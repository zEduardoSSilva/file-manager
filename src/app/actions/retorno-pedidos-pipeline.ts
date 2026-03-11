"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// Como este pipeline parece apenas ler e salvar, não precisamos de um schema de validação complexo aqui.
// A função `readAll` da classe FileReader vai converter o Excel para JSON.

async function processRetornoPedidosData({ files }: PipelineArgs): Promise<ProcessorOutput> {
  // Usamos `readAll` sem um schema para simplesmente converter os arquivos para JSON.
  const data = await files.readAll("files")
  const flatData = data.flat()

  return {
    data: flatData,
    summary: `Retorno Pedidos: ${flatData.length} registros processados.`,
  }
}

export const executeRetornoPedidosPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("retorno-pedidos", formData, processRetornoPedidosData)
}
