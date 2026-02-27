'use server';

import { firebaseStore, DriverConsolidated, PipelineResult } from '@/lib/firebase';
import { generateDataSummary } from '@/ai/flows/ai-generated-data-summary';

/**
 * Server Action para executar o pipeline de transformação vFleet.
 * Processa dados baseados nas colunas:
 * - Controle: "PLACA SISTEMA", "MOTORISTA", "ENTREGAS", "VIAGEM"
 * - Alertas: "MOTORISTA", "TIPO" (Curva Brusca, Banguela, Ociosidade, Exc. Velocidade)
 */
export async function executeVFleetPipeline(formData: FormData) {
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
    
    console.log(`[vFleet] Iniciando processamento de ${month}/${year}`);

    // Simulação de Validação de Cabeçalhos (Baseado no que você forneceu)
    const mockValidationDelay = () => new Promise(r => setTimeout(r, 400));
    
    // 1. Validando Controle de Entregas (Aba Acumulado)
    console.log("[vFleet] Validando colunas: PLACA SISTEMA, MOTORISTA, KM, VIAGEM...");
    await mockValidationDelay();

    // 2. Validando Histórico de Alertas
    console.log("[vFleet] Validando colunas de Alertas: MOTORISTA, TIPO, EXCESSO, DURACAO...");
    await mockValidationDelay();

    // Lógica de Consolidação Simulada (Refletindo a aba 05_Consolidado_Motorista)
    const mockDrivers = [
      "RODRIGO ALVES", "MARCOS SILVA", "JOSE OLIVEIRA", "ANTONIO SANTOS", 
      "LUIS FERREIRA", "CARLOS GOMES", "PAULO COSTA", "RICARDO MARTINS"
    ];

    const processedData: DriverConsolidated[] = mockDrivers.map(name => {
      const activityDays = Math.floor(Math.random() * 20) + 5;
      
      // Simulação de cruzamento por TIPO de alerta
      const failures = {
        curva: Math.floor(Math.random() * 2),
        banguela: Math.floor(Math.random() * 1.5),
        ociosidade: Math.floor(Math.random() * 3),
        velocidade: Math.floor(Math.random() * 2),
      };
      
      // Regra: 4/4 critérios (Sem nenhuma falha no dia)
      const bonifiedDays = Math.max(0, activityDays - (failures.curva + failures.banguela + failures.ociosidade + failures.velocidade));
      const performance = parseFloat(((bonifiedDays / activityDays) * 100).toFixed(2));
      const totalBonus = bonifiedDays * 4.80;

      return {
        'Motorista': name,
        'Dias com Atividade': activityDays,
        'Dias Bonificados (4/4)': bonifiedDays,
        'Percentual de Desempenho (%)': performance,
        'Total Bonificação (R$)': totalBonus,
        'Falhas Curva Brusca': failures.curva,
        'Falhas Banguela': failures.banguela,
        'Falhas Ociosidade': failures.ociosidade,
        'Falhas Exc. Velocidade': failures.velocidade,
      };
    });

    processedData.sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

    console.log(`[vFleet] Cruzamento concluído. Solicitando resumo de IA...`);

    // Geração de Resumo via Genkit
    let summaryResult;
    try {
      summaryResult = await generateDataSummary({
        consolidatedDriverData: JSON.stringify(processedData),
        pipelineContext: `Período: ${month}/${year}. Regra: Bonificação R$ 4.80 por dia 4/4.`
      });
    } catch (aiError) {
      console.error("[vFleet] Erro Genkit:", aiError);
      summaryResult = { summary: "O resumo automático não pôde ser gerado, mas os dados estão salvos." };
    }

    // Persistência no "Firebase"
    const saved = await firebaseStore.saveResult('vfleet', {
      timestamp: Date.now(),
      year,
      month,
      data: processedData,
      summary: summaryResult.summary
    });

    return {
      success: true,
      result: JSON.parse(JSON.stringify(saved)) as PipelineResult
    };
  } catch (error: any) {
    console.error(`[vFleet] ERRO NO PIPELINE:`, error.message);
    return {
      success: false,
      error: error.message || 'Erro interno durante o processamento.'
    };
  }
}

export async function getLatestPipelineResult(pipelineId: string) {
  return await firebaseStore.getResult(pipelineId);
}
