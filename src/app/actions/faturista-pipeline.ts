
"use server"

import { z } from "zod"
import { groupBy, map, sumBy, countBy } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

const FaturistaSchema = z.object({
  "Emissor": z.string(),
  "Período": z.string(),
  "Data": z.string(), // Ou z.date() se o formato for consistente
  "Semana": z.string(),
  "Funcionário": z.string(),
  "Função": z.string(),
  "H.E 50%": z.number().optional(),
  "H.E 100%": z.number().optional(),
  "Faltas": z.number().optional(),
})

type FaturistaEntry = z.infer<typeof FaturistaSchema>

async function processFaturistaData({ year, month, files }: PipelineArgs): Promise<ProcessorOutput> {
  const data = await files.readAll("files", FaturistaSchema)
  const flatData = data.flat()

  const byFuncionario = groupBy(flatData, "Funcionário")

  const resumoMensal = map(byFuncionario, (entries, nome) => {
    const he50 = sumBy(entries, e => e["H.E 50%"] ?? 0)
    const he100 = sumBy(entries, e => e["H.E 100%"] ?? 0)
    const faltas = sumBy(entries, e => e["Faltas"] ?? 0)
    const totalHE = he50 + he100

    return {
      "Funcionário": nome,
      "Função": entries[0]["Função"],
      "H.E 50%": he50,
      "H.E 100%": he100,
      "Faltas": faltas,
      "Total HE": totalHE,
      "Períodos": countBy(entries, "Período"),
    }
  })

  return {
    data: flatData,
    resumoMensal,
    summary: `Faturista: ${flatData.length} registros para ${resumoMensal.length} funcionários.`,
  }
}

export const executeFaturistaPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("faturista", formData, processFaturistaData)
}
