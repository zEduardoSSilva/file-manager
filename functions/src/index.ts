import * as admin from "firebase-admin";

admin.initializeApp();

// ─────────────────────────────────────────────────────────────────────────────
// NOTA: A função `updateFirebaseUsage` foi removida pois usava Math.random()
// para gerar dados falsos, sobrescrevendo os dados reais.
//
// O rastreamento real de uso do Firestore é feito no client-side pelo módulo:
//   src/lib/firebaseUsageTracker.ts
//
// Que persiste leituras/escritas/deletações por usuário na coleção `_meta`.
// ─────────────────────────────────────────────────────────────────────────────
//
// Se futuramente precisar de dados de billing reais via server, utilize:
//   https://cloud.google.com/billing/docs/reference/rest
// ─────────────────────────────────────────────────────────────────────────────

// Espaço reservado para futuras Cloud Functions reais.
export {};

