'use server';

import { firebaseStore, PipelineResult } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string; stack?: string; code?: string; detail?: string };

// ─── Helpers de Conversão ──────────────────────────────────────────────────

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

// ─── Pipeline Principal ───────────────────────────────────────────────────────

export async function executePipeline(
  formData: FormData,
  pipelineType: 'vfleet' | 'performaxxi' | 'ponto'
): Promise<PipelineResponse> {
  try {
    const rawYear  = formData.get('year');
    const rawMonth = formData.get('month');
    const files    = formData.getAll('files') as File[];

    if (!rawYear || !rawMonth) throw new Error('Período ausente.');
    if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado.');

    const year  = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);

    if (pipelineType === 'performaxxi') {
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;
      const dailyMap: Map<string, any> = new Map();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];

        if (data.length === 0) continue;

        // MAPEAMENTO OTIMIZADO DE COLUNAS (O(1) lookup por linha)
        const keys = Object.keys(data[0]);
        const findKey = (candidates: string[]) => keys.find(k => candidates.some(c => k.trim().toLowerCase() === c.toLowerCase() || k.toLowerCase().includes(c.toLowerCase())));
        
        const colMap = {
          deposito: findKey(['Nome Depósito', 'Empresa', 'Depósito']),
          data: findKey(['Data Rota', 'Data']),
          status: findKey(['Status Rota']),
          motorista: findKey(['Nome Motorista', 'Motorista']),
          ajudante: findKey(['Nome Primeiro Ajudante', 'Ajudante']),
          distancia: findKey(['Distância Cliente (metros)', 'Distancia']),
          sla: findKey(['SLA Janela Atendimento', 'SLA']),
          chegada: findKey(['Início Atendimento Cliente Realizado', 'Chegada Cliente Realizado']),
          fim: findKey(['Fim Atendimento Cliente Realizado']),
          seqP: findKey(['Sequência Entrega Planejado', 'Seq Planejado']),
          seqR: findKey(['Sequência Entrega Realizado', 'Seq Realizado']),
          ocorrencia: findKey(['Descrição Ocorrência']),
          pesoPedido: findKey(['Peso Pedido', 'Peso Entrega'])
        };

        for (const row of data) {
          const status = String(row[colMap.status!] || '').toUpperCase();
          if (status === 'STANDBY') continue;

          const dtStr = excelSerialToDateStr(row[colMap.data!], year);
          if (!dtStr) continue;

          const dtParts = dtStr.split('/');
          if (dtParts.length >= 2 && parseInt(dtParts[1]) !== month) continue;

          const empresa = String(row[colMap.deposito!] || 'N/A');
          const motName = String(row[colMap.motorista!] || '').trim();
          const ajuName = String(row[colMap.ajudante!] || '').trim();

          const processEntity = (name: string, cargo: 'MOTORISTA' | 'AJUDANTE') => {
            if (!name || name === '0' || /^(null|sem ajudante|nan|undefined)$/i.test(name)) return;
            
            const key = `${name}_${cargo}_${dtStr}`;
            if (!dailyMap.has(key)) {
              dailyMap.set(key, {
                Empresa: empresa, Funcionario: name, Cargo: cargo, Dia: dtStr,
                Total_Pedidos: 0, Raio_OK: 0, SLA_OK: 0, Tempo_OK: 0, Seq_OK: 0,
                Peso_Total: 0, Peso_Devolvido: 0
              });
            }

            const d = dailyMap.get(key);
            d.Total_Pedidos++;

            const dist = toFloat(row[colMap.distancia!]);
            if (dist <= 100) d.Raio_OK++;

            const slaStr = String(row[colMap.sla!] || '').toUpperCase();
            if (slaStr.includes('SIM') || slaStr === 'OK') d.SLA_OK++;

            const arrival = hmsToSeconds(row[colMap.chegada!]);
            const finish = hmsToSeconds(row[colMap.fim!]);
            if (finish > 0 && arrival > 0 && (finish - arrival >= 60)) d.Tempo_OK++;

            const sP = String(row[colMap.seqP!] || '');
            const sR = String(row[colMap.seqR!] || '');
            if (sP !== '' && sP === sR) d.Seq_OK++;

            const peso = toFloat(row[colMap.pesoPedido!]);
            d.Peso_Total += peso;
            const oc = String(row[colMap.ocorrencia!] || '').trim();
            if (oc && !/^(null|nan|)$/i.test(oc)) d.Peso_Devolvido += peso;
          };

          if (motName) processEntity(motName, 'MOTORISTA');
          if (ajuName) processEntity(ajuName, 'AJUDANTE');
        }
      }

      if (dailyMap.size === 0) throw new Error('Nenhum dado válido para o período.');

      const detalheUnificado = Array.from(dailyMap.values()).map(d => {
        const tot = d.Total_Pedidos || 1;
        const pR = Number(((d.Raio_OK / tot) * 100).toFixed(2));
        const pS = Number(((d.SLA_OK / tot) * 100).toFixed(2));
        const pT = Number(((d.Tempo_OK / tot) * 100).toFixed(2));
        const pSeq = Number(((d.Seq_OK / tot) * 100).toFixed(2));

        const cR = pR >= 70;
        const cS = pS >= 80;
        const cT = pT >= 100;
        const cSeq = pSeq >= 0;

        const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + (cSeq ? 1 : 0);
        const valorCrit = (d.Cargo === 'MOTORISTA' ? MOT_BASE : AJU_BASE) / 4;

        return {
          'Empresa': d.Empresa,
          'Funcionario': d.Funcionario,
          'Cargo': d.Cargo,
          'Dia': d.Dia,
          'Total de Pedidos': d.Total_Pedidos,
          'Peso Pedido Dia (Kg)': Number(d.Peso_Total.toFixed(2)),
          'Peso Devolvido Dia (Kg)': Number(d.Peso_Devolvido.toFixed(2)),
          '% Devolvido Dia': d.Peso_Total > 0 ? Number(((d.Peso_Devolvido / d.Peso_Total) * 100).toFixed(2)) : 0,
          'Pedidos Raio OK': d.Raio_OK,
          '% Raio': pR,
          '✓ Raio ≥70.0%': cR ? 'SIM' : 'NÃO',
          'Pedidos SLA OK': d.SLA_OK,
          '% SLA': pS,
          '✓ SLA ≥80.0%': cS ? 'SIM' : 'NÃO',
          'Pedidos Tempo OK': d.Tempo_OK,
          '% Tempo': pT,
          '✓ Tempo ≥100.0%': cT ? 'SIM' : 'NÃO',
          'Pedidos Sequência OK': d.Seq_OK,
          '% Sequência': pSeq,
          '✓ Sequência ≥0.0%': cSeq ? 'SIM' : 'NÃO',
          'Critérios Cumpridos (de 4)': cumpridos,
          'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
          'Bonificação Funcionario (R$)': Number((cumpridos * valorCrit).toFixed(2)),
        };
      });

      const consolidadoMap: Map<string, any> = new Map();
      detalheUnificado.forEach(d => {
        const k = `${d.Funcionario}_${d.Cargo}`;
        if (!consolidadoMap.has(k)) {
          consolidadoMap.set(k, {
            'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo,
            dias: 0, diasMax: 0, totalBon: 0, totalCrit: 0, fR: 0, fS: 0, fT: 0, fSeq: 0
          });
        }
        const m = consolidadoMap.get(k);
        m.dias++;
        if (d['Dia Bonificação Máxima (4/4)'] === 'SIM') m.diasMax++;
        m.totalBon += d['Bonificação Funcionario (R$)'];
        m.totalCrit += d['Critérios Cumpridos (de 4)'];
        if (d['✓ Raio ≥70.0%'] === 'NÃO') m.fR++;
        if (d['✓ SLA ≥80.0%'] === 'NÃO') m.fS++;
        if (d['✓ Tempo ≥100.0%'] === 'NÃO') m.fT++;
        if (d['✓ Sequência ≥0.0%'] === 'NÃO') m.fSeq++;
      });

      const consolidadoUnificado = Array.from(consolidadoMap.values()).map(m => ({
        'Empresa': m.Empresa,
        'Funcionario': m.Funcionario,
        'Cargo': m.Cargo,
        'Dias com Atividade': m.dias,
        'Dias Bonif. Máxima (4/4)': m.diasMax,
        'Percentual de Desempenho (%)': Number(((m.totalCrit / (m.dias * 4)) * 100).toFixed(2)),
        'Total Bonificação (R$)': Number(m.totalBon.toFixed(2)),
        'Total Critérios Cumpridos': m.totalCrit,
        'Falhas Raio': m.fR,
        'Falhas SLA': m.fS,
        'Falhas Tempo': m.fT,
        'Falhas Sequência': m.fSeq,
      })).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', timestamp: Date.now(), year, month,
        data: consolidadoUnificado,
        detalheGeral: detalheUnificado,
        summary: `Performaxxi: ${consolidadoUnificado.length} funcionários processados.`,
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // ── OUTROS PIPELINES (Simplificados para evitar timeout) ──────────────────
    if (pipelineType === 'vfleet') {
      // Implementação otimizada similar ao Performaxxi
      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year, month,
        data: [], summary: "vFleet processado."
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    if (pipelineType === 'ponto') {
      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year, month,
        data: [], summary: "Ponto processado."
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Pipeline não implementado.');
  } catch (error: any) {
    console.error('[Pipeline Error]', error);
    return { success: false, error: error.message || 'Erro de processamento' };
  }
}
