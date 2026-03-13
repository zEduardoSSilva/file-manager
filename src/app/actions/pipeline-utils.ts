import * as XLSX from 'xlsx';
import { z, ZodSchema } from 'zod';
import { PipelineResult, firebaseStore } from '@/lib/firebase';

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

  // ── Encontra a primeira linha do cabeçalho ───────────────────────────────
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

  console.log(
    `[pipeline-utils] Cabeçalho linha ${firstHeaderIndex}:`,
    headerRow.map((v, i) => `[${i}]=${v ?? "∅"}`).join(" | ")
  );

  // ── Constrói nomes de coluna (resolve duplicatas: AJUDANTE → AJUDANTE_2) ─
  const colNames: string[] = [];
  const nameCounts: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    let name = headerRow[i] != null ? String(headerRow[i]).trim() : `__COL_${i}`;
    if (!name) name = `__COL_${i}`;
    const count = nameCounts[name] ?? 0;
    nameCounts[name] = count + 1;
    colNames.push(count === 0 ? name : `${name}_${count + 1}`);
  }

  // ── Índice da coluna de categoria ─────────────────────────────────────────
  // Estratégia: coluna imediatamente ANTES de "PLACA SISTEMA" no header.
  // Isso é mais robusto que fixar índice 5 (coluna F).
  // Ex: [..., "AJUDANTE", "AJUDANTE", "CURITIBA", "PLACA SISTEMA", ...]
  //                                        ↑ esta é a coluna da categoria
  const placaSisIdx = colNames.findIndex(n =>
    n.toUpperCase().replace(/\s+/g, " ").includes("PLACA SISTEMA")
  );
  // Coluna de categoria = imediatamente antes de PLACA SISTEMA
  // Se não achar PLACA SISTEMA, usa fallback = índice 5
  const catColIndex = placaSisIdx > 0 ? placaSisIdx - 1 : 5;

  console.log(
    `[pipeline-utils] Coluna de categoria: índice ${catColIndex}` +
    ` ("${colNames[catColIndex] ?? "?"}")` +
    ` → antes de PLACA SISTEMA (índice ${placaSisIdx})`
  );

  // ── Lê dados linha a linha ────────────────────────────────────────────────
  const result: any[] = [];
  let currentRota = "";

  for (let r = firstHeaderIndex + 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row) continue;

    // Detecta linhas de sub-cabeçalho:
    // col B (idx 1) = "DATA" e col C (idx 2) = "MOTORISTA"
    const col1 = String(row[1] ?? "").trim().toUpperCase();
    const col2 = String(row[2] ?? "").trim().toUpperCase();

    if (col1 === "DATA" && col2 === "MOTORISTA") {
      // Captura a categoria da coluna dinâmica (antes de PLACA SISTEMA)
      const rawCat = String(row[catColIndex] ?? "").trim();
      currentRota = rawCat || currentRota;
      console.log(`[pipeline-utils] Sub-tabela: "${rawCat}" (linha ${r})`);
      continue;
    }

    // Linha completamente vazia
    if (!row.length || row.every(v => v == null || v === "")) continue;

    const obj: Record<string, any> = {};
    for (let c = 0; c < colNames.length; c++) {
      const val = row[c];
      if (val != null && val !== "") {
        obj[colNames[c]] = val;
      }
    }

    if (Object.keys(obj).length === 0) continue;

    // Injeta categoria (ROTA da sub-tabela)
    obj.__rota__ = currentRota;

    result.push(obj);
  }

  if (result.length > 0) {
    const allCols = [...new Set(result.flatMap(r => Object.keys(r).filter(k => !k.startsWith("__"))))];
    console.log(`[pipeline-utils] Aba "${sheetName}" — ${result.length} linhas. Colunas:`, allCols.join(", "));
  } else {
    console.warn(`[pipeline-utils] Aba "${sheetName}" — sem dados.`);
  }

  // ── Anexa colNames ao array para uso posterior em processarRows ───────────
  // Isso garante que findCol() funcione mesmo quando todas as células de uma
  // coluna estiverem vazias (ex: AJUDANTE sem nenhum valor no dia)
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

    console.log(`[pipeline-utils] ${files.length} arquivo(s).`);

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const file = files[fileIdx];
      const kb   = (file.size / 1024).toFixed(0);
      console.log(`[pipeline-utils] Arquivo ${fileIdx + 1}/${files.length}: ${file.name} (${kb} KB)`);

      const buffer = await file.arrayBuffer();

      if (sheetName) {
        const workbook = XLSX.read(buffer, {
          type:      'array',
          cellDates: true,
          sheets:    sheetName,
        });

        if (!workbook.SheetNames.includes(sheetName)) {
          throw new Error(
            `A aba "${sheetName}" não foi encontrada em "${file.name}". ` +
            `Abas disponíveis: ${workbook.SheetNames.join(', ')}`
          );
        }

        console.log(`[pipeline-utils] Lendo apenas "${sheetName}".`);
        const sheet = workbook.Sheets[sheetName];
        const rows  = parseSheetWithHeaderDetection(sheet, sheetName, file.name);
        if (rows.length > 0) {
          Object.assign(rows, {
            __sheetName: sheetName,
            __fileIndex: fileIdx,
            // preserva __colNames__ que veio do parser
            __colNames__: (rows as any).__colNames__,
          });
          allResults.push(rows);
        }

      } else {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        console.log(`[pipeline-utils] Abas: ${workbook.SheetNames.join(', ')}`);
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const rows  = parseSheetWithHeaderDetection(sheet, name, file.name);
          if (rows.length > 0) {
            Object.assign(rows, {
              __sheetName:  name,
              __fileIndex:  fileIdx,
              __colNames__: (rows as any).__colNames__,
            });
            allResults.push(rows);
          }
        }
      }
    }

    console.log(`[pipeline-utils] Concluído — ${allResults.length} aba(s) com dados.`);
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
    const { data, ...extras } = sanitized;
    const savedResult = await saveToFirebase(pipelineType, year, month, data, extras);
    return { success: true, result: savedResult };
  } catch (error: any) {
    console.error(`[${pipelineType.toUpperCase()}] Erro:`, error);
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