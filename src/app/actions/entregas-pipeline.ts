"use server"

import { processAndSave, PipelineArgs, ProcessorOutput, PipelineResponse } from "./pipeline-utils"
import {
  getFirestore, collection, query, where, getDocs,
} from "firebase/firestore"
import { initializeApp, getApps, getApp } from "firebase/app"

// ─── Firebase (server-side) ───────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDj733yNRCHjua7X-0rkHc74VA4qkDpg9w",
  authDomain:        "file-manager-hub-50030335.firebaseapp.com",
  projectId:         "file-manager-hub-50030335",
  storageBucket:     "file-manager-hub-50030335.firebasestorage.app",
  messagingSenderId: "187801013388",
  appId:             "1:187801013388:web:ef1417fae5d8d24d93ffa9",
}
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const db  = getFirestore(app)

// ─── Configurações ────────────────────────────────────────────────────────────
const MAPA_FILIAL_REGIAO: Record<string, string> = {
  "Cambe":        "RK01",
  "Cascavel":     "KP01",
  "Curitiba":     "RK03",
  "Campo Grande": "BV01",
  "Dourados":     "BV02",
}

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

export function montarNomeAba(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`
}

export function abaDoMes(nomeAba: string, month: number, year: number): boolean {
  const match = nomeAba.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return false
  return parseInt(match[2]) === month && parseInt(match[3]) === year
}

const PALAVRAS_ROTA = new Set([
  "ROTINA", "CHAO", "CHÃO", "INTERIOR", "CASCAVEL", "CURITIBA",
  "CAMBE", "CAMPO GRANDE", "DOURADOS", "MARINGA", "LONDRINA",
  "AS", "A/S", "EM ROTA", "FRETE",
])

function detectarRota(row: any, colsKeys: string[]): string {
  for (const k of colsKeys) {
    const ku = removeAcentos(k)
    if (ku === "ROTA" || ku === "CATEGORIA_ORIGEM" || ku === "CATEGORIA ORIGEM") {
      const v = String(row[k] ?? "").trim()
      if (v) return v
    }
  }
  for (const k of colsKeys) {
    const v = String(row[k] ?? "").trim()
    if (v && PALAVRAS_ROTA.has(removeAcentos(v))) return v
  }
  if (colsKeys.length >= 6) {
    const v = String(row[colsKeys[5]] ?? "").trim()
    if (v && !/^\d+$/.test(v)) return v
  }
  return ""
}

function norm(s: string): string {
  return removeAcentos(s).replace(/\s+/g, " ").trim()
}

function findCol(colsKeys: string[], ...patterns: RegExp[]): string | undefined {
  for (const pat of patterns) {
    const found = colsKeys.find(k => pat.test(norm(k)))
    if (found) return found
  }
  return undefined
}

// ─── Chave de deduplicação ────────────────────────────────────────────────────
function dedupKey(row: any): string {
  const liq  = String(row["LIQUIDAÇÃO"]      ?? "").trim()
  const data = String(row["DATA DE ENTREGA"] ?? "").trim()
  return `${liq}|${data}`
}

// ─── Busca registros já salvos no Firebase ────────────────────────────────────
// Retorna tanto o Set de chaves (para dedup) quanto o array de linhas existentes
// (para reincluir no novo documento, garantindo que nada se perca).
async function buscarDadosExistentes(
  year: number,
  month: number,
): Promise<{ keys: Set<string>; rows: any[] }> {
  try {
    const q = query(
      collection(db, "pipeline_results"),
      where("pipelineType", "==", "consolidacao-entregas"),
      where("year",  "==", year),
      where("month", "==", month),
    )
    const snap = await getDocs(q)
    if (snap.empty) return { keys: new Set(), rows: [] }

    // Documento mais recente (ordenação client-side, sem orderBy)
    const sorted = snap.docs.sort(
      (a, b) => (b.data().timestamp ?? 0) - (a.data().timestamp ?? 0)
    )
    const rows: any[] = sorted[0].data().data ?? []
    const keys = new Set<string>()
    for (const row of rows) {
      const k = dedupKey(row)
      if (k !== "|") keys.add(k)
    }
    return { keys, rows }
  } catch {
    // Se falhar a busca, prossegue sem deduplicação
    return { keys: new Set(), rows: [] }
  }
}

// ─── Processamento de linhas de uma aba ──────────────────────────────────────
function processarRows(rows: any[], filialNome: string, dataEntrega: string): any[] {
  if (!rows || rows.length === 0) return []
  const colsKeys = Object.keys(rows[0] ?? {})

  console.log(`[processarRows] Filial: ${filialNome} | Colunas detectadas:`, colsKeys)
  console.log(`[processarRows] Primeira linha:`, rows[0])
  console.log(`[processarRows] colData:`, findCol(colsKeys, /^DATA$/))
  console.log(`[processarRows] colMotorista:`, findCol(colsKeys, /MOTORISTA/))

  const colData       = findCol(colsKeys, /^DATA$/)
  const colMotorista  = findCol(colsKeys, /MOTORISTA/)
  const colAjudante1 = findCol(colsKeys, /^AJUDANTE_1$/, /^AJUDANTE$/)
  const colAjudante2 = findCol(colsKeys, /^AJUDANTE_2$/)
  const colPlaca      = findCol(colsKeys, /^PLACA$/)
  const colPlacaSis   = findCol(colsKeys, /PLACA.?SISTEMA/)
  const colEntregas   = findCol(colsKeys, /^ENTREGAS$/)
  const colPeso       = findCol(colsKeys, /^PESO$/)
  const colTempo      = findCol(colsKeys, /^TEMPO$/)
  const colKm         = findCol(colsKeys, /^KM$/)
  const colLiquidacao = findCol(colsKeys, /LIQUIDA/, /^VIAGEM$/, /^ID$/)
  const colObs        = findCol(colsKeys, /OBSERVA/)
  const colChapa      = findCol(colsKeys, /^CHAPA$/)
  const colFrete      = findCol(colsKeys, /^FRETE$/)
  const colDescarga   = findCol(colsKeys, /DESCARGA/)
  const colHospedagem = findCol(colsKeys, /HOSPED/)
  const colDiaria     = findCol(colsKeys, /^DIARIA$/, /^DIÁRIA$/)
  const colExtra      = findCol(colsKeys, /^EXTRA$/)
  const colSaida      = findCol(colsKeys, /^SA[IÍ]DA$/)
  const colModelo     = findCol(colsKeys, /^MODELO$/)
  const colOcp        = findCol(colsKeys, /^OCP$/)
  const colValor      = findCol(colsKeys, /^VALOR$/)
  const colStatus     = findCol(colsKeys, /^STATUS$/)
  const colContrato   = findCol(colsKeys, /^CONTRATO$/)
  const colPerforma   = findCol(colsKeys, /PERFORMAXXI/)
  const colEntDev     = findCol(colsKeys, /ENTREGAS.?DEV/)
  const colValorDev   = findCol(colsKeys, /VALOR.?DEV/)

  const resultado: any[] = []

  for (const row of rows) {
    const dataVal = colData ? row[colData] : null
    if (!dataVal) continue
    const dataStr = String(dataVal).toUpperCase()
    if (/TOTAL|GERAL|CARGAS|FROTA|FRETE/.test(dataStr)) continue

    const motoristaVal = colMotorista ? row[colMotorista] : null
    if (!motoristaVal) continue
    if (String(motoristaVal).toUpperCase() === "MOTORISTA") continue

    let placa = colPlaca ? row[colPlaca] : null
    if (!placa && colPlacaSis) placa = row[colPlacaSis]

    const rota = String(row["ROTA"] ?? "").trim()

    resultado.push({
      "ROTA":            rota,
      "FILIAL":          filialNome,
      "REGIÃO":          MAPA_FILIAL_REGIAO[filialNome] ?? "",
      "DATA DE ENTREGA": dataEntrega,
      "DATA":            dataVal,
      "MOTORISTA":       motoristaVal,
      "AJUDANTE":   colAjudante1 ? (row[colAjudante1] ?? null) : null,
      "AJUDANTE 2": colAjudante2 ? (row[colAjudante2] ?? null) : null,        
      "PLACA SISTEMA":   colPlacaSis    ? (row[colPlacaSis]    ?? null) : null,
      "PLACA":           placa          ?? null,
      "ENTREGAS":        colEntregas    ? (row[colEntregas]    ?? null) : null,
      "PESO":            colPeso        ? (row[colPeso]        ?? null) : null,
      "TEMPO":           colTempo       ? formatarTempo(row[colTempo])  : "",
      "KM":              colKm          ? (row[colKm]          ?? null) : null,
      "LIQUIDAÇÃO":      colLiquidacao  ? (row[colLiquidacao]  ?? null) : null,
      "OBSERVAÇÃO":      colObs         ? (row[colObs]         ?? null) : null,
      "CHAPA":           colChapa       ? (row[colChapa]       ?? null) : null,
      "FRETE":           colFrete       ? (row[colFrete]       ?? null) : null,
      "DESCARGA PALET":  colDescarga    ? (row[colDescarga]    ?? null) : null,
      "HOSPEDAGEM":      colHospedagem  ? (row[colHospedagem]  ?? null) : null,
      "DIARIA":          colDiaria      ? (row[colDiaria]      ?? null) : null,
      "EXTRA":           colExtra       ? (row[colExtra]       ?? null) : null,
      "SAÍDA":           colSaida       ? (row[colSaida]       ?? null) : null,
      "MODELO":          colModelo      ? (row[colModelo]      ?? null) : null,
      "OCP":             colOcp         ? (row[colOcp]         ?? null) : null,
      "VALOR":           colValor       ? (row[colValor]       ?? null) : null,
      "STATUS":          colStatus      ? (row[colStatus]      ?? null) : null,
      "CONTRATO":        colContrato    ? (row[colContrato]    ?? null) : null,
      "PERFORMAXXI":     colPerforma    ? (row[colPerforma]    ?? null) : null,
      "ENTREGAS DEV":    colEntDev      ? (row[colEntDev]      ?? null) : null,
      "VALOR DEV":       colValorDev    ? (row[colValorDev]    ?? null) : null,
    })
  }
  return resultado
}

// ─── Acumulado (sem CHÃO) ─────────────────────────────────────────────────────
function gerarAcumulado(filialData: Record<string, any[]>): any[] {
  const todos: any[] = []
  for (const rows of Object.values(filialData)) {
    for (const row of rows) {
      if (removeAcentos(String(row["ROTA"] ?? "")).trim() === "CHAO") continue
      todos.push(row)
    }
  }
  return todos
}

// ─── Processor principal ──────────────────────────────────────────────────────
async function consolidacaoEntregasProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const { year, month, files, formData } = args
  const day = parseInt(formData?.get("day") as string ?? "0") || 0
  const abaAlvo = day > 0 ? montarNomeAba(day, month, year) : ""
  if (abaAlvo) formData.set("sheetName", abaAlvo)

  const sheetsData = await files.readAll("files")
  const fileNames: string[] = (formData.getAll("fileNames") as string[]) ?? []
  if (!sheetsData.length) throw new Error("Nenhum arquivo ou aba encontrada.")

  // ── Busca o que já existe no Firebase ────────────────────────────────────
  // rows: linhas já salvas (serão reincluídas no novo doc)
  // keys: Set de chaves para detectar duplicatas
  const { keys: existentes, rows: rowsExistentes } = await buscarDadosExistentes(year, month)

  const filialData: Record<string, any[]> = {}
  let totalRegistros = 0
  const diasProcessados = new Set<string>()

  for (const [idx, rows] of sheetsData.entries()) {
    const sheetName: string = (rows as any).__sheetName ?? abaAlvo ?? ""
    if (!abaAlvo && sheetName && !abaDoMes(sheetName, month, year)) continue
    if (sheetName) diasProcessados.add(sheetName)

    const fileIdx: number = (rows as any).__fileIndex ?? idx
    const nome = (fileNames[fileIdx] ?? "").toLowerCase()

    const filialId = (fileNames[fileIdx] ?? "").toLowerCase()
    let filialNome = "Desconhecida"
    if      (filialId === "cambe")        filialNome = "Cambe"
    else if (filialId === "cascavel")     filialNome = "Cascavel"
    else if (filialId === "curitiba")     filialNome = "Curitiba"
    else if (filialId === "campo-grande") filialNome = "Campo Grande"
    else if (filialId === "dourados")     filialNome = "Dourados"
    // Fallback: tenta pelo nome real do arquivo caso o id não bata
    else if (/cambe/i.test(nome))         filialNome = "Cambe"
    else if (/cascavel/i.test(nome))      filialNome = "Cascavel"
    else if (/curitiba/i.test(nome))      filialNome = "Curitiba"
    else if (/campo.?grande/i.test(nome)) filialNome = "Campo Grande"
    else if (/dourados/i.test(nome))      filialNome = "Dourados"

    const dataEntrega = abaAlvo
      ? abaAlvo.replace(/\./g, "/")
      : sheetName
        ? sheetName.replace(/\./g, "/")
        : `${String(month).padStart(2, "0")}/${year}`

    const processados = processarRows(rows, filialNome, dataEntrega)
    if (!filialData[filialNome]) filialData[filialNome] = []
    filialData[filialNome].push(...processados)
    totalRegistros += processados.length
  }

  // ── Separa novos × duplicados ─────────────────────────────────────────────
  const acumuladoBruto = gerarAcumulado(filialData)

  const duplicadas: Array<{ liquidacao: string; data: string; motorista: string; filial: string }> = []
  const novosRegistros: any[] = []

  for (const row of acumuladoBruto) {
    const k = dedupKey(row)
    if (k !== "|" && existentes.has(k)) {
      duplicadas.push({
        liquidacao: String(row["LIQUIDAÇÃO"]      ?? "—"),
        data:       String(row["DATA DE ENTREGA"] ?? "—"),
        motorista:  String(row["MOTORISTA"]       ?? "—"),
        filial:     String(row["FILIAL"]          ?? "—"),
      })
    } else {
      novosRegistros.push(row)
    }
  }

  // ── Documento final = existentes + novos ──────────────────────────────────
  // Assim o documento mais recente sempre contém o histórico completo do mês,
  // independentemente de quantas vezes o pipeline for executado.
  const acumuladoFinal = [...rowsExistentes, ...novosRegistros]

  // ExtraSheets: recalcula por filial usando o acumulado final completo
  const filialDataFiltrada: Record<string, any[]> = {}
  const duplicadasKeys = new Set(duplicadas.map(d => `${d.liquidacao}|${d.data}`))

  // Para os extraSheets por filial, combina existentes + novos (sem duplicados)
  for (const [filial, rows] of Object.entries(filialData)) {
    filialDataFiltrada[filial] = rows.filter(r => !duplicadasKeys.has(dedupKey(r)))
  }
  // Reincorpora linhas existentes nas filiais corretas
  for (const row of rowsExistentes) {
    const filial = String(row["FILIAL"] ?? "Desconhecida")
    if (!filialDataFiltrada[filial]) filialDataFiltrada[filial] = []
    filialDataFiltrada[filial].push(row)
  }

  const filiaisOk = Object.values(filialDataFiltrada).filter(r => r.length > 0).length
  const diasLabel = day > 0
    ? `dia ${String(day).padStart(2, "0")}`
    : `${diasProcessados.size} dias`

  const dupInfo = duplicadas.length > 0
    ? ` · ${duplicadas.length} duplicada(s) ignorada(s)`
    : ""

  return {
    // data = acumulado COMPLETO (histórico + novos) — é o que o grid exibe
    data: acumuladoFinal,
    summary: `Consolidação ${String(month).padStart(2, "0")}/${year} (${diasLabel}): ${filiaisOk} filiais · ${totalRegistros} registros novos · ${acumuladoFinal.length} no acumulado${dupInfo}`,
    duplicadas,
    extraSheets: [
      ...Object.entries(filialDataFiltrada).map(([filial, rows]) => ({
        name: filial.slice(0, 31),
        data: rows,
      })),
      { name: "Acumulado", data: acumuladoFinal },
    ],
  }
}

export async function executeConsolidacaoEntregasPipeline(formData: FormData): Promise<PipelineResponse> {
  return await processAndSave("consolidacao-entregas", formData, consolidacaoEntregasProcessor)
}