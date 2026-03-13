import * as XLSX from 'xlsx';
import { z, ZodSchema } from 'zod';
import { collection, doc, writeBatch, getDocs } from 'firebase/firestore';
import { PipelineResult, db } from '@/lib/firebase';

export interface PipelineResponse {
  success: boolean;
  result: PipelineResult;
  error?: string;
}

function toDateString(value: any): string | any {
  if (typeof value === 'number' && value > 10000 && value < 60000) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${String(date.d).padStart(2,'0')}/${String(date.m).padStart(2,'0')}/${date.y}`;
    }
  } else if (value instanceof Date) {
    return `${String(value.getDate()).padStart(2,'0')}/${String(value.getMonth()+1).padStart(2,'0')}/${value.getFullYear()}`;
  }
  return value;
}

// ─── Parser principal ─────────────────────────────────────────────────────────
function parseSheetWithHeaderDetection(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
): any[] {
  if (!sheet || !sheet["!ref"]) {
    console.warn(`[pipeline-utils] Aba "${sheetName}" vazia.`);
    return [];
  }

  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: true,
    defval: undefined,
  });

  let firstHeaderIndex = -1;
  let headerRow: any[] = [];

  for (let i = 0; i < Math.min(rawData.length, 30); i++) {
    const rowStr = String(rawData[i]?.join("|") || "").toUpperCase();
    if (rowStr.includes("MOTORISTA") && (rowStr.includes("PLACA") || rowStr.includes("DATA"))) {
      firstHeaderIndex = i;
      headerRow = rawData[i] ?? [];
      break;
    }
  }

  if (firstHeaderIndex === -1) {
    console.warn(`[pipeline-utils] Cabeçalho não encontrado em "${sheetName}".`);
    return [];
  }

  const colNames: string[] = [];
  const nameCounts: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    let name = headerRow[i] != null ? String(headerRow[i]).trim() : `__COL_${i}`;
    if (!name) name = `__COL_${i}`;
    const count = nameCounts[name] ?? 0;
    nameCounts[name] = count + 1;
    colNames.push(count === 0 ? name : `${name}_${count + 1}`);
  }

  const placaSisIdx = colNames.findIndex(n =>
    n.toUpperCase().replace(/\s+/g, " ").includes("PLACA SISTEMA")
  );
  const catColIndex = placaSisIdx > 0 ? placaSisIdx - 1 : 5;

  const result: any[] = [];
  let currentRota = "";

  for (let r = firstHeaderIndex + 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row) continue;

    const col1 = String(row[1] ?? "").trim().toUpperCase();
    const col2 = String(row[2] ?? "").trim().toUpperCase();

    if (col1 === "DATA" && col2 === "MOTORISTA") {
      const rawCat = String(row[catColIndex] ?? "").trim();
      currentRota = rawCat || currentRota;
      continue;
    }

    if (!row.length || row.every(v => v == null || v === "")) continue;

    const obj: Record<string, any> = {};
    for (let c = 0; c < colNames.length; c++) {
      const val = row[c];
      if (val != null && val !== "") {
        obj[colNames[c]] = val;
      }
    }

    if (Object.keys(obj).length === 0) continue;

    obj.__rota__ = currentRota;
    result.push(obj);
  }

  Object.assign(result, { __colNames__: colNames });
  return result;
}

// ─── FileReader ───────────────────────────────────────────────────────────────
class FileReader {
  constructor(private formData: FormData) {}

  async read(fieldName: string, schema?: ZodSchema<any>): Promise<any[]> {
    const file = this.formData.get(fieldName) as File | null;
    if (!file) return [];
    const buffer = await file.arrayBuffer();
    const wb     = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet  = wb.Sheets[wb.SheetNames[0]];
    const rows   = parseSheetWithHeaderDetection(sheet, wb.SheetNames[0], file.name);
    if (schema) {
      const result = z.array(schema).safeParse(rows);
      if (!result.success) throw new Error(`Validação falhou para ${file.name}.`);
      return result.data;
    }
    return rows;
  }

  async readAll(fieldName: string): Promise<any[][]> {
    const files     = this.formData.getAll(fieldName) as File[];
    const sheetName = this.formData.get('sheetName') as string | null;
    const allResults: any[][] = [];

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const file   = files[fileIdx];
      const buffer = await file.arrayBuffer();

      if (sheetName) {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, sheets: sheetName });
        if (!workbook.SheetNames.includes(sheetName)) {
          throw new Error(
            `A aba "${sheetName}" não foi encontrada em "${file.name}". ` +
            `Abas disponíveis: ${workbook.SheetNames.join(', ')}`
          );
        }
        const sheet = workbook.Sheets[sheetName];
        const rows  = parseSheetWithHeaderDetection(sheet, sheetName, file.name);
        if (rows.length > 0) {
          Object.assign(rows, { __sheetName: sheetName, __fileIndex: fileIdx, __colNames__: (rows as any).__colNames__ });
          allResults.push(rows);
        }
      } else {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const rows  = parseSheetWithHeaderDetection(sheet, name, file.name);
          if (rows.length > 0) {
            Object.assign(rows, { __sheetName: name, __fileIndex: fileIdx, __colNames__: (rows as any).__colNames__ });
            allResults.push(rows);
          }
        }
      }
    }

    return allResults;
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────
export interface PipelineArgs {
  year: number;
  month: number;
  files: FileReader;
  formData: FormData;
}

export interface ProcessorOutput {
  summary: string;
  data: any[];
  [key: string]: any;
}

// ─── Sanitização ─────────────────────────────────────────────────────────────
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined || obj === null) return null;
  if (typeof obj === 'number' && (!isFinite(obj) || isNaN(obj))) return null;
  if (obj instanceof Date)  return toDateString(obj);
  if (obj instanceof Error) return obj.toString();
  if (Array.isArray(obj))   return obj.map(item => sanitizeForFirestore(item));
  if (typeof obj === 'object') {
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = sanitizeForFirestore(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

// ─── processAndSave ───────────────────────────────────────────────────────────
export async function processAndSave(
  pipelineType: string,
  formData: FormData,
  processor: (args: PipelineArgs) => Promise<ProcessorOutput>
): Promise<PipelineResponse> {
  try {
    const year  = Number(formData.get('year'));
    const month = Number(formData.get('month'));
    if (isNaN(year) || isNaN(month)) throw new Error('Ano e mês devem ser números válidos.');

    const files           = new FileReader(formData);
    const processorResult = await processor({ year, month, files, formData });
    const sanitized       = sanitizeForFirestore(processorResult);

    // ✅ Separa os campos: data vai para subcoleção, extraSheets fica só em memória
    const { data, extraSheets, ...metadataExtras } = sanitized;

    const savedResult = await saveToFirebase(pipelineType, year, month, data, metadataExtras);

    // ✅ extraSheets retorna para o cliente (para download Excel) mas NUNCA vai ao Firestore
    return {
      success: true,
      result: { ...savedResult, data, extraSheets },
    };
  } catch (error: any) {
    console.error(`[${pipelineType.toUpperCase()}] Erro:`, error);
    return { success: false, result: {} as PipelineResult, error: error.message };
  }
}

// ─── saveToFirebase ───────────────────────────────────────────────────────────
// Arquitetura:
//   pipeline_results/{id}           → documento leve (metadados, ~1-5 KB)
//   pipeline_results/{id}/items/    → subcoleção (1 doc por registro, ilimitado)
//
// O documento principal NUNCA contém arrays de dados.
// Cada item da subcoleção fica ~200-800 bytes → sem risco de estouro.
// ─────────────────────────────────────────────────────────────────────────────
export async function saveToFirebase(
  type: string,
  year: number,
  month: number,
  data: any[],
  extras: Record<string, any> = {}
): Promise<PipelineResult> {

  // ── Documento principal: SOMENTE metadados ────────────────────────────────
  // Nunca inclui arrays de dados — isso garante que nunca ultrapasse 1 MB.
  const mainDocPayload = {
    pipelineType: type,
    timestamp:    Date.now(),
    year,
    month,
    summary:      extras.summary   ?? "",
    itemCount:    data.length,
    // Metadados leves de deduplicação (contagem, não os dados)
    duplicadasCount: Array.isArray(extras.duplicadas) ? extras.duplicadas.length : 0,
  };

  // ── Subcoleção items: 1 documento por registro ────────────────────────────
  const BATCH_LIMIT = 499; // Firestore permite 500 ops por batch; reservamos 1 para o doc principal
  const mainCollectionRef = collection(db, 'pipeline_results');
  const mainDocRef = doc(mainCollectionRef);
  const mainDocId  = mainDocRef.id;

  console.log(`[FIREBASE] Doc principal: ${mainDocId} | ${data.length} itens → subcoleção items/`);

  const itemsRef  = collection(db, 'pipeline_results', mainDocId, 'items');
  const allBatches: ReturnType<typeof writeBatch>[] = [];

  // Primeiro batch inclui o documento principal
  let currentBatch     = writeBatch(db);
  let currentBatchSize = 0;

  currentBatch.set(mainDocRef, mainDocPayload);
  currentBatchSize++;
  allBatches.push(currentBatch);

  for (const item of data) {
    if (currentBatchSize >= BATCH_LIMIT) {
      currentBatch     = writeBatch(db);
      currentBatchSize = 0;
      allBatches.push(currentBatch);
    }
    currentBatch.set(doc(itemsRef), item);
    currentBatchSize++;
  }

  console.log(`[FIREBASE] ${allBatches.length} batch(es) — commitando em paralelo...`);
  await Promise.all(allBatches.map(b => b.commit()));
  console.log(`[FIREBASE] ✅ Salvo! ID: ${mainDocId}`);

  return {
    ...mainDocPayload,
    id: mainDocId,
    data: [], // data retorna vazio aqui — processAndSave injeta de volta para o cliente
  } as unknown as PipelineResult;
}

// ─── loadItemsFromFirebase ────────────────────────────────────────────────────
// Lê os dados da subcoleção items/ de um documento de pipeline.
// Use isso no DataViewer e no buscarDadosExistentes.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadItemsFromFirebase(pipelineResultId: string): Promise<any[]> {
  const itemsRef = collection(db, 'pipeline_results', pipelineResultId, 'items');
  const snapshot = await getDocs(itemsRef);
  return snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));
}