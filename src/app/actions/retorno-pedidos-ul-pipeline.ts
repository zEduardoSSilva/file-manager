import {
  processAndSave,
  PipelineArgs,
  ProcessorOutput,
  PipelineResponse,
} from './pipeline-utils';

async function retornoPedidosULProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const sheetsData = await args.files.readAll('files');
  const allData = sheetsData.flat();

  return {
    data: allData,
    summary: `Retorno Pedidos UL: ${allData.length} registros processados.`,
  };
}

export async function executeRetornoPedidosULPipeline(formData: FormData, _type?: string): Promise<PipelineResponse> {
  return processAndSave('retorno-pedidos-ul', formData, retornoPedidosULProcessor);
}
