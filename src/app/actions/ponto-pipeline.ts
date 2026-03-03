'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * PIPELINE Ponto — ULTRA PERFORMANCE
 * Otimizado para 20.000+ linhas e limitação de payload Firestore.
 */

const MOT_VALOR_MARCACOES = 1.60;
const MOT_VALOR_CRITERIOS = 1.60;
const AJU_VALOR_MARCACOES = 2.40;
const AJU_VALOR_CRITERIOS = 2.40;

function toMin(h: string): number | null {
  if (!h || !h.includes(':')) return null;
  const [hrs, min] = h.replace('*', '').split(':').map(Number);
  return hrs * 60 + min;
}

function fromMin(m: number | null): string {
  if (m === null) return '';
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

export async function executePontoPipeline(formData: FormData) {
  try {
    const year  = parseInt(formData.get('year')  as string);
    const month = parseInt(formData.get('month') as string);
    const files = formData.getAll('files') as File[];

    const allRecords: any[] = [];

    for (const f of files) {
      const text = await f.text();
      const lines = text.split(/\r?\n/);
      let curId = '', curNome = '', curCargo = f.name.toLowerCase().includes('motorista') ? 'Motorista' : 'Ajudante';

      lines.forEach(l => {
        const c = l.split(';').map(x => x.trim());
        if (/^\d{2,}$/.test(c[0]) && c[1] && !c[0].includes('/')) {
          curId = c[0]; curNome = c[1];
        } else if (c[0]?.includes('/') && curId) {
          const dtParts = c[0].split('/');
          if (parseInt(dtParts[1]) === month && (dtParts[2]?.includes(year.toString()) || dtParts.length === 2)) {
            const mks = (c[2] || '').split(/\s+/).filter(t => t.includes(':'));
            allRecords.push({
              id: curId, nome: curNome, cargo: curCargo, data: c[0],
              e: mks[0]||'', sa: mks[1]||'', ra: mks[2]||'', s: mks[3]||'',
              mks: mks.length, score: mks.length
            });
          }
        }
      });
    }

    const dedup = new Map<string, any>();
    allRecords.forEach(r => {
      const k = `${r.id}|${r.data}`;
      if (!dedup.has(k) || r.score > dedup.get(k).score) dedup.set(k, r);
    });

    const detalhe: any[] = [];
    const colabs = new Map<string, any>();

    dedup.forEach(r => {
      const vMks = r.cargo === 'Motorista' ? MOT_VALOR_MARCACOES : AJU_VALOR_MARCACOES;
      const vCri = r.cargo === 'Motorista' ? MOT_VALOR_CRITERIOS : AJU_VALOR_CRITERIOS;
      
      const mkOk = r.mks === 4;
      const bMk = mkOk ? vMks : 0;
      
      // Simplificação de critérios para performance
      const e = toMin(r.e), sa = toMin(r.sa), ra = toMin(r.ra), s = toMin(r.s);
      let criOk = false;
      if (e!==null && s!==null) {
        const total = s < e ? (s+1440)-e : s-e;
        const alm = (sa!==null && ra!==null) ? (ra < sa ? (ra+1440)-sa : ra-sa) : 0;
        const trab = total - alm;
        criOk = trab <= 560 && alm >= 60;
      }
      
      const bCri = criOk ? vCri : 0;
      const totalDia = Number((bMk + bCri).toFixed(2));

      detalhe.push({
        Colaborador: r.nome, Cargo: r.cargo, Dia: r.data, 
        '💰 Bonus Marcações': bMk, '💰 Bonus Critérios': bCri, '💵 Total Dia': totalDia
      });

      const ck = `${r.id}|${r.cargo}`;
      if (!colabs.has(ck)) {
        colabs.set(ck, { 
          ID: r.id, Colaborador: r.nome, Cargo: r.cargo, 
          'Dias': 0, 'Total': 0, 'Mks4': 0, 'CriOK': 0 
        });
      }
      const c = colabs.get(ck);
      c.Dias++; c.Total += totalDia;
      if (mkOk) c.Mks4++;
      if (criOk) c.CriOK++;
    });

    const consolidado = Array.from(colabs.values()).map(c => ({
      ID: c.ID, Colaborador: c.Colaborador, Cargo: c.Cargo,
      'Dias Trabalhados': c.Dias, '💵 BONIFICAÇÃO TOTAL': Number(c.Total.toFixed(2)),
      'Dias 4 Mks': c.Mks4, 'Dias Critérios OK': c.CriOK
    })).sort((a,b) => b['💵 BONIFICAÇÃO TOTAL'] - a['💵 BONIFICAÇÃO TOTAL']);

    const saved = await firebaseStore.saveResult('ponto', {
      pipelineType: 'ponto', timestamp: Date.now(), year, month,
      data: consolidado,
      detalhePonto: detalhe.slice(0, 500), // LIMITAÇÃO FIRESTORE
      summary: `${consolidado.length} colaboradores processados.`
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
