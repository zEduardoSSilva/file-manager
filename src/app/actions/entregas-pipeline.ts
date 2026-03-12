"use server"

import { processAndSave, PipelineArgs, ProcessorOutput, PipelineResponse } from "./pipeline-utils"

// ─── Configurações ────────────────────────────────────────────────────────────
const MAPA_FILIAL_REGIAO: Record<string, string> = {
  "Cambe":        "RK01",
  "Cascavel":     "KP01",
  "Curitiba":     "RK03",
  "Campo Grande": "BV01",
  "Dourados":     "BV02",
}

const COLS_REMOVER = new Set([
  "CURITIBA","AS","CHÃO","EM ROTA","SIM","MARINGA","INTERIOR",
  "LONDRINA","CASCAVEL","CAMPO GRANDE","A,S/CAMPO GRANDE",
  "DOURADOS","CAMBE","LIQUIDAÇÃO","ID","DESCARGA PLT","DESCARGA PALET","VALOR LIQ",
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function removeAcentos(txt: string): string {
  return txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
}

function formatarTempo(valor: any): string {
  if (valor == null || valor === "") return ""
  const num = Number(valor)
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60)
    return `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`
  }
  const str = String(valor).trim()
  const match = str.match(/^(\d+):(\d{2})(?::\d{2})?$/)
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`
  return str
}

/**
 * Monta o nome de aba no padrão DD.MM.YYYY usado nas planilhas de controle.
 */
export function montarNomeAba(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`
}

/**
 * Verifica se um nome de aba no formato DD.MM.YYYY pertence ao mês/ano alvo.
 */
export function abaDoMes(nomeAba: string, month: number, year: number): boolean {
  const match = nomeAba.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return false
  return parseInt(match[2]) === month && parseInt(match[3]) === year
}

// ─── Processamento de linhas de uma aba ──────────────────────────────────────

function processarRows(rows: any[], filialNome: string, dataEntrega: string): any[] {
  if (!rows || rows.length === 0) return []

  const colsKeys = Object.keys(rows[0] ?? {})

  const colData      = colsKeys.find(k => /^DATA$/i.test(k.trim()))
  const colMotorista = colsKeys.find(k => /MOTORISTA/i.test(k))
  const colPeso      = colsKeys.find(k => /^PESO$/i.test(k.trim()))
  const colPlaca     = colsKeys.find(k => /^PLACA$/i.test(k.trim()))
  const colPlacaSis  = colsKeys.find(k => /PLACA SISTEMA/i.test(k))
  const colTempo     = colsKeys.find(k => /^TEMPO$/i.test(k.trim()))
  const colKm        = colsKeys.find(k => /^KM$/i.test(k.trim()))
  const colEntregas  = colsKeys.find(k => /^ENTREGAS$/i.test(k.trim()))
  const colAjudante  = colsKeys.find(k => /^AJUDANTE$/i.test(k.trim()))
  const colObs       = colsKeys.find(k => /OBSERVA/i.test(k))
  const colStatus    = colsKeys.find(k => /^STATUS$/i.test(k.trim()))
  const colLiq       = colsKeys.find(k => /LIQUIDA|^ID$/i.test(k.trim()))
  const colValor     = colsKeys.find(k => /^VALOR$/i.test(k.trim()))

  const resultado: any[] = []

  for (const row of rows) {
    const dataVal = row[colData ?? ""]
    if (!dataVal) continue
    const dataStr = String(dataVal).toUpperCase()
    if (/TOTAL|GERAL|CARGAS|FROTA|FRETE/.test(dataStr)) continue
    if (!row[colMotorista ?? ""]) continue

    let placa = colPlaca ? row[colPlaca] : null
    if (!placa && colPlacaSis) placa = row[colPlacaSis]
    const viagem = colLiq ? row[colLiq] : null

    const out: any = {
      "REGIÃO":          MAPA_FILIAL_REGIAO[filialNome] ?? "",
      "DATA DE ENTREGA": dataEntrega,
      "DATA":            colData      ? row[colData]      : "",
      "MOTORISTA":       colMotorista ? row[colMotorista] : "",
      "AJUDANTE":        colAjudante  ? row[colAjudante]  : "",
      "PLACA SISTEMA":   colPlacaSis  ? row[colPlacaSis]  : "",
      "PLACA":           placa ?? "",
      "ENTREGAS":        colEntregas  ? row[colEntregas]  : "",
      "PESO":            colPeso      ? row[colPeso]      : "",
      "TEMPO":           colTempo     ? formatarTempo(row[colTempo]) : "",
      "KM":              colKm        ? row[colKm]        : "",
      "VIAGEM":          viagem ?? "",
      "OBSERVAÇÃO":      colObs       ? row[colObs]       : "",
      "STATUS":          colStatus    ? row[colStatus]    : "",
      "VALOR":           colValor     ? row[colValor]     : "",
    }

    for (const key of colsKeys) {
      if (COLS_REMOVER.has(key.toUpperCase())) continue
      if (key.startsWith("Unnamed")) continue
      if (!(key in out)) out[key] = row[key]
    }

    resultado.push(out)
  }

  return resultado
}

// ─── Acumulado (sem CHÃO) ─────────────────────────────────────────────────────

function gerarAcumulado(filialData: Record<string, any[]>): any[] {
  const todos: any[] = []
  for (const [filial, rows] of Object.entries(filialData)) {
    for (const row of rows) {
      const cat = removeAcentos(String(row["CATEGORIA_ORIGEM"] ?? "")).trim()
      if (cat === "CHAO") continue
      todos.push({ "FILIAL": filial, ...row })
    }
  }
  return todos
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function consolidacaoEntregasProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const month = args.month ?? new Date().getMonth() + 1
  const year  = args.year  ?? new Date().getFullYear()
  const day   = parseInt(args.formData?.get("day") as string ?? "0") || 0

  // Nome da aba alvo passado via formData (a view já monta o nome correto)
  // day > 0  → "DD.MM.YYYY"   (apenas essa aba)
  // day == 0 → ""             (todas as abas — filtradas pelo processador)
  const abaAlvo = day > 0 ? montarNomeAba(day, month, year) : ""

  // Injeta abaAlvo no formData para que pipeline-utils selecione a aba certa
  // pipeline-utils lê args.formData.get("sheetName") antes de parsear o Excel
  if (abaAlvo) {
    args.formData?.set("sheetName", abaAlvo)
  }

  // readAll com 2 argumentos — schema undefined (sem validação Zod)
  const sheetsData = await args.files.readAll("files")
  const fileNames: string[] = (args.formData?.getAll("fileNames") as string[]) ?? []

  if (!sheetsData.length) throw new Error("Nenhum arquivo encontrado.")

  const filialData: Record<string, any[]> = {}
  let totalRegistros = 0
  const diasProcessados = new Set<string>()

  // Quando abaAlvo está vazio (mês completo), sheetsData pode conter
  // múltiplos grupos — um por aba lida. O pipeline-utils injeta
  // __sheetName nos rows para que possamos filtrar aqui.
  sheetsData.forEach((rows, idx) => {
    const sheetName: string = (rows as any).__sheetName ?? abaAlvo ?? ""

    // Modo mês completo: ignora abas que não sejam DD.MM.YYYY do mês/ano
    if (!abaAlvo && sheetName) {
      if (!abaDoMes(sheetName, month, year)) return
    }

    if (sheetName) diasProcessados.add(sheetName)

    // Índice do arquivo original (injetado pelo pipeline-utils em modo multi-aba)
    const fileIdx: number = (rows as any).__fileIndex ?? idx
    const nome = (fileNames[fileIdx] ?? fileNames[idx] ?? "").toLowerCase()

    let filialNome = "Desconhecida"
    if      (/cambe/i.test(nome))          filialNome = "Cambe"
    else if (/cascavel/i.test(nome))       filialNome = "Cascavel"
    else if (/curitiba/i.test(nome))       filialNome = "Curitiba"
    else if (/campo.?grande/i.test(nome))  filialNome = "Campo Grande"
    else if (/dourados/i.test(nome))       filialNome = "Dourados"

    // DATA DE ENTREGA legível
    const dataEntrega = abaAlvo
      ? abaAlvo.replace(/\./g, "/")                         // "DD/MM/YYYY"
      : sheetName
        ? sheetName.replace(/\./g, "/")                     // aba do mês
        : `${String(month).padStart(2, "0")}/${year}`       // fallback

    const processados = processarRows(rows, filialNome, dataEntrega)
    if (!filialData[filialNome]) filialData[filialNome] = []
    filialData[filialNome].push(...processados)
    totalRegistros += processados.length
  })

  const acumulado = gerarAcumulado(filialData)
  const filiaisOk = Object.values(filialData).filter(r => r.length > 0).length
  const diasLabel = day > 0
    ? `dia ${String(day).padStart(2, "0")}`
    : `${diasProcessados.size} dias`

  const extraSheets = [
    ...Object.entries(filialData).map(([filial, rows]) => ({
      name: filial.slice(0, 31),
      data: rows,
    })),
    { name: "Acumulado", data: acumulado },
  ]

  return {
    data: acumulado,
    summary: `Consolidação ${String(month).padStart(2, "0")}/${year} (${diasLabel}): ${filiaisOk} filiais · ${totalRegistros} registros · ${acumulado.length} no acumulado`,
    extraSheets,
  }
}

export async function executeConsolidacaoEntregasPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("consolidacao-entregas", formData, consolidacaoEntregasProcessor)
}