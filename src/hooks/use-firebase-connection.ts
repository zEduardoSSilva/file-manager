// ─────────────────────────────────────────────────────────────────────────────
// hooks/use-firebase-connection.ts
//
// Hook React que retorna o estado atual da conexão Firebase de forma reativa.
// Atualiza automaticamente quando toggleFirebaseConnection / setFirebaseConnection
// é chamado em qualquer lugar do app — sem precisar de re-render externo.
//
// Uso:
//   const isConnected = useFirebaseConnection()
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { getFirebaseConnectionStatus } from '@/lib/firebase-connection'

export function useFirebaseConnection(): boolean {
  const [connected, setConnected] = useState<boolean>(getFirebaseConnectionStatus)

  useEffect(() => {
    const handler = (e: Event) => {
      setConnected((e as CustomEvent<{ connected: boolean }>).detail.connected)
    }
    window.addEventListener('firebase-connection-changed', handler)
    return () => window.removeEventListener('firebase-connection-changed', handler)
  }, [])

  return connected
}
