"use server"

import { collection, getDocs, writeBatch, getFirestore } from "firebase/firestore"
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
//  DT_FATURAMENTO    →   DATA                    direto
//  ENTREGAS          →   ENTREGAS                direto (número)
//  FATURAMENTO       →   VALOR                   direto (número)
//  PESO              →   PESO                    direto (número)
//  FATURAMENTO_DEV   →   VALOR DEV               direto (número)
//  DT_FECHAMENTO     →   STATUS                  se preenchido → "FECHADO", senão → "ABERTO"
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
  success:    boolean
  message:    string
  matched:    number
  updated:    number
  notMatched: string[]
}

function normalizarViagem(v: string): string {
  // Remove zeros à esquerda e espaços — assim "00031012" e "31012" são iguais
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

export async function updateEntregasFromFaturamentoAction(
  faturamentoRows: FaturamentoRow[],
  year:  number,
  month: number,
): Promise<UpdateFaturamentoResult> {
  try {
    const pad   = String(month).padStart(2, "0")
    const docId = `consolidacao-entregas_${year}_${pad}`

    // ── 1. Lê TODOS os itens do mês — 1 única query ───────────────────────
    const itemsRef = collection(db, "pipeline_results", docId, "items")
    const snap     = await getDocs(itemsRef)

    if (snap.empty) {
      return {
        success: false,
        message: "Nenhum registro encontrado para este período.",
        matched: 0, updated: 0, notMatched: [],
      }
    }

    // ── 2. Indexa itens por VIAGEM em memória ─────────────────────────────
    // VIAGENS pode conter múltiplos valores separados por " / "
    const indexPorViagem = new Map<string, { ref: any; dataEntrega: string }[]>()

    for (const d of snap.docs) {
      const data       = d.data()
      const viagens    = String(data["VIAGENS"] ?? "").trim()
      const dataEntrega = String(data["DATA DE ENTREGA"] ?? "").trim()
      if (!viagens) continue

      for (const v of viagens.split(" / ").map(x => x.trim()).filter(Boolean)) {
        const key = normalizarViagem(v)
        if (!indexPorViagem.has(key)) indexPorViagem.set(key, [])
        indexPorViagem.get(key)!.push({ ref: d.ref, dataEntrega })
      }
    }

    // ── 3. Para cada linha de faturamento, monta os campos a atualizar ────
    const updates    = new Map<string, Record<string, any>>() // itemId → { _ref, fields }
    const matched    = new Set<string>()
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

      // ── Monta os campos conforme mapeamento + regras ───────────────────
      const fields: Record<string, any> = {}

      // DT_FATURAMENTO → DATA
      if (isPreenchido(fat.DT_FATURAMENTO))
        fields["DATA"] = String(fat.DT_FATURAMENTO).trim()

      // ENTREGAS → ENTREGAS
      if (isPreenchido(fat.ENTREGAS))
        fields["ENTREGAS"] = toNum(fat.ENTREGAS)

      // FATURAMENTO → VALOR
      if (isPreenchido(fat.FATURAMENTO))
        fields["VALOR"] = toNum(fat.FATURAMENTO)

      // PESO → PESO
      if (isPreenchido(fat.PESO))
        fields["PESO"] = toNum(fat.PESO)

      // FATURAMENTO_DEV → VALOR DEV
      if (isPreenchido(fat.FATURAMENTO_DEV))
        fields["VALOR DEV"] = toNum(fat.FATURAMENTO_DEV)

      // DT_FECHAMENTO → STATUS (regra condicional)
      fields["STATUS"] = isPreenchido(fat.DT_FECHAMENTO) ? "FECHADO" : "ABERTO"

      for (const item of itens) {
        const id = item.ref.id

        // SAÍDA → DATA DE ENTREGA do próprio registro (sempre)
        const fieldsComSaida = {
          ...fields,
          "SAÍDA": item.dataEntrega,
        }

        updates.set(id, { ...fieldsComSaida, _ref: item.ref })
      }
    }

    if (updates.size === 0) {
      return {
        success: false,
        message: `Nenhum registro de entrega com match encontrado. Verifique se o campo VIAGEM do Excel bate com o campo VIAGENS das entregas.`,
        matched: 0, updated: 0, notMatched,
      }
    }

    // ── 4. Batch updates ──────────────────────────────────────────────────
    const BATCH_LIMIT = 499
    let   batch       = writeBatch(db)
    let   count       = 0
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

    return {
      success: true,
      message: `${totalWritten} registro(s) atualizado(s) · ${matched.size} viagem(ns) com match${notMatchedMsg}`,
      matched: matched.size,
      updated: totalWritten,
      notMatched,
    }

  } catch (e: any) {
    return { success: false, message: e.message, matched: 0, updated: 0, notMatched: [] }
  }
}