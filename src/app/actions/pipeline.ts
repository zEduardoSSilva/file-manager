
'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * Utilitários ultra-rápidos para processamento de grandes volumes (20k+ linhas)
 */
const fastDateStr = (val: any): { str: string, month: number, year: number } | null => {
  if (!val) return null;
  let d: Date;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    d = new Date(Math.round((val - 25569) * 86400 * 1000));
  } else {
    const s = String(val).trim();
    const p = s.split('/');
    if (p.length === 3) {
      const day = p[0].padStart(2, '0');
      const month = p[1].padStart(2, '0');
      const year = p[2].length === 2 ? `20${p[2]}` : p[2];
      return { str: `${day}/${month}/${year}`, month: parseInt(month), year: parseInt(year) };
    }
    return null;
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const year = d.getFullYear();
  return { str: `${day}/${monthStr}/${year}`, month, year };
};

const fastToFloat = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(s) || 0;
};

export async function executePipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);
    const targetYear = parseInt(formData.get('year') as string);
    const targetMonth = parseInt(formData.get('month') as string);
    const files = formData.getAll('files') as File[];

    if (!targetYear || !targetMonth || files.length === 0) {
      throw new Error('Parâmetros ou arquivos ausentes.');
    }

    if (pipelineType === 'performaxxi') {
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;
      const CRIT_COUNT = 4;

      // Map para agrupar dados diários por funcionário (Nome|Cargo|Dia)
      const dailyMap = new Map<string, any>();
      
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        if (rows.length < 2) continue;

        // Mapeamento dinâmico de cabeçalhos (uma única vez por arquivo)
        const headers = rows[0].map(h => String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").trim());
        const getIdx = (cands: string[]) => headers.findIndex(h => cands.some(c => h.includes(c)));
        
        const col = {
          empresa: getIdx(['deposito', 'empresa', 'nome deposito']),
          data: getIdx(['data rota', 'data']),
          status: getIdx(['status rota', 'status']),
          motorista: getIdx(['nome motorista', 'motorista']),
          ajudante: getIdx(['nome primeiro ajudante', 'ajudante']),
          dist: getIdx(['distancia cliente', 'distancia']),
          sla: getIdx(['sla janela', 'sla']),
          chegada: getIdx(['chegada cliente realizado', 'chegada']),
          fimAtend: getIdx(['fim atendimento cliente realizado', 'fim atendimento']),
          seqP: getIdx(['sequencia entrega planejado', 'seq planejado']),
          seqR: getIdx(['sequencia entrega realizado', 'seq realizado']),
        };

        // Loop linear otimizado
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          
          // FILTRAGEM PRECOCE (STANDBY)
          const status = String(row[col.status] || '').toUpperCase();
          if (status === 'STANDBY') continue;

          // FILTRAGEM DE PERÍODO
          const dateInfo = fastDateStr(row[col.data]);
          if (!dateInfo || dateInfo.month !== targetMonth || dateInfo.year !== targetYear) continue;

          const empresa = String(row[col.empresa] || 'N/A');
          const dist = fastToFloat(row[col.dist]);
          const slaOk = String(row[col.sla] || '').toUpperCase().includes('SIM');
          
          let timeOk = false;
          try {
            const start = new Date(row[col.chegada]).getTime();
            const end = new Date(row[col.fimAtend]).getTime();
            if (end - start >= 60000) timeOk = true; // >= 1 minuto
          } catch (e) {}

          const seqOk = row[col.seqP] !== undefined && String(row[col.seqP]) === String(row[col.seqR]);

          const processRole = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE') => {
            if (!nome || /^(0|null|nan|sem ajudante)$/i.test(nome)) return;
            const key = `${nome}|${cargo}|${dateInfo.str}`;
            
            let d = dailyMap.get(key);
            if (!d) {
              d = { 
                Empresa: empresa, Funcionario: nome, Cargo: cargo, Dia: dateInfo.str,
                pedidos: 0, rOk: 0, sOk: 0, tOk: 0, seqOk: 0
              };
              dailyMap.set(key, d);
            }

            d.pedidos++;
            if (dist <= 100) d.rOk++;
            if (slaOk) d.sOk++;
            if (timeOk) d.tOk++;
            if (seqOk) d.seqOk++;
          };

          processRole(String(row[col.motorista] || '').trim(), 'MOTORISTA');
          processRole(String(row[col.ajudante] || '').trim(), 'AJUDANTE');
        }
      }

      // Consolidação final por funcionário
      const consolidadoMap = new Map<string, any>();
      for (const d of dailyMap.values()) {
        const cR = (d.rOk / d.pedidos) >= 0.7; // Meta Raio 70%
        const cS = (d.sOk / d.pedidos) >= 0.8; // Meta SLA 80%
        const cT = (d.tOk / d.pedidos) >= 1.0; // Meta Tempo 100%
        const cSeq = d.seqOk === d.pedidos;    // Sequência total
        
        const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + (cSeq ? 1 : 0);
        const unit = d.Cargo === 'MOTORISTA' ? (MOT_BASE / CRIT_COUNT) : (AJU_BASE / CRIT_COUNT);
        const bonusDia = Number((cumpridos * unit).toFixed(2));

        const key = `${d.Funcionario}|${d.Cargo}`;
        let m = consolidadoMap.get(key);
        if (!m) {
          m = { 
            'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 
            'Dias com Atividade': 0, 'Dias Bonif. Máxima (4/4)': 0, 
            'Total Bonificação (R$)': 0, 'Total Critérios Cumpridos': 0, 
            'Falhas Raio': 0, 'Falhas SLA': 0, 'Falhas Tempo': 0, 'Falhas Sequência': 0 
          };
          consolidadoMap.set(key, m);
        }
        
        m['Dias com Atividade']++;
        if (cumpridos === CRIT_COUNT) m['Dias Bonif. Máxima (4/4)']++;
        m['Total Bonificação (R$)'] += bonusDia;
        m['Total Critérios Cumpridos'] += cumpridos;
        if (!cR) m['Falhas Raio']++;
        if (!cS) m['Falhas SLA']++;
        if (!cT) m['Falhas Tempo']++;
        if (!cSeq) m['Falhas Sequência']++;
      }

      const consolidado = Array.from(consolidadoMap.values()).map(m => {
        const possiveis = m['Dias com Atividade'] * CRIT_COUNT;
        return {
          ...m,
          'Total Bonificação (R$)': Number(m['Total Bonificação (R$)'].toFixed(2)),
          'Percentual de Desempenho (%)': Number(((m['Total Critérios Cumpridos'] / possiveis) * 100).toFixed(2))
        };
      }).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', timestamp: Date.now(), year: targetYear, month: targetMonth,
        data: consolidado, summary: `Processamento de ${consolidado.length} funcionários concluído com filtragem STANDBY e performance ultra-rápida.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // Fallback para outros tipos
    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error("Erro no Pipeline:", error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}
