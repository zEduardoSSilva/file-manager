/**
 * firebaseUsageTracker.ts
 *
 * Rastreia operações do Firestore por usuário e persiste contadores diários
 * em `_meta/usage_YYYY-MM-DD`.
 *
 * O documento de uso terá a seguinte estrutura:
 *   date: "YYYY-MM-DD"
 *   lastSeen: timestamp
 *   totalReads: X
 *   totalWrites: Y
 *   totalDeletes: Z
 *   users: {
 *     [userId]: {
 *       name: "Nome do Usuário",
 *       email: "email@usuario.com",
 *       reads: A,
 *       writes: B,
 *       deletes: C
 *     },
 *     // ...outros usuários
 *   }
 */

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  DocumentReference,
} from "firebase/firestore";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyDj733yNRCHjua7X-0rkHc74VA4qkDpg9w",
  authDomain:        "file-manager-hub-50030335.firebaseapp.com",
  projectId:         "file-manager-hub-50030335",
  storageBucket:     "file-manager-hub-50030335.firebasestorage.app",
  messagingSenderId: "187801013388",
  appId:             "1:187801013388:web:ef1417fae5d8d24d93ffa9",
};
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app); // Get auth instance

// ─── Limites do plano Spark ───────────────────────────────────────────────────
export const SPARK_LIMITS = {
  reads:   50_000,
  writes:  20_000,
  deletes: 20_000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function usageDocRef(): DocumentReference {
  return doc(db, "_meta", `usage_${todayKey()}`);
}

// Fila de incrementos pendentes por usuário
let pendingReads:   { [key: string]: number } = {};
let pendingWrites:  { [key: string]: number } = {};
let pendingDeletes: { [key: string]: number } = {};
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimeout = null;
  const readsToFlush = pendingReads;
  const writesToFlush = pendingWrites;
  const deletesToFlush = pendingDeletes;
  pendingReads = {};
  pendingWrites = {};
  pendingDeletes = {};

  const allUserIds = [
    ...Object.keys(readsToFlush),
    ...Object.keys(writesToFlush),
    ...Object.keys(deletesToFlush),
  ];
  if (allUserIds.length === 0) return;

  const uniqueUserIds = [...new Set(allUserIds)];
  const ref = usageDocRef();
  const updatePayload: { [key: string]: any } = { lastSeen: Date.now() };

  let totalReads = 0;
  let totalWrites = 0;
  let totalDeletes = 0;

  const currentUser = auth.currentUser;

  for (const userId of uniqueUserIds) {
    const r = readsToFlush[userId] || 0;
    const w = writesToFlush[userId] || 0;
    const d = deletesToFlush[userId] || 0;

    if (r > 0) {
      updatePayload[`users.${userId}.reads`] = increment(r);
      totalReads += r;
    }
    if (w > 0) {
      updatePayload[`users.${userId}.writes`] = increment(w);
      totalWrites += w;
    }
    if (d > 0) {
      updatePayload[`users.${userId}.deletes`] = increment(d);
      totalDeletes += d;
    }

    // Adiciona/atualiza info do usuário para referência futura no dashboard
    if (currentUser && currentUser.uid === userId) {
        updatePayload[`users.${userId}.name`] = currentUser.displayName || "N/A";
        updatePayload[`users.${userId}.email`] = currentUser.email || "N/A";
    }
  }

  // Adiciona incrementos para os totais do dia
  if (totalReads > 0)   updatePayload.totalReads = increment(totalReads);
  if (totalWrites > 0)  updatePayload.totalWrites = increment(totalWrites);
  if (totalDeletes > 0) updatePayload.totalDeletes = increment(totalDeletes);

  try {
    await updateDoc(ref, updatePayload);
  } catch (error: any) {
    // Se o documento não existe, cria um novo com os valores corretos
    if (error.code === 'not-found') {
        try {
            const initialPayload = {
                date: todayKey(),
                lastSeen: Date.now(),
                totalReads: totalReads,
                totalWrites: totalWrites,
                totalDeletes: totalDeletes,
                users: {} as {[key: string]: any}
            };
            for (const userId of uniqueUserIds) {
                initialPayload.users[userId] = {
                    reads: readsToFlush[userId] || 0,
                    writes: writesToFlush[userId] || 0,
                    deletes: deletesToFlush[userId] || 0,
                };
                 if (currentUser && currentUser.uid === userId) {
                    initialPayload.users[userId].name = currentUser.displayName || "N/A";
                    initialPayload.users[userId].email = currentUser.email || "N/A";
                }
            }
            await setDoc(ref, initialPayload);
        } catch (e) {
            console.error("Firebase Usage Tracker: Falha ao criar doc de uso.", e);
        }
    } else {
        console.error("Firebase Usage Tracker: Falha ao atualizar doc de uso.", error);
    }
  }
}

function schedule() {
  if (flushTimeout) return;
  flushTimeout = setTimeout(flush, 2500); // Agrupa operações em janelas de 2.5s
}

function track(type: 'reads' | 'writes' | 'deletes', count: number) {
    const user = auth.currentUser;
    // Se não houver usuário logado, rastreia como 'anonymous'
    const userId = user ? user.uid : 'anonymous';

    switch (type) {
        case 'reads':
            pendingReads[userId] = (pendingReads[userId] || 0) + count;
            break;
        case 'writes':
            pendingWrites[userId] = (pendingWrites[userId] || 0) + count;
            break;
        case 'deletes':
            pendingDeletes[userId] = (pendingDeletes[userId] || 0) + count;
            break;
    }
    schedule();
}


// ─── API pública ──────────────────────────────────────────────────────────────

/** Chame depois de getDocs / getDoc, passando o número de documentos lidos. */
export function trackRead(count = 1) {
    track('reads', count);
}

/** Chame depois de addDoc / setDoc / updateDoc. */
export function trackWrite(count = 1) {
    track('writes', count);
}

/** Chame depois de deleteDoc. */
export function trackDelete(count = 1) {
    track('deletes', count);
}

// ─── Leitura dos contadores ───────────────────────────────────────────────────

export interface UserUsage {
    name?: string;
    email?: string;
    reads: number;
    writes: number;
    deletes: number;
}

export interface DailyUsage {
  date: string;
  totalReads: number;
  totalWrites: number;
  totalDeletes: number;
  users: { [userId: string]: UserUsage };
}

/** Busca os contadores dos últimos N dias. */
export async function fetchUsageHistory(days = 7): Promise<DailyUsage[]> {
  const result: DailyUsage[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const ref = doc(db, "_meta", `usage_${key}`);

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        result.push({
          date: key,
          totalReads: data.totalReads ?? 0,
          totalWrites: data.totalWrites ?? 0,
          totalDeletes: data.totalDeletes ?? 0,
          users: data.users ?? {},
        });
      } else {
        result.push({ date: key, totalReads: 0, totalWrites: 0, totalDeletes: 0, users: {} });
      }
    } catch (e) {
      console.error(`Firebase Usage Tracker: Falha ao buscar uso para ${key}`, e);
      result.push({ date: key, totalReads: 0, totalWrites: 0, totalDeletes: 0, users: {} });
    }
  }

  return result.reverse(); // mais antigo → mais recente
}
