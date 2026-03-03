'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE vFleet — TypeScript
 * Otimizado para processamento rápido de telemetria.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BONIFICACAO_DIARIA_TOTAL = 16.00;
const PERCENTUAL_CONDUCAO      = 0.30;
const VALOR_CONDUCAO           = 4.80; // 30% de R$ 16,00

interface DiaConducao {
  Motorista: string;
  Dia: string;
  'Total de Registros': number;
  'Registros Sem Curva Brusca': number;
  '% Sem Curva': number;
  '✓ Curva 100%': boolean;
  'Total Eventos Curva': number;
  'Registros Sem Banguela': number;
  '% Sem Banguela': number;
  '✓ Banguela 100%': boolean;
  'Total Banguela (seg)': number;
  'Registros Sem Ociosidade': number;
  '% Sem Ociosidade': number;
  '✓ Ociosidade 100%': boolean;
  'Total Ociosidade (seg)': number;
  '✓ Sem Excesso Velocidade': boolean;
  'Critérios Cumpridos (de 4)': number;
  'Critérios Falhados': number;
  'Dia Bonificado': boolean;
  'Bonificação Condução (R$)': number;
}

interface ConsolidadoMotorista {
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

const normalizeHeader = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function toSeconds(s: any): number {
  if (!s || s === '-') return 0;
  const parts = String(s).trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extrairNomeCpf(texto: any): { nome: string; cpf: string } {
  if (!texto || String(texto).trim() === '') return { nome: '', cpf: '' };
  const s = String(texto).trim();
  const cpfMatch = s.match(/(\d{11})/);
  if (cpfMatch) {
    const cpf  = cpfMatch[1];
    const nome = s.replace(/[-\s]*\d{11}[-\s]*/g, '').replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, '').trim();
    return { nome, cpf };
  }
  return { nome: s, cpf: '' };
}

function parseCSV(texto: string): Record<string, any>[] {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
  if (linhas.length < 2) return [];
  const sep = linhas[0].includes(';') ? ';' : ',';
  const headers = linhas[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  return linhas.slice(1).map(linha => {
    const vals = linha.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function toDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  const s = String(val).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s.split(' ')[0];
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export async function executeVFleetPipeline(formData: FormData) {
  try {
    const targetYear  = parseInt(formData.get('year') as string);
    const targetMonth = parseInt(formData.get('month') as string);
    const files       = formData.getAll('files') as File[];

    let boletimRows: Record<string, any>[] = [];
    let alertaRows:  Record<string, any>[] = [];

    for (const f of files) {
      const text = await f.text();
      const parsed = parseCSV(text);
      if (f.name.toLowerCase().includes('alerta')) alertaRows.push(...parsed);
      else boletimRows.push(...parsed);
    }

    if (boletimRows.length === 0) throw new Error('Nenhum dado de Boletim encontrado.');

    const excessoMap = new Map<string, boolean>();
    alertaRows.forEach(a => {
      const mot = String(a['MOTORISTA'] || a['motorista'] || '').trim();
      const tipo = String(a['TIPO'] || a['tipo'] || '').toUpperCase();
      if (tipo.includes('VELOCIDADE')) {
        const dia = toDateStr(a['DATA'] || a['data']);
        excessoMap.set(`${mot}|${dia}`, true);
      }
    });

    const diaMap = new Map<string, any>();
    boletimRows.forEach(row => {
      const { nome } = extrairNomeCpf(row['MOTORISTAS'] || row['motoristas']);
      const dia = toDateStr(row['DIA'] || row['dia'] || row['data']);
      if (!nome || !dia) return;

      const key = `${nome}|${dia}`;
      let agg = diaMap.get(key);
      if (!agg) {
        agg = { total: 0, curvaOK: 0, bangOK: 0, ocioOK: 0 };
        diaMap.set(key, agg);
      }

      agg.total++;
      if (parseFloat(row['CURVA BRUSCA'] || row['curva']) === 0) agg.curvaOK++;
      if (toSeconds(row['BANGUELA']) === 0) agg.bangOK++;
      if (toSeconds(row['PARADO LIGADO'] || row['ociosidade']) === 0) agg.ocioOK++;
    });

    const detalhe: DiaConducao[] = [];
    diaMap.forEach((agg, key) => {
      const [mot, dia] = key.split('|');
      const cumpriuCurva = agg.curvaOK === agg.total;
      const cumpriuBang  = agg.bangOK === agg.total;
      const cumpriuOcio  = agg.ocioOK === agg.total;
      const cumpriuVeloc = !excessoMap.has(key);
      const score = (cumpriuCurva?1:0) + (cumpriuBang?1:0) + (cumpriuOcio?1:0) + (cumpriuVeloc?1:0);
      const bonificado = score === 4;

      detalhe.push({
        Motorista: mot, Dia: dia, 'Total de Registros': agg.total,
        'Registros Sem Curva Brusca': agg.curvaOK, '% Sem Curva': Math.round(agg.curvaOK/agg.total*100),
        '✓ Curva 100%': cumpriuCurva, 'Total Eventos Curva': 0,
        'Registros Sem Banguela': agg.bangOK, '% Sem Banguela': Math.round(agg.bangOK/agg.total*100),
        '✓ Banguela 100%': cumpriuBang, 'Total Banguela (seg)': 0,
        'Registros Sem Ociosidade': agg.ocioOK, '% Sem Ociosidade': Math.round(agg.ocioOK/agg.total*100),
        '✓ Ociosidade 100%': cumpriuOcio, 'Total Ociosidade (seg)': 0,
        '✓ Sem Excesso Velocidade': cumpriuVeloc, 'Critérios Cumpridos (de 4)': score,
        'Critérios Falhados': 4 - score, 'Dia Bonificado': bonificado,
        'Bonificação Condução (R$)': bonificado ? VALOR_CONDUCAO : 0
      });
    });

    const consMap = new Map<string, ConsolidadoMotorista>();
    detalhe.forEach(d => {
      let m = consMap.get(d.Motorista);
      if (!m) {
        m = { Motorista: d.Motorista, 'Dias com Atividade': 0, 'Dias Bonificados (4/4)': 0, 'Percentual de Desempenho (%)': 0, 'Total Bonificação (R$)': 0, 'Falhas Curva Brusca': 0, 'Falhas Banguela': 0, 'Falhas Ociosidade': 0, 'Falhas Exc. Velocidade': 0 };
        consMap.set(d.Motorista, m);
      }
      m['Dias com Atividade']++;
      if (d['Dia Bonificado']) m['Dias Bonificados (4/4)']++;
      m['Total Bonificação (R$)'] += d['Bonificação Condução (R$)'];
      if (!d['✓ Curva 100%']) m['Falhas Curva Brusca']++;
      if (!d['✓ Banguela 100%']) m['Falhas Banguela']++;
      if (!d['✓ Ociosidade 100%']) m['Falhas Ociosidade']++;
      if (!d['✓ Sem Excesso Velocidade']) m['Falhas Exc. Velocidade']++;
    });

    const consolidado = Array.from(consMap.values()).map(m => ({
      ...m, 'Percentual de Desempenho (%)': Math.round(m['Dias Bonificados (4/4)'] / m['Dias com Atividade'] * 100)
    })).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

    const saved = await firebaseStore.saveResult('vfleet', {
      pipelineType: 'vfleet', timestamp: Date.now(), year: targetYear, month: targetMonth,
      data: consolidado, summary: `${consolidado.length} motoristas analisados.`
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}