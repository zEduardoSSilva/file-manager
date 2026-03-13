import * as XLSX from 'xlsx';
import { z, ZodSchema } from 'zod';
import { PipelineResult, firebaseStore } from '@/lib/firebase';


export interface SheetData {
  rows: any[];
  sheetName: string;
  fileIndex: number;
}

export interface PipelineResponse {
  success: boolean;
  result: PipelineResult;
  error?: string;
}

/**
 * Converte número de série de data do Excel ou Date para string DD/MM/YYYY.
 */
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

/**
 * Detecta o cabeçalho e extrai os dados de uma aba em formato JSON.
 */
function parseSheetWithHeaderDetection(sheet: XLSX.WorkSheet, sheetName: string, fileName: string): any[] {
  if (!sheet || !sheet["!ref"]) return []

  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true })

  // ← ADICIONE ESTE LOG
  console.log(`[headerDetection] Primeiras 15 linhas brutas de "${sheetName}":`)
  rawData.slice(0, 15).forEach((row, i) => {
    console.log(`  linha ${i}:`, row)
  })

  let headerRowIndex = -1;
  for (let i = 0; i < rawData.length; i++) {
    const rowString = String(rawData[i]?.join("|") || "").toUpperCase();
    if (rowString.includes("MOTORISTA") && (rowString.includes("PLACA") || rowString.includes("DATA"))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    console.warn(`[pipeline-utils] Cabeçalho não encontrado na aba "${sheetName}".`);
    return [];
  }

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  range.s.r = headerRowIndex;
  const rows = XLSX.utils.sheet_to_json(sheet, { range: XLSX.utils.encode_range(range), raw: false });
  console.log(`[pipeline-utils] Aba "${sheetName}" parseada — ${rows.length} linhas.`);
  return rows;
}

// ─── FileReader ───────────────────────────────────────────────────────────────
class FileReader {
  constructor(private formData: FormData) {}

  private async readFile(file: File, sheetName?: string): Promise<any[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    const targetSheetName = sheetName && workbook.SheetNames.includes(sheetName)
      ? sheetName
      : workbook.SheetNames[0];

    if (!targetSheetName) throw new Error(`O arquivo ${file.name} não contém planilhas.`);

    const sheet = workbook.Sheets[targetSheetName];
    return parseSheetWithHeaderDetection(sheet, targetSheetName, file.name);
  }

  async read(fieldName: string, schema?: ZodSchema<any>): Promise<any[]> {
    const file = this.formData.get(fieldName) as File | null;
    if (!file) return [];
    const jsonData = await this.readFile(file);
    if (schema) {
      const result = z.array(schema).safeParse(jsonData);
      if (!result.success) {
        console.error("Erro de validação Zod:", result.error.flatten().fieldErrors);
        throw new Error(`Validação falhou para o arquivo ${file.name}.`);
      }
      return result.data;
    }
    return jsonData;
  }

  async readAll(fieldName: string): Promise<any[][]> {
    const files      = this.formData.getAll(fieldName) as File[];
    const sheetName  = this.formData.get('sheetName') as string | null;
    const allResults: any[][] = [];

    console.log(`[pipeline-utils] ${files.length} arquivo(s) para processar.`);

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const file = files[fileIdx];
      console.log(`[pipeline-utils] Arquivo ${fileIdx + 1}/${files.length}: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);

      const buffer = await file.arrayBuffer();

      if (sheetName) {
        // ── Modo dia específico ──────────────────────────────────────────────
        // Passa { sheets: sheetName } → XLSX só parseia a aba alvo,
        // ignorando completamente as outras abas do mês.
        // Em arquivos grandes (40+ MB) isso reduz o tempo em ~95%.
        const workbook = XLSX.read(buffer, {
          type:      'array',
          cellDates: true,
          sheets:    sheetName,   // ← carrega APENAS esta aba
        });

        if (!workbook.SheetNames.includes(sheetName)) {
          throw new Error(`A aba "${sheetName}" não foi encontrada em "${file.name}".`);
        }

        console.log(`[pipeline-utils] Lendo apenas a aba "${sheetName}".`);
        const sheet = workbook.Sheets[sheetName];
        const rows  = parseSheetWithHeaderDetection(sheet, sheetName, file.name);

        if (rows.length > 0) {
          const tagged = Object.assign(rows, { __sheetName: sheetName, __fileIndex: fileIdx });
          allResults.push(tagged);
        }

      } else {
        // ── Modo mês completo ────────────────────────────────────────────────
        // Precisa carregar todas as abas — não tem como evitar.
        // Mas pelo menos não carrega fórmulas desnecessárias.
        const workbook = XLSX.read(buffer, {
          type:      'array',
          cellDates: true,
        });

        console.log(`[pipeline-utils] Abas encontradas: ${workbook.SheetNames.join(', ')}`);

        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const rows  = parseSheetWithHeaderDetection(sheet, name, file.name);
          if (rows.length > 0) {
            const tagged = Object.assign(rows, { __sheetName: name, __fileIndex: fileIdx });
            allResults.push(tagged);
          }
        }
      }
    }

    console.log(`[pipeline-utils] Processamento concluído — ${allResults.length} aba(s) com dados.`);
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

// ─── Sanitização para Firestore ───────────────────────────────────────────────
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

    const files         = new FileReader(formData);
    const processorArgs: PipelineArgs = { year, month, files, formData };
    const processorResult = await processor(processorArgs);
    const sanitizedResult = sanitizeForFirestore(processorResult);

    const { data, ...extras } = sanitizedResult;
    const savedResult = await saveToFirebase(pipelineType, year, month, data, extras);

    return { success: true, result: savedResult };
  } catch (error: any) {
    console.error(`[${pipelineType.toUpperCase()}] Erro no Pipeline:`, error);
    return { success: false, result: {} as PipelineResult, error: error.message };
  }
}

// ─── saveToFirebase ───────────────────────────────────────────────────────────
export async function saveToFirebase(
  type: string,
  year: number,
  month: number,
  data: any[],
  extras: Record<string, any> = {}
): Promise<PipelineResult> {
  const { extraSheets, ...extrasParaFirestore } = extras;

  const fullPayload: Omit<PipelineResult, 'id'> = {
    pipelineType: type,
    timestamp:    Date.now(),
    year,
    month,
    data,
    summary: extrasParaFirestore.summary ?? "",
  };

  try {
    console.log("[FIREBASE] Salvando:", fullPayload.data?.length, "registros");
    const saved = await firebaseStore.saveResult(type, fullPayload);
    console.log("[FIREBASE] Salvo! ID:", saved.id);

    return {
      ...fullPayload,
      id:          saved.id,
      extraSheets: extraSheets,
    } as unknown as PipelineResult;

  } catch (error: any) {
    console.error("[FIREBASE] Erro ao salvar:", error);
    throw error;
  }
}