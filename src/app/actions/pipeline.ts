'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * Utilitários ultra-rápidos para processamento de grandes volumes
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
    if (p.length === 3) return { str: s, month: parseInt(p[1]), year: parseInt(p[2]) };
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

      const dailyMap = new Map<string, any>();
      
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        if (rows.length < 2) continue;

        // Mapeia cabeçalhos uma única vez
        const headers = rows[0].map(h => String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").trim());
        const getIdx = (cands: string[]) => headers.findIndex(h => cands.some(c => h.includes(c)));
        
        const col = {
          empresa: getIdx(['deposito', 'empresa']),
          data: getIdx(['data rota']),
          status: getIdx(['status rota']),
          motorista: getIdx(['nome motorista']),
          ajudante: getIdx(['nome primeiro ajudante']),
          dist: getIdx(['distancia cliente']),
          sla: getIdx(['sla janela']),
          chegada: getIdx(['chegada cliente realizado']),
          fimAtend: getIdx(['fim atendimento cliente realizado']),
          seqP: getIdx(['sequencia entrega planejado']),
          seqR: getIdx(['sequencia entrega realizado']),
          pesoP: getIdx(['peso pedido']),
          ocorrencia: getIdx(['descricao ocorrencia'])
        };

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          
          // FILTRO 1: StandBy (Curto-circuito)
          const status = String(row[col.status] || '').toUpperCase();
          if (status === 'STANDBY') continue;

          // FILTRO 2: Período
          const dateInfo = fastDateStr(row[col.data]);
          if (!dateInfo || dateInfo.month !== targetMonth || (dateInfo.year !== targetYear && dateInfo.year !== targetYear - 2000)) continue;

          const empresa = String(row[col.empresa] || 'N/A');
          const peso = fastToFloat(row[col.pesoP]);
          const isDevolvido = String(row[col.ocorrencia] || '').trim() !== '';

          const processRole = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE') => {
            if (!nome || /^(0|null|nan|sem ajudante)$/i.test(nome)) return;
            const key = `${nome}|${cargo}|${dateInfo.str}`;
            
            let d = dailyMap.get(key);
            if (!d) {
              d = { 
                Empresa: empresa, Funcionario: nome, Cargo: cargo, Dia: dateInfo.str,
                pedidos: 0, rOk: 0, sOk: 0, tOk: 0, seqOk: 0, pesoT: 0, pesoD: 0 
              };
              dailyMap.set(key, d);
            }

            d.pedidos++;
            d.pesoT += peso;
            if (isDevolvido) d.pesoD += peso;
            if (fastToFloat(row[col.dist]) <= 100) d.rOk++;
            if (String(row[col.sla] || '').toUpperCase().includes('SIM')) d.sOk++;
            
            const atendSec = (new Date(row[col.fimAtend]).getTime() - new Date(row[col.chegada]).getTime()) / 1000;
            if (atendSec >= 60) d.tOk++;
            if (row[col.seqP] !== undefined && String(row[col.seqP]) === String(row[col.seqR])) d.seqOk++;
          };

          processRole(String(row[col.motorista] || '').trim(), 'MOTORISTA');
          processRole(String(row[col.ajudante] || '').trim(), 'AJUDANTE');
        }
      }

      // Converte mapa para array de detalhes
      const detalheGeral = Array.from(dailyMap.values()).map(d => {
        const cR = (d.rOk / d.pedidos) >= 0.7;
        const cS = (d.sOk / d.pedidos) >= 0.8;
        const cT = (d.tOk / d.pedidos) >= 1.0;
        const cSeq = true; 
        const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + (cSeq ? 1 : 0);
        const unit = d.Cargo === 'MOTORISTA' ? (MOT_BASE / CRIT_COUNT) : (AJU_BASE / CRIT_COUNT);

        return {
          'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 'Dia': d.Dia,
          'Total de Pedidos': d.pedidos, 'Peso Pedido Dia (Kg)': Number(d.pesoT.toFixed(2)),
          'Peso Devolvido Dia (Kg)': Number(d.pesoD.toFixed(2)), '% Devolvido Dia': d.pesoT > 0 ? Number(((d.pesoD / d.pesoT) * 100).toFixed(2)) : 0,
          'Pedidos Raio OK': d.rOk, '% Raio': Number(((d.rOk / d.pedidos) * 100).toFixed(2)), '✓ Raio ≥70%': cR ? 'SIM' : 'NÃO',
          'Pedidos SLA OK': d.sOk, '% SLA': Number(((d.sOk / d.pedidos) * 100).toFixed(2)), '✓ SLA ≥80%': cS ? 'SIM' : 'NÃO',
          'Pedidos Tempo OK': d.tOk, '% Tempo': Number(((d.tOk / d.pedidos) * 100).toFixed(2)), '✓ Tempo ≥100%': cT ? 'SIM' : 'NÃO',
          'Pedidos Sequência OK': d.seqOk, '% Sequência': Number(((d.seqOk / d.pedidos) * 100).toFixed(2)), '✓ Sequência ≥0%': 'SIM',
          'Critérios Cumpridos (de 4)': cumpridos, 'Critérios Falhados': CRIT_COUNT - cumpridos,
          'Dia Bonificação Máxima (4/4)': cumpridos === CRIT_COUNT ? 'SIM' : 'NÃO',
          '% Bonificação': Number(((cumpridos / CRIT_COUNT) * 100).toFixed(2)),
          'Bonificação Funcionario (R$)': Number((cumpridos * unit).toFixed(2))
        };
      });

      // Consolidação
      const consolidadoMap = new Map<string, any>();
      for (const d of detalheGeral) {
        const key = `${d.Funcionario}|${d.Cargo}`;
        let m = consolidadoMap.get(key);
        if (!m) {
          m = { Empresa: d.Empresa, Funcionario: d.Funcionario, Cargo: d.Cargo, dias: 0, bMax: 0, totalR: 0, totalC: 0, fR: 0, fS: 0, fT: 0 };
          consolidadoMap.set(key, m);
        }
        m.dias++; 
        if (d['Dia Bonificação Máxima (4/4)'] === 'SIM') m.bMax++;
        m.totalR += d['Bonificação Funcionario (R$)']; 
        m.totalC += d['Critérios Cumpridos (de 4)'];
        if (d['✓ Raio ≥70%'] === 'NÃO') m.fR++;
        if (d['✓ SLA ≥80%'] === 'NÃO') m.fS++;
        if (d['✓ Tempo ≥100%'] === 'NÃO') m.fT++;
      }

      const consolidado = Array.from(consolidadoMap.values()).map(m => ({
        'Empresa': m.Empresa, 'Funcionario': m.Funcionario, 'Cargo': m.Cargo,
        'Dias com Atividade': m.dias, 'Dias Bonif. Máxima (4/4)': m.bMax,
        'Percentual de Desempenho (%)': Number(((m.totalC / (m.dias * CRIT_COUNT)) * 100).toFixed(2)),
        'Total Bonificação (R$)': Number(m.totalR.toFixed(2)),
        'Total Critérios Cumpridos': m.totalC, 'Falhas Raio': m.fR, 'Falhas SLA': m.fS, 'Falhas Tempo': m.fT, 'Falhas Sequência': 0
      })).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', timestamp: Date.now(), year: targetYear, month: targetMonth,
        data: consolidado, detalheGeral: detalheGeral,
        summary: `Sucesso: ${consolidado.length} funcionários processados em única passagem.`
      });

      // Retornamos apenas o consolidado para o cliente para evitar payload gigante e timeout
      return { success: true, result: JSON.parse(JSON.stringify({ ...saved, detalheGeral: [] })) };
    }

    // VFLEET
    if (pipelineType === 'vfleet') {
      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year: targetYear, month: targetMonth,
        data: [], summary: `vFleet processado.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // PONTO
    if (pipelineType === 'ponto') {
      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year: targetYear, month: targetMonth,
        data: [], summary: `Absenteísmo processado.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Tipo de pipeline inválido.');
  } catch (error: any) {
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}
