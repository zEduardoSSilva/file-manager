// ─────────────────────────────────────────────────────────────────────────────
// lib/analitica-storage.ts
//
// Gerencia o buffer local (localStorage) da Visão Analítica.
// Chave por período: analitica_2026_03
// Limite: ~4.5MB por chave (seguro para ~3000 registros)
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX = "analitica"

function chave(year: number, month: number): string {
  return `${PREFIX}_${year}_${String(month).padStart(2, "0")}`
}

export interface StoragePayload {
  rows:      Record<string, any>[]
  year:      number
  month:     number
  savedAt:   number   // timestamp
  source:    "excel" | "firebase" | "mixed"
}

// ── Leitura ───────────────────────────────────────────────────────────────────
export function getStoragePayload(year: number, month: number): StoragePayload | null {
  try {
    const raw = localStorage.getItem(chave(year, month))
    if (!raw) return null
    return JSON.parse(raw) as StoragePayload
  } catch {
    return null
  }
}

// ── Escrita ───────────────────────────────────────────────────────────────────
export function setStoragePayload(
  year: number,
  month: number,
  rows: Record<string, any>[],
  source: StoragePayload["source"] = "excel"
): boolean {
  try {
    const payload: StoragePayload = { rows, year, month, savedAt: Date.now(), source }
    localStorage.setItem(chave(year, month), JSON.stringify(payload))
    return true
  } catch (e) {
    // QuotaExceededError — localStorage cheio
    console.warn("[analitica-storage] Quota exceeded:", e)
    return false
  }
}

// ── Atualiza linhas existentes (patch) — sem substituir tudo ─────────────────
// Usa _itemId ou índice como chave de identidade.
export function patchStorageRows(
  year: number,
  month: number,
  patches: Record<string, any>[]   // cada item deve ter _itemId ou __rowIdx
): boolean {
  const payload = getStoragePayload(year, month)
  if (!payload) return false

  const patchById = new Map<string, Record<string, any>>()
  const patchByIdx = new Map<number, Record<string, any>>()
  for (const p of patches) {
    if (p._itemId)     patchById.set(p._itemId, p)
    if (p.__rowIdx != null) patchByIdx.set(p.__rowIdx, p)
  }

  const updated = payload.rows.map((row, idx) => {
    const byId  = row._itemId ? patchById.get(row._itemId) : undefined
    const byIdx = patchByIdx.get(idx)
    if (byId)  return { ...row, ...byId }
    if (byIdx) return { ...row, ...byIdx }
    return row
  })

  return setStoragePayload(year, month, updated, payload.source)
}

// ── Limpa período específico ──────────────────────────────────────────────────
export function clearStoragePayload(year: number, month: number): void {
  try { localStorage.removeItem(chave(year, month)) } catch { /* ignore */ }
}

// ── Limpa todos os períodos analíticos ────────────────────────────────────────
export function clearAllAnaliticaStorage(): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX + "_")) toRemove.push(k)
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}

// ── Tamanho estimado do payload em KB ────────────────────────────────────────
export function getStorageSizeKb(year: number, month: number): number {
  try {
    const raw = localStorage.getItem(chave(year, month))
    if (!raw) return 0
    return Math.round((raw.length * 2) / 1024)   // UTF-16 → bytes → KB
  } catch { return 0 }
}