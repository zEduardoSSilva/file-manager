import * as XLSX from 'xlsx';
import { z, ZodSchema } from 'zod';
import {
  collection, doc, getDoc, setDoc, writeBatch, getDocs,
} from 'firebase/firestore';
import { PipelineResult, db } from '@/lib/firebase';
import { trackRead, trackWrite } from '@/lib/firebaseUsageTracker';

export interface PipelineResponse {
  success: boolean;
  result: PipelineResult;
  error?: string;
}

// ─── ID determinístico — 1 doc por pipeline+ano+mês ──────────────────────────
// Antes: cada import criava um novo doc aleatório com TODOS os dados acumulados
// Agora: sempre o mesmo doc → updates incrementais → sem explosão de escritas
export function mainDocId(type: string, year: number, month: number): string {
  return `${type}_${year}_${String(month).padStart(2, '0')}`
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
    console.warn(`[actions-utils] Aba "${sheetName}" vazia.`);
    return [];
  }

  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, blankrows: true, defval: undefined,
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
    console.warn(`[actions-utils] Cabeçalho não encontrado em "${sheetName}".`);
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
      if (val != null && val !== "") obj[colNames[c]] = val;
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
          Object.assign(rows, {
            __sheetName: sheetName, __fileIndex: fileIdx,
            __colNames__: (rows as any).__colNames__,
          });
          allResults.push(rows);
        }
      } else {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const rows  = parseSheetWithHeaderDetection(sheet, name, file.name);
          if (rows.length > 0) {
            Object.assign(rows, {
              __sheetName: name, __fileIndex: fileIdx,
              __colNames__: (rows as any).__colNames__,
            });
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
  year: number; month: number; files: FileReader; formData: FormData;
}
export interface ProcessorOutput {
  summary: string; data: any[]; [key: string]: any;
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

// ─── porFilialDia ─────────────────────────────────────────────────────────────
function calcularPorFilialDia(data: any[]): Record<string, Record<string, number>> {
  const porFilialDia: Record<string, Record<string, number>> = {};
  for (const row of data) {
    const filial = String(row["FILIAL"] ?? "—").trim();
    const dt     = String(row["DATA DE ENTREGA"] ?? "—").trim();
    if (!porFilialDia[filial]) porFilialDia[filial] = {};
    porFilialDia[filial][dt] = (porFilialDia[filial][dt] ?? 0) + 1;
  }
  return porFilialDia;
}

function mergePorFilialDia(
  existing: Record<string, Record<string, number>>,
  incoming: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const result = { ...existing };
  for (const [filial, diaMap] of Object.entries(incoming)) {
    if (!result[filial]) result[filial] = {};
    for (const [dt, cnt] of Object.entries(diaMap)) {
      result[filial][dt] = (result[filial][dt] ?? 0) + cnt;
    }
  }
  return result;
}

function extractDayFromItem(item: any): number {
  const dateStr = String(item["DATA DE ENTREGA"] ?? "");
  const m = dateStr.trim().match(/^(\d{1,2})[\/\.]/);
  return m ? parseInt(m[1]) : 0;
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

    const { data, extraSheets, dedupKeys: newDedupKeys, ...metadataExtras } = sanitized;

    const savedResult = await saveToFirebase(
      pipelineType, year, month, data,
      { ...metadataExtras, newDedupKeys: newDedupKeys ?? [] }
    );

    // extraSheets volta para o cliente mas NUNCA vai ao Firestore
    return {
      success: true,
      result: { ...savedResult, data, extraSheets } as any,
    };
  } catch (error: any) {
    console.error(`[${pipelineType.toUpperCase()}] Erro:`, error);
    return { success: false, result: {} as PipelineResult, error: error.message };
  }
}

// ─── saveToFirebase ───────────────────────────────────────────────────────────
// ✅ NOVO MODELO — custo linear:
//   • 1 doc determinístico por pipeline+ano+mês (sem proliferação de docs)
//   • Lê apenas o metadata do doc principal (1 leitura por import)
//   • Escreve apenas os NOVOS registros (N escritas, nunca reescreve os antigos)
//   • dedupKeys no metadata = dedup sem ler subcoleção (eliminada leitura O(N))
//
// Antes: 6 imports × (lê N existentes + escreve N+M acumulados) = O(N²) ops
// Agora: 6 imports × (lê 1 metadata + escreve M novos) = O(N) ops
// ─────────────────────────────────────────────────────────────────────────────
export async function saveToFirebase(
  type: string,
  year: number,
  month: number,
  data: any[],           // APENAS os novos registros deste import
  extras: Record<string, any> = {}
): Promise<PipelineResult> {
  const docId     = mainDocId(type, year, month)
  const mainRef   = doc(db, 'pipeline_results', docId)
  const itemsRef  = collection(db, 'pipeline_results', docId, 'items')

  // ── 1. Lê metadata existente (1 leitura) ─────────────────────────────────
  const existing     = await getDoc(mainRef)
  trackRead(1)
  const existingData = existing.exists() ? existing.data() : {}

  const existingDedupKeys: string[]                           = existingData.dedupKeys   ?? []
  const existingPorFilialDia: Record<string, Record<string, number>> = existingData.porFilialDia ?? {}
  const existingItemCount: number                             = existingData.itemCount   ?? 0

  // ── 2. Computa novos metadados ────────────────────────────────────────────
  const newDedupKeys: string[]    = extras.newDedupKeys ?? []
  const allDedupKeys  = [...new Set([...existingDedupKeys, ...newDedupKeys])]
  const newPorFilialDia           = calcularPorFilialDia(data)
  const mergedPorFilialDia        = mergePorFilialDia(existingPorFilialDia, newPorFilialDia)

  console.log(
    `[FIREBASE] Doc: ${docId} | `,
    `Existentes: ${existingItemCount} | Novos: ${data.length} | Total: ${existingItemCount + data.length}`
  )

  // ── 3. Escreve APENAS os novos itens na subcoleção ────────────────────────
  const BATCH_LIMIT = 498 // reserva 2 ops (doc principal + margem)
  const allBatches: ReturnType<typeof writeBatch>[] = []
  let   currentBatch     = writeBatch(db)
  let   currentBatchSize = 0
  allBatches.push(currentBatch)

  for (const item of data) {
    if (currentBatchSize >= BATCH_LIMIT) {
      currentBatch     = writeBatch(db)
      currentBatchSize = 0
      allBatches.push(currentBatch)
    }
    const day = extractDayFromItem(item)
    currentBatch.set(doc(itemsRef), {
      ...item,
      _year:  year,
      _month: month,
      _day:   day,
    })
    currentBatchSize++
  }

  // ── 4. Atualiza (ou cria) o doc principal com metadados ───────────────────
  await setDoc(mainRef, {
    pipelineType:    type,
    year,
    month,
    timestamp:       Date.now(),
    summary:         extras.summary ?? '',
    itemCount:       existingItemCount + data.length,
    duplicadasCount: Array.isArray(extras.duplicadas) ? extras.duplicadas.length : 0,
    dedupKeys:       allDedupKeys,
    porFilialDia:    mergedPorFilialDia,
  }, { merge: true })

  if (data.length > 0) {
    await Promise.all(allBatches.map(b => b.commit()))
  }

  trackWrite(1 + data.length) // 1 doc principal + N itens
  console.log(`[FIREBASE] ✅ Salvo! ID: ${docId} | +${data.length} itens`)

  return {
    pipelineType: type, year, month,
    timestamp:    Date.now(),
    summary:      extras.summary ?? '',
    id:           docId,
    data:         [],
  } as unknown as PipelineResult;
}

// ─── loadItemsFromFirebase ────────────────────────────────────────────────────
// Lê todos os itens da subcoleção do doc principal do mês.
// Usado pela VisaoAnalitica para montar o grid.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadItemsFromFirebase(
  type: string,
  year: number,
  month: number,
): Promise<any[]> {
  const docId    = mainDocId(type, year, month)
  const itemsRef = collection(db, 'pipeline_results', docId, 'items')
  const snapshot = await getDocs(itemsRef)
  trackRead(snapshot.size)
  return snapshot.docs.map(d => {
    const { _year, _month, _day, ...rest } = d.data()
    return { ...rest, _itemId: d.id }
  })
}

// ─── getDedupKeys ─────────────────────────────────────────────────────────────
// Lê APENAS o metadata do doc principal (1 leitura) para obter as chaves de dedup.
// Substituiu a leitura de toda a subcoleção items/ (que causava O(N) leituras).
// ─────────────────────────────────────────────────────────────────────────────
export async function getDedupKeys(
  type: string,
  year: number,
  month: number,
): Promise<{ keys: Set<string>; docExists: boolean }> {
  const docId  = mainDocId(type, year, month)
  const mainRef = doc(db, 'pipeline_results', docId)
  const snap   = await getDoc(mainRef)
  trackRead(1)

  if (!snap.exists()) return { keys: new Set(), docExists: false }

  const dedupKeys: string[] = snap.data().dedupKeys ?? []
  return { keys: new Set(dedupKeys), docExists: true }
}