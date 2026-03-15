
import { Timestamp } from "firebase/firestore";

/**
 * Representa um único registro de entrega, como lido da planilha e salvo no Firestore.
 * Esta é a estrutura para a nova coleção "entregas" que resolverá o problema de consumo.
 */
export interface Entrega {
  // Metadados da importação para rastreabilidade
  pipelineId: string;
  importTimestamp: Timestamp;

  // Campos de data para consultas eficientes
  year: number;
  month: number;
  day: number;

  // Dados principais da entrega, com tipos corrigidos
  "DATA DE ENTREGA": string;
  "FILIAL": string;
  "REGIÃO": string;
  "ROTA": string;
  "MOTORISTA": string;
  "AJUDANTE"?: string;
  "AJUDANTE 2"?: string;
  "PLACA": string;
  "PLACA SISTEMA"?: string;
  "ENTREGAS": number;
  "PESO": number;
  "TEMPO": string; // Formato "HH:MM"
  "KM": number;
  "VIAGENS": string; // O campo unificado (antigo LIQUIDAÇÃO/ID)
  "VALOR": number;
  "FRETE": number;
  "DESCARGA PALET"?: number;
  "HOSPEDAGEM"?: number;
  "DIARIA"?: number;
  "EXTRA"?: number;
  "CHAPA"?: number;
  "OBSERVAÇÃO"?: string;
  "STATUS"?: string;
  "CONTRATO"?: string;
  "PERFORMAXXI"?: any;
  "ENTREGAS DEV"?: number;
  "VALOR DEV"?: number;
}

/**
 * Representa o resultado de um pipeline (modelo antigo).
 * Mantido para referência durante a migração.
 */
export interface PipelineResult {
  pipelineType: string;
  year: number;
  month: number;
  timestamp: Timestamp;
  summary: string;
  duplicadas?: any[];
  data: any[]; // O array que estamos eliminando
}

/**
 * Representa um motorista ou ajudante.
 */
export interface Colaborador {
  id?: string; // ID do documento no Firestore
  nome: string;
  cargo: 'MOTORISTA' | 'AJUDANTE';
  cpf?: string;
  telefone?: string;
  empresa?: string;
  ativo: boolean;
}

/**
 * Representa um veículo.
 */
export interface Veiculo {
  id?: string; // ID do documento no Firestore
  placa: string;
  modelo?: string;
  tipo?: string;
  empresa?: string;
  ativo: boolean;
}
