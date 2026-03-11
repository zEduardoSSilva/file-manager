
"use server"

import { z } from "zod"
import { groupBy, map, sumBy } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

const CoordenadorSchema = z.object({
  "CENTRO DE CUSTO": z.string(),
  "NOME FUNCIONARIO": z.string(),
  "VERBA": z.string(),
  "VALOR": z.number(),
})

async function processCoordenadorData({ year, month, files }: PipelineArgs): Promise<ProcessorOutput> {
  const data = await files.readAll("files", CoordenadorSchema)
  const flatData = data.flat()

  const grouped = groupBy(flatData, "NOME FUNCIONARIO")

  const resumoMensal = map(grouped, (entries, nome) => {
    const totalValor = sumBy(entries, "VALOR")
    return {
      "NOME FUNCIONARIO": nome,
      "CENTRO DE CUSTO": entries[0]["CENTRO DE CUSTO"],
      "TOTAL_VALOR": totalValor,
    }
  })

  return {
    data: flatData,
    resumoMensal,
    summary: `Coordenador: ${resumoMensal.length} funcionários processados em ${flatData.length} entradas.`,
  }
}

export const executeCoordenadorPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("coordenador", formData, processCoordenadorData)
}
