'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * PIPELINE Performaxxi — ULTRA PERFORMANCE
 * Otimizado para 20.000+ linhas.
 * Lógica Proporcional: Raio (70%), SLA (80%), Tempo (100%), Sequência (0%)
 */

const VALOR_MOT = 8.00;
const VALOR_AJU = 7.20;
const CRITERIOS = 4;

const MIN_RAIO  = 0.70;
const MIN_SLA   = 0.80;
const MIN_TEMPO = 1.00;
const MIN_SEQ   = 0.00;

const normalize = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function getFastDateInfo(val: any) {
  if (!val) return null;
  let d: Date;
  if (typeof val === 'number') d = new Date(Math.round((val - 25569) * 86400 * 1000));
  else d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return { 
    str: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`, 
    month: d.getMonth()+1, 
    year: d.getFullYear() 
  };
}

function getTs(val: any) {
  if (!val) return null;
  if (typeof val === 'number') return Math.round((val - 25569) * 86400 * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export async function executePerformaxxiPipeline(formData: FormData) {
  try {
    const year  = parseInt(formData.get('year') as string);
    const month = parseInt(formData.get('month') as string);
    const files = formData.getAll('files') as File[];

    const dailyMap = new Map<string, any>();

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
      
      // LER COMO MATRIZ BRUTA (header: 1) É MUITO MAIS RÁPIDO
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
      if (rows.length < 2) continue;

      const headers = rows[0].map(h => normalize(String(h)));
      
      // MAPEIA ÍNDICES UMA ÚNICA VEZ
      const idx = {
        emp: headers.findIndex(h => h.includes('deposito') || h.includes('empresa')),
        dat: headers.findIndex(h => h.includes('data')),
        sta: headers.findIndex(h => h.includes('status')),
        mot: headers.findIndex(h => h.includes('motorista')),
        aj1: headers.findIndex(h => h.includes('primeiro_ajudante')),
        aj2: headers.findIndex(h => h.includes('segundo_ajudante')),
        dis: headers.findIndex(h => h.includes('distancia')),
        sla: headers.findIndex(h => h.includes('sla')),
        che: headers.findIndex(h => h.includes('chegada')),
        fim: headers.findIndex(h => h.includes('fim_atendimento')),
        cli: headers.findIndex(h => h.includes('cliente')),
        sqp: headers.findIndex(h => h.includes('sequencia_entrega_planejado')),
        sqr: headers.findIndex(h => h.includes('sequencia_entrega_realizado'))
      };

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        
        // FILTRAGEM PRECOCE: IGNORA STANDBY
        const status = normalize(String(row[idx.sta] || ''));
        if (status === 'standby') continue;

        const date = getFastDateInfo(row[idx.dat]);
        if (!date || date.month !== month || date.year !== year) continue;

        const emp = String(row[idx.emp] || 'N/A').trim();
        const cli = String(row[idx.cli] || i).trim();
        
        // CRITÉRIOS INDIVIDUAIS
        const dist = parseFloat(String(row[idx.dis] || 0).replace(',','.'));
        const slaVal = normalize(String(row[idx.sla] || ''));
        const slaOk = slaVal.includes('sim') || slaVal.includes('ok');
        
        const tsS = getTs(row[idx.che]);
        const tsE = getTs(row[idx.fim]);
        const timeOk = (tsS && tsE) ? (tsE - tsS) >= 60000 : false;
        
        const seqP = String(row[idx.sqp] || '').trim();
        const seqR = String(row[idx.sqr] || '').trim();
        const seqOk = (seqP && seqR) ? seqP === seqR : false;

        const process = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE') => {
          const n = String(nome || '').trim();
          if (!n || /^(0|null|nan|nao|sem ajudante)$/i.test(n)) return;
          
          const key = `${n}|${cargo}|${date.str}`;
          if (!dailyMap.has(key)) {
            dailyMap.set(key, { emp, n, cargo, dia: date.str, peds: [] });
          }
          dailyMap.get(key).peds.push({ r: dist <= 100, s: slaOk, t: timeOk, seq: seqOk });
        };

        if (idx.mot >= 0) process(row[idx.mot], 'MOTORISTA');
        if (idx.aj1 >= 0) process(row[idx.aj1], 'AJUDANTE');
        if (idx.aj2 >= 0) process(row[idx.aj2], 'AJUDANTE');
      }
    }

    const consolidado: any[] = [];
    const grouped = new Map<string, any>();

    dailyMap.forEach(dia => {
      const peds = dia.peds;
      const tot = peds.length;
      if (tot === 0) return;

      const rOk = peds.filter((p:any) => p.r).length / tot >= MIN_RAIO;
      const sOk = peds.filter((p:any) => p.s).length / tot >= MIN_SLA;
      const tOk = peds.filter((p:any) => p.t).length / tot >= MIN_TEMPO;
      const qOk = peds.filter((p:any) => p.seq).length / tot >= MIN_SEQ;
      
      const cOk = (rOk?1:0) + (sOk?1:0) + (tOk?1:0) + (qOk?1:0);
      
      const vBase = dia.cargo === 'MOTORISTA' ? VALOR_MOT : VALOR_AJU;
      const bonus = Number((cOk / CRITERIOS * vBase).toFixed(2));

      const gKey = `${dia.n}|${dia.cargo}`;
      if (!grouped.has(gKey)) {
        grouped.set(gKey, { 
          'Empresa': dia.emp, 'Funcionario': dia.n, 'Cargo': dia.cargo,
          'Dias com Atividade': 0, 'Dias Bonif. Máxima (4/4)': 0,
          'Total Bonificação (R$)': 0, 'Total Critérios Cumpridos': 0,
          'Percentual de Desempenho (%)': 0, 'Falhas Raio': 0, 'Falhas SLA': 0, 'Falhas Tempo': 0, 'Falhas Sequência': 0
        });
      }
      const g = grouped.get(gKey);
      g['Dias com Atividade']++;
      if (cOk === 4) g['Dias Bonif. Máxima (4/4)']++;
      g['Total Bonificação (R$)'] += bonus;
      g['Total Critérios Cumpridos'] += cOk;
      if (!rOk) g['Falhas Raio']++;
      if (!sOk) g['Falhas SLA']++;
      if (!tOk) g['Falhas Tempo']++;
      if (!qOk) g['Falhas Sequência']++;
    });

    grouped.forEach(g => {
      g['Total Bonificação (R$)'] = Number(g['Total Bonificação (R$)'].toFixed(2));
      const possiveis = g['Dias com Atividade'] * 4;
      g['Percentual de Desempenho (%)'] = Number((g['Total Critérios Cumpridos'] / possiveis * 100).toFixed(2));
      consolidado.push(g);
    });

    const finalResult = consolidado.sort((a,b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);
    
    // SALVA NO FIREBASE E RETORNA
    const saved = await firebaseStore.saveResult('performaxxi', {
      pipelineType: 'performaxxi', 
      timestamp: Date.now(), 
      year, month,
      data: finalResult, 
      summary: `${finalResult.length} funcionários analisados com filtragem STANDBY.`
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    console.error("ERRO PERFORMAXXI:", error);
    return { success: false, error: error.message };
  }
}
