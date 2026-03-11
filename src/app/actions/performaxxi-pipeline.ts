
"use server"

import { z } from "zod"
import { groupBy, map, sumBy } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// Defina os schemas Zod para cada tipo de arquivo
const VendasSchema = z.object({
  "COd. Vendedor": z.number(),
  "Vendedor": z.string(),
  "COd. Cliente": z.number(),
  "Cliente": z.string(),
  "Total Venda": z.number(),
  "Positivação": z.string().transform(v => v === "Sim"),
})

const MetasSchema = z.object({
  "Cod. Vendedor": z.number(),
  "Vendedor": z.string(),
  "Meta Positivação": z.number(),
  "Meta Venda": z.number(),
})

async function processPerformaxxiData({ year, month, files }: PipelineArgs): Promise<ProcessorOutput> {
  const vendas = await files.read("fileVendas", VendasSchema)
  const metas = await files.read("fileMetas", MetasSchema)

  const vendasPorVendedor = groupBy(vendas, "Vendedor")

  const resumoVendedores = metas.map(meta => {
    const nomeVendedor = meta["Vendedor"]
    const vendasVendedor = vendasPorVendedor[nomeVendedor] || []
    const totalVendido = sumBy(vendasVendedor, "Total Venda")
    const clientesPositivados = vendasVendedor.filter(v => v["Positivação"]).length
    
    const atingiuMetaVenda = totalVendido >= meta["Meta Venda"]
    const atingiuMetaPositivacao = clientesPositivados >= meta["Meta Positivação"]

    return {
      vendedor: nomeVendedor,
      totalVendido,
      metaVenda: meta["Meta Venda"],
      atingiuMetaVenda,
      clientesPositivados,
      metaPositivacao: meta["Meta Positivação"],
      atingiuMetaPositivacao,
      resumoDiario: vendasVendedor, // ou um resumo se for muito grande
    }
  })

  return {
    data: vendas, // ou resumoVendedores, dependendo do que for mais útil na UI
    resumoVendedores,
    summary: `Performaxxi: ${resumoVendedores.length} vendedores processados.`,
  }
}

export const executePerformaxxiPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("performaxxi", formData, processPerformaxxiData)
}
