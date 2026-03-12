import {
  processAndSave,
  PipelineArgs,
  ProcessorOutput,
  PipelineResponse,
} from './pipeline-utils';

async function consolidacaoEntregasProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const sheetsData = await args.files.readAll('files');
  const allData = sheetsData.flat();

  return {
    data: allData,
    summary: `Consolidação Entregas: ${allData.length} registros processados.`,
  };
}

export async function executeConsolidacaoEntregasPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave('consolidacao-entregas', formData, consolidacaoEntregasProcessor);
}
