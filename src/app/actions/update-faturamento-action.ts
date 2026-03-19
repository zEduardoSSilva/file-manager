"use server"

import { collection, getDocs, writeBatch, getFirestore, Timestamp } from "firebase/firestore"
import { initializeApp, getApps, getApp } from "firebase/app"

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

// ─── Mapeamento Excel → pipeline_result ──────────────────────────────────────
//
//  Excel col          →  pipeline_result field   Regra
//  ─────────────────────────────────────────────────────────────────────────
//  VIAGEM                 VIAGENS                 chave de matching
//  DT_FATURAMENTO    →   DATA                    string dd/MM/yyyy (com corr. de inversão)
//  ENTREGAS          →   ENTREGAS                número
//  FATURAMENTO       →   VALOR                   número
//  PESO              →   PESO                    número
//  FATURAMENTO_DEV   →   VALOR DEV               número
//  DT_FECHAMENTO     →   STATUS                  se preenchido → "FECHADO", senão → "ABERTO"
//                    →   DT_FECHAMENTO           string dd/MM/yyyy (com corr. de inversão)
//                         SAÍDA                  sempre = DATA DE ENTREGA do próprio registro
// ─────────────────────────────────────────────────────────────────────────────

interface FaturamentoRow {
  VIAGEM?:          string | number
  DT_FATURAMENTO?:  string | number
  ENTREGAS?:        string | number
  FATURAMENTO?:     string | number
  PESO?:            string | number
  FATURAMENTO_DEV?: string | number
  DT_FECHAMENTO?:   string | number
  [key: string]:    any
}

export interface UpdateFaturamentoResult {
  success:      boolean
  message:      string
  matched:      number
  updated:      number
  notMatched:   string[]
  dateWarnings: string[]   // avisos de datas corrigidas / suspeitas
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalizarViagem(v: string): string {
  return String(v ?? "").trim().replace(/^0+/, "").toUpperCase().replace(/\s+/g, "")
}

function toNum(v: any): number {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return isNaN(n) ? 0 : n
}

function isPreenchido(v: any): boolean {
  const s = String(v ?? "").trim()
  return s !== "" && s !== "0" && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined"
}

// ─── Converte serial do Excel para Date ───────────────────────────────────────
// O Excel usa epoch 1900-01-01 (com bug: considera 1900 ano bissexto)
// Seriais > 60 precisam subtrair 1 para compensar o bug do dia 29/02/1900
function excelSerialToDate(serial: number): Date {
  const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30)) // 30/12/1899
  return new Date(EXCEL_EPOCH.getTime() + serial * 86400000)
}

// ─── Parser de datas com detecção de inversão ────────────────────────────────
//
// Estratégia:
//   1. Se for número inteiro ≥ 40000 → serial do Excel → converte
//   2. Se for string com separadores → tenta DD/MM/YYYY e MM/DD/YYYY
//   3. Aplica heurística de inversão:
//      a) Se o mês > 12 → claramente invertido (dia e mês trocados)
//      b) Se dia > 12 e mês ≤ 12 → ambíguo; valida contra o período esperado
//      c) Se ambos ≤ 12 → aceita como DD/MM (padrão BR) mas alerta se mês = expectedMonth
//
// Retorna { date: Date | null; corrigida: boolean; aviso: string | null }
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedDate {
  date:      Date | null
  str:       string | null   // formato dd/MM/yyyy para salvar no banco
  corrigida: boolean
  aviso:     string | null
}

function parseDateValue(
  v: any,
  expectedYear:  number,
  expectedMonth: number,
  fieldName: string,
): ParsedDate {
  const empty: ParsedDate = { date: null, str: null, corrigida: false, aviso: null }

  if (!isPreenchido(v)) return empty

  const raw = String(v).trim()

  // ── 1. Serial numérico do Excel ───────────────────────────────────────────
  const numVal = parseFloat(raw.replace(",", "."))
  if (!isNaN(numVal) && numVal > 40000 && numVal < 60000 && !raw.includes("/") && !raw.includes("-")) {
    const d = excelSerialToDate(Math.round(numVal))
    const str = formatDateBR(d)
    return { date: d, str, corrigida: false, aviso: null }
  }

  // ── 2. Parse de strings com separadores ──────────────────────────────────
  // Normaliza separadores
  const normalized = raw.replace(/[-\.]/g, "/")
  const parts = normalized.split("/").map(p => p.trim())

  if (parts.length < 3) {
    // Tenta formato sem separador: DDMMYYYY ou YYYYMMDD
    if (raw.length === 8 && /^\d{8}$/.test(raw)) {
      const d1 = parseInt(raw.slice(0, 2))
      const m1 = parseInt(raw.slice(2, 4))
      const y1 = parseInt(raw.slice(4, 8))
      if (y1 > 2000 && m1 >= 1 && m1 <= 12 && d1 >= 1 && d1 <= 31) {
        const d = new Date(Date.UTC(y1, m1 - 1, d1))
        return { date: d, str: formatDateBR(d), corrigida: false, aviso: null }
      }
    }
    return empty
  }

  // Detecta se o ano está na primeira ou última posição
  let day: number, month: number, year: number

  const p0 = parseInt(parts[0])
  const p1 = parseInt(parts[1])
  const p2 = parseInt(parts[2])

  if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return empty

  // YYYY/MM/DD
  if (p0 > 1900) {
    year = p0; month = p1; day = p2
  } else {
    // Assume DD/MM/YYYY (padrão BR)
    day = p0; month = p1; year = p2 < 100 ? 2000 + p2 : p2
  }

  // ── 3. Heurística de inversão ─────────────────────────────────────────────
  let corrigida = false
  let aviso: string | null = null

  if (month > 12) {
    // Mês inválido → claramente dia e mês estão trocados
    ;[day, month] = [month, day]
    corrigida = true
    aviso = `[${fieldName}] Data "${raw}" estava invertida (mês > 12) → corrigida para ${day}/${month}/${year}`
  } else if (day > 12 && month <= 12) {
    // Dia > 12: não pode ser confundido com mês → formato DD/MM inequívoco
    // Nada a fazer, mas valida contra o período esperado
    if (month !== expectedMonth && day === expectedMonth) {
      // O que está no campo "mês" corresponde ao mês esperado → invertido
      ;[day, month] = [month, day]
      corrigida = true
      aviso = `[${fieldName}] Data "${raw}" parece invertida (mês esperado ${expectedMonth}) → corrigida para ${day}/${month}/${year}`
    }
  } else if (day <= 12 && month <= 12) {
    // Ambíguo (ambos ≤ 12). Valida contra período esperado.
    if (month === expectedMonth && day !== expectedMonth) {
      // OK — mês bate com o esperado
    } else if (day === expectedMonth && month !== expectedMonth) {
      // O dia bate com o mês esperado → provável inversão
      ;[day, month] = [month, day]
      corrigida = true
      aviso = `[${fieldName}] Data "${raw}" ambígua; mês esperado ${expectedMonth} → interpretada como ${day}/${month}/${year}`
    }
    // Se nenhum bate, mantém DD/MM como padrão BR sem alterar
  }

  // Valida se a data resultante é válida
  if (month < 1 || month > 12 || day < 1 || day > 31) return empty

  const date = new Date(Date.UTC(year, month - 1, day))
  if (isNaN(date.getTime())) return empty

  return { date, str: formatDateBR(date), corrigida, aviso }
}

function formatDateBR(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export async function updateEntregasFromFaturamentoAction(
  faturamentoRows: FaturamentoRow[],
  year:  number,
  month: number,
): Promise<UpdateFaturamentoResult> {
  const dateWarnings: string[] = []

  try {
    const pad   = String(month).padStart(2, "0")
    const docId = `consolidacao-entregas_${year}_${pad}`

    // ── 1. Lê TODOS os itens do mês ───────────────────────────────────────
    const itemsRef = collection(db, "pipeline_results", docId, "items")
    const snap     = await getDocs(itemsRef)

    if (snap.empty) {
      return {
        success: false,
        message: "Nenhum registro encontrado para este período.",
        matched: 0, updated: 0, notMatched: [], dateWarnings: [],
      }
    }

    // ── 2. Indexa itens por VIAGEM em memória ─────────────────────────────
    const indexPorViagem = new Map<string, { ref: any; dataEntrega: string }[]>()

    for (const d of snap.docs) {
      const data        = d.data()
      const viagens     = String(data["VIAGENS"] ?? "").trim()
      const dataEntrega = String(data["DATA DE ENTREGA"] ?? "").trim()
      if (!viagens) continue

      for (const v of viagens.split(" / ").map(x => x.trim()).filter(Boolean)) {
        const key = normalizarViagem(v)
        if (!indexPorViagem.has(key)) indexPorViagem.set(key, [])
        indexPorViagem.get(key)!.push({ ref: d.ref, dataEntrega })
      }
    }

    // ── 3. Para cada linha de faturamento, monta os campos a atualizar ────
    const updates     = new Map<string, Record<string, any>>()
    const matched     = new Set<string>()
    const notMatched: string[] = []

    for (const fat of faturamentoRows) {
      const viagemRaw = String(fat.VIAGEM ?? "").trim()
      if (!viagemRaw) continue

      const viagemKey = normalizarViagem(viagemRaw)
      const itens     = indexPorViagem.get(viagemKey)

      if (!itens || itens.length === 0) {
        notMatched.push(viagemRaw)
        continue
      }

      matched.add(viagemKey)

      // ── Monta os campos ────────────────────────────────────────────────
      const fields: Record<string, any> = {}

      // DT_FATURAMENTO → DATA (string dd/MM/yyyy, com correção de inversão)
      const dtFat = parseDateValue(fat.DT_FATURAMENTO, year, month, "DT_FATURAMENTO")
      if (dtFat.str) {
        fields["DATA"] = dtFat.str
        if (dtFat.aviso) dateWarnings.push(`Viagem ${viagemRaw}: ${dtFat.aviso}`)
      }

      // DT_FECHAMENTO → DT_FECHAMENTO (string) + STATUS
      const dtFech = parseDateValue(fat.DT_FECHAMENTO, year, month, "DT_FECHAMENTO")
      if (dtFech.str) {
        fields["DT_FECHAMENTO"] = dtFech.str
        fields["STATUS"]        = "FECHADO"
        if (dtFech.aviso) dateWarnings.push(`Viagem ${viagemRaw}: ${dtFech.aviso}`)
      } else {
        fields["STATUS"] = "ABERTO"
      }

      // Numéricos
      if (isPreenchido(fat.ENTREGAS))        fields["ENTREGAS"]   = toNum(fat.ENTREGAS)
      if (isPreenchido(fat.FATURAMENTO))     fields["VALOR"]      = toNum(fat.FATURAMENTO)
      if (isPreenchido(fat.PESO))            fields["PESO"]       = toNum(fat.PESO)
      if (isPreenchido(fat.FATURAMENTO_DEV)) fields["VALOR DEV"]  = toNum(fat.FATURAMENTO_DEV)

      for (const item of itens) {
        const id = item.ref.id
        updates.set(id, {
          ...fields,
          "SAÍDA": item.dataEntrega,   // sempre = DATA DE ENTREGA do registro
          _ref: item.ref,
        })
      }
    }

    if (updates.size === 0) {
      return {
        success: false,
        message: "Nenhum registro de entrega com match encontrado. Verifique se o campo VIAGEM do Excel bate com o campo VIAGENS das entregas.",
        matched: 0, updated: 0, notMatched, dateWarnings,
      }
    }

    // ── 4. Batch updates ──────────────────────────────────────────────────
    const BATCH_LIMIT = 499
    let   batch        = writeBatch(db)
    let   count        = 0
    let   totalWritten = 0

    for (const [, entry] of updates) {
      const { _ref, ...data } = entry
      batch.update(_ref, data)
      count++
      totalWritten++
      if (count >= BATCH_LIMIT) {
        await batch.commit()
        batch = writeBatch(db)
        count = 0
      }
    }
    if (count > 0) await batch.commit()

    const notMatchedMsg = notMatched.length > 0
      ? ` | ${notMatched.length} sem match: ${notMatched.slice(0, 8).join(", ")}${notMatched.length > 8 ? "…" : ""}`
      : " | Todas as viagens tiveram match."

    const warnMsg = dateWarnings.length > 0
      ? ` | ⚠️ ${dateWarnings.length} data(s) corrigida(s).`
      : ""

    return {
      success: true,
      message: `${totalWritten} registro(s) atualizado(s) · ${matched.size} viagem(ns) com match${notMatchedMsg}${warnMsg}`,
      matched: matched.size,
      updated: totalWritten,
      notMatched,
      dateWarnings,
    }

  } catch (e: any) {
    return { success: false, message: e.message, matched: 0, updated: 0, notMatched: [], dateWarnings: [] }
  }
}