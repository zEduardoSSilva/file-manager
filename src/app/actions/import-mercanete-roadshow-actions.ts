
"use server"

import { z } from "zod"
import { intersectionWith,isEqual } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./actions-utils"

const MercaneteSchema = z.object({
  "Nome Cliente": z.string(),
  "Código": z.number(),
  "Endereço": z.string(),
  // Adicionar mais campos se necessário
})

const RoadshowSchema = z.object({
  "Nome Cliente": z.string(),
  "Código": z.number(),
  "Endereço": z.string(),
  // Adicionar mais campos se necessário
})

async function processMercaneteRoadshowData({ year, month, files }: PipelineArgs): Promise<ProcessorOutput> {
  const mercanetePromise = files.read("fileMercanete", MercaneteSchema)
  const roadshowPromise = files.read("fileRoadshow", RoadshowSchema)
  const [mercaneteData, roadshowData] = await Promise.all([mercanetePromise, roadshowPromise])

  const commonClients = intersectionWith(mercaneteData, roadshowData, (a, b) => {
    return a["Código"] === b["Código"] && a["Nome Cliente"] === b["Nome Cliente"]
  })

  return {
    data: commonClients,
    summary: `Mercanete x Roadshow: ${commonClients.length} clientes em comum encontrados.`,
    config: {
      mercaneteCount: mercaneteData.length,
      roadshowCount: roadshowData.length,
    }
  }
}

export const executeMercaneteRoadshowPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("mercanete-roadshow", formData, processMercaneteRoadshowData)
}
