
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  Timestamp 
} from "firebase/firestore";

// Configuração será injetada pelo Firebase Studio automaticamente
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export interface DriverConsolidated {
  'ID'?: string;
  'Empresa'?: string;
  'Funcionario'?: string;
  'Motorista'?: string;
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
  // Ponto
  'Dias_Trabalhados'?: number;
  '💰 Total_Bonus_Marcacoes'?: number;
  '💰 Total_Bonus_Criterios'?: number;
  '💵 BONIFICACAO_TOTAL'?: number;
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
  id?: string;
  pipelineType: 'vfleet' | 'performaxxi' | 'ponto';
  timestamp: number;
  year: number;
  month: number;
  data: any[];
  absenteismoData?: AbsenteismoData[];
  detalheGeral?: any[];
  summary?: string;
}

export const firebaseStore = {
  saveResult: async (type: string, result: Omit<PipelineResult, 'id'>) => {
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

  getLatestByType: async (type: string): Promise<PipelineResult | null> => {
    try {
      const q = query(
        collection(db, "pipeline_results"),
        where("pipelineType", "==", type),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return null;
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as PipelineResult;
    } catch (error) {
      console.error("Erro ao buscar do Firestore:", error);
      return null;
    }
  }
};
