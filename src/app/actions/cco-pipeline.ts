
"use server"

import { z } from "zod"
import { uniqBy } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

const CCO_MOTORISTA_HORAS_FIXAS = 184
const CCO_AJUDANTE_HORAS_FIXAS = 191

const MotoristaSchema = z.object({
  NOME: z.string(),
  FUNCAO: z.string(),
  SALARIO: z.number(),
})

const AjudanteSchema = z.object({
  NOME: z.string(),
  FUNCAO: z.string(),
  SALARIO: z.number(),
})

async function processCcoData({ year, month, files }: PipelineArgs): Promise<ProcessorOutput> {
  const motoristas = await files.read("fileMotoristas", MotoristaSchema)
  const ajudantes = await files.read("fileAjudantes", AjudanteSchema)

  const motoristasTratados = motoristas.map(m => ({
    ...m,
    EQUIPE: "MOTORISTA",
    HE_100: m.SALARIO / CCO_MOTORISTA_HORAS_FIXAS * 1.5 * 2,
    DSR_S_HE: (m.SALARIO / CCO_MOTORISTA_HORAS_FIXAS * 1.5 * 2) / 25 * 5,
  }))

  const ajudantesTratados = ajudantes.map(a => ({
    ...a,
    EQUIPE: "AJUDANTE",
    HE_100: a.SALARIO / CCO_AJUDANTE_HORAS_FIXAS * 2 * 2,
    DSR_S_HE: (a.SALARIO / CCO_AJUDANTE_HORAS_FIXAS * 2 * 2) / 25 * 5,
  }))

  const finalData = uniqBy([...motoristasTratados, ...ajudantesTratados], 'NOME')
  const totalMotoristas = motoristasTratados.length
  const totalAjudantes = ajudantesTratados.length

  // Os dados que a UI precisa para exibir as tabelas
  const resumoMensal = finalData.map(f => ({ 
    empresa: f.NOME, // Assumindo que NOME é a "empresa" ou identificador único
    ...f 
  }));

  return {
    data: finalData, // Para o download do excel
    resumoMensal, // Para a tabela de resumo na UI
    summary: `CCO: ${totalMotoristas} motoristas e ${totalAjudantes} ajudantes processados.`,
  }
}

export const executeCcoPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("cco", formData, processCcoData)
}
