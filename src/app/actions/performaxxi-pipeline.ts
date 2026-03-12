"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// ─── Constantes ───────────────────────────────────────────────────────────────
const VALOR_PERFORMANCE_MOTORISTA = 8.00
const VALOR_PERFORMANCE_AJUDANTE  = 7.20
const CRITERIOS_PERFORMANCE       = 4

const PERCENTUAL_MINIMO_RAIO  = 70.0
const PERCENTUAL_MINIMO_SLA   = 80.0
const PERCENTUAL_MINIMO_TEMPO = 100.0
const PERCENTUAL_MINIMO_SEQ   = 0.0

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(text: any): string {
  if (!text) return ""
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_\s]/g, " ")
    .replace(/\s+/g, "_")
    .trim()
}

function findCol(candidates: string[], columns: string[]): string | null {
  const normMap: Record<string, string> = {}
  for (const col of columns) normMap[normalize(col)] = col

  for (const cand of candidates) {
    const nc = normalize(cand)
    if (normMap[nc]) return normMap[nc]
    const partial = Object.keys(normMap).find(k => k.startsWith(nc))
    if (partial) return normMap[partial]
  }
  return null
}

function toFloat(x: any): number {
  if (x == null || x === "") return NaN
  const s = String(x).trim().replace(/[^0-9.,]/g, "")
  if (!s) return NaN
  if (s.includes(".") && s.includes(",")) {
    return parseFloat(s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, ""))
  }
  return parseFloat(s.replace(",", "."))
}

function parseDate(value: any): string | null {
  if (!value) return null
  const str = String(value).trim()
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return str.slice(0, 10)
  // Excel serial
  const num = Number(str)
  if (!isNaN(num) && num > 40000) {
    const d = new Date((num - 25569) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  return null
}

function calcularTempoAtendimento(inicio: any, fim: any): number {
  if (!inicio || !fim) return NaN
  const i = new Date(String(inicio)).getTime()
  const f = new Date(String(fim)).getTime()
  if (isNaN(i) || isNaN(f)) return NaN
  return (f - i) / 60000
}

function normalizarNome(nome: any): string {
  if (!nome) return ""
  return String(nome)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Etapa 1: Processar rotas ─────────────────────────────────────────────────

function processarRotas(rows: any[]): {
  baseOriginal: any[]
  baseDados: any[]
  resumo: any[]
} {
  const cols = Object.keys(rows[0] ?? {})

  const colStatus  = findCol(["status_rota", "status_da_rota", "status"], cols)
  const colData    = findCol(["data_rota", "data_da_rota", "data"], cols)
  const colEmpresa = findCol(["empresa", "nome_deposito", "deposito"], cols)
  const colPeso    = findCol(["peso_pedido", "peso_do_pedido", "peso"], cols)
  const colOcorr   = findCol(["descricao_ocorrencia", "desc_ocorrencia", "ocorrencia"], cols)

  const processed = rows.map(row => {
    const peso = toFloat(row[colPeso ?? ""])
    const temOcorr = colOcorr
      ? String(row[colOcorr] ?? "").trim() !== "" && String(row[colOcorr] ?? "").toLowerCase() !== "nan"
      : false
    return {
      ...row,
      _data_key: parseDate(row[colData ?? ""]),
      _empresa: String(row[colEmpresa ?? ""] ?? "").trim(),
      _status: String(row[colStatus ?? ""] ?? "").trim().toLowerCase(),
      _peso_total: isNaN(peso) ? 0 : peso,
      _peso_devolvido: temOcorr ? (isNaN(peso) ? 0 : peso) : 0,
      _peso_entregue: temOcorr ? 0 : (isNaN(peso) ? 0 : peso),
    }
  })

  const baseOriginal = rows
  const baseDados = processed.filter(r => r._status !== "standby")

  // Resumo por empresa + data
  const grupos: Record<string, any> = {}
  for (const row of baseDados) {
    const key = `${row._empresa}||${row._data_key}`
    if (!grupos[key]) {
      grupos[key] = {
        nome_deposito: row._empresa,
        data_rota: row._data_key,
        peso_total: 0, peso_entregue: 0, peso_devolvido: 0, qtde_rotas: 0
      }
    }
    grupos[key].peso_total     += row._peso_total
    grupos[key].peso_entregue  += row._peso_entregue
    grupos[key].peso_devolvido += row._peso_devolvido
    grupos[key].qtde_rotas++
  }

  const resumo = Object.values(grupos).map((g: any) => ({
    ...g,
    perc_devolvido: g.peso_total > 0 ? +(g.peso_devolvido / g.peso_total * 100).toFixed(2) : 0
  }))

  return { baseOriginal, baseDados, resumo }
}

// ─── Padronizar nomes com cadastro de funcionários ────────────────────────────

function padronizarNome(nome: any, funcionarios: any[]): { nomePadronizado: string; empresa: string } {
  const n = normalizarNome(nome)
  if (!n || !funcionarios.length) return { nomePadronizado: String(nome ?? ""), empresa: "N/A" }

  const colNome    = findCol(["Nome", "nome"], Object.keys(funcionarios[0]))
  const colEmpresa = findCol(["EMPRESA", "empresa"], Object.keys(funcionarios[0]))

  if (!colNome || !colEmpresa) return { nomePadronizado: String(nome ?? ""), empresa: "N/A" }

  const exato = funcionarios.find(f => normalizarNome(f[colNome]) === n)
  if (exato) return { nomePadronizado: String(exato[colNome]), empresa: String(exato[colEmpresa]) }

  const partes = n.split(" ").filter(Boolean)
  const contem = funcionarios.find(f => {
    const fn = normalizarNome(f[colNome])
    return partes.every(p => fn.includes(p))
  })
  if (contem) return { nomePadronizado: String(contem[colNome]), empresa: String(contem[colEmpresa]) }

  return { nomePadronizado: String(nome ?? ""), empresa: "N/A" }
}

// ─── Etapa 2/3: Análise de performance (motorista ou ajudante) ────────────────

function analisarPerformance(
  baseDados: any[],
  funcionarios: any[],
  colNomeColaborador: string,
  valorPerformance: number,
  tipo: "Motorista" | "Ajudante"
): { detalhe: any[]; consolidado: any[] } {

  const cols = Object.keys(baseDados[0] ?? {})

  const colDist   = findCol(["distancia_cliente_metros", "distancia_metros", "distancia"], cols)
  const colSLA    = findCol(["sla_janela_atendimento", "sla"], cols)
  const colCheg   = findCol(["chegada_cliente_realizado", "chegada_realizado", "chegada"], cols)
  const colFim    = findCol(["fim_atendimento_cliente_realizado", "fim_atendimento_realizado", "fim_atendimento"], cols)
  const colSeqP   = findCol(["sequencia_entrega_planejado", "seq_planejado"], cols)
  const colSeqR   = findCol(["sequencia_entrega_realizado", "seq_realizado"], cols)
  const colPeso   = findCol(["peso_pedido", "peso"], cols)
  const colOcorr  = findCol(["descricao_ocorrencia", "ocorrencia"], cols)
  const colData   = findCol(["data_rota", "data"], cols)
  const colEmpresa = findCol(["nome_deposito", "empresa", "deposito"], cols)
  const colCodCli = findCol(["codigo_cliente", "cod_cliente", "cliente"], cols)

  // Filtra registros válidos com colaborador e data
  const validos = baseDados.filter(row => {
    const nome = String(row[colNomeColaborador] ?? "").trim()
    const data = row[colData ?? ""]
    return nome && nome !== "N.R." && data
  })

  if (!validos.length) return { detalhe: [], consolidado: [] }

  // Processa cada pedido
  const pedidos = validos.map(row => {
    const nome = String(row[colNomeColaborador] ?? "").trim()
    const { nomePadronizado, empresa } = padronizarNome(nome, funcionarios)
    const data = parseDate(row[colData ?? ""])
    const codCli = colCodCli ? String(row[colCodCli] ?? row["_idx"] ?? "") : ""
    const dist = colDist ? toFloat(row[colDist]) : NaN
    const peso = colPeso ? (toFloat(row[colPeso]) || 0) : 0
    const temOcorr = colOcorr
      ? String(row[colOcorr] ?? "").trim() !== "" && String(row[colOcorr] ?? "").toLowerCase() !== "nan"
      : false
    const sla = colSLA ? /sim|ok/i.test(String(row[colSLA] ?? "")) : false
    const tempo = (colCheg && colFim) ? calcularTempoAtendimento(row[colCheg], row[colFim]) : NaN
    const seqP = colSeqP ? Number(row[colSeqP]) : NaN
    const seqR = colSeqR ? Number(row[colSeqR]) : NaN

    return {
      colaborador: nomePadronizado,
      empresa,
      data,
      codCli,
      raio_ok: !isNaN(dist) ? dist <= 100 : false,
      sla_ok: sla,
      tempo_ok: !isNaN(tempo) ? tempo >= 1.0 : false,
      seq_ok: !isNaN(seqP) && !isNaN(seqR) ? seqP === seqR : false,
      peso,
      peso_devolvido: temOcorr ? peso : 0,
    }
  })

  // Agrupa por colaborador + data + cliente (deduplicação de pedido)
  const porPedido: Record<string, any> = {}
  for (const p of pedidos) {
    const key = `${p.colaborador}||${p.empresa}||${p.data}||${p.codCli}`
    if (!porPedido[key]) {
      porPedido[key] = { ...p, _count: 0 }
    } else {
      // max: se qualquer linha do pedido passou no critério, conta como OK
      porPedido[key].raio_ok  = porPedido[key].raio_ok  || p.raio_ok
      porPedido[key].sla_ok   = porPedido[key].sla_ok   || p.sla_ok
      porPedido[key].tempo_ok = porPedido[key].tempo_ok || p.tempo_ok
      porPedido[key].seq_ok   = porPedido[key].seq_ok   || p.seq_ok
      porPedido[key].peso          += p.peso
      porPedido[key].peso_devolvido += p.peso_devolvido
    }
    porPedido[key]._count++
  }

  // Agrupa por colaborador + data (diário)
  const porDia: Record<string, any> = {}
  for (const p of Object.values(porPedido)) {
    const key = `${p.colaborador}||${p.empresa}||${p.data}`
    if (!porDia[key]) {
      porDia[key] = {
        colaborador: p.colaborador, empresa: p.empresa, data: p.data,
        total: 0, raio: 0, sla: 0, tempo: 0, seq: 0,
        peso: 0, peso_dev: 0,
      }
    }
    const d = porDia[key]
    d.total++
    if (p.raio_ok)  d.raio++
    if (p.sla_ok)   d.sla++
    if (p.tempo_ok) d.tempo++
    if (p.seq_ok)   d.seq++
    d.peso     += p.peso
    d.peso_dev += p.peso_devolvido
  }

  const valorPorCriterio = valorPerformance / CRITERIOS_PERFORMANCE

  // Monta detalhe diário
  const detalhe = Object.values(porDia).map((d: any) => {
    const pRaio  = d.total > 0 ? +(d.raio  / d.total * 100).toFixed(2) : 0
    const pSLA   = d.total > 0 ? +(d.sla   / d.total * 100).toFixed(2) : 0
    const pTempo = d.total > 0 ? +(d.tempo / d.total * 100).toFixed(2) : 0
    const pSeq   = d.total > 0 ? +(d.seq   / d.total * 100).toFixed(2) : 0

    const cRaio  = pRaio  >= PERCENTUAL_MINIMO_RAIO
    const cSLA   = pSLA   >= PERCENTUAL_MINIMO_SLA
    const cTempo = pTempo >= PERCENTUAL_MINIMO_TEMPO
    const cSeq   = pSeq   >= PERCENTUAL_MINIMO_SEQ

    const cumpridos = (cRaio ? 1 : 0) + (cSLA ? 1 : 0) + (cTempo ? 1 : 0) + (cSeq ? 1 : 0)
    const bonif = +(cumpridos * valorPorCriterio).toFixed(2)
    const pBonif = +(cumpridos / CRITERIOS_PERFORMANCE * 100).toFixed(2)

    return {
      "Empresa": d.empresa,
      [tipo]: d.colaborador,
      "Dia": d.data,
      "Total de Pedidos": d.total,
      "Peso Pedido Dia (Kg)": +d.peso.toFixed(2),
      "Peso Devolvido Dia (Kg)": +d.peso_dev.toFixed(2),
      "% Devolvido Dia": d.peso > 0 ? +(d.peso_dev / d.peso * 100).toFixed(2) : 0,
      "% Raio": pRaio,   [`✓ Raio ≥${PERCENTUAL_MINIMO_RAIO}%`]:  cRaio,
      "% SLA": pSLA,     [`✓ SLA ≥${PERCENTUAL_MINIMO_SLA}%`]:    cSLA,
      "% Tempo": pTempo, [`✓ Tempo ≥${PERCENTUAL_MINIMO_TEMPO}%`]: cTempo,
      "% Sequência": pSeq, [`✓ Sequência ≥${PERCENTUAL_MINIMO_SEQ}%`]: cSeq,
      [`Critérios Cumpridos (de ${CRITERIOS_PERFORMANCE})`]: cumpridos,
      "Critérios Falhados": CRITERIOS_PERFORMANCE - cumpridos,
      "Dia Bonificação Máxima (4/4)": cumpridos === CRITERIOS_PERFORMANCE,
      "% Bonificação": pBonif,
      [`Bonificação ${tipo} (R$)`]: bonif,
    }
  })

  // Consolidado por colaborador
  const porColab: Record<string, any> = {}
  for (const row of detalhe) {
    const nome = row[tipo]
    if (!porColab[nome]) {
      porColab[nome] = {
        [tipo]: nome,
        Empresa: row["Empresa"],
        dias: 0, diasMax: 0, bonif: 0, cumpridos: 0,
        fRaio: 0, fSLA: 0, fTempo: 0, fSeq: 0,
      }
    }
    const c = porColab[nome]
    c.dias++
    if (row["Dia Bonificação Máxima (4/4)"]) c.diasMax++
    c.bonif     += row[`Bonificação ${tipo} (R$)`]
    c.cumpridos += row[`Critérios Cumpridos (de ${CRITERIOS_PERFORMANCE})`]
    if (!row[`✓ Raio ≥${PERCENTUAL_MINIMO_RAIO}%`])   c.fRaio++
    if (!row[`✓ SLA ≥${PERCENTUAL_MINIMO_SLA}%`])     c.fSLA++
    if (!row[`✓ Tempo ≥${PERCENTUAL_MINIMO_TEMPO}%`]) c.fTempo++
    if (!row[`✓ Sequência ≥${PERCENTUAL_MINIMO_SEQ}%`]) c.fSeq++
  }

  const consolidado = Object.values(porColab).map((c: any) => {
    const possiveis = c.dias * CRITERIOS_PERFORMANCE
    return {
      "Empresa": c.Empresa,
      [tipo]: c[tipo],
      "Dias com Atividade": c.dias,
      "Dias Bonif. Máxima (4/4)": c.diasMax,
      "Percentual de Desempenho (%)": possiveis > 0 ? +(c.cumpridos / possiveis * 100).toFixed(2) : 0,
      "Total Bonificação (R$)": +c.bonif.toFixed(2),
      "Total Critérios Cumpridos": c.cumpridos,
      "Falhas Raio": c.fRaio,
      "Falhas SLA": c.fSLA,
      "Falhas Tempo": c.fTempo,
      "Falhas Sequência": c.fSeq,
    }
  }).sort((a, b) => b["Percentual de Desempenho (%)"] - a["Percentual de Desempenho (%)"])

  return { detalhe, consolidado }
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function performaxxiProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const sheetsData  = await args.files.readAll("files")
  const fileNames: string[] = (args.formData?.getAll("fileNames") as string[]) ?? []

  // Separa relatório de rotas vs cadastro de funcionários pelo nome
  let rotaRows:  any[] = []
  let funcRows:  any[] = []

  sheetsData.forEach((sheet, idx) => {
    const nome = (fileNames[idx] ?? "").toLowerCase()
    if (nome.includes("funcionari")) funcRows = [...funcRows, ...sheet]
    else rotaRows = [...rotaRows, ...sheet]
  })

  if (!rotaRows.length) throw new Error("Nenhum relatório de rotas encontrado.")

  // Normaliza colunas snake_case
  const normalize_cols = (rows: any[]) =>
    rows.map(row => {
      const out: any = {}
      for (const [k, v] of Object.entries(row)) out[normalize(k)] = v
      return out
    })

  const rotas = normalize_cols(rotaRows)
  const funcs = funcRows.length ? funcRows : []

  // ── Etapa 1 ──────────────────────────────────────────────────────────────
  const { baseOriginal, baseDados, resumo } = processarRotas(rotas)

  const cols = Object.keys(baseDados[0] ?? {})

  // ── Etapa 2: Motoristas ───────────────────────────────────────────────────
  const colMot = findCol(["nome_motorista", "motorista"], cols) ?? "nome_motorista"
  const { detalhe: detMot, consolidado: consMot } =
    analisarPerformance(baseDados, funcs, colMot, VALOR_PERFORMANCE_MOTORISTA, "Motorista")

  // ── Etapa 3: Ajudantes ────────────────────────────────────────────────────
  const colAjud = findCol(
    ["nome_primeiro_ajudante", "nome_segundo_ajudante", "ajudante"], cols
  )
  const { detalhe: detAjud, consolidado: consAjud } = colAjud
    ? analisarPerformance(baseDados, funcs, colAjud, VALOR_PERFORMANCE_AJUDANTE, "Ajudante")
    : { detalhe: [], consolidado: [] }

  const totalMot  = consMot.length
  const totalAjud = consAjud.length
  const bonifMot  = consMot.reduce((s, m) => s + m["Total Bonificação (R$)"], 0)
  const bonifAjud = consAjud.reduce((s, m) => s + m["Total Bonificação (R$)"], 0)

  return {
    data: consMot,
    summary: `Performaxxi ${args.month}/${args.year}: ${totalMot} motoristas · ${totalAjud} ajudantes · R$ ${(bonifMot + bonifAjud).toFixed(2)} em bonificações`,
    extraSheets: [
      { name: "01_Base_Original",         data: baseOriginal },
      { name: "02_Base_Dados",            data: baseDados    },
      { name: "03_Resumo_Rotas",          data: resumo       },
      { name: "04_Detalhe_Motorista",     data: detMot       },
      { name: "05_Consolidado_Motorista", data: consMot      },
      { name: "06_Detalhe_Ajudante",      data: detAjud      },
      { name: "07_Consolidado_Ajudante",  data: consAjud     },
    ],
  }
}

export async function executePerformaxxiPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("performaxxi", formData, performaxxiProcessor)
}