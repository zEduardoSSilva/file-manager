/*
 * SCRIPT DE MIGRAÇÃO ÚNICA
 *
 * Este script converte os resultados de pipeline do tipo 'consolidacao-entregas'
 * do formato antigo (array 'data' gigante) para o novo formato (subcoleção 'items').
 *
 * PARA EXECUTAR:
 * 1. Configure um arquivo .env na raiz do projeto com suas credenciais do Firebase Admin SDK.
 * 2. Compile e execute o script usando a configuração específica:
 *    - npx tsc --project src/lib/migration-scripts/tsconfig.script.json
 *    - node src/lib/migration-scripts/migrate-entregas.cjs
 */

import * as admin from 'firebase-admin';
const dotenv = require('dotenv');

// Carrega variáveis de ambiente
dotenv.config();

// ─── CONFIGURAÇÃO DO FIREBASE ADMIN ───────────────────────────────────────────
// Alinhado com a convenção do Firebase (snake_case)
const serviceAccount = {
  project_id:   process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as any)
  });
}

const db = admin.firestore();

// ─── FUNÇÃO DE MIGRAÇÃO ───────────────────────────────────────────────────────

export async function migrateConsolidacaoEntregas() {
  console.log("Iniciando migração para 'consolidacao-entregas'...");

  const pipelineResultsRef = db.collection('pipeline_results');

  const querySnapshot = await pipelineResultsRef
    .where('pipelineType', '==', 'consolidacao-entregas')
    .where('itemCount', '==', null)
    .get();

  if (querySnapshot.empty) {
    console.log("Nenhum documento no formato antigo encontrado. Migração não necessária.");
    return;
  }

  console.log(`Encontrados ${querySnapshot.size} documentos para migrar.`);

  let migratedCount = 0;

  for (const doc of querySnapshot.docs) {
    const docId = doc.id;
    const docData = doc.data();
    const oldDataArray = docData.data;

    if (!Array.isArray(oldDataArray) || oldDataArray.length === 0) {
      console.log(` -> Documento ${docId} está no formato antigo mas não tem dados. Apenas atualizando o marcador.`);
      await pipelineResultsRef.doc(docId).update({ 
        itemCount: 0,
        data: admin.firestore.FieldValue.delete()
      });
      continue;
    }

    console.log(` -> Migrando documento ${docId} (${oldDataArray.length} itens)...`);

    const itemsSubcollectionRef = pipelineResultsRef.doc(docId).collection('items');
    const BATCH_LIMIT = 500;
    let batch = db.batch();
    let batchCount = 0;

    try {
      for (let i = 0; i < oldDataArray.length; i++) {
        const item = oldDataArray[i];
        const newItemRef = itemsSubcollectionRef.doc();
        batch.set(newItemRef, item);
        batchCount++;

        if (batchCount === BATCH_LIMIT) {
          await batch.commit();
          console.log(`    - Lote de ${BATCH_LIMIT} itens salvo.`);
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        console.log(`    - Lote final de ${batchCount} itens salvo.`);
      }

      await pipelineResultsRef.doc(docId).update({
        itemCount: oldDataArray.length,
        data: admin.firestore.FieldValue.delete(),
      });

      console.log(` -> Sucesso! Documento ${docId} migrado.`);
      migratedCount++;

    } catch (error) {
      console.error(` -> ERRO ao migrar documento ${docId}:`, error);
    }
  }

  console.log(`\nMigração concluída. ${migratedCount} de ${querySnapshot.size} documentos foram migrados com sucesso.`);
}

// Executa a função
migrateConsolidacaoEntregas().catch(console.error);
