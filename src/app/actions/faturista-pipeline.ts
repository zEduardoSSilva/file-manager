import { PipelineResponse, readAllFilesFromFormData, saveToFirebase } from './pipeline-utils';

export async function executeFaturistaPipeline(formData: FormData): Promise<PipelineResponse> {
  try {
    const year = parseInt(formData.get('year') as string);
    const month = parseInt(formData.get('month') as string);
    const sheetsData = await readAllFilesFromFormData(formData, 'files');
    const allData = sheetsData.flat();

    const result = await saveToFirebase('faturista', year, month, allData, {
      summary: `Faturista: ${allData.length} registros processados.`,
    });

    return { success: true, result };
  } catch (error: any) {
    return { success: false, result: {} as any, error: error.message };
  }
}
