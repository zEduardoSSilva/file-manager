"use server"

import { z } from "zod"
import { groupBy, map, sumBy, meanBy, keyBy } from "lodash"
import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// Constantes de negócio
const VALOR_DIA_INCENTIVO = 400 / 25; // R$ 16,00
const META_OCUPACAO_VEICULO = 0.85;

// Schemas para validação dos arquivos Excel
const ConsolidadoSchema = z.object({
  "Data da Viagem": z.string(), // ou z.date()
  "Placa": z.string(),
  "Região": z.string(),
  "Peso Total da Carga (kg)": z.number(),
  "Tempo Total da Viagem (h)": z.number(),
});

const VeiculosSchema = z.object({
  "Placa": z.string(),
  "Capacidade (kg)": z.number(),
});

const PerformaxxiSchema = z.object({
  "Placa": z.string(),
  "Data": z.string(),
  "Tempo Produtivo (h)": z.number(),
});

async function processRoadshowData({ files }: PipelineArgs): Promise<ProcessorOutput> {
  // 1. Leitura e validação dos arquivos
  const consolidado = await files.read("fileConsolidado", ConsolidadoSchema);
  if (consolidado.length === 0) {
    throw new Error("O arquivo Consolidado_Entregas é obrigatório e não foi encontrado ou está vazio.");
  }
  
  const veiculos = await files.read("fileVeiculos", VeiculosSchema);
  const performaxxi = await files.read("filePedidos", PerformaxxiSchema);

  // 2. Preparação dos dados auxiliares
  const capacidadePorPlaca = keyBy(veiculos, "Placa");
  const tempoProdutivoPorPlacaDia = keyBy(performaxxi, p => `${p.Placa}_${p.Data}`);

  // 3. Processamento principal dos dados consolidados
  const dadosConsolidados = consolidado.map(item => {
    const placa = item["Placa"];
    const dataViagem = item["Data da Viagem"];
    const key = `${placa}_${dataViagem}`;

    const capacidade = capacidadePorPlaca[placa]?.["Capacidade (kg)"] ?? 10000; // Usa 10T como fallback
    const tempoProdutivo = tempoProdutivoPorPlacaDia[key]?.["Tempo Produtivo (h)"] ?? item["Tempo Total da Viagem (h)"]; // Usa tempo total como fallback

    const ocupacaoVeiculo = (item["Peso Total da Carga (kg)"] / capacidade);
    const ocupacaoJornada = tempoProdutivo / item["Tempo Total da Viagem (h)"];

    let indicadorFinal = 0;
    if (ocupacaoVeiculo >= META_OCUPACAO_VEICULO) {
      indicadorFinal = ocupacaoJornada <= 1 ? 1 : ocupacaoVeiculo;
    }

    const incentivo = indicadorFinal * VALOR_DIA_INCENTIVO;

    return {
      data: dataViagem,
      placa,
      regiao: item["Região"],
      ocupacaoJornada,
      ocupacaoVeiculo,
      indicadorFinal,
      incentivo,
    };
  });

  // 4. Geração dos resumos
  const resumoPorRegiao = groupBy(dadosConsolidados, 'regiao');
  const resumoMensal = map(resumoPorRegiao, (rotas, regiao) => ({
    regiao,
    incentivoTotal: sumBy(rotas, 'incentivo'),
  }));

  const resumoAritmetico = {
    mediaOcupacaoJornada: meanBy(dadosConsolidados, 'ocupacaoJornada'),
    mediaOcupacaoVeiculo: meanBy(dadosConsolidados, 'ocupacaoVeiculo'),
    totalIncentivo: sumBy(dadosConsolidados, 'incentivo'),
  };

  return {
    data: dadosConsolidados,
    resumoMensal, 
    resumoAritmetico, 
    summary: `Roadshow: ${dadosConsolidados.length} rotas processadas. Incentivo total: ${resumoAritmetico.totalIncentivo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
  };
}

export const executeRoadshowPipeline = async (formData: FormData): Promise<PipelineResponse> => {
  return processAndSave("roadshow", formData, processRoadshowData);
}
