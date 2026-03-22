// ─────────────────────────────────────────────────────────────────────────────
// lib/firebase-connection.ts
//
// MUDANÇA: padrão agora é DESLIGADO (false) para não consumir nenhuma leitura.
// O usuário precisa ligar explicitamente o Zap para conectar.
// O estado persiste em localStorage para sobreviver a refresh.
// Componentes React podem escutar o evento 'firebase-connection-changed'
// ou usar o hook `useFirebaseConnection` (src/hooks/use-firebase-connection.ts).
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "firebase_connected"

// Lê do localStorage — padrão false (desligado)
function readPersistedState(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === null) return false   // primeira vez → desligado por padrão
    return v === "true"
  } catch {
    return false
  }
}

function persistState(v: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, String(v)) } catch { /* ignore */ }
}

function dispatchEvent(v: boolean): void {
  try {
    window.dispatchEvent(
      new CustomEvent('firebase-connection-changed', { detail: { connected: v } })
    )
  } catch { /* ignore em ambientes sem window */ }
}

let isFirebaseConnected: boolean = readPersistedState()

export const getFirebaseConnectionStatus = (): boolean => isFirebaseConnected

export const toggleFirebaseConnection = (): void => {
  isFirebaseConnected = !isFirebaseConnected
  persistState(isFirebaseConnected)
  dispatchEvent(isFirebaseConnected)
}

export const setFirebaseConnection = (v: boolean): void => {
  isFirebaseConnected = v
  persistState(v)
  dispatchEvent(v)
}