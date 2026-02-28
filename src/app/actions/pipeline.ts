'use server';

import { firebaseStore, PipelineResult } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string; stack?: string; code?: string; detail?: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Encontra coluna por nome exato ou parcial baseado na lista do usuário
const findCol = (row: any, candidates: string[]): any => {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const found = keys.find(k => k.trim().toLowerCase() === cand.toLowerCase());
    if (found !== undefined) return row[found];
  }
  // Fallback para include parcial se não achar exato
  for (const cand of candidates) {
    const found = keys.find(k => k.toLowerCase().includes(cand.toLowerCase()));
    if (found !== undefined) return row[found];
  }
  return undefined;
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

    // ── PERFORMAXXI ─────────────────────────────────────────────────────────
    if (pipelineType === 'performaxxi') {
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;
      const dailyMap: Record<string, any> = {};

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];

        if (data.length === 0) continue;

        const processarEntidade = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE', row: any, dtStr: string, empresa: string) => {
          const nomeTrim = nome.trim();
          if (!nomeTrim || nomeTrim === '0' || /^(null|sem ajudante|nan|undefined)$/i.test(nomeTrim)) return;

          const key = `${nomeTrim}_${cargo}_${dtStr}`;
          if (!dailyMap[key]) {
            dailyMap[key] = {
              Empresa: empresa, Funcionario: nomeTrim, Cargo: cargo, Dia: dtStr,
              Total_Pedidos: 0, Raio_OK: 0, SLA_OK: 0, Tempo_OK: 0, Seq_OK: 0,
              Peso_Total: 0, Peso_Devolvido: 0
            };
          }

          const d = dailyMap[key];
          d.Total_Pedidos++;

          // Raio <= 100m
          const dist = toFloat(findCol(row, ['Distância Cliente (metros)', 'Distância Cliente', 'distancia_cliente']));
          if (dist <= 100) d.Raio_OK++;

          // SLA
          const sla = String(findCol(row, ['SLA Janela Atendimento', 'SLA Janela', 'SLA']) || '').toUpperCase();
          if (sla.includes('SIM') || sla === 'OK') d.SLA_OK++;

          // Tempo de atendimento >= 60s
          const chegada = hmsToSeconds(findCol(row, ['Chegada Cliente Realizado', 'Início Atendimento Cliente Realizado']));
          const fim     = hmsToSeconds(findCol(row, ['Fim Atendimento Cliente Realizado']));
          if (fim > 0 && chegada > 0 && (fim - chegada >= 60)) d.Tempo_OK++;

          // Sequência
          const sP = String(findCol(row, ['Sequência Entrega Planejado']) || '');
          const sR = String(findCol(row, ['Sequência Entrega Realizado']) || '');
          if (sP !== '' && sP === sR) d.Seq_OK++;

          // Peso
          const peso = toFloat(findCol(row, ['Peso Pedido', 'Peso Entrega']));
          d.Peso_Total += peso;
          const oc = String(findCol(row, ['Descrição Ocorrência']) || '').trim();
          if (oc && !/^(null|nan|)$/i.test(oc)) d.Peso_Devolvido += peso;
        };

        for (const row of data) {
          const status = String(findCol(row, ['Status Rota']) || '').toUpperCase();
          if (status === 'STANDBY') continue;

          const dtStr = excelSerialToDateStr(findCol(row, ['Data Rota']), year);
          if (!dtStr) continue;

          const dtParts = dtStr.split('/');
          if (dtParts.length >= 2 && parseInt(dtParts[1]) !== month) continue;

          const empresa  = String(findCol(row, ['Nome Depósito', 'Empresa']) || 'N/A');
          const motorista = String(findCol(row, ['Nome Motorista']) || '');
          const ajudante  = String(findCol(row, ['Nome Primeiro Ajudante']) || '');

          if (motorista) processarEntidade(motorista, 'MOTORISTA', row, dtStr, empresa);
          if (ajudante)  processarEntidade(ajudante,  'AJUDANTE',  row, dtStr, empresa);
        }
      }

      if (Object.keys(dailyMap).length === 0) {
        throw new Error('Nenhum registro válido encontrado para o período/critérios selecionados.');
      }

      // Detalhe unificado com ordem rigorosa
      const detalheUnificado = Object.values(dailyMap).map(d => {
        const tot = d.Total_Pedidos || 1;
        const pR   = Number(((d.Raio_OK  / tot) * 100).toFixed(2));
        const pS   = Number(((d.SLA_OK   / tot) * 100).toFixed(2));
        const pT   = Number(((d.Tempo_OK / tot) * 100).toFixed(2));
        const pSeq = Number(((d.Seq_OK   / tot) * 100).toFixed(2));

        const cR   = pR   >= 70;
        const cS   = pS   >= 80;
        const cT   = pT   >= 100;
        const cSeq = pSeq >= 0;

        const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + (cSeq ? 1 : 0);
        const valorMax  = d.Cargo === 'MOTORISTA' ? MOT_BASE : AJU_BASE;
        const valorCrit = valorMax / 4;

        return {
          'Empresa'                    : d.Empresa,
          'Funcionario'                : d.Funcionario,
          'Cargo'                      : d.Cargo,
          'Dia'                        : d.Dia,
          'Total de Pedidos'           : d.Total_Pedidos,
          'Peso Pedido Dia (Kg)'       : Number(d.Peso_Total.toFixed(2)),
          'Peso Devolvido Dia (Kg)'    : Number(d.Peso_Devolvido.toFixed(2)),
          '% Devolvido Dia'            : d.Peso_Total > 0 ? Number(((d.Peso_Devolvido / d.Peso_Total) * 100).toFixed(2)) : 0,
          'Pedidos Raio OK'            : d.Raio_OK,
          '% Raio'                     : pR,
          '✓ Raio ≥70.0%'              : cR ? 'SIM' : 'NÃO',
          'Pedidos SLA OK'             : d.SLA_OK,
          '% SLA'                      : pS,
          '✓ SLA ≥80.0%'               : cS ? 'SIM' : 'NÃO',
          'Pedidos Tempo OK'           : d.Tempo_OK,
          '% Tempo'                    : pT,
          '✓ Tempo ≥100.0%'            : cT ? 'SIM' : 'NÃO',
          'Pedidos Sequência OK'       : d.Seq_OK,
          '% Sequência'                : pSeq,
          '✓ Sequência ≥0.0%'          : cSeq ? 'SIM' : 'NÃO',
          'Critérios Cumpridos (de 4)' : cumpridos,
          'Critérios Falhados'         : 4 - cumpridos,
          'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
          '% Bonificação'              : Number(((cumpridos / 4) * 100).toFixed(2)),
          'Bonificação Funcionario (R$)': Number((cumpridos * valorCrit).toFixed(2)),
        };
      });

      // Consolidado unificado com ordem rigorosa
      const consolidadoMap: Record<string, any> = {};
      for (const d of detalheUnificado) {
        const key = `${d.Funcionario}_${d.Cargo}`;
        if (!consolidadoMap[key]) {
          consolidadoMap[key] = {
            'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo,
            dias: 0, diasMax: 0, totalBon: 0, totalCrit: 0,
            fR: 0, fS: 0, fT: 0, fSeq: 0,
          };
        }
        const m = consolidadoMap[key];
        m.dias++;
        if (d['Dia Bonificação Máxima (4/4)'] === 'SIM') m.diasMax++;
        m.totalBon  += d['Bonificação Funcionario (R$)'];
        m.totalCrit += d['Critérios Cumpridos (de 4)'];
        if (d['✓ Raio ≥70.0%']     === 'NÃO') m.fR++;
        if (d['✓ SLA ≥80.0%']      === 'NÃO') m.fS++;
        if (d['✓ Tempo ≥100.0%']   === 'NÃO') m.fT++;
        if (d['✓ Sequência ≥0.0%'] === 'NÃO') m.fSeq++;
      }

      const consolidadoUnificado = Object.values(consolidadoMap).map((m: any) => ({
        'Empresa'                     : m['Empresa'],
        'Funcionario'                 : m['Funcionario'],
        'Cargo'                       : m['Cargo'],
        'Dias com Atividade'          : m.dias,
        'Dias Bonif. Máxima (4/4)'    : m.diasMax,
        'Percentual de Desempenho (%)': Number(((m.totalCrit / (m.dias * 4)) * 100).toFixed(2)),
        'Total Bonificação (R$)'      : Number(m.totalBon.toFixed(2)),
        'Total Critérios Cumpridos'   : m.totalCrit,
        'Falhas Raio'                 : m.fR,
        'Falhas SLA'                  : m.fS,
        'Falhas Tempo'                : m.fT,
        'Falhas Sequência'            : m.fSeq,
      })).sort((a: any, b: any) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', timestamp: Date.now(), year, month,
        data: consolidadoUnificado,
        detalheGeral: detalheUnificado,
        summary: `Performaxxi Unificado: ${consolidadoUnificado.length} funcionários processados.`,
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // ── OUTROS PIPELINES (vFleet e Ponto mantidos simplificados) ────────────────
    if (pipelineType === 'vfleet') {
      // Implementação otimizada similar...
      const VFLEET_BONUS = 4.80;
      const dailyAnalysis: Record<string, any> = {};
      let bulletins: any[] = [];
      let alerts: any[] = [];

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) as any[];
        if (file.name.toUpperCase().includes('BOLETIM')) bulletins.push(...sheet);
        else alerts.push(...sheet);
      }

      for (const row of bulletins) {
        const dt = excelSerialToDateStr(row['DIA'] || row['DATA'], year);
        if (!dt) continue;
        const motorista = String(row['MOTORISTAS'] || row['MOTORISTA'] || '').split('-')[0].trim();
        if (!motorista || /sem identificação/i.test(motorista)) continue;
        const key = `${motorista}_${dt}`;
        if (!dailyAnalysis[key]) dailyAnalysis[key] = { motorista, dia: dt, curva: 0, banguela: 0, ociosidade: 0, velocidade: 0 };
        dailyAnalysis[key].curva += parseInt(row['CURVA BRUSCA'] || 0);
        dailyAnalysis[key].banguela += hmsToSeconds(row['BANGUELA']);
        dailyAnalysis[key].ociosidade += hmsToSeconds(row['PARADO LIGADO']);
      }

      for (const alert of alerts) {
        const dt = excelSerialToDateStr(alert['DATA'] || alert['DIA'], year);
        const mot = String(alert['MOTORISTA'] || '').trim();
        const key = `${mot}_${dt}`;
        if (mot && dailyAnalysis[key] && String(alert['TIPO']).toUpperCase().includes('VELOCIDADE')) {
          dailyAnalysis[key].velocidade++;
        }
      }

      const detalheConducao = Object.values(dailyAnalysis).map(d => {
        const ok = d.curva === 0 && d.banguela === 0 && d.ociosidade === 0 && d.velocidade === 0;
        return {
          'Motorista': d.motorista, 'Dia': d.dia, 'Falhas Curva': d.curva,
          'Falhas Banguela (seg)': d.banguela, 'Falhas Ociosidade (seg)': d.ociosidade,
          'Falhas Velocidade': d.velocidade, 'Dia Bonificado': ok ? 'SIM' : 'NÃO',
          'Bonificação Condução (R$)': ok ? VFLEET_BONUS : 0,
        };
      });

      const consolidadoMap: Record<string, any> = {};
      for (const d of detalheConducao) {
        if (!consolidadoMap[d.Motorista]) consolidadoMap[d.Motorista] = { 'Motorista': d.Motorista, dias: 0, diasBon: 0, totalBon: 0 };
        consolidadoMap[d.Motorista].dias++;
        if (d['Dia Bonificado'] === 'SIM') consolidadoMap[d.Motorista].diasBon++;
        consolidadoMap[d.Motorista].totalBon += d['Bonificação Condução (R$)'];
      }

      const consolidado = Object.values(consolidadoMap).map((m: any) => ({
        'Motorista': m.Motorista, 'Dias com Atividade': m.dias, 'Dias Bonificados (4/4)': m.diasBon,
        'Percentual de Desempenho (%)': Number(((m.diasBon / m.dias) * 100).toFixed(2)),
        'Total Bonificação (R$)': Number(m.totalBon.toFixed(2)),
      })).sort((a: any, b: any) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year, month,
        data: consolidado, detalheConducao,
        summary: `vFleet: ${consolidado.length} motoristas processados.`,
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    if (pipelineType === 'ponto') {
      const includeSundays = formData.get('includeSundays') === 'true';
      const excludedDatesRaw = formData.get('excludedDates');
      const excludedDates: string[] = excludedDatesRaw ? JSON.parse(excludedDatesRaw as string) : [];
      const MOT_MARC = 1.60;
      const dailyMap: Record<string, any[]> = {};

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }) as any[][];
        let id = '', nome = '';
        for (const row of data) {
          const c0 = String(row[0] || '').trim();
          const c1 = String(row[1] || '').trim();
          if (/^\d+$/.test(c0) && c1.length > 3) { id = c0; nome = c1; continue; }
          if (id && (c0.includes('/') || /^\d{1,2}\/\d{1,2}/.test(c0))) {
            const dtStr = excelSerialToDateStr(c0, year);
            if (!dtStr) continue;
            const dtParts = dtStr.split('/');
            if (parseInt(dtParts[1]) !== month || excludedDates.includes(dtStr)) continue;
            const dtObj = new Date(parseInt(dtParts[2]), parseInt(dtParts[1]) - 1, parseInt(dtParts[0]));
            if (!includeSundays && dtObj.getDay() === 0) continue;
            const marcacoes = row.slice(2).filter(v => /^\d{1,2}:\d{2}/.test(String(v || '').trim())).length;
            const key = `${id}_${nome}`;
            if (!dailyMap[key]) dailyMap[key] = [];
            dailyMap[key].push({ id, nome, data: dtStr, marcacoes });
          }
        }
      }

      const detalhePonto: any[] = [];
      const consolidadoMap: Record<string, any> = {};
      for (const regs of Object.values(dailyMap)) {
        for (const r of regs) {
          const ok = r.marcacoes === 4;
          detalhePonto.push({
            'ID': r.id, 'Funcionario': r.nome, 'Dia': r.data, 'Marcações': r.marcacoes,
            '✓ 4 Marcações': ok ? 'SIM' : 'NÃO', 'Bônus Marcações (R$)': ok ? MOT_MARC : 0
          });
          if (!consolidadoMap[r.id]) consolidadoMap[r.id] = { ID: r.id, Nome: r.nome, dias: 0, ok: 0, bon: 0 };
          consolidadoMap[r.id].dias++;
          if (ok) { consolidadoMap[r.id].ok++; consolidadoMap[r.id].bon += MOT_MARC; }
        }
      }

      const consolidado = Object.values(consolidadoMap).map((m: any) => ({
        'ID': m.ID, 'Funcionario': m.Nome, 'Dias com Atividade': m.dias,
        'Dias 4 Marcações OK': m.ok, 'Percentual (%)': Number(((m.ok / m.dias) * 100).toFixed(2)),
        'Total Bonificação (R$)': Number(m.bon.toFixed(2))
      }));

      const absenteismoData = consolidado.map((c: any) => ({
        'ID': c.ID, 'Nome': c.Funcionario, 'Total_Dias': c['Dias com Atividade'],
        'Faltas': Math.max(0, c['Dias com Atividade'] - c['Dias 4 Marcações OK']),
        'Percentual (%)': c['Percentual (%)'],
        'Valor_Incentivo': c['Percentual (%)'] >= 90 ? 50 : 0
      }));

      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year, month,
        data: consolidado, detalhePonto, absenteismoData,
        summary: `Ponto: ${consolidado.length} colaboradores processados.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Pipeline não implementado.');
  } catch (error: any) {
    console.error('[Pipeline Error]', error);
    return { success: false, error: error.message || 'Erro de processamento' };
  }
}
