
"use server"

import { z } from "zod"
import { groupBy, map, sumBy } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

const DevolucoesSchema = z.object({
  "Nome Fantasia": z.string(),
  "Representante": z.string(),
  "Tipo de Devolução": z.string(),
  "Motivo": z.string(),
  "Valor (Impacto)": z.number(),
})

type Devolucao = z.infer<typeof DevolucoesSchema>

async function processDevolucoesData({ year, month, files }: PipelineArgs): Promise<ProcessorOutput> {
  const data = await files.readAll("files", DevolucoesSchema)
  const flatData = data.flat()

  const byRepresentante = groupBy(flatData, "Representante")
  const resumoPorRepresentante = map(byRepresentante, (devs, rep) => ({
    representante: rep,
    totalDevolucoes: sumBy(devs, "Valor (Impacto)"),
    quantidade: devs.length,
    tipos: map(groupBy(devs, "Tipo de Devolução"), (d, tipo) => ({ tipo, total: sumBy(d, "Valor (Impacto)")})),
    motivos: map(groupBy(devs, "Motivo"), (d, motivo) => ({ motivo, total: sumBy(d, "Valor (Impacto)")})),
  })).sort((a, b) => b.totalDevolucoes - a.totalDevolucoes)

  const byCliente = groupBy(flatData, "Nome Fantasia")
  const resumoPorCliente = map(byCliente, (devs, cliente) => ({
    cliente,
    totalDevolucoes: sumBy(devs, "Valor (Impacto)"),
    quantidade: devs.length,
  })).sort((a, b) => b.totalDevolucoes - a.totalDevolucoes)

  return {
    data: flatData,
    resumoPorRepresentante,
    resumoPorCliente,
    summary: `Devoluções: ${flatData.length} registros para ${resumoPorRepresentante.length} representantes e ${resumoPorCliente.length} clientes.`,
  }
}

export const executeDevolucoesPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("devolucoes", formData, processDevolucoesData)
}
