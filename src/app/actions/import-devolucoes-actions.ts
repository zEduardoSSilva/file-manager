"use server"

import { processAndSave, PipelineArgs, ProcessorOutput, PipelineResponse } from "./actions-utils"

// ─── Constantes ───────────────────────────────────────────────────────────────
const COLS_NOMES = ["MOTORISTA", "AJUDANTE", "AJUDANTE_1"]
const COL_VIAGENS = "VIAGENS"
const COL_REGIAO = "REGIÃO"
const COL_DATA   = "DATA DE ENTREGA"

// ─── Normalização de nomes ────────────────────────────────────────────────────

function removeAcentos(txt: string): string {
  return txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalizarNomeChave(nome: any): string {
  if (!nome || String(nome).trim() === "") return ""
  let txt = String(nome).toUpperCase().trim()
  txt = removeAcentos(txt)
  txt = txt.replace(/[^\w\s]/g, "").replace(/\s+/g, " ")
  return txt.split(" ").filter(t => !/^\d+$/.test(t)).join(" ").trim()
}

function similaridade(a: string, b: string): number {
  if (!a || !b) return 0
  const longer  = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (longer.length === 0) return 1
  return (longer.length - editDistance(longer, shorter)) / longer.length
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function palavrasCompletas(procurado: string, cadastro: string): boolean {
  const setProcurado = new Set(procurado.split(" "))
  const setCadastro  = new Set(cadastro.split(" "))
  return [...setProcurado].every(p => setCadastro.has(p))
}

// Monta mapas por empresa a partir das linhas do Funcionario.xlsx
function montarMapaFuncionarios(rows: any[]): Record<string, {
  mapaOficial: Record<string, string>
  mapaIncorreto: Record<string, string>
  chavesOficial: string[]
  chavesIncorreto: string[]
}> {
  const mapa: Record<string, any> = {}
  for (const row of rows) {
    const empresa = String(row["EMPRESA"] ?? "").trim()
    const nomeOfi = String(row["Nome"] ?? "").trim()
    const nomeInc = String(row["Nome_Incorreto"] ?? "").trim()
    if (!empresa || !nomeOfi) continue
    if (!mapa[empresa]) mapa[empresa] = { mapaOficial: {}, mapaIncorreto: {}, chavesOficial: [], chavesIncorreto: [] }

    const chaveOfi = normalizarNomeChave(nomeOfi)
    if (chaveOfi && !mapa[empresa].mapaOficial[chaveOfi]) {
      mapa[empresa].mapaOficial[chaveOfi] = nomeOfi
      mapa[empresa].chavesOficial.push(chaveOfi)
    }
    if (nomeInc) {
      const chaveInc = normalizarNomeChave(nomeInc)
      if (chaveInc && !mapa[empresa].mapaIncorreto[chaveInc]) {
        mapa[empresa].mapaIncorreto[chaveInc] = nomeOfi
        mapa[empresa].chavesIncorreto.push(chaveInc)
      }
    }
  }
  return mapa
}

function encontrarNomeOficial(
  nomeOriginal: any, empresa: string,
  mapaEmpresa: Record<string, any>, limiarFuzzy = 0.75
): string {
  if (!nomeOriginal || ["-","N/A","nan","none"].includes(String(nomeOriginal).trim().toLowerCase())) {
    return String(nomeOriginal ?? "")
  }
  if (!empresa || !mapaEmpresa || !mapaEmpresa[empresa]) return String(nomeOriginal)

  const chave = normalizarNomeChave(nomeOriginal)
  if (!chave) return String(nomeOriginal)

  const { mapaOficial, mapaIncorreto, chavesOficial, chavesIncorreto } = mapaEmpresa[empresa]

  // 1. Exato incorreto
  if (mapaIncorreto[chave]) return mapaIncorreto[chave]
  // 2. Exato oficial
  if (mapaOficial[chave]) return mapaOficial[chave]

  // 3. Palavras completas — incorreto
  const matchInc = chavesIncorreto.filter(c => palavrasCompletas(chave, c))
    .sort((a, b) => b.split(" ").length - a.split(" ").length)
  if (matchInc.length) return mapaIncorreto[matchInc[0]]

  // 4. Palavras completas — oficial
  const matchOfi = chavesOficial.filter(c => palavrasCompletas(chave, c))
    .sort((a, b) => b.split(" ").length - a.split(" ").length)
  if (matchOfi.length) return mapaOficial[matchOfi[0]]

  // 5. Fuzzy
  let melhorScore = 0, melhorChave = ""
  for (const c of chavesOficial) {
    const s = similaridade(chave, c)
    if (s > melhorScore) { melhorScore = s; melhorChave = c }
  }
  if (melhorChave && melhorScore >= limiarFuzzy) return mapaOficial[melhorChave]

  return String(nomeOriginal)
}

// ─── Utilitários de data / viagem ─────────────────────────────────────────────

function extrairAnoMes(valor: any): { ano: number | null; mes: number | null } {
  if (!valor) return { ano: null, mes: null }
  if (valor instanceof Date) return { ano: valor.getFullYear(), mes: valor.getMonth() + 1 }

  const s = String(valor).trim()
  // dd/mm/yyyy
  let m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const ano = parseInt(m[3]) + (parseInt(m[3]) < 100 ? 2000 : 0)
    return { ano, mes: parseInt(m[2]) }
  }
  // yyyy-mm-dd
  m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) return { ano: parseInt(m[1]), mes: parseInt(m[2]) }
  return { ano: null, mes: null }
}

function explodeViagens(valor: any): string[] {
  if (!valor) return []
  const txt = String(valor).trim()
  if (!txt || ["nan","none","(vazio)","vazio"].includes(txt.toLowerCase())) return []
  const partes = txt.split(/[\/;,|\s]+/)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of partes) {
    const num = p.replace(/\D/g, "")
    if (!num || seen.has(num)) continue
    out.push(num); seen.add(num)
  }
  return out
}

function normKey(x: any): string {
  if (!x) return ""
  const s = String(x).replace(/\D/g, "").replace(/^0+/, "")
  return s === "" ? "0" : s
}

// ─── Agregação de faturamento ─────────────────────────────────────────────────

function agregarFaturamentoPorViagem(
  rows: any[], motivosDesconsiderar: Set<string> | "__TODOS__"
): Map<string, { faturamento: number; faturamentoDev: number; qtdNFe: number; qtdNFeDev: number }> {

  const agg = new Map<string, { fat: number; fatDev: number; notas: Set<string>; notasDev: Set<string> }>()

  for (const row of rows) {
    const key   = normKey(row["VIAGENS"] ?? row["viagens"] ?? "")
    if (!key) continue

    const fat    = parseFloat(row["FATURAMENTO"] ?? 0) || 0
    const fatDev = parseFloat(row["FATURAMENTO_DEV"] ?? 0) || 0
    const nota   = String(row["NOTA"] ?? "").trim()
    const motivo = String(row["MOTIVO_DEV"] ?? "").trim().toUpperCase()

    const ehDev        = fatDev > 0
    const ehSistema    = motivosDesconsiderar === "__TODOS__"
      ? false
      : ehDev && motivosDesconsiderar.has(motivo)
    const ehMotorista  = ehDev && !ehSistema

    if (!agg.has(key)) agg.set(key, { fat: 0, fatDev: 0, notas: new Set(), notasDev: new Set() })
    const e = agg.get(key)!
    e.fat += fat
    if (ehMotorista) e.fatDev += fatDev
    if (nota) e.notas.add(nota)
    if (ehMotorista && nota) e.notasDev.add(nota)
  }

  const result = new Map<string, { faturamento: number; faturamentoDev: number; qtdNFe: number; qtdNFeDev: number }>()
  for (const [k, v] of agg.entries()) {
    result.set(k, {
      faturamento:    v.fat,
      faturamentoDev: v.fatDev,
      qtdNFe:         v.notas.size,
      qtdNFeDev:      v.notasDev.size,
    })
  }
  return result
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function devolucoesPipelineProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const sheetsData = await args.files.readAll("files")
  const fileNames: string[] = (args.formData?.getAll("fileNames") as string[]) ?? []

  if (!sheetsData.length) throw new Error("Nenhum arquivo encontrado.")

  const anoAlvo = args.year  ?? new Date().getFullYear()
  const mesAlvo = args.month ?? new Date().getMonth() + 1

  // Classifica cada arquivo pelo nome
  let rowsControle: any[] = []
  let rowsFat: any[]      = []
  let rowsFunc: any[]     = []
  let rowsMotivos: any[]  = []

  sheetsData.forEach((rows, idx) => {
    const nome = (fileNames[idx] ?? "").toLowerCase()
    if (/fat|faturamento|fechamento/i.test(nome))   rowsFat     = rows
    else if (/funcionari/i.test(nome))              rowsFunc    = rows
    else if (/motivo/i.test(nome))                  rowsMotivos = rows
    else                                            rowsControle = rows
  })

  if (!rowsControle.length) throw new Error("Arquivo de controle logístico não encontrado.")

  // ── Filtra controle por ano/mês ───────────────────────────────────────
  const controle = rowsControle.filter(row => {
    const { ano, mes } = extrairAnoMes(row[COL_DATA])
    return ano === anoAlvo && mes === mesAlvo
  })
  if (!controle.length) throw new Error(`Nenhum registro para ${mesAlvo}/${anoAlvo} no controle.`)

  // ── Mapa de funcionários ──────────────────────────────────────────────
  const mapaFunc = rowsFunc.length ? montarMapaFuncionarios(rowsFunc) : null

  // ── Normaliza nomes por região ────────────────────────────────────────
  if (mapaFunc) {
    for (const row of controle) {
      const empresa = String(row[COL_REGIAO] ?? "").trim()
      for (const col of COLS_NOMES) {
        if (col in row) row[col] = encontrarNomeOficial(row[col], empresa, mapaFunc)
      }
    }
  }

  // ── Motivos do sistema ────────────────────────────────────────────────
  let motivosDesconsiderar: Set<string> | "__TODOS__" = "__TODOS__"
  if (rowsMotivos.length) {
    const motivos = new Set<string>()
    for (const row of rowsMotivos) {
      const considera = String(row["CONSIDERA"] ?? "").trim().toUpperCase()
      const motivo    = String(row["MOTIVO_DEV"] ?? "").trim().toUpperCase()
      if (considera === "NÃO" && motivo) motivos.add(motivo)
    }
    motivosDesconsiderar = motivos.size > 0 ? motivos : "__TODOS__"
  }

  // ── Agrega faturamento ────────────────────────────────────────────────
  const fatAgg = rowsFat.length
    ? agregarFaturamentoPorViagem(rowsFat, motivosDesconsiderar)
    : new Map()

  // ── Explode viagem: colaborador × viagem ─────────────────────────────
  const records: any[] = []
  for (const row of controle) {
    const viagens = explodeViagens(row[COL_VIAGENS])
    if (!viagens.length) continue

    for (const col of COLS_NOMES) {
      const nome = row[col]
      if (!nome || ["-","N/A","nan","none",""].includes(String(nome).trim().toLowerCase())) continue
      for (const v of viagens) {
        records.push({ colaborador: String(nome).trim(), viagem: v })
      }
    }
  }

  // ── Merge com faturamento ─────────────────────────────────────────────
  const detalhamento = records.map(r => {
    const fatInfo = fatAgg.get(normKey(r.viagem))
    return {
      colaborador:                   r.colaborador,
      viagem:                        r.viagem,
      Faturamento:                   fatInfo?.faturamento    ?? 0,
      Faturamento_Dev:               fatInfo?.faturamentoDev ?? 0,
      Quantidade_NFe:                fatInfo?.qtdNFe         ?? 0,
      Quantidade_NFe_Dev:            fatInfo?.qtdNFeDev      ?? 0,
      Percentual_Venda_Devolvida:    fatInfo && fatInfo.faturamento > 0
        ? +(fatInfo.faturamentoDev / fatInfo.faturamento * 100).toFixed(4) : 0,
      Percentual_Qtd_Notas_Devolvidas: fatInfo && fatInfo.qtdNFe > 0
        ? +(fatInfo.qtdNFeDev / fatInfo.qtdNFe * 100).toFixed(4) : 0,
    }
  })

  // ── Resumo por colaborador ────────────────────────────────────────────
  const porColab: Record<string, any> = {}
  for (const r of detalhamento) {
    if (!porColab[r.colaborador]) {
      porColab[r.colaborador] = {
        colaborador: r.colaborador, qtdViagens: 0,
        fatTotal: 0, fatDev: 0, qtdNFe: 0, qtdNFeDev: 0,
      }
    }
    const c = porColab[r.colaborador]
    c.qtdViagens++
    c.fatTotal  += r.Faturamento
    c.fatDev    += r.Faturamento_Dev
    c.qtdNFe    += r.Quantidade_NFe
    c.qtdNFeDev += r.Quantidade_NFe_Dev
  }

  const resumo = Object.values(porColab).map((c: any) => ({
    colaborador:                     c.colaborador,
    Qtd_Viagens:                     c.qtdViagens,
    Faturamento_Total:               +c.fatTotal.toFixed(2),
    Faturamento_Devolvido:           +c.fatDev.toFixed(2),
    Total_NFes:                      c.qtdNFe,
    Total_NFes_Devolvidas:           c.qtdNFeDev,
    Percentual_Venda_Devolvida:      c.fatTotal > 0 ? +(c.fatDev / c.fatTotal * 100).toFixed(4) : 0,
    Percentual_Qtd_Notas_Devolvidas: c.qtdNFe  > 0 ? +(c.qtdNFeDev / c.qtdNFe * 100).toFixed(4) : 0,
  })).sort((a, b) => b.Qtd_Viagens - a.Qtd_Viagens)

  const totalFat = resumo.reduce((s, r) => s + r.Faturamento_Total, 0)
  const totalDev = resumo.reduce((s, r) => s + r.Faturamento_Devolvido, 0)

  return {
    data: detalhamento,
    resumoPorColaborador: resumo,
    summary: `Devoluções ${mesAlvo}/${anoAlvo}: ${resumo.length} colaboradores · ${detalhamento.length} viagens · R$ ${totalFat.toFixed(2)} fat. · R$ ${totalDev.toFixed(2)} devolvido`,
    extraSheets: [
      { name: "Resumo por Colaborador", data: resumo      },
      { name: "Detalhamento",           data: detalhamento },
    ],
  }
}

export async function executeDevolucoesPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("devolucoes", formData, devolucoesPipelineProcessor)
}