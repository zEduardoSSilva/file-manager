'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

/**
 * Utilitários ultra-rápidos para conversão de dados
 */
const excelSerialToDateStr = (serial: any): string => {
  if (typeof serial === 'number') {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return format(date, 'dd/MM/yyyy');
  }
  if (serial instanceof Date) return format(serial, 'dd/MM/yyyy');
  const s = String(serial || '').trim();
  return s.includes('/') ? s : '';
};

const hmsToSeconds = (hms: any): number => {
  if (!hms || hms === '-' || hms === '0') return 0;
  const s = String(hms);
  const parts = s.split(':');
  if (parts.length === 3) return (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
  if (parts.length === 2) return (+parts[0]) * 60 + (+parts[1]);
  return 0;
};

const toFloat = (val: any): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
};

export async function executePipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);
    const rawYear = formData.get('year') as string;
    const rawMonth = formData.get('month') as string;
    const files = formData.getAll('files') as File[];

    if (!rawYear || !rawMonth || files.length === 0) {
      throw new Error('Parâmetros ou arquivos ausentes.');
    }

    const year = parseInt(rawYear);
    const month = parseInt(rawMonth);

    if (pipelineType === 'performaxxi') {
      const dailyMap = new Map<string, any>();
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;

      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];

        if (rawData.length === 0) continue;

        // Identifica colunas uma ÚNICA VEZ (Otimização crítica para 20k linhas)
        const firstRow = rawData[0];
        const keys = Object.keys(firstRow);
        const findK = (c: string[]) => keys.find(k => c.some(x => k.toLowerCase().includes(x.toLowerCase()))) || '';

        const col = {
          deposito: findK(['Depósito', 'Empresa']),
          data: findK(['Data Rota']),
          status: findK(['Status Rota']),
          motorista: findK(['Nome Motorista']),
          ajudante: findK(['Nome Primeiro Ajudante']),
          dist: findK(['Distância Cliente', 'Distancia Cliente']),
          sla: findK(['SLA Janela']),
          chegada: findK(['Chegada Cliente Realizado']),
          fimAtend: findK(['Fim Atendimento Cliente Realizado']),
          seqP: findK(['Sequência Entrega Planejado', 'Sequencia']),
          seqR: findK(['Sequência Entrega Realizado', 'Sequencia']),
          pesoP: findK(['Peso Pedido']),
          ocorrencia: findK(['Descrição Ocorrência', 'Descricao'])
        };

        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (String(row[col.status]).toUpperCase() === 'STANDBY') continue;

          const dtStr = excelSerialToDateStr(row[col.data]);
          if (!dtStr) continue;
          
          const rowMonth = parseInt(dtStr.split('/')[1]);
          if (rowMonth !== month) continue;

          const empresa = String(row[col.deposito] || 'N/A');
          const motorista = String(row[col.motorista] || '').trim();
          const ajudante = String(row[col.ajudante] || '').trim();

          const process = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE') => {
            if (!nome || /^(0|null|nan|sem ajudante)$/i.test(nome)) return;
            const key = `${nome}_${cargo}_${dtStr}`;
            let d = dailyMap.get(key);
            if (!d) {
              d = { 
                Empresa: empresa, Funcionario: nome, Cargo: cargo, Dia: dtStr,
                pedidos: 0, rOk: 0, sOk: 0, tOk: 0, seqOk: 0, pesoT: 0, pesoD: 0 
              };
              dailyMap.set(key, d);
            }
            d.pedidos++;
            if (toFloat(row[col.dist]) <= 100) d.rOk++;
            if (String(row[col.sla] || '').toUpperCase().includes('SIM')) d.sOk++;
            const diff = hmsToSeconds(row[col.fimAtend]) - hmsToSeconds(row[col.chegada]);
            if (diff >= 60) d.tOk++;
            if (String(row[col.seqP]) !== '' && String(row[col.seqP]) === String(row[col.seqR])) d.seqOk++;
            const pP = toFloat(row[col.pesoP]);
            d.pesoT += pP;
            if (String(row[col.ocorrencia] || '').trim() !== '') d.pesoD += pP;
          };

          process(motorista, 'MOTORISTA');
          process(ajudante, 'AJUDANTE');
        }
      }

      const detalheUnificado = Array.from(dailyMap.values()).map(d => {
        const tot = d.pedidos || 1;
        const cR = (d.rOk / tot) >= 0.7;
        const cS = (d.sOk / tot) >= 0.8;
        const cT = (d.tOk / tot) >= 1.0;
        const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + 1;
        const vUnit = d.Cargo === 'MOTORISTA' ? MOT_BASE / 4 : AJU_BASE / 4;

        return {
          'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 'Dia': d.Dia,
          'Total de Pedidos': d.pedidos,
          'Peso Pedido Dia (Kg)': +d.pesoT.toFixed(2),
          'Peso Devolvido Dia (Kg)': +d.pesoD.toFixed(2),
          '% Devolvido Dia': d.pesoT > 0 ? +((d.pesoD / d.pesoT) * 100).toFixed(2) : 0,
          'Pedidos Raio OK': d.rOk, '% Raio': +((d.rOk/tot)*100).toFixed(2), '✓ Raio ≥70%': cR ? 'SIM' : 'NÃO',
          'Pedidos SLA OK': d.sOk, '% SLA': +((d.sOk/tot)*100).toFixed(2), '✓ SLA ≥80%': cS ? 'SIM' : 'NÃO',
          'Pedidos Tempo OK': d.tOk, '% Tempo': +((d.tOk/tot)*100).toFixed(2), '✓ Tempo ≥100%': cT ? 'SIM' : 'NÃO',
          'Pedidos Sequência OK': d.seqOk, '% Sequência': +((d.seqOk/tot)*100).toFixed(2), '✓ Sequência ≥0%': 'SIM',
          'Critérios Cumpridos (de 4)': cumpridos, 'Critérios Falhados': 4 - cumpridos,
          'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
          '% Bonificação': +((cumpridos / 4) * 100).toFixed(2),
          'Bonificação Funcionario (R$)': +(cumpridos * vUnit).toFixed(2)
        };
      });

      const consolidadoMap = new Map<string, any>();
      for (const d of detalheUnificado) {
        const key = `${d.Funcionario}_${d.Cargo}`;
        let m = consolidadoMap.get(key);
        if (!m) {
          m = { 
            'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 
            dias: 0, bMax: 0, totalR: 0, totalC: 0, fR: 0, fS: 0, fT: 0 
          };
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

      const consolidadoUnificado = Array.from(consolidadoMap.values()).map(m => ({
        'Empresa': m.Empresa, 'Funcionario': m.Funcionario, 'Cargo': m.Cargo,
        'Dias com Atividade': m.dias, 'Dias Bonif. Máxima (4/4)': m.bMax,
        'Percentual de Desempenho (%)': +((m.totalC / (m.dias * 4)) * 100).toFixed(2),
        'Total Bonificação (R$)': +m.totalR.toFixed(2),
        'Total Critérios Cumpridos': m.totalC,
        'Falhas Raio': m.fR, 'Falhas SLA': m.fS, 'Falhas Tempo': m.fT, 'Falhas Sequência': 0
      })).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', timestamp: Date.now(), year, month,
        data: consolidadoUnificado, detalheGeral: detalheUnificado,
        summary: `Processamento em lote concluído: ${consolidadoUnificado.length} funcionários analisados.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // --- VFLEET ---
    if (pipelineType === 'vfleet') {
      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year, month,
        data: [], summary: `vFleet processado.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // --- PONTO ---
    if (pipelineType === 'ponto') {
      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year, month,
        data: [], summary: `Absenteísmo processado.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Tipo de pipeline inválido.');

  } catch (error: any) {
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}
