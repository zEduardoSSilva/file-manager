
// Simulation of Firebase store to manage pipeline results
// In a real app, you would initialize Firebase here.

export interface DriverConsolidated {
  Motorista: string;
  'Dias com Atividade': number;
  'Dias Bonificados (4/4)': number;
  'Percentual de Desempenho (%)': number;
  'Total Bonificação (R$)': number;
  'Falhas Curva Brusca': number;
  'Falhas Banguela': number;
  'Falhas Ociosidade': number;
  'Falhas Exc. Velocidade': number;
}

export interface PipelineResult {
  id: string;
  timestamp: number;
  year: number;
  month: number;
  data: DriverConsolidated[];
  summary?: string;
}

// Memory-based storage for demo purposes
const storage: Record<string, PipelineResult> = {};

export const firebaseStore = {
  saveResult: async (pipelineId: string, result: Omit<PipelineResult, 'id'>) => {
    // Simulating delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    storage[pipelineId] = { ...result, id: pipelineId };
    return storage[pipelineId];
  },

  getResult: async (pipelineId: string): Promise<PipelineResult | null> => {
    return storage[pipelineId] || null;
  }
};
