import { PipelineResponse, readExcelFromFormData, saveToFirebase } from './pipeline-utils';

export async function executeCcoPipeline(formData: FormData, _type?: string): Promise<PipelineResponse> {
  try {
    const year = parseInt(formData.get('year') as string);
    const month = parseInt(formData.get('month') as string);
    const motoristas = await readExcelFromFormData(formData, 'fileMotoristas');
    const ajudantes = await readExcelFromFormData(formData, 'fileAjudantes');
    
    const allData = [...motoristas, ...ajudantes];
    
    const result = await saveToFirebase('cco', year, month, allData, {
      resumoMensal: [],
      summary: `CCO: ${allData.length} registros consolidados.`,
    });

    return { success: true, result };
  } catch (error: any) {
    return { success: false, result: {} as any, error: error.message };
  }
}
