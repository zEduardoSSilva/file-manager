
// Simulation of Firebase store to manage pipeline results
// In a real app, you would initialize Firebase here.

export interface DriverConsolidated {
  'ID': string;
  'Motorista'?: string;
  'Ajudante'?: string;
  'Empresa'?: string;
  'Dias_Trabalhados': number;
  '💰 Total_Bonus_Marcacoes': number;
  '💰 Total_Bonus_Criterios': number;
  '💵 BONIFICACAO_TOTAL': number;
  'Dias_Todos_Criterios_OK': number;
  'Dias_4_Marcacoes_Completas': number;
  'Dias_Violou_DSR': number;
  'Total_Ajustes_Manuais': number;
  // Legacy fields for mapping
  'Dias com Atividade'?: number;
  'Percentual de Desempenho (%)'?: number;
}

export interface AbsenteismoData {
  ID: string;
  Nome: string;
  Grupo: 'Motorista' | 'Ajudante';
  Total_Dias: number;
  Presencas: number;
  Faltas: number;
  Percentual: number;
  Valor_Incentivo: number;
}

export interface PipelineResult {
  id: string;
  pipelineType: 'vfleet' | 'performaxxi' | 'ponto';
  timestamp: number;
  year: number;
  month: number;
  data: DriverConsolidated[];
  helpersData?: DriverConsolidated[];
  absenteismoData?: AbsenteismoData[];
  summary?: string;
}

// Memory-based storage for demo purposes
const storage: Record<string, PipelineResult> = {};

export const firebaseStore = {
  saveResult: async (id: string, result: Omit<PipelineResult, 'id'>) => {
    // Simulating delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    const newId = `${result.pipelineType}_${result.year}_${result.month}_${Date.now()}`;
    storage[newId] = { ...result, id: newId };
    return storage[newId];
  },

  getResult: async (id: string): Promise<PipelineResult | null> => {
    return storage[id] || null;
  },

  getLatestByType: async (type: string): Promise<PipelineResult | null> => {
    const results = Object.values(storage).filter(r => r.pipelineType === type);
    if (results.length === 0) return null;
    return results.sort((a, b) => b.timestamp - a.timestamp)[0];
  }
};
