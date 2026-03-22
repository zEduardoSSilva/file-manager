// Importa db do arquivo central – não duplicar firebaseConfig aqui.
import {
  collection,
  addDoc,
  query,
  getDocs,
  orderBy,
  limit,
  Timestamp
} from "firebase/firestore";
import { db } from './firebase-app';
import { getFirebaseConnectionStatus } from './firebase-connection';

export { db };

export interface DriverConsolidated {
  'Empresa'?: string;
  'Funcionario'?: string;
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
}

export interface AbsenteismoData {
  'ID': string;
  'Nome': string;
  'Grupo': string;
  'Total_Dias': number;
  'Faltas': number;
  'Percentual (% )'?: number;
  'Valor_Incentivo': number;
}

export interface PipelineResult {
  id?: string;
  pipelineType: string;
  timestamp: number;
  year: number;
  month: number;
  data: any[];
  absenteismoData?: AbsenteismoData[];
  summary?: string;
  [key: string]: any; // Permite campos extras como detalheConducao, resumoMensal, etc.
}

export const firebaseStore = {
  saveResult: async (type: string, result: Omit<PipelineResult, 'id'>) => {
    if (!getFirebaseConnectionStatus()) {
      console.log("Firebase connection is disabled. Save operation cancelled.");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "pipeline_results"), {
        ...result,
        createdAt: Timestamp.now()
      });
      return { ...result, id: docRef.id };
    } catch (error) {
      console.error("Erro ao salvar no Firestore:", error);
      throw error;
    }
  },

  getRecentActivity: async (maxItems: number = 5): Promise<PipelineResult[]> => {
    if (!getFirebaseConnectionStatus()) {
      console.log("Firebase connection is disabled. Fetch operation cancelled.");
      return [];
    }
    try {
      const q = query(
        collection(db, "pipeline_results"),
        orderBy("createdAt", "desc"),
        limit(maxItems)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PipelineResult));
    } catch (error) {
      console.error("Erro ao buscar atividade recente:", error);
      return [];
    }
  }
};
