
'use server';

import { firebaseStore, DriverConsolidated, PipelineResult, AbsenteismoData } from '@/lib/firebase';
import { generateDataSummary } from '@/ai/flows/ai-generated-data-summary';

export async function executePipeline(formData: FormData, pipelineType: 'vfleet' | 'performaxxi' | 'ponto') {
  try {
    const rawYear = formData.get('year');
    const rawMonth = formData.get('month');
    const files = formData.getAll('files') as File[];
    
    console.log(`[SERVER] Recebida requisição para ${pipelineType}. Arquivos: ${files.length}`);

    if (!rawYear || !rawMonth) {
      throw new Error('Parâmetros de período (Mês/Ano) ausentes.');
    }

    if (!files || files.length === 0) {
      throw new Error('Nenhum arquivo enviado para processamento.');
    }

    const year = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);
    
    // Simulação de processamento pesado
    await new Promise(r => setTimeout(r, 2000));

    let processedDrivers: DriverConsolidated[] = [];
    let processedHelpers: DriverConsolidated[] = [];
    let absenteismoData: AbsenteismoData[] = [];

    // Lógica simplificada de retorno para o protótipo
    if (pipelineType === 'ponto') {
      const mockNames = ["RODRIGO ALVES", "MARCOS SILVA", "JOSE OLIVEIRA"];
      processedDrivers = mockNames.map(name => ({
        'ID': 'M' + Math.floor(Math.random() * 1000),
        'Motorista': name,
        'Dias com Atividade': 22,
        'Dias Bonif. Ponto (4/4)': 20,
        'Percentual de Desempenho (%)': 90.9,
        'Total Bonificação (R$)': 64.00,
        'Total Ajustes Manuais': 1
      }));
      absenteismoData = mockNames.map(name => ({
        ID: 'ID-' + Math.floor(Math.random() * 999),
        Nome: name,
        Grupo: 'Motorista' as const,
        Total_Dias: 26,
        Presencas: 25,
        Faltas: 1,
        Percentual: 96.15,
        Valor_Incentivo: 40.00
      }));
    } else if (pipelineType === 'performaxxi') {
      processedDrivers = [{
        'Motorista': "CARLOS SILVA",
        'Empresa': 'Logistics Pro',
        'Dias com Atividade': 15,
        'Dias Bonif. Máxima (4/4)': 12,
        'Percentual de Desempenho (%)': 80.0,
        'Total Bonificação (R$)': 96.00,
        'Falhas Raio': 1,
        'Falhas SLA': 1,
        'Falhas Tempo': 0,
        'Falhas Sequência': 1
      }];
    } else {
      processedDrivers = [{
        'Motorista': "RICARDO GOMES",
        'Dias com Atividade': 20,
        'Dias Bonif. Máxima (4/4)': 18,
        'Percentual de Desempenho (%)': 90.0,
        'Total Bonificação (R$)': 86.40,
        'Falhas Curva Brusca': 0,
        'Falhas Banguela': 0,
        'Falhas Ociosidade': 1,
        'Falhas Exc. Velocidade': 1
      }];
    }

    // IA Summary
    let summaryText = "Processamento concluído. Verifique os detalhes na tabela abaixo.";
    try {
      const summaryResult = await generateDataSummary({
        consolidatedDriverData: JSON.stringify(processedDrivers.slice(0, 3)),
        pipelineContext: `Pipeline: ${pipelineType}. Período: ${month}/${year}.`
      });
      summaryText = summaryResult.summary;
    } catch (e) {
      console.error("[SERVER] IA Summary error:", e);
    }

    const saved = await firebaseStore.saveResult(pipelineType, {
      pipelineType,
      timestamp: Date.now(),
      year,
      month,
      data: processedDrivers,
      helpersData: processedHelpers,
      absenteismoData,
      summary: summaryText
    });

    return {
      success: true,
      result: JSON.parse(JSON.stringify(saved)) as PipelineResult
    };
  } catch (error: any) {
    console.error("[SERVER] Pipeline Error:", error.message);
    return { success: false, error: error.message || 'Erro interno no servidor.' };
  }
}

export async function getLatestResult(type: string) {
  return await firebaseStore.getLatestByType(type);
}
