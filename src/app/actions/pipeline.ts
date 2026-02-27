
'use server';

import { firebaseStore, DriverConsolidated } from '@/lib/firebase';
import { generateDataSummary } from '@/ai/flows/ai-generated-data-summary';

export async function executeVFleetPipeline(formData: FormData) {
  const year = parseInt(formData.get('year') as string);
  const month = parseInt(formData.get('month') as string);
  
  // In a real scenario, we would parse the uploaded Excel files here using 'xlsx' or similar.
  // For this demo, we will simulate the transformation logic on some mock data
  // derived from the parameters to show the flow.

  console.log(`Executing vFleet Pipeline for ${month}/${year}`);

  // Simulated data based on the business rules in the prompt
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

  // Sort by performance descending
  processedData.sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

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

  return {
    success: true,
    result: saved
  };
}

export async function getLatestPipelineResult(pipelineId: string) {
  return await firebaseStore.getResult(pipelineId);
}
