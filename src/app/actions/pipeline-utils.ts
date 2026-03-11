import * as XLSX from 'xlsx';
import { z, ZodSchema } from 'zod';
import { PipelineResult, firebaseStore } from '@/lib/firebase';

// A resposta padronizada que a UI espera
export interface PipelineResponse {
  success: boolean;
  result: PipelineResult;
  error?: string;
}

// Classe auxiliar para ler e validar arquivos Excel do FormData
class FileReader {
  constructor(private formData: FormData) {}

  private async readFile(file: File): Promise<any[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error(`O arquivo ${file.name} não contém planilhas.`);
    }
    return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
  }

  async read(fieldName: string, schema?: ZodSchema<any>): Promise<any[]> {
    const file = this.formData.get(fieldName) as File | null;
    if (!file) {
      return [];
    }
    const jsonData = await this.readFile(file);
    if (schema) {
      const result = z.array(schema).safeParse(jsonData);
      if (!result.success) {
        console.error("Erro de validação Zod:", result.error.flatten().fieldErrors);
        throw new Error(`Validação falhou para o arquivo ${file.name}. Verifique o formato das colunas.`);
      }
      return result.data;
    }
    return jsonData;
  }

  async readAll(fieldName: string, schema?: ZodSchema<any>): Promise<any[][]> {
    const files = this.formData.getAll(fieldName) as File[];
    const allResults: any[][] = [];

    for (const file of files) {
      const jsonData = await this.readFile(file);
      if (schema) {
        const result = z.array(schema).safeParse(jsonData);
        if (!result.success) {
          console.error(`Erro de validação Zod para ${file.name}:`, result.error.flatten().fieldErrors);
          throw new Error(`Validação falhou para o arquivo ${file.name}. Verifique o console do servidor para mais detalhes.`);
        }
        allResults.push(result.data);
      } else {
        allResults.push(jsonData);
      }
    }
    return allResults;
  }
}

// Interface para os argumentos passados para as funções de processamento de cada pipeline
export interface PipelineArgs {
  year: number;
  month: number;
  files: FileReader;
  formData: FormData;
}

// Interface para a saída das funções de processamento
export interface ProcessorOutput {
  summary: string; // Um resumo do que foi processado
  data: any[];     // Os dados brutos/detalhados
  [key: string]: any; // Permite outras propriedades, como resumos e totais
}

/**
 * Orquestra a execução de um pipeline: processa os dados e salva no Firebase.
 * @param pipelineType - O nome do pipeline (ex: "ponto", "cco").
 * @param formData - Os dados recebidos do formulário do cliente.
 * @param processor - A função específica do pipeline para transformar os dados.
 * @returns Uma resposta padronizada para a UI.
 */
export async function processAndSave(
  pipelineType: string,
  formData: FormData,
  processor: (args: PipelineArgs) => Promise<ProcessorOutput>
): Promise<PipelineResponse> {
  try {
    const year = Number(formData.get('year'));
    const month = Number(formData.get('month'));

    if (isNaN(year) || isNaN(month)) {
      throw new Error('Ano e mês devem ser números válidos.');
    }

    const files = new FileReader(formData);
    const processorArgs: PipelineArgs = { year, month, files, formData };
    
    // Executa a lógica de processamento específica do pipeline
    const processorResult = await processor(processorArgs);

    // Separa os dados principais dos extras para salvar no Firebase
    const { data, ...extras } = processorResult;
    
    const savedResult = await saveToFirebase(pipelineType, year, month, data, extras);

    return {
      success: true,
      result: savedResult,
    };
  } catch (error: any) {
    console.error(`[${pipelineType.toUpperCase()}] Erro no Pipeline:`, error);
    return {
      success: false,
      result: {} as PipelineResult,
      error: error.message,
    };
  }
}

// Salva os resultados do pipeline no Firestore
export async function saveToFirebase(
  type: string, 
  year: number, 
  month: number, 
  data: any[], 
  extras: Record<string, any> = {}
): Promise<PipelineResult> {
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
