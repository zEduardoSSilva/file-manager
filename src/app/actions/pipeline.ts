
'use server';

import { firebaseStore, DriverConsolidated, PipelineResult } from '@/lib/firebase';
import { generateDataSummary } from '@/ai/flows/ai-generated-data-summary';

export async function executePipeline(formData: FormData, pipelineType: 'vfleet' | 'performaxxi') {
  try {
    const rawYear = formData.get('year');
    const rawMonth = formData.get('month');
    const files = formData.getAll('files') as File[];
    
    if (!rawYear || !rawMonth) {
      throw new Error('Parâmetros de período (Mês/Ano) ausentes.');
    }

    if (!files || files.length === 0) {
      throw new Error('Nenhum arquivo enviado para processamento.');
    }

    const year = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);
    
    console.log(`[${pipelineType}] Iniciando processamento de ${month}/${year}`);

    // Simulação de processamento baseada no tipo de pipeline
    await new Promise(r => setTimeout(r, 1000));

    let processedDrivers: DriverConsolidated[] = [];
    let processedHelpers: DriverConsolidated[] = [];

    if (pipelineType === 'performaxxi') {
      // Lógica Performaxxi (Motorista R$ 8.00, Ajudante R$ 7.20)
      const mockNames = ["RODRIGO ALVES", "MARCOS SILVA", "JOSE OLIVEIRA", "ANTONIO SANTOS"];
      
      processedDrivers = mockNames.map(name => {
        const activeDays = Math.floor(Math.random() * 15) + 10;
        const maxBonusDays = Math.floor(activeDays * 0.8);
        const perf = parseFloat(((maxBonusDays / activeDays) * 100).toFixed(2));
        return {
          'Motorista': name,
          'Empresa': 'Performaxxi Log',
          'Dias com Atividade': activeDays,
          'Dias Bonif. Máxima (4/4)': maxBonusDays,
          'Percentual de Desempenho (%)': perf,
          'Total Bonificação (R$)': maxBonusDays * 8.00,
          'Total Critérios Cumpridos': maxBonusDays * 4 + (activeDays - maxBonusDays) * 2,
          'Falhas Raio': Math.floor(Math.random() * 2),
          'Falhas SLA': Math.floor(Math.random() * 1),
          'Falhas Tempo': 0,
          'Falhas Sequência': Math.floor(Math.random() * 3),
        };
      });

      processedHelpers = mockNames.map(name => ({
        'Ajudante': name + " (Ajudante)",
        'Empresa': 'Performaxxi Log',
        'Dias com Atividade': 15,
        'Dias Bonif. Máxima (4/4)': 12,
        'Percentual de Desempenho (%)': 80.0,
        'Total Bonificação (R$)': 12 * 7.20,
        'Total Critérios Cumpridos': 48,
        'Falhas Raio': 1,
        'Falhas SLA': 1,
        'Falhas Tempo': 0,
        'Falhas Sequência': 1,
      }));

    } else {
      // Lógica vFleet (R$ 4.80 fixo)
      const mockDrivers = ["CARLOS GOMES", "PAULO COSTA", "RICARDO MARTINS"];
      processedDrivers = mockDrivers.map(name => {
        const activityDays = 20;
        const failures = { curva: 1, banguela: 0, ociosidade: 2, velocidade: 0 };
        const bonifiedDays = 17;
        return {
          'Motorista': name,
          'Dias com Atividade': activityDays,
          'Dias Bonif. Máxima (4/4)': bonifiedDays,
          'Percentual de Desempenho (%)': 85,
          'Total Bonificação (R$)': bonifiedDays * 4.80,
          'Falhas Curva Brusca': failures.curva,
          'Falhas Banguela': failures.banguela,
          'Falhas Ociosidade': failures.ociosidade,
          'Falhas Exc. Velocidade': failures.velocidade,
        };
      });
    }

    // Geração de Resumo via Genkit
    let summaryText = "Resumo gerado automaticamente.";
    try {
      const summaryResult = await generateDataSummary({
        consolidatedDriverData: JSON.stringify(processedDrivers.slice(0, 5)),
        pipelineContext: `Pipeline: ${pipelineType}. Período: ${month}/${year}.`
      });
      summaryText = summaryResult.summary;
    } catch (e) {
      console.warn("IA Summary failed, using fallback.");
    }

    const saved = await firebaseStore.saveResult(pipelineType, {
      pipelineType,
      timestamp: Date.now(),
      year,
      month,
      data: processedDrivers,
      helpersData: processedHelpers,
      summary: summaryText
    });

    return {
      success: true,
      result: JSON.parse(JSON.stringify(saved)) as PipelineResult
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getLatestResult(type: string) {
  return await firebaseStore.getLatestByType(type);
}
