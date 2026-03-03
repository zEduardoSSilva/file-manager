
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
  'Percentual (%)': number;
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
