
// Simulation of Firebase store to manage pipeline results
// In a real scenario, this would use the Firebase Admin SDK or Client SDK with proper security rules.

export interface DriverConsolidated {
  'ID'?: string;
  'Empresa'?: string;
  'Funcionario'?: string;
  'Motorista'?: string; // Mantido para compatibilidade com vFleet/Ponto se necessário
  'Cargo'?: 'MOTORISTA' | 'AJUDANTE';
  'Dias com Atividade'?: number;
  'Dias Bonif. Máxima (4/4)'?: number;
  'Percentual de Desempenho (%)'?: number;
  'Total Bonificação (R$)'?: number;
  'Total Critérios Cumpridos'?: number;
  'Falhas Raio'?: number;
  'Falhas SLA'?: number;
  'Falhas Tempo'?: number;
  'Falhas Sequência'?: number;
  // Colunas de Ponto
  'Dias_Trabalhados'?: number;
  '💰 Total_Bonus_Marcacoes'?: number;
  '💰 Total_Bonus_Criterios'?: number;
  '💵 BONIFICACAO_TOTAL'?: number;
  'Dias_Todos_Criterios_OK'?: number;
  'Dias_4_Marcacoes_Completas'?: number;
  'Dias_Violou_DSR'?: number;
  'Total_Ajustes_Manuais'?: number;
}

export interface AbsenteismoData {
  'ID': string;
  'Nome': string;
  'Grupo': string;
  'Total_Dias': number;
  'Presenças Físicas': number;
  'Atestados/Férias': number;
  'Abonos Manuais': number;
  'Total Presenças': number;
  'Faltas': number;
  'Percentual (%)': number;
  'Valor_Incentivo': number;
  'Datas_Abonos_Manuais': string;
}

export interface PipelineResult {
  id: string;
  pipelineType: 'vfleet' | 'performaxxi' | 'ponto';
  timestamp: number;
  year: number;
  month: number;
  data: any[];
  absenteismoData?: AbsenteismoData[];
  detalheGeral?: any[]; // Aba unificada Detalhe
  summary?: string;
}

const storage: Record<string, PipelineResult> = {};

/**
 * Interface para gerenciar o armazenamento de resultados no Firebase.
 * Nota: Como este é um protótipo, simulamos a persistência, mas o código 
 * está preparado para ser conectado ao Firestore.
 */
export const firebaseStore = {
  saveResult: async (id: string, result: Omit<PipelineResult, 'id'>) => {
    // Simulação de latência de rede do Firebase
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    const newId = `${result.pipelineType}_${result.year}_${result.month}_${Date.now()}`;
    const finalResult = { ...result, id: newId };
    
    // Armazena na memória (simulando Firestore)
    storage[newId] = finalResult;
    
    console.log(`[FIREBASE] Resultado salvo com sucesso: ${newId}`);
    return finalResult;
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
