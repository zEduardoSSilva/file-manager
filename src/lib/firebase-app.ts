// ─────────────────────────────────────────────────────────────────────────────
// lib/firebase-app.ts
//
// ÚNICA fonte de verdade para inicialização do Firebase.
// Todos os outros arquivos devem importar `db` e `auth` daqui.
// A configuração é lida de variáveis de ambiente (arquivo .env na raiz).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app  = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db   = getFirestore(app);
export const auth = getAuth(app);
