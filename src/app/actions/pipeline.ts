
'use server';

import { firebaseStore, PipelineResult } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday } from 'date-fns';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string };

const normalizePlate = (plate: any): string => {
  if (!plate) return "";
  return String(plate).toUpperCase().replace(/[^A-Z0-9]/g, "");
};

const excelSerialToDateStr = (serial: any, defaultYear: number): string => {
  if (typeof serial === 'number' && serial > 30000 && serial < 60000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return format(date, 'dd/MM/yyyy');
  }
  if (serial instanceof Date) return format(serial, 'dd/MM/yyyy');
  const s = String(serial || "").trim();
  if (s.includes('/') && s.length >= 8) return s;
  return "";
};

const hmsToSeconds = (hms: any): number => {
  if (!hms || hms === "-") return 0;
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

const findCol = (row: any, candidates: string[]): string | undefined => {
  if (!row) return undefined;
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const normCand = cand.toLowerCase().trim();
    const found = keys.find(k => k.toLowerCase().trim().includes(normCand));
    if (found) return found;
  }
  return undefined;
};

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function executePipeline(formData: FormData, pipelineType: 'vfleet' | 'performaxxi' | 'ponto'): Promise<PipelineResponse> {
  try {
    const rawYear = formData.get('year');
    const rawMonth = formData.get('month');
    const files = formData.getAll('files') as File[];
    
    if (!rawYear || !rawMonth) throw new Error('Período ausente.');
    if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado.');

    const year = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);

    if (pipelineType === 'performaxxi') {
      let rawData: any[] = [];
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
        rawData.push(...data);
      }

      const baseDados = rawData.filter(row => {
        const statusVal = String(row[findCol(row, ['status_rota', 'status']) || ''] || '').toUpperCase();
        return statusVal !== 'STANDBY';
      });

      const analisarGrupo = (tipo: 'MOTORISTA' | 'AJUDANTE') => {
        if (baseDados.length === 0) return [];
        
        const firstRow = baseDados[0];
        const colNomeCand = tipo === 'MOTORISTA' ? ['nome_motorista', 'motorista'] : ['nome_primeiro_ajudante', 'ajudante'];
        const colNome = findCol(firstRow, colNomeCand);
        const colData = findCol(firstRow, ['data_rota', 'data']);
        const colEmpresa = findCol(firstRow, ['empresa', 'deposito']);
        const colDist = findCol(firstRow, ['distancia_cliente_metros', 'distancia']);
        const colSla = findCol(firstRow, ['sla_janela_atendimento', 'sla']);
        const colChegada = findCol(firstRow, ['chegada_cliente_realizado', 'chegada']);
        const colFim = findCol(firstRow, ['fim_atendimento_cliente_realizado', 'fim_atendimento']);
        const colPeso = findCol(firstRow, ['peso_pedido', 'peso']);
        const colOc = findCol(firstRow, ['descricao_ocorrencia', 'ocorrencia']);

        const baseValor = tipo === 'MOTORISTA' ? MOT_BASE : AJU_BASE;
        const valorPorCriterio = baseValor / 4;
        const dailyMap: Record<string, any> = {};

        baseDados.forEach(row => {
          const nome = String(row[colNome || ''] || '').trim();
          if (!nome || nome === 'N.R.' || nome === '0') return;

          const dateStr = excelSerialToDateStr(row[colData || ''], year);
          if (!dateStr) return;
          const key = `${nome}_${dateStr}`;

          if (!dailyMap[key]) {
            dailyMap[key] = {
              Empresa: String(row[colEmpresa || ''] || 'N/A'),
              Funcionario: nome,
              Cargo: tipo,
              Dia: dateStr,
              Total_Pedidos: 0,
              Raio_OK: 0,
              SLA_OK: 0,
              Tempo_OK: 0,
              Seq_OK: 0,
              Peso_Total: 0,
              Peso_Devolvido: 0
            };
          }

          dailyMap[key].Total_Pedidos++;
          if (toFloat(row[colDist || '']) <= 100) dailyMap[key].Raio_OK++;
          const slaVal = String(row[colSla || ''] || '').toUpperCase();
          if (slaVal.includes('SIM') || slaVal.includes('OK')) dailyMap[key].SLA_OK++;
          
          const t1 = hmsToSeconds(row[colChegada || '']);
          const t2 = hmsToSeconds(row[colFim || '']);
          if (t2 - t1 >= 60) dailyMap[key].Tempo_OK++;

          const sPlan = String(row['sequencia_entrega_planejado'] || '');
          const sReal = String(row['sequencia_entrega_realizado'] || '');
          if (sPlan === sReal && sPlan !== '') dailyMap[key].Seq_OK++;

          const peso = toFloat(row[colPeso || '']);
          dailyMap[key].Peso_Total += peso;
          const ocVal = String(row[colOc || ''] || '').trim();
          if (ocVal !== '' && ocVal.toUpperCase() !== 'NULL') dailyMap[key].Peso_Devolvido += peso;
        });

        return Object.values(dailyMap).map(d => {
          const pRaio = Number(((d.Raio_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pSla = Number(((d.SLA_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pTempo = Number(((d.Tempo_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pSeq = Number(((d.Seq_OK / d.Total_Pedidos) * 100).toFixed(2));

          const cRaio = pRaio >= 70;
          const cSla = pSla >= 80;
          const cTempo = pTempo >= 100;
          const cSeq = pSeq >= 0;

          const cumpridos = (cRaio ? 1 : 0) + (cSla ? 1 : 0) + (cTempo ? 1 : 0) + (cSeq ? 1 : 0);
          
          // Ordem solicitada pelo usuário
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
            '% Raio': pRaio,
            '✓ Raio ≥70.0%': cRaio ? 'SIM' : 'NÃO',
            'Pedidos SLA OK': d.SLA_OK,
            '% SLA': pSla,
            '✓ SLA ≥80.0%': cSla ? 'SIM' : 'NÃO',
            'Pedidos Tempo OK': d.Tempo_OK,
            '% Tempo': pTempo,
            '✓ Tempo ≥100.0%': cTempo ? 'SIM' : 'NÃO',
            'Pedidos Sequência OK': d.Seq_OK,
            '% Sequência': pSeq,
            '✓ Sequência ≥0.0%': cSeq ? 'SIM' : 'NÃO',
            'Critérios Cumpridos (de 4)': cumpridos,
            'Critérios Falhados': 4 - cumpridos,
            'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
            '% Bonificação': Number((cumpridos / 4 * 100).toFixed(2)),
            'Bonificação Funcionario (R$)': Number((cumpridos * valorPorCriterio).toFixed(2))
          };
        });
      };

      const detalheUnificado = [...analisarGrupo('MOTORISTA'), ...analisarGrupo('AJUDANTE')];

      const consolidadoUnificado = Object.values(detalheUnificado.reduce((acc: any, curr: any) => {
        const key = `${curr.Funcionario}_${curr.Cargo}`;
        if (!acc[key]) {
          acc[key] = {
            'Empresa': curr.Empresa, 
            'Funcionario': curr.Funcionario, 
            'Cargo': curr.Cargo, 
            'Dias com Atividade': 0, 
            'Dias Bonif. Máxima (4/4)': 0,
            'Total Bonificação (R$)': 0, 
            'Total Critérios Cumpridos': 0, 
            'Falhas Raio': 0, 
            'Falhas SLA': 0, 
            'Falhas Tempo': 0, 
            'Falhas Sequência': 0
          };
        }
        acc[key]['Dias com Atividade']++;
        if (curr['Dia Bonificação Máxima (4/4)'] === 'SIM') acc[key]['Dias Bonif. Máxima (4/4)']++;
        acc[key]['Total Bonificação (R$)'] += curr['Bonificação Funcionario (R$)'];
        acc[key]['Total Critérios Cumpridos'] += curr['Critérios Cumpridos (de 4)'];
        if (curr['✓ Raio ≥70.0%'] === 'NÃO') acc[key]['Falhas Raio']++;
        if (curr['✓ SLA ≥80.0%'] === 'NÃO') acc[key]['Falhas SLA']++;
        if (curr['✓ Tempo ≥100.0%'] === 'NÃO') acc[key]['Falhas Tempo']++;
        if (curr['✓ Sequência ≥0.0%'] === 'NÃO') acc[key]['Falhas Sequência']++;
        return acc;
      }, {})).map((m: any) => ({
        ...m, 
        'Percentual de Desempenho (%)': Number(((m['Total Critérios Cumpridos'] / (m['Dias com Atividade'] * 4)) * 100).toFixed(2)),
        'Total Bonificação (R$)': Number(m['Total Bonificação (R$)'].toFixed(2))
      })).sort((a: any, b: any) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', 
        timestamp: Date.now(), 
        year, month,
        data: consolidadoUnificado, 
        detalheGeral: detalheUnificado,
        summary: `Performaxxi Unificado: Analisados ${consolidadoUnificado.length} funcionários.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    if (pipelineType === 'vfleet') {
      let bulletins: any[] = [];
      let alerts: any[] = [];
      const VFLEET_BONUS = 4.80;

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const name = file.name.toUpperCase();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        if (name.includes('BOLETIM')) bulletins.push(...sheet);
        else alerts.push(...sheet);
      }

      const dailyAnalysis: Record<string, any> = {};
      bulletins.forEach(row => {
        const diaStr = excelSerialToDateStr(row['DIA'] || row['DATA'], year);
        if (!diaStr) return;
        const motorista = String(row['MOTORISTAS'] || '').split('-')[0].trim();
        if (!motorista || motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO')) return;
        const key = `${motorista}_${diaStr}`;
        if (!dailyAnalysis[key]) dailyAnalysis[key] = { motorista, dia: diaStr, curva: 0, banguela: 0, ociosidade: 0, velocidade: 0 };
        dailyAnalysis[key].curva += parseInt(row['CURVA BRUSCA'] || 0);
        dailyAnalysis[key].banguela += hmsToSeconds(row['BANGUELA']);
        dailyAnalysis[key].ociosidade += hmsToSeconds(row['PARADO LIGADO']);
      });

      alerts.forEach(alert => {
        const diaStr = excelSerialToDateStr(alert['DATA'] || alert['DIA'], year);
        const motorista = String(alert['MOTORISTA'] || '').trim();
        if (motorista && !motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO') && String(alert['TIPO']).includes('VELOCIDADE')) {
          if (dailyAnalysis[`${motorista}_${diaStr}`]) dailyAnalysis[`${motorista}_${diaStr}`].velocidade++;
        }
      });

      const detailRows = Object.values(dailyAnalysis).map(d => {
        const todosOk = d.curva === 0 && d.banguela === 0 && d.ociosidade === 0 && d.velocidade === 0;
        return { 'Motorista': d.motorista, 'Dia': d.dia, 'Dia Bonificado': todosOk ? 'SIM' : 'NÃO', 'Bonificação Condução (R$)': todosOk ? VFLEET_BONUS : 0 };
      });

      const consolidado = Object.values(detailRows.reduce((acc: any, curr: any) => {
        if (!acc[curr.Motorista]) acc[curr.Motorista] = { 'Motorista': curr.Motorista, 'Dias com Atividade': 0, 'Dias Bonificados (4/4)': 0, 'Total Bonificação (R$)': 0 };
        acc[curr.Motorista]['Dias com Atividade']++;
        if (curr['Dia Bonificado'] === 'SIM') acc[curr.Motorista]['Dias Bonificados (4/4)']++;
        acc[curr.Motorista]['Total Bonificação (R$)'] += curr['Bonificação Condução (R$)'];
        return acc;
      }, {}));

      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year, month,
        data: consolidado, summary: `vFleet: Analisados ${consolidado.length} motoristas.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    if (pipelineType === 'ponto') {
      const includeSundays = formData.get('includeSundays') === 'true';
      const excludedDatesSet = new Set(JSON.parse(formData.get('excludedDates') as string || '[]'));
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(start);
      const agendaOficial = eachDayOfInterval({ start, end }).filter(d => {
        const f = format(d, 'dd/MM/yyyy');
        return !excludedDatesSet.has(f) && (includeSundays || !isSunday(d));
      }).map(d => format(d, 'dd/MM/yyyy'));

      let rawData: any[] = [];
      for (const file of files) {
        const workbook = XLSX.read(await fileToBuffer(file), { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
        let id = '', nome = '';
        data.forEach(row => {
          const c0 = String(row[0] || '').trim(), c1 = String(row[1] || '').trim();
          if (c0 && /^\d+$/.test(c0) && c1.length > 5 && !c0.includes('/')) { id = c0; nome = c1; }
          else if (id && c0.includes('/')) {
            const dt = excelSerialToDateStr(row[0], year);
            if (dt.split('/')[1] === month.toString().padStart(2, '0')) rawData.push({ id, nome, data: dt, marcacoes: String(row[2] || '') });
          }
        });
      }

      const consolidado = Object.values(rawData.reduce((acc: any, curr: any) => {
        const k = `${curr.id}_${curr.nome}`;
        if (!acc[k]) acc[k] = { ID: curr.id, Motorista: curr.nome, Dias_Trabalhados: 0 };
        acc[k].Dias_Trabalhados++;
        return acc;
      }, {}));

      const absData = consolidado.map((c: any) => {
        const meta = agendaOficial.length;
        const perc = Number(((c.Dias_Trabalhados / meta) * 100).toFixed(2));
        return { 
          ID: c.ID, 
          Nome: c.Motorista, 
          Grupo: 'MOTORISTA', 
          Total_Dias: meta, 
          'Presenças Físicas': c.Dias_Trabalhados, 
          'Atestados/Férias': 0, 
          'Abonos Manuais': excludedDatesSet.size, 
          'Total Presenças': c.Dias_Trabalhados + excludedDatesSet.size, 
          Faltas: Math.max(0, meta - c.Dias_Trabalhados), 
          'Percentual (%)': perc, 
          Valor_Incentivo: perc >= 100 ? 50 : 0 
        };
      });

      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year, month,
        data: consolidado, absenteismoData: absData, summary: `Ponto: Processados ${absData.length} colaboradores.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Pipeline não implementado.');
  } catch (error: any) {
    console.error('Erro no Pipeline:', error);
    return { success: false, error: error.message };
  }
}
