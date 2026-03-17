
import { collection, writeBatch, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as XLSX from 'xlsx';
import { trackRead, trackWrite } from "../../lib/firebaseUsageTracker";

export async function importFaturamentoAction(file: File): Promise<{ success: boolean; message: string; }> {
  try {
    const reader = new FileReader();

    const data = await new Promise<any[]>((resolve, reject) => {
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

          let headerRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].some(cell => cell !== null && String(cell).trim() !== '')) {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1 || headerRowIndex >= rows.length) {
            return resolve([]);
          }

          const headers = rows[headerRowIndex].map(header => String(header || '').toUpperCase().trim());
          const dataRows = rows.slice(headerRowIndex + 1);

          const json = dataRows
            .filter(row => row && row.some(cell => cell !== null && String(cell).trim() !== ''))
            .map(row => {
              const obj: { [key: string]: any } = {};
              headers.forEach((header, index) => {
                if (header) {
                  obj[header] = row[index];
                }
              });
              return obj;
            });

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
    const faturamentoCollection = collection(db, "docs_faturamento");
    let writeCount = 0;

    for (const item of data) {
      const viagem = item.VIAGEM ? String(item.VIAGEM).trim() : null;

      if (!viagem) {
        console.warn("Skipping row due to missing VIAGEM. Row content:", JSON.stringify(item, null, 2));
        continue;
      }

      const q = query(faturamentoCollection, where("VIAGEM", "==", viagem));
      const querySnapshot = await getDocs(q);
      trackRead(querySnapshot.size); // RASTREAMENTO LEITURA

      const faturamentoData = {
        DM_FILIAL: item.DM_FILIAL ?? null,
        DT_FATURAMENTO: item.DT_FATURAMENTO ?? null,
        DT_RETORNO: item.DT_RETORNO ?? null,
        DT_FECHAMENTO: item.DT_FECHAMENTO ?? null,
        DIAS_ABERTO: item.DIAS_ABERTO ?? null,
        VIAGEM: viagem,
        ENTREGAS: item.ENTREGAS ?? null,
        FATURAMENTO: item.FATURAMENTO ?? null,
        FATURAMENTO_DEV: item.FATURAMENTO_DEV ?? null,
        PESO: item.PESO ?? null,
        PESO_DEV: item.PESO_DEV ?? null,
        MOTIVO_DEV: item.MOTIVO_DEV ?? null
      };

      if (!querySnapshot.empty) {
        const faturamentoDoc = querySnapshot.docs[0];
        batch.update(faturamentoDoc.ref, faturamentoData);
      } else {
        batch.set(doc(faturamentoCollection), faturamentoData);
      }
      writeCount++;
    }

    if (writeCount > 0) {
        trackWrite(writeCount); // RASTREAMENTO ESCRITA
        await batch.commit();
    }

    return { success: true, message: "Importação de faturamento concluída com sucesso!" };
  } catch (error) {
    console.error("Erro ao importar faturamento:", error);
    return { success: false, message: `Erro ao importar faturamento: ${error instanceof Error ? error.message : "Ocorreu um erro desconhecido."}` };
  }
}
