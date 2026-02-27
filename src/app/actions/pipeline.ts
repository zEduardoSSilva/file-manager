
'use server';

import { firebaseStore, DriverConsolidated, PipelineResult, AbsenteismoData } from '@/lib/firebase';
import { generateDataSummary } from '@/ai/flows/ai-generated-data-summary';

export async function executePipeline(formData: FormData, pipelineType: 'vfleet' | 'performaxxi' | 'ponto') {
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
    await new Promise(r => setTimeout(r, 1500));

    let processedDrivers: DriverConsolidated[] = [];
    let processedHelpers: DriverConsolidated[] = [];
    let absenteismoData: AbsenteismoData[] = [];

    if (pipelineType === 'ponto') {
      // Lógica de Ponto (Motorista R$ 3.20 | Ajudante R$ 4.80)
      const mockNames = ["RODRIGO ALVES", "MARCOS SILVA", "JOSE OLIVEIRA", "ANTONIO SANTOS"];
      
      processedDrivers = mockNames.map(name => {
        const activeDays = 22;
        const fullMarkingsDays = Math.floor(Math.random() * 5) + 17; // 17 a 22 dias
        const bonusMarks = fullMarkingsDays * 1.60;
        const bonusCrit = fullMarkingsDays * 1.60; // Mock: todos os critérios ok se 4 marcações ok
        return {
          'ID': 'M' + Math.floor(Math.random() * 1000),
          'Motorista': name,
          'Empresa': 'Logistics Pro',
          'Dias com Atividade': activeDays,
          'Dias Bonif. Ponto (4/4)': fullMarkingsDays,
          'Percentual de Desempenho (%)': parseFloat(((fullMarkingsDays / activeDays) * 100).toFixed(2)),
          'Total Bônus Marcações': bonusMarks,
          'Total Bônus Critérios': bonusCrit,
          'Total Bonificação (R$)': bonusMarks + bonusCrit,
          'Total Ajustes Manuais': Math.floor(Math.random() * 3),
        };
      });

      processedHelpers = mockNames.map(name => {
        const activeDays = 22;
        const fullMarkingsDays = Math.floor(Math.random() * 4) + 18;
        const bonusMarks = fullMarkingsDays * 2.40;
        const bonusCrit = fullMarkingsDays * 2.40;
        return {
          'ID': 'A' + Math.floor(Math.random() * 1000),
          'Ajudante': name + " (Ajudante)",
          'Empresa': 'Logistics Pro',
          'Dias com Atividade': activeDays,
          'Dias Bonif. Ponto (4/4)': fullMarkingsDays,
          'Percentual de Desempenho (%)': parseFloat(((fullMarkingsDays / activeDays) * 100).toFixed(2)),
          'Total Bônus Marcações': bonusMarks,
          'Total Bônus Critérios': bonusCrit,
          'Total Bonificação (R$)': bonusMarks + bonusCrit,
          'Total Ajustes Manuais': 0,
        };
      });

      // Lógica de Absenteísmo - Corrigido sintaxe de concatenação
      absenteismoData = [
        ...mockNames.map(n => ({ n, g: 'Motorista' as const })), 
        ...mockNames.map(n => ({ n: n + " (Ajudante)", g: 'Ajudante' as const }))
      ].map(item => {
        const total = 26; // Dias úteis
        const presences = Math.floor(Math.random() * 4) + 23;
        const perc = parseFloat(((presences / total) * 100).toFixed(2));
        let incentive = 0;
        if (perc >= 100) incentive = 50;
        else if (perc >= 90) incentive = 40;
        else if (perc >= 75) incentive = 25;

        return {
          ID: 'ID-' + Math.floor(Math.random() * 999),
          Nome: item.n,
          Grupo: item.g,
          Total_Dias: total,
          Presencas: presences,
          Faltas: total - presences,
          Percentual: perc,
          Valor_Incentivo: incentive
        };
      });

    } else if (pipelineType === 'performaxxi') {
      const mockNames = ["RODRIGO ALVES", "MARCOS SILVA", "JOSE OLIVEIRA", "ANTONIO SANTOS"];
      processedDrivers = mockNames.map(name => {
        const activeDays = 15;
        const maxBonusDays = 12;
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
      const mockDrivers = ["CARLOS GOMES", "PAULO COSTA", "RICARDO MARTINS"];
      processedDrivers = mockDrivers.map(name => {
        const activityDays = 20;
        const bonifiedDays = 17;
        return {
          'Motorista': name,
          'Dias com Atividade': activityDays,
          'Dias Bonif. Máxima (4/4)': bonifiedDays,
          'Percentual de Desempenho (%)': 85,
          'Total Bonificação (R$)': bonifiedDays * 4.80,
          'Falhas Curva Brusca': 1,
          'Falhas Banguela': 0,
          'Falhas Ociosidade': 2,
          'Falhas Exc. Velocidade': 0,
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
      absenteismoData,
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
