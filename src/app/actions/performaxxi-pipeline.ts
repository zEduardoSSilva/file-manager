'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Performaxxi — ULTRA PERFORMANCE
 * Otimizado para 20.000+ linhas com filtragem precoce (STANDBY).
 * ═══════════════════════════════════════════════════════════════════════════
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
  return { str: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`, month: d.getMonth()+1, year: d.getFullYear() };
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
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as any[][];
      if (rows.length < 2) continue;

      const headers = rows[0].map(h => normalize(h));
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
        cli: headers.findIndex(h => h.includes('cliente'))
      };

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (normalize(row[idx.sta]) === 'standby') continue;

        const date = getFastDateInfo(row[idx.dat]);
        if (!date || date.month !== month || date.year !== year) continue;

        const emp = String(row[idx.emp] || 'N/A').trim();
        const cli = String(row[idx.cli] || i).trim();
        const dist = parseFloat(String(row[idx.dis] || 0).replace(',','.'));
        const slaOk = normalize(row[idx.sla]).includes('sim') || normalize(row[idx.sla]).includes('ok');
        const tsS = getTs(row[idx.che]);
        const tsE = getTs(row[idx.fim]);
        const timeOk = (tsS && tsE) ? (tsE - tsS) >= 60000 : false;

        const process = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE') => {
          const n = String(nome || '').trim();
          if (!n || /^(0|null|nan|nao|sem ajudante)$/i.test(n)) return;
          const key = `${n}|${cargo}|${date.str}`;
          if (!dailyMap.has(key)) dailyMap.set(key, { emp, n, cargo, dia: date.str, peds: new Map() });
          const p = dailyMap.get(key).peds;
          if (!p.has(cli)) p.set(cli, { r: dist <= 100, s: slaOk, t: timeOk, seq: true });
        };

        if (idx.mot >= 0) process(row[idx.mot], 'MOTORISTA');
        if (idx.aj1 >= 0) process(row[idx.aj1], 'AJUDANTE');
        if (idx.aj2 >= 0) process(row[idx.aj2], 'AJUDANTE');
      }
    }

    const consolidado: any[] = [];
    const grouped = new Map<string, any>();

    dailyMap.forEach(dia => {
      const peds = Array.from(dia.peds.values() as any[]);
      const tot = peds.length;
      const rOk = peds.filter(p => p.r).length / tot >= MIN_RAIO;
      const sOk = peds.filter(p => p.s).length / tot >= MIN_SLA;
      const tOk = peds.filter(p => p.t).length / tot >= MIN_TEMPO;
      const cOk = (rOk?1:0) + (sOk?1:0) + (tOk?1:0) + 1; // seq sempre ok
      
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
    });

    grouped.forEach(g => {
      g['Total Bonificação (R$)'] = Number(g['Total Bonificação (R$)'].toFixed(2));
      g['Percentual de Desempenho (%)'] = Number((g['Total Critérios Cumpridos'] / (g['Dias com Atividade'] * 4) * 100).toFixed(2));
      consolidado.push(g);
    });

    const finalResult = consolidado.sort((a,b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);
    const saved = await firebaseStore.saveResult('performaxxi', {
      pipelineType: 'performaxxi', timestamp: Date.now(), year, month,
      data: finalResult, summary: `${finalResult.length} funcionários analisados.`
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}