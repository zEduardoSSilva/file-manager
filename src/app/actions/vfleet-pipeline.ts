'use client';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * PIPELINE vFleet — TypeScript
 * Otimizado para performance e limite de armazenamento Firestore.
 */

const BONIFICACAO_DIARIA_TOTAL = 16.00;
const PERCENTUAL_CONDUCAO      = 0.30;
const VALOR_CONDUCAO           = 4.80; 

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

function toDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  if (val instanceof Date) {
    return `${String(val.getDate()).padStart(2,'0')}/${String(val.getMonth()+1).padStart(2,'0')}/${val.getFullYear()}`;
  }
  return String(val).split(' ')[0];
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

export async function executeVFleetPipeline(formData: FormData) {
  try {
    const targetYear  = parseInt(formData.get('year')  as string);
    const targetMonth = parseInt(formData.get('month') as string);
    const files       = formData.getAll('files') as File[];

    let boletimRows: any[] = [];
    let alertas: any[] = [];

    for (const f of files) {
      const text = await f.text();
      const parsed = parseCSV(text);
      if (f.name.toLowerCase().includes('alerta')) {
        alertas.push(...parsed);
      } else {
        boletimRows.push(...parsed);
      }
    }

    const diaMap = new Map<string, any>();
    const excessoMap = new Set<string>();

    alertas.forEach(a => {
      const tipo = String(a['TIPO'] || '').toUpperCase();
      if (tipo.includes('VELOCIDADE')) {
        excessoMap.add(`${String(a['MOTORISTA']).trim()}|${toDateStr(a['DATA'])}`);
      }
    });

    boletimRows.forEach(row => {
      const { nome } = extrairNomeCpf(row['MOTORISTAS']);
      const dia = toDateStr(row['DIA'] || row['DATA']);
      if (!nome || !dia) return;

      const ign = toSeconds(row['TEMPO IGNICAO LIGADA']);
      const dist = parseFloat(String(row['DISTANCIA PERCORRIDA'] || '0').replace(',', '.'));
      if (ign === 0 && dist === 0) return;

      const key = `${nome}|${dia}`;
      if (!diaMap.has(key)) {
        diaMap.set(key, { 
          mot: nome, dia, reg: 0, curvaOK: 0, bangOK: 0, ocioOK: 0, 
          curvaEvt: 0, bangSeg: 0, ocioSeg: 0 
        });
      }
      const agg = diaMap.get(key);
      agg.reg++;
      const cEvt = parseFloat(row['CURVA BRUSCA'] || '0') || 0;
      const bSeg = toSeconds(row['BANGUELA']);
      const oSeg = toSeconds(row['PARADO LIGADO']);
      
      agg.curvaEvt += cEvt; agg.bangSeg += bSeg; agg.ocioSeg += oSeg;
      if (cEvt === 0) agg.curvaOK++;
      if (bSeg === 0) agg.bangOK++;
      if (oSeg === 0) agg.ocioOK++;
    });

    const detalhe: DiaConducao[] = [];
    diaMap.forEach((agg, key) => {
      const [mot, dia] = key.split('|');
      const curOK = agg.curvaOK === agg.reg;
      const banOK = agg.bangOK === agg.reg;
      const ociOK = agg.ocioOK === agg.reg;
      const velOK = !excessoMap.has(key);
      const score = (curOK?1:0) + (banOK?1:0) + (ociOK?1:0) + (velOK?1:0);

      detalhe.push({
        Motorista: mot, Dia: dia, 'Total de Registros': agg.reg,
        'Registros Sem Curva Brusca': agg.curvaOK, '% Sem Curva': Math.round(agg.curvaOK/agg.reg*100),
        '✓ Curva 100%': curOK, 'Total Eventos Curva': agg.curvaEvt,
        'Registros Sem Banguela': agg.bangOK, '% Sem Banguela': Math.round(agg.bangOK/agg.reg*100),
        '✓ Banguela 100%': banOK, 'Total Banguela (seg)': agg.bangSeg,
        'Registros Sem Ociosidade': agg.ocioOK, '% Sem Ociosidade': Math.round(agg.ocioOK/agg.reg*100),
        '✓ Ociosidade 100%': ociOK, 'Total Ociosidade (seg)': agg.ocioSeg,
        '✓ Sem Excesso Velocidade': velOK, 'Critérios Cumpridos (de 4)': score,
        'Critérios Falhados': 4 - score, 'Dia Bonificado': score === 4,
        'Bonificação Condução (R$)': score === 4 ? VALOR_CONDUCAO : 0
      });
    });

    const consMap = new Map<string, ConsolidadoMotorista>();
    detalhe.forEach(d => {
      if (!consMap.has(d.Motorista)) {
        consMap.set(d.Motorista, {
          Motorista: d.Motorista, 'Dias com Atividade': 0, 'Dias Bonificados (4/4)': 0,
          'Percentual de Desempenho (%)': 0, 'Total Bonificação (R$)': 0,
          'Falhas Curva Brusca': 0, 'Falhas Banguela': 0, 'Falhas Ociosidade': 0, 'Falhas Exc. Velocidade': 0
        });
      }
      const c = consMap.get(d.Motorista)!;
      c['Dias com Atividade']++;
      if (d['Dia Bonificado']) c['Dias Bonificados (4/4)']++;
      c['Total Bonificação (R$)'] += d['Bonificação Condução (R$)'];
      if (!d['✓ Curva 100%']) c['Falhas Curva Brusca']++;
      if (!d['✓ Banguela 100%']) c['Falhas Banguela']++;
      if (!d['✓ Ociosidade 100%']) c['Falhas Ociosidade']++;
      if (!d['✓ Sem Excesso Velocidade']) c['Falhas Exc. Velocidade']++;
    });

    const finalCons = Array.from(consMap.values()).map(c => ({
      ...c,
      'Total Bonificação (R$)': Number(c['Total Bonificação (R$)'].toFixed(2)),
      'Percentual de Desempenho (%)': Number((c['Dias Bonificados (4/4)']/c['Dias com Atividade']*100).toFixed(2))
    })).sort((a,b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

    const saved = await firebaseStore.saveResult('vfleet', {
      pipelineType: 'vfleet', timestamp: Date.now(), year: targetYear, month: targetMonth,
      data: finalCons,
      detalheConducao: detalhe.slice(0, 500), // LIMITAÇÃO PARA FIRESTORE
      summary: `${finalCons.length} motoristas | ${detalhe.length} dias analisados.`
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
