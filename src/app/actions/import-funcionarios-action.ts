import { collection, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function importFuncionariosAction(data: any[]): Promise<{ success: boolean; message: string; }> {
  try {
    const batch = writeBatch(db);
    const collectionRef = collection(db, "docs_funcionarios");

    let processedCount = 0;
    data.forEach(item => {
      const rawId = item.NOME_COMPLETO;
      if (!rawId || typeof rawId !== 'string') {
        return; 
      }
      // CORREÇÃO: Remove o caractere '/' que é inválido em IDs de documento.
      const docId = rawId.trim().toUpperCase().replace(/\//g, ' ');

      if (docId) {
        const docRef = doc(collectionRef, docId);
        
        const cleanItem: { [key: string]: any } = {};
        Object.keys(item).forEach(key => {
          if (item[key] !== null && item[key] !== undefined && item[key] !== '') {
            cleanItem[key] = item[key];
          }
        });

        batch.set(docRef, cleanItem);
        processedCount++;
      }
    });

    if (processedCount === 0) {
        return { success: false, message: "Nenhum funcionário com NOME_COMPLETO válido foi encontrado no arquivo." };
    }

    await batch.commit();

    return { success: true, message: `${processedCount} de ${data.length} funcionários importados com sucesso!` };

  } catch (error) {
    console.error("Firebase Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
    return { success: false, message: `Falha na importação: ${errorMessage}` };
  }
}
