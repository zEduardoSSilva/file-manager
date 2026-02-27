'use server';

import { firebaseStore, DriverConsolidated, PipelineResult } from '@/lib/firebase';
import { generateDataSummary } from '@/ai/flows/ai-generated-data-summary';

/**
 * Server Action to execute the vFleet transformation pipeline.
 * Processes mock driver data based on provided period and files.
 */
export async function executeVFleetPipeline(formData: FormData) {
  try {
    const rawYear = formData.get('year');
    const rawMonth = formData.get('month');
    
    if (!rawYear || !rawMonth) {
      throw new Error('Parâmetros de período ausentes.');
    }

    const year = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);
    
    console.log(`[vFleet Pipeline] Starting execution for ${month}/${year}`);

    // Simulated transformation logic
    const mockDrivers = [
      "RODRIGO ALVES", "MARCOS SILVA", "JOSE OLIVEIRA", "ANTONIO SANTOS", 
      "LUIS FERREIRA", "CARLOS GOMES", "PAULO COSTA", "RICARDO MARTINS"
    ];

    const processedData: DriverConsolidated[] = mockDrivers.map(name => {
      const activityDays = Math.floor(Math.random() * 20) + 5;
      const failures = {
        curva: Math.floor(Math.random() * 3),
        banguela: Math.floor(Math.random() * 2),
        ociosidade: Math.floor(Math.random() * 4),
        velocidade: Math.floor(Math.random() * 2),
      };
      
      const bonifiedDays = Math.max(0, activityDays - (failures.curva + failures.banguela + failures.ociosidade + failures.velocidade));
      const performance = parseFloat(((bonifiedDays / activityDays) * 100).toFixed(2));
      const totalBonus = bonifiedDays * 4.80;

      return {
        Motorista: name,
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

    console.log(`[vFleet Pipeline] Transformation complete. Generating AI summary...`);

    // Generate AI Summary
    const summaryResult = await generateDataSummary({
      consolidatedDriverData: JSON.stringify(processedData),
      pipelineContext: `Month: ${month}, Year: ${year}. Rules: Bonus R$ 4.80 if 4/4 criteria met.`
    });

    // Save to Firebase (Simulated)
    const saved = await firebaseStore.saveResult('vfleet', {
      timestamp: Date.now(),
      year,
      month,
      data: processedData,
      summary: summaryResult.summary
    });

    console.log(`[vFleet Pipeline] Execution successful. Result saved.`);

    // Return a plain serializable object
    return {
      success: true,
      result: JSON.parse(JSON.stringify(saved)) as PipelineResult
    };
  } catch (error: any) {
    console.error(`[vFleet Pipeline] ERROR:`, error.message);
    return {
      success: false,
      error: error.message || 'Ocorreu um erro interno durante o processamento.'
    };
  }
}

export async function getLatestPipelineResult(pipelineId: string) {
  return await firebaseStore.getResult(pipelineId);
}
