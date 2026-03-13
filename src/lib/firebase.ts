// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
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
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDj733yNRCHjua7X-0rkHc74VA4qkDpg9w",
  authDomain: "file-manager-hub-50030335.firebaseapp.com",
  projectId: "file-manager-hub-50030335",
  storageBucket: "file-manager-hub-50030335.firebasestorage.app",
  messagingSenderId: "187801013388",
  appId: "1:187801013388:web:ef1417fae5d8d24d93ffa9",
  measurementId: "G-MJ60ERTPV8"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

// Initialize Firebase
// const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

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
  'Percentual (%)'?: number;
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
