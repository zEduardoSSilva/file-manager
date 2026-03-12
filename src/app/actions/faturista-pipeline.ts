"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// ─── Constantes ───────────────────────────────────────────────────────────────

const SHEET_FATURAMENTO    = "Faturamento"
const PROCESSO_CINTAS      = "ENTREGA DE CINTAS PARA SEPARAÇÃO"
const PROCESSO_LIBERACAO   = "LIBERAÇÃO PARA ROTEIRIZAÇÃO"   // trailing space ignorado via trim

// Limites de horário em minutos desde meia-noite
//   Cintas:    ≤22h=100% | 22–23h=85% | 23–00h=75% | >00h=0%
//   Liberação: ≤20h30=100% | –21h=85% | –22h=75% | >22h=0%
const CINTAS_LIM_100 = hhmm(22, 0)
const CINTAS_LIM_85  = hhmm(23, 0)
const CINTAS_LIM_75  = hhmm(24, 0)   // meia-noite do dia seguinte

const LIB_LIM_100 = hhmm(20, 30)
const LIB_LIM_85  = hhmm(21, 0)
const LIB_LIM_75  = hhmm(22, 0)

function hhmm(h: number, m: number): number { return h * 60 + m }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanCol(col: any): string {
  return String(col).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s.\-/]+/g, "_")
}

function findCol(row: Record<string, any>, opcoes: string[]): string | null {
  const normMap = new Map(Object.keys(row).map(k => [cleanCol(k), k]))
  for (const op of opcoes) {
    const n = cleanCol(op)
    if (normMap.has(n)) return normMap.get(n)!
  }
  for (const op of opcoes) {
    const n = cleanCol(op)
    for (const [k, orig] of normMap) if (k.includes(n)) return orig
  }
  return null
}

/**
 * Converte string de horário ("17:00", "0:30", "23:45:00") para minutos desde meia-noite.
 * Retorna null se não conseguir converter.
 */
function parseTimeToMinutes(value: any): number | null {
  if (value == null) return null

  // Já é número (Excel serial fraction of day)
  if (typeof value === "number") {
    if (value >= 0 && value < 1) return Math.round(value * 24 * 60)
    return null
  }

  const str = String(value).trim()
  if (!str || str === "-") return null

  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2])
  }

  // Tenta parse como Date
  const d = new Date(`1970-01-01T${str}`)
  if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes()

  return null
}

function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  const str = String(value).trim()

  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(+br[3], +br[2] - 1, +br[1])

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])

  // Excel serial
  const num = parseFloat(str)
  if (!isNaN(num) && num > 40000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function formatDateISO(d: Date | null): string {
  if (!d) return ""
  return d.toISOString().slice(0, 10)
}

function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Conta dias úteis (seg–sex) em um mês.
 * Equivalente a numpy.busday_count sem feriados customizados.
 */
function contarDiasUteis(ano: number, mes: number): number {
  const fim = new Date(ano, mes, 1)   // primeiro dia do próximo mês
  const ini = new Date(ano, mes - 1, 1)
  let count = 0
  const cur = new Date(ini)
  while (cur < fim) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function norm(s: any): string {
  if (s == null) return ""
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function pickSheet(
  sheetsMap: Map<string, any[]>,
  candidates: string[]
): any[] | null {
  for (const candidate of candidates) {
    for (const [sheetName, data] of sheetsMap) {
      if (norm(sheetName) === norm(candidate) || norm(sheetName).includes(norm(candidate))) {
        return data
      }
    }
  }
  return null
}

// ─── Aplicação de percentual por faixa de horário ────────────────────────────

interface PercentResult {
  perc: number       // 0, 0.75, 0.85 ou 1.0
  metaOk: boolean
}

function calcPercCintas(terminoAjMin: number): PercentResult {
  if (terminoAjMin <= CINTAS_LIM_100) return { perc: 1.00, metaOk: true  }
  if (terminoAjMin <= CINTAS_LIM_85)  return { perc: 0.85, metaOk: false }
  if (terminoAjMin <= CINTAS_LIM_75)  return { perc: 0.75, metaOk: false }
  return                                     { perc: 0.00, metaOk: false }
}

function calcPercLib(terminoAjMin: number): PercentResult {
  if (terminoAjMin <= LIB_LIM_100) return { perc: 1.00, metaOk: true  }
  if (terminoAjMin <= LIB_LIM_85)  return { perc: 0.85, metaOk: false }
  if (terminoAjMin <= LIB_LIM_75)  return { perc: 0.75, metaOk: false }
  return                                   { perc: 0.00, metaOk: false }
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function faturistaProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  // Parâmetros extras do FormData
  const metaCintas    = parseFloat(args.formData?.get("metaCintas")    as string ?? "200") || 200
  const metaLiberacao = parseFloat(args.formData?.get("metaLiberacao") as string ?? "200") || 200
  const empresasRaw   = String(args.formData?.get("empresas") ?? "RK01,BV01")
  const empresasFiltro = empresasRaw.split(",").map(e => e.trim().toUpperCase()).filter(Boolean)

  // ── Leitura da aba Faturamento ────────────────────────────────────────────
  let rows: any[] = []
  try {
    const sheets = await args.files.readSheets("fileTempos")
    rows = pickSheet(sheets, [SHEET_FATURAMENTO]) ?? []
  } catch {
    // fallback: primeira aba
    const all = await args.files.readAll("fileTempos")
    rows = all.flat()
  }

  if (!rows.length) throw new Error("Arquivo vazio ou aba 'Faturamento' não encontrada.")
  const totalRegistros = rows.length
  console.log(`[Faturista] ${totalRegistros} registros carregados`)

  // ── Detecta colunas ───────────────────────────────────────────────────────
  const firstRow = rows[0]
  const COL_DATA      = findCol(firstRow, ["DATA", "Data", "DT"])
  const COL_EMPRESA   = findCol(firstRow, ["EMPRESA", "Empresa", "empresa"])
  const COL_CIDADE    = findCol(firstRow, ["CIDADE", "Cidade", "cidade"])
  const COL_PROCESSOS = findCol(firstRow, ["PROCESSOS", "Processos", "processo", "PROCESSO"])
  const COL_INICIO    = findCol(firstRow, ["INICIO", "Início", "inicio", "INÍCIO"])
  const COL_TERMINO   = findCol(firstRow, ["TERMINO", "Término", "termino", "TÉRMINO"])
  const COL_PEDIDOS   = findCol(firstRow, ["PEDIDOS", "Pedidos", "pedidos"])

  const missing = Object.entries({ DATA: COL_DATA, EMPRESA: COL_EMPRESA, PROCESSOS: COL_PROCESSOS, INICIO: COL_INICIO, TERMINO: COL_TERMINO })
    .filter(([, v]) => v == null).map(([k]) => k)
  if (missing.length) throw new Error(`Colunas não encontradas: ${missing.join(", ")}`)

  // ── Dias úteis e metas diárias ────────────────────────────────────────────
  const diasUteis    = contarDiasUteis(args.year, args.month)
  if (diasUteis === 0) throw new Error("Nenhum dia útil encontrado no período.")
  const metaDiaCintas    = metaCintas    / diasUteis
  const metaDiaLiberacao = metaLiberacao / diasUteis

  console.log(`[Faturista] ${diasUteis} dias úteis | Meta/dia: Cintas R$ ${metaDiaCintas.toFixed(2)} | Lib R$ ${metaDiaLiberacao.toFixed(2)}`)

  // ── Normaliza e filtra ────────────────────────────────────────────────────
  let viradas          = 0
  let registrosFiltrados = 0

  const dadosCintas:    any[] = []
  const dadosLiberacao: any[] = []

  for (const row of rows) {
    // Filtro data
    const data = parseDate(row[COL_DATA!])
    if (!data) continue
    if (data.getFullYear() !== args.year || data.getMonth() + 1 !== args.month) continue

    // Filtro empresa
    const empresa = String(row[COL_EMPRESA!] ?? "").trim().toUpperCase()
    if (empresasFiltro.length && !empresasFiltro.includes(empresa)) continue

    // Horários
    const inicioMin  = parseTimeToMinutes(row[COL_INICIO!])
    const terminoMin = parseTimeToMinutes(row[COL_TERMINO!])
    if (inicioMin == null || terminoMin == null) continue

    registrosFiltrados++

    // Ajuste de virada de dia
    let terminoAjMin = terminoMin
    if (terminoMin < inicioMin) {
      terminoAjMin = terminoMin + 24 * 60   // adiciona 24h
      viradas++
    }

    const processo = String(row[COL_PROCESSOS!] ?? "").trim().toUpperCase()
    const cidade   = COL_CIDADE  ? String(row[COL_CIDADE]  ?? "").trim() : ""
    const pedidos  = COL_PEDIDOS ? row[COL_PEDIDOS] : null

    const baseRow = {
      DATA:              formatDateISO(data),
      EMPRESA:           empresa,
      CIDADE:            cidade,
      PROCESSOS:         row[COL_PROCESSOS!],
      INICIO:            minutesToHHMM(inicioMin),
      TERMINO:           minutesToHHMM(terminoMin),
      PEDIDOS:           pedidos,
      TERMINO_AJUSTADO:  minutesToHHMM(terminoAjMin),
    }

    // Processo Cintas
    if (processo.includes("CINTAS")) {
      const { perc, metaOk } = calcPercCintas(terminoAjMin)
      dadosCintas.push({
        ...baseRow,
        Perc_Meta_Cintas:  perc,
        Meta_OK_Cintas:    metaOk,
        Valor_Cintas_Dia:  +(perc * metaDiaCintas).toFixed(2),
      })
    }

    // Processo Liberação
    if (processo.includes("LIBERAÇÃO") || processo.includes("LIBERACAO") || processo.includes("ROTEIRI")) {
      const { perc, metaOk } = calcPercLib(terminoAjMin)
      dadosLiberacao.push({
        ...baseRow,
        Perc_Meta_Liberacao:  perc,
        Meta_OK_Liberacao:    metaOk,
        Valor_Liberacao_Dia:  +(perc * metaDiaLiberacao).toFixed(2),
      })
    }
  }

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalCintas    = dadosCintas.reduce((a, r) => a + r.Valor_Cintas_Dia, 0)
  const totalLiberacao = dadosLiberacao.reduce((a, r) => a + r.Valor_Liberacao_Dia, 0)
  const totalGeral     = totalCintas + totalLiberacao

  console.log(`[Faturista] Cintas: ${dadosCintas.length} reg · R$ ${totalCintas.toFixed(2)}`)
  console.log(`[Faturista] Liberação: ${dadosLiberacao.length} reg · R$ ${totalLiberacao.toFixed(2)}`)
  console.log(`[Faturista] ${viradas} viradas de dia`)

  // ── Resumo mensal por empresa ─────────────────────────────────────────────
  const empresasUnicas = new Set([
    ...dadosCintas.map(r => r.EMPRESA),
    ...dadosLiberacao.map(r => r.EMPRESA),
  ])

  const resumoMensal = Array.from(empresasUnicas).sort().map(emp => {
    const bonifCintas    = dadosCintas.filter(r => r.EMPRESA === emp).reduce((a, r) => a + r.Valor_Cintas_Dia, 0)
    const bonifLiberacao = dadosLiberacao.filter(r => r.EMPRESA === emp).reduce((a, r) => a + r.Valor_Liberacao_Dia, 0)
    return {
      empresa:              emp,
      bonificacaoCintas:    +bonifCintas.toFixed(2),
      bonificacaoLiberacao: +bonifLiberacao.toFixed(2),
      bonificacaoTotal:     +(bonifCintas + bonifLiberacao).toFixed(2),
    }
  })

  return {
    data:                dadosCintas,         // compatibilidade DataViewer
    dadosCintas,
    dadosLiberacao,
    resumoMensal,
    totalRegistros,
    registrosFiltrados,
    viradas,
    diasUteis,
    totalCintas:    +totalCintas.toFixed(2),
    totalLiberacao: +totalLiberacao.toFixed(2),
    summary:
      `Faturista ${String(args.month).padStart(2, "0")}/${args.year}: ` +
      `Cintas R$ ${totalCintas.toFixed(2)} · ` +
      `Liberação R$ ${totalLiberacao.toFixed(2)} · ` +
      `Total R$ ${totalGeral.toFixed(2)} · ` +
      `${viradas} viradas de dia`,
    extraSheets: [
      { name: "Prazo_Cintas",    data: dadosCintas    },
      { name: "Prazo_Liberacao", data: dadosLiberacao },
      { name: "Resumo_Mensal",   data: resumoMensal   },
    ],
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function executeFaturistaPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("faturista", formData, faturistaProcessor)
}
