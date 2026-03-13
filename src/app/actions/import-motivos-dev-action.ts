
import { collection, writeBatch, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as XLSX from 'xlsx';

export async function importMotivosDevAction(file: File): Promise<{ success: boolean; message: string; }> {
  try {
    const reader = new FileReader();

    const data = await new Promise<any[]>((resolve, reject) => {
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          resolve(json);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = (error) => {
        reject(error);
      };

      reader.readAsArrayBuffer(file);
    });

    const batch = writeBatch(db);
    const motivosCollection = collection(db, "motivos_devolucao");

    for (const item of data) {
      const motivoDev = item.MOTIVO_DEV?.toString().trim();
      if (!motivoDev) {
        console.warn("Skipping row due to missing MOTIVO_DEV:", item);
        continue; // Pula a linha se o motivo estiver faltando
      }

      const q = query(motivosCollection, where("MOTIVO_DEV", "==", motivoDev));
      const querySnapshot = await getDocs(q);

      const motivoData = {
        MOTIVO_DEV: motivoDev,
        CONSIDERA: item.CONSIDERA
      };

      if (!querySnapshot.empty) {
        // Atualiza o motivo existente
        const motivoDoc = querySnapshot.docs[0];
        batch.update(motivoDoc.ref, motivoData);
      } else {
        // Adiciona um novo motivo
        batch.set(doc(motivosCollection), motivoData);
      }
    }

    await batch.commit();

    return { success: true, message: "Importação de motivos de devolução concluída com sucesso!" };
  } catch (error) {
    console.error("Erro ao importar motivos de devolução:", error);
    return { success: false, message: `Erro ao importar motivos de devolução: ${error instanceof Error ? error.message : "Ocorreu um erro desconhecido."}` };
  }
}
