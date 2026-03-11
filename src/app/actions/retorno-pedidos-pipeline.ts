import { PipelineResponse, readAllFilesFromFormData, saveToFirebase } from './pipeline-utils';

export async function executeRetornoPedidosPipeline(formData: FormData, _type?: string): Promise<PipelineResponse> {
  try {
    const year = parseInt(formData.get('year') as string);
    const month = parseInt(formData.get('month') as string);
    const sheetsData = await readAllFilesFromFormData(formData, 'files');
    const allData = sheetsData.flat();

    const result = await saveToFirebase('retorno-pedidos', year, month, allData, {
      summary: `Retorno Pedidos TXT: ${allData.length} registros processados.`,
    });

    return { success: true, result };
  } catch (error: any) {
    return { success: false, result: {} as any, error: error.message };
  }
}
