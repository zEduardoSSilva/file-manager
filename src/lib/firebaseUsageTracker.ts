/**
 * firebaseUsageTracker.ts
 *
 * Rastreia operações do Firestore feitas por este app e persiste
 * contadores diários em `_meta/usage_YYYY-MM-DD`.
 *
 * Limites do plano gratuito (Spark):
 *   Leituras:  50.000 / dia
 *   Escritas:  20.000 / dia
 *   Exclusões: 20.000 / dia
 *
 * USO:
 *   import { trackRead, trackWrite, trackDelete } from "@/lib/firebaseUsageTracker"
 *
 *   // Depois de cada getDocs / getDoc:
 *   trackRead(snap.size)
 *
 *   // Depois de cada addDoc / setDoc / updateDoc:
 *   trackWrite()
 *
 *   // Depois de cada deleteDoc:
 *   trackDelete()
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  DocumentReference,
} from "firebase/firestore"
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

// ─── Limites do plano Spark ───────────────────────────────────────────────────
export const SPARK_LIMITS = {
  reads:   50_000,
  writes:  20_000,
  deletes: 20_000,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // "YYYY-MM-DD"
}

function usageDocRef(): DocumentReference {
  return doc(db, "_meta", `usage_${todayKey()}`)
}

// Fila de incrementos pendentes — enviados em batch a cada 2 segundos
// para evitar excesso de escritas no Firestore
let pendingReads   = 0
let pendingWrites  = 0
let pendingDeletes = 0
let flushTimeout: ReturnType<typeof setTimeout> | null = null

async function flush() {
  flushTimeout = null
  const r = pendingReads
  const w = pendingWrites
  const d = pendingDeletes
  pendingReads = pendingWrites = pendingDeletes = 0
  if (r === 0 && w === 0 && d === 0) return

  const ref = usageDocRef()
  try {
    await updateDoc(ref, {
      reads:     increment(r),
      writes:    increment(w),
      deletes:   increment(d),
      lastSeen:  Date.now(),
    })
  } catch {
    // Documento ainda não existe → cria com os valores iniciais
    try {
      await setDoc(ref, {
        date:     todayKey(),
        reads:    r,
        writes:   w,
        deletes:  d,
        lastSeen: Date.now(),
      })
    } catch (e) {
      // silencia — não queremos travar a app por falha no tracker
    }
  }
}

function schedule() {
  if (flushTimeout) return
  flushTimeout = setTimeout(flush, 2000) // agrupa em janelas de 2s
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** Chame depois de getDocs / getDoc, passando o número de documentos lidos. */
export function trackRead(count = 1) {
  pendingReads += count
  schedule()
}

/** Chame depois de addDoc / setDoc / updateDoc. */
export function trackWrite(count = 1) {
  pendingWrites += count
  schedule()
}

/** Chame depois de deleteDoc. */
export function trackDelete(count = 1) {
  pendingDeletes += count
  schedule()
}

// ─── Leitura dos contadores ───────────────────────────────────────────────────

export interface DailyUsage {
  date:     string
  reads:    number
  writes:   number
  deletes:  number
  lastSeen: number
}

/** Busca os contadores dos últimos N dias. */
export async function fetchUsageHistory(days = 7): Promise<DailyUsage[]> {
  const result: DailyUsage[] = []
  const today = new Date()

  for (let i = 0; i < days; i++) {
    const d   = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const ref = doc(db, "_meta", `usage_${key}`)
    try {
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        result.push({
          date:     key,
          reads:    data.reads    ?? 0,
          writes:   data.writes   ?? 0,
          deletes:  data.deletes  ?? 0,
          lastSeen: data.lastSeen ?? 0,
        })
      } else {
        result.push({ date: key, reads: 0, writes: 0, deletes: 0, lastSeen: 0 })
      }
    } catch {
      result.push({ date: key, reads: 0, writes: 0, deletes: 0, lastSeen: 0 })
    }
  }

  return result.reverse() // mais antigo → mais recente
}