import {
  processAndSave,
  PipelineArgs,
  ProcessorOutput,
  PipelineResponse,
} from './pipeline-utils';

async function vFleetProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const sheetsData = await args.files.readAll('files');
  const allData = sheetsData.flat();

  return {
    data: allData,
    summary: `vFleet: ${allData.length} registros processados.`,
  };
}

export async function executeVFleetPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave('vfleet', formData, vFleetProcessor);
}
