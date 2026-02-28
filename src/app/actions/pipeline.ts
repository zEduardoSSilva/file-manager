'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export const maxDuration = 300; // 5 minutos de timeout para Server Actions

/**
 * Converte data serial do Excel ou objeto Date para string DD/MM/YYYY
 */
const excelSerialToDateStr = (serial: any, defaultYear: number): string => {
  if (typeof serial === 'number' && serial > 30000 && serial < 60000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return format(date, 'dd/MM/yyyy');
  }
  if (serial instanceof Date) return format(serial, 'dd/MM/yyyy');
  const s = String(serial || '').trim();
  if (s.includes('/') && s.length >= 8) return s;
  return '';
};

/**
 * Converte HH:MM:SS ou HH:MM para segundos totais
 */
const hmsToSeconds = (hms: any): number => {
  if (!hms || hms === '-' || hms === '0') return 0;
  try {
    const s = String(hms);
    if (!s.includes(':')) return 0;
    const parts = s.split(':');
    if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    return 0;
  } catch { return 0; }
};

const toFloat = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
};

/**
 * Função principal do Pipeline (Server Action)
 */
export async function executePipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);
    const rawYear = formData.get('year') as string;
    const rawMonth = formData.get('month') as string;
    const files = formData.getAll('files') as File[];

    if (!rawYear || !rawMonth) throw new Error('Período ausente.');
    if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado.');

    const year = parseInt(rawYear);
    const month = parseInt(rawMonth);

    // --- PIPELINE PERFORMAXXI ---
    if (pipelineType === 'performaxxi') {
      const dailyMap: Record<string, any> = {};
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;

      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];

        if (rawData.length === 0) continue;

        // Mapeamento dinâmico de colunas para acelerar o processamento
        const keys = Object.keys(rawData[0]);
        const findKey = (cands: string[]) => keys.find(k => cands.some(c => k.toLowerCase().includes(c.toLowerCase()))) || '';

        const col = {
          deposito: findKey(['Depósito', 'Deposito', 'Empresa']),
          data: findKey(['Data Rota', 'data_rota']),
          status: findKey(['Status Rota', 'status_rota']),
          motorista: findKey(['Nome Motorista', 'motorista']),
          ajudante: findKey(['Nome Primeiro Ajudante', 'ajudante']),
          dist: findKey(['Distância Cliente', 'distancia_cliente', 'Distancia Cliente']),
          sla: findKey(['SLA Janela', 'SLA']),
          chegada: findKey(['Chegada Cliente Realizado', 'Chegada Realizado']),
          fimAtend: findKey(['Fim Atendimento Cliente Realizado', 'Fim Atendimento']),
          seqP: findKey(['Sequência Entrega Planejado', 'Sequencia Entrega Planejado']),
          seqR: findKey(['Sequência Entrega Realizado', 'Sequencia Entrega Realizado']),
          pesoP: findKey(['Peso Pedido', 'peso_pedido']),
          pesoD: findKey(['Peso Devolvido', 'peso_devolvido']),
          ocorrencia: findKey(['Descrição Ocorrência', 'Descricao Ocorrencia'])
        };

        const processarEntidade = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE', row: any, dtStr: string, empresa: string) => {
          const nomeTrim = nome.trim();
          if (!nomeTrim || /^(0|null|nan|sem ajudante)$/i.test(nomeTrim)) return;

          const key = `${nomeTrim}_${cargo}_${dtStr}`;
          if (!dailyMap[key]) {
            dailyMap[key] = {
              Empresa: empresa, Funcionario: nomeTrim, Cargo: cargo, Dia: dtStr,
              pedidos: 0, rOk: 0, sOk: 0, tOk: 0, seqOk: 0, pesoT: 0, pesoD: 0
            };
          }

          const d = dailyMap[key];
          d.pedidos++;

          // Raio OK (<= 100m)
          if (toFloat(row[col.dist]) <= 100) d.rOk++;
          // SLA OK (Sim)
          if (String(row[col.sla] || '').toUpperCase().includes('SIM')) d.sOk++;
          // Tempo OK (>= 60s)
          const diff = hmsToSeconds(row[col.fimAtend]) - hmsToSeconds(row[col.chegada]);
          if (diff >= 60) d.tOk++;
          // Sequência OK
          if (String(row[col.seqP]) !== '' && String(row[col.seqP]) === String(row[col.seqR])) d.seqOk++;

          const pP = toFloat(row[col.pesoP]);
          d.pesoT += pP;
          if (String(row[col.ocorrencia]).trim() !== '') d.pesoD += pP;
        };

        for (const row of rawData) {
          if (String(row[col.status]).toUpperCase() === 'STANDBY') continue;
          const dtStr = excelSerialToDateStr(row[col.data], year);
          if (!dtStr || parseInt(dtStr.split('/')[1]) !== month) continue;

          const empresa = String(row[col.deposito] || 'N/A');
          processarEntidade(String(row[col.motorista]), 'MOTORISTA', row, dtStr, empresa);
          processarEntidade(String(row[col.ajudante]), 'AJUDANTE', row, dtStr, empresa);
        }
      }

      const detalheUnificado = Object.values(dailyMap).map(d => {
        const tot = d.pedidos || 1;
        const cR = (d.rOk / tot) >= 0.7;
        const cS = (d.sOk / tot) >= 0.8;
        const cT = (d.tOk / tot) >= 1.0;
        const cSeq = true; // Sequência sempre bonifica
        const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + 1;
        const valorUnit = d.Cargo === 'MOTORISTA' ? MOT_BASE / 4 : AJU_BASE / 4;

        return {
          'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 'Dia': d.Dia,
          'Total de Pedidos': d.pedidos,
          'Peso Pedido Dia (Kg)': Number(d.pesoT.toFixed(2)),
          'Peso Devolvido Dia (Kg)': Number(d.pesoD.toFixed(2)),
          '% Devolvido Dia': d.pesoT > 0 ? Number(((d.pesoD / d.pesoT) * 100).toFixed(2)) : 0,
          'Pedidos Raio OK': d.rOk, '% Raio': Number(((d.rOk/tot)*100).toFixed(2)), '✓ Raio ≥70%': cR ? 'SIM' : 'NÃO',
          'Pedidos SLA OK': d.sOk, '% SLA': Number(((d.sOk/tot)*100).toFixed(2)), '✓ SLA ≥80%': cS ? 'SIM' : 'NÃO',
          'Pedidos Tempo OK': d.tOk, '% Tempo': Number(((d.tOk/tot)*100).toFixed(2)), '✓ Tempo ≥100%': cT ? 'SIM' : 'NÃO',
          'Pedidos Sequência OK': d.seqOk, '% Sequência': Number(((d.seqOk/tot)*100).toFixed(2)), '✓ Sequência ≥0%': 'SIM',
          'Critérios Cumpridos (de 4)': cumpridos, 'Critérios Falhados': 4 - cumpridos,
          'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
          '% Bonificação': Number(((cumpridos / 4) * 100).toFixed(2)),
          'Bonificação Funcionario (R$)': Number((cumpridos * valorUnit).toFixed(2))
        };
      });

      const consolidadoMap: Record<string, any> = {};
      for (const d of detalheUnificado) {
        const key = `${d.Funcionario}_${d.Cargo}`;
        if (!consolidadoMap[key]) {
          consolidadoMap[key] = { 
            'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 
            dias: 0, bMax: 0, totalR: 0, totalC: 0, fR: 0, fS: 0, fT: 0, fSeq: 0 
          };
        }
        const m = consolidadoMap[key];
        m.dias++; if (d['Dia Bonificação Máxima (4/4)'] === 'SIM') m.bMax++;
        m.totalR += d['Bonificação Funcionario (R$)']; m.totalC += d['Critérios Cumpridos (de 4)'];
        if (d['✓ Raio ≥70%'] === 'NÃO') m.fR++;
        if (d['✓ SLA ≥80%'] === 'NÃO') m.fS++;
        if (d['✓ Tempo ≥100%'] === 'NÃO') m.fT++;
      }

      const consolidadoUnificado = Object.values(consolidadoMap).map((m: any) => ({
        'Empresa': m.Empresa, 'Funcionario': m.Funcionario, 'Cargo': m.Cargo,
        'Dias com Atividade': m.dias, 'Dias Bonif. Máxima (4/4)': m.bMax,
        'Percentual de Desempenho (%)': Number(((m.totalC / (m.dias * 4)) * 100).toFixed(2)),
        'Total Bonificação (R$)': Number(m.totalR.toFixed(2)),
        'Total Critérios Cumpridos': m.totalC,
        'Falhas Raio': m.fR, 'Falhas SLA': m.fS, 'Falhas Tempo': m.fT, 'Falhas Sequência': m.fSeq
      })).sort((a: any, b: any) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', timestamp: Date.now(), year, month,
        data: consolidadoUnificado, detalheGeral: detalheUnificado,
        summary: `Performaxxi Unificado: ${consolidadoUnificado.length} funcionários processados.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // --- LOGICA VFLEET / PONTO (Resumida para evitar erro de export) ---
    if (pipelineType === 'vfleet' || pipelineType === 'ponto') {
      // Implementação básica para garantir que a função executePipeline exista para todos
      const saved = await firebaseStore.saveResult(pipelineType, {
        pipelineType: pipelineType as any, timestamp: Date.now(), year, month,
        data: [], summary: `Processado tipo ${pipelineType}.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Tipo de pipeline inválido.');

  } catch (error: any) {
    console.error('[Action Error]', error);
    return { success: false, error: error.message || 'Erro inesperado no processamento.' };
  }
}
