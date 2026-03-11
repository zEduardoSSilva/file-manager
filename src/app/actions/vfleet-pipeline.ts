import { PipelineResponse, readAllFilesFromFormData, saveToFirebase } from './pipeline-utils';

export async function executeVFleetPipeline(formData: FormData): Promise<PipelineResponse> {
  try {
    const year = parseInt(formData.get('year') as string);
    const month = parseInt(formData.get('month') as string);
    const sheetsData = await readAllFilesFromFormData(formData, 'files');
    
    // Combine all file data
    const allData = sheetsData.flat();
    
    const result = await saveToFirebase('vfleet', year, month, allData, {
      summary: `vFleet: ${allData.length} registros processados.`,
    });

    return { success: true, result };
  } catch (error: any) {
    return { success: false, result: {} as any, error: error.message };
  }
}
