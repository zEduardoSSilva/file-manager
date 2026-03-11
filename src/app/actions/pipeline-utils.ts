import * as XLSX from 'xlsx';
import { PipelineResult, firebaseStore } from '@/lib/firebase';

export interface PipelineResponse {
  success: boolean;
  result: PipelineResult;
  error?: string;
}

export async function readExcelFromFormData(formData: FormData, fieldName: string): Promise<any[]> {
  const file = formData.get(fieldName) as File | null;
  if (!file) return [];
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
}

export async function readAllFilesFromFormData(formData: FormData, fieldName: string = 'files'): Promise<any[][]> {
  const files = formData.getAll(fieldName) as File[];
  const results: any[][] = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    results.push(XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]));
  }
  return results;
}

export async function saveToFirebase(type: string, year: number, month: number, data: any[], extras: Record<string, any> = {}): Promise<PipelineResult> {
  const pipelineData: Omit<PipelineResult, 'id'> = {
    pipelineType: type,
    timestamp: Date.now(),
    year,
    month,
    data,
    ...extras,
  };
  const saved = await firebaseStore.saveResult(type, pipelineData);
  return { ...pipelineData, id: saved.id } as PipelineResult;
}
