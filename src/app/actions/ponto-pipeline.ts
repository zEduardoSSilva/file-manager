
"use server"

import { z } from "zod"
import { groupBy, map } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// Schema para o arquivo de ponto
const PontoSchema = z.object({
  "Nome": z.string(),
  "Data": z.string(), // Considerar usar z.date() se o formato for padronizado
  "Dia": z.string(),
  "Marcações": z.string(), // String com marcações separadas por espaço
  "Horas Trabalhadas": z.string(), // Formato "HH:mm"
  "Horas Extras": z.string(),
  "Absenteísmo": z.string(),
  "Banco de Horas": z.string(),
})

type PontoEntry = z.infer<typeof PontoSchema>

// Função para converter "HH:mm" para minutos
const timeToMinutes = (time: string): number => {
  if (!time || !time.includes(":")) return 0
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

// Função para formatar minutos de volta para "HH:mm"
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

async function processPontoData({ year, month, files }: PipelineArgs): Promise<ProcessorOutput> {
  const data = await files.readAll("files", PontoSchema)
  const flatData = data.flat()

  const byFuncionario = groupBy(flatData, "Nome")

  const resumoMensal = map(byFuncionario, (entries, nome) => {
    const totalMinutosTrabalhados = entries.reduce((acc, e) => acc + timeToMinutes(e["Horas Trabalhadas"]), 0)
    const totalMinutosExtras = entries.reduce((acc, e) => acc + timeToMinutes(e["Horas Extras"]), 0)
    const totalMinutosAbsenteismo = entries.reduce((acc, e) => acc + timeToMinutes(e["Absenteísmo"]), 0)
    // O cálculo do banco de horas pode ser mais complexo, aqui um exemplo simples
    const ultimoBanco = entries[entries.length - 1]["Banco de Horas"]

    return {
      nome,
      diasTrabalhados: entries.length,
      totalHorasTrabalhadas: minutesToTime(totalMinutosTrabalhados),
      totalHorasExtras: minutesToTime(totalMinutosExtras),
      totalAbsenteismo: minutesToTime(totalMinutosAbsenteismo),
      bancoDeHorasFinal: ultimoBanco,
      entradas: entries, // para detalhamento
    }
  })

  return {
    data: flatData,
    resumoMensal,
    summary: `Ponto: ${flatData.length} registros de ponto para ${resumoMensal.length} funcionários.`,
  }
}

export const executePontoPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("ponto", formData, processPontoData)
}
