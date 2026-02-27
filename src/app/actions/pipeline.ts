
'use server';

import { firebaseStore, PipelineResult } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday, differenceInMinutes, parse, addDays, isSameDay } from 'date-fns';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string };

// --- HELPERS DE NORMALIZAÇÃO ---
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
  const str = String(serial || "").trim();
  if (str.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) return str;
  return str;
};

const hmsToSeconds = (hms: string): number => {
  if (!hms || hms === "-") return 0;
  try {
    const parts = String(hms).split(':');
    if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    return 0;
  } catch { return 0; }
};

const hmsToMinutes = (hms: string): number => {
  if (!hms || hms === "-" || !String(hms).includes(':')) return 0;
  try {
    const parts = String(hms).split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } catch { return 0; }
};

const minutesToHms = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return "";
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `${minutes < 0 ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const toFloat = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const clean = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
};

const findCol = (row: any, candidates: string[]): string | undefined => {
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

    // --- PERFORMAXXI ---
    if (pipelineType === 'performaxxi') {
      let rawData: any[] = [];
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;
      const CRITERIOS_TOTAL = 4;

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
        rawData.push(...data);
      }

      const baseDados = rawData.filter(row => {
        const statusCol = findCol(row, ['status_rota', 'status_da_rota', 'status']);
        const status = String(row[statusCol || ''] || '').toUpperCase();
        return status !== 'STANDBY';
      });

      const analisarGrupo = (grupoTipo: 'MOTORISTA' | 'AJUDANTE') => {
        const colNomeCand = grupoTipo === 'MOTORISTA' ? ['nome_motorista', 'motorista'] : ['nome_primeiro_ajudante', 'nome_segundo_ajudante', 'ajudante'];
        const baseValor = grupoTipo === 'MOTORISTA' ? MOT_BASE : AJU_BASE;
        const valorPorCriterio = baseValor / CRITERIOS_TOTAL;

        const dailyMap: Record<string, any> = {};

        baseDados.forEach(row => {
          const colNome = findCol(row, colNomeCand);
          const colData = findCol(row, ['data_rota', 'data_da_rota', 'data']);
          const colEmpresa = findCol(row, ['empresa', 'nome_deposito', 'deposito']);
          
          const nome = String(row[colNome || ''] || '').trim();
          const dataRaw = row[colData || ''];
          if (!nome || nome === 'N.R.' || !dataRaw) return;

          const dateStr = excelSerialToDateStr(dataRaw, year);
          const key = `${nome}_${dateStr}`;

          if (!dailyMap[key]) {
            dailyMap[key] = {
              Empresa: String(row[colEmpresa || ''] || 'N/A'),
              Funcionario: nome,
              Cargo: grupoTipo,
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

          const distCol = findCol(row, ['distancia_cliente_metros', 'distancia_metros', 'distancia']);
          const slaCol = findCol(row, ['sla_janela_atendimento', 'sla']);
          const chegCol = findCol(row, ['chegada_cliente_realizado', 'chegada']);
          const fimCol = findCol(row, ['fim_atendimento_cliente_realizado', 'fim_atendimento']);
          const seqPlanCol = findCol(row, ['sequencia_entrega_planejado']);
          const seqRealCol = findCol(row, ['sequencia_entrega_realizado']);
          const pesoCol = findCol(row, ['peso_pedido', 'peso']);
          const ocCol = findCol(row, ['descricao_ocorrencia', 'ocorrencia']);

          dailyMap[key].Total_Pedidos++;
          
          if (toFloat(row[distCol || '']) <= 100) dailyMap[key].Raio_OK++;
          if (String(row[slaCol || ''] || '').toUpperCase().match(/SIM|OK/)) dailyMap[key].SLA_OK++;
          
          const t1 = hmsToSeconds(String(row[chegCol || ''] || ''));
          const t2 = hmsToSeconds(String(row[fimCol || ''] || ''));
          if (t2 - t1 >= 60) dailyMap[key].Tempo_OK++;

          if (row[seqPlanCol || ''] === row[seqRealCol || ''] && row[seqPlanCol || ''] !== undefined) dailyMap[key].Seq_OK++;

          const peso = toFloat(row[pesoCol || '']);
          dailyMap[key].Peso_Total += peso;
          if (String(row[ocCol || ''] || '').trim() !== '') dailyMap[key].Peso_Devolvido += peso;
        });

        const detalhe = Object.values(dailyMap).map(d => {
          const pRaio = Number(((d.Raio_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pSla = Number(((d.SLA_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pTempo = Number(((d.Tempo_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pSeq = Number(((d.Seq_OK / d.Total_Pedidos) * 100).toFixed(2));

          const cRaio = pRaio >= 70;
          const cSla = pSla >= 80;
          const cTempo = pTempo >= 100;
          const cSeq = pSeq >= 0;

          const cumpridos = (cRaio ? 1 : 0) + (cSla ? 1 : 0) + (cTempo ? 1 : 0) + (cSeq ? 1 : 0);
          const bonus = Number((cumpridos * valorPorCriterio).toFixed(2));

          // Retorno com a ordem exata solicitada
          return {
            'Empresa': d.Empresa,
            'Funcionario': d.Funcionario,
            'Cargo': d.Cargo,
            'Dia': d.Dia,
            'Total de Pedidos': d.Total_Pedidos,
            'Peso Pedido Dia (Kg)': d.Peso_Total.toFixed(2),
            'Peso Devolvido Dia (Kg)': d.Peso_Devolvido.toFixed(2),
            '% Devolvido Dia': d.Peso_Total > 0 ? ((d.Peso_Devolvido / d.Peso_Total) * 100).toFixed(2) : '0.00',
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
            '% Bonificação': (cumpridos / 4 * 100).toFixed(2),
            'Bonificação Funcionario (R$)': bonus
          };
        });

        const consolidado = Object.values(detalhe.reduce((acc: any, curr: any) => {
          const nome = curr.Funcionario;
          if (!acc[nome]) {
            acc[nome] = {
              'Empresa': curr.Empresa,
              'Funcionario': nome,
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
          acc[nome]['Dias com Atividade']++;
          if (curr['Dia Bonificação Máxima (4/4)'] === 'SIM') acc[nome]['Dias Bonif. Máxima (4/4)']++;
          acc[nome]['Total Bonificação (R$)'] += curr['Bonificação Funcionario (R$)'] || 0;
          acc[nome]['Total Critérios Cumpridos'] += curr['Critérios Cumpridos (de 4)'];
          if (curr['✓ Raio ≥70.0%'] === 'NÃO') acc[nome]['Falhas Raio']++;
          if (curr['✓ SLA ≥80.0%'] === 'NÃO') acc[nome]['Falhas SLA']++;
          if (curr['✓ Tempo ≥100.0%'] === 'NÃO') acc[nome]['Falhas Tempo']++;
          if (curr['✓ Sequência ≥0.0%'] === 'NÃO') acc[nome]['Falhas Sequência']++;
          return acc;
        }, {})).map((m: any) => ({
          'Empresa': m.Empresa,
          'Funcionario': m.Funcionario,
          'Cargo': m.Cargo,
          'Dias com Atividade': m['Dias com Atividade'],
          'Dias Bonif. Máxima (4/4)': m['Dias Bonif. Máxima (4/4)'],
          'Percentual de Desempenho (%)': Number(((m['Total Critérios Cumpridos'] / (m['Dias com Atividade'] * 4)) * 100).toFixed(2)),
          'Total Bonificação (R$)': Number(m['Total Bonificação (R$)'].toFixed(2)),
          'Total Critérios Cumpridos': m['Total Critérios Cumpridos'],
          'Falhas Raio': m['Falhas Raio'],
          'Falhas SLA': m['Falhas SLA'],
          'Falhas Tempo': m['Falhas Tempo'],
          'Falhas Sequência': m['Falhas Sequência']
        }));

        return { detalhe, consolidado };
      };

      const resMot = analisarGrupo('MOTORISTA');
      const resAju = analisarGrupo('AJUDANTE');

      // Unificação para salvar no Banco de Dados conforme pedido
      const consolidadoUnificado = [...resMot.consolidado, ...resAju.consolidado];
      const detalheUnificado = [...resMot.detalhe, ...resAju.detalhe];

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi',
        timestamp: Date.now(),
        year, month,
        data: consolidadoUnificado,
        detalheGeral: detalheUnificado,
        summary: `Performaxxi: Analisados ${consolidadoUnificado.length} colaboradores (Motoristas e Ajudantes).`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // --- VFLEET ---
    if (pipelineType === 'vfleet') {
      let vehicleBulletins: any[] = [];
      let alerts: any[] = [];
      const VFLEET_BONUS = 4.80;

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const name = file.name.toUpperCase();
        if (name.includes('BOLETIM')) {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          vehicleBulletins.push(...XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
        } else if (name.includes('ALERTAS') || name.includes('HISTORICO')) {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          alerts.push(...XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]));
        }
      }

      const dailyAnalysis: Record<string, any> = {};
      vehicleBulletins.forEach(row => {
        const placa = normalizePlate(row[findCol(row, ['PLACA']) || '']);
        const diaRaw = row[findCol(row, ['DIA', 'DATA']) || ''];
        if (!placa || !diaRaw) return;
        const dateStr = excelSerialToDateStr(diaRaw, year);
        let motorista = String(row[findCol(row, ['MOTORISTAS', 'MOTORISTA']) || ''] || '').split('-')[0].trim();
        if (!motorista || motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO')) return;
        const key = `${motorista}_${dateStr}`;
        if (!dailyAnalysis[key]) dailyAnalysis[key] = { motorista, dia: dateStr, curva: 0, banguela: 0, ociosidade: 0, velocidade: 0 };
        dailyAnalysis[key].curva += parseInt(row[findCol(row, ['CURVA BRUSCA']) || ''] || 0);
        dailyAnalysis[key].banguela += hmsToSeconds(row[findCol(row, ['BANGUELA']) || '']);
        dailyAnalysis[key].ociosidade += hmsToSeconds(row[findCol(row, ['PARADO LIGADO']) || '']);
      });

      alerts.forEach(alert => {
        const dateStr = excelSerialToDateStr(alert[findCol(alert, ['DATA', 'DIA']) || ''], year);
        const motorista = String(alert[findCol(alert, ['MOTORISTA']) || ''] || '').trim();
        if (motorista && !motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO') && String(alert[findCol(alert, ['TIPO']) || '']).includes('VELOCIDADE')) {
          if (dailyAnalysis[`${motorista}_${dateStr}`]) dailyAnalysis[`${motorista}_${dateStr}`].velocidade++;
        }
      });

      const detailRows = Object.values(dailyAnalysis).map(d => {
        const todosOk = d.curva === 0 && d.banguela === 0 && d.ociosidade === 0 && d.velocidade === 0;
        return {
          'Motorista': d.motorista, 'Dia': d.dia,
          '✓ Curva 100%': d.curva === 0 ? 'SIM' : 'NÃO',
          '✓ Banguela 100%': d.banguela === 0 ? 'SIM' : 'NÃO',
          '✓ Ociosidade 100%': d.ociosidade === 0 ? 'SIM' : 'NÃO',
          '✓ Sem Excesso Velocidade': d.velocidade === 0 ? 'SIM' : 'NÃO',
          'Dia Bonificado': todosOk ? 'SIM' : 'NÃO',
          'Bonificacao Conducao (R$)': todosOk ? VFLEET_BONUS : 0
        };
      });

      const consolidado = Object.values(detailRows.reduce((acc: any, curr: any) => {
        if (!acc[curr.Motorista]) acc[curr.Motorista] = { 'Motorista': curr.Motorista, 'Dias com Atividade': 0, 'Dias Bonificados (4/4)': 0, 'Total Bonificação (R$)': 0, 'Falhas Curva Brusca': 0, 'Falhas Banguela': 0, 'Falhas Ociosidade': 0, 'Falhas Exc. Velocidade': 0 };
        acc[curr.Motorista]['Dias com Atividade']++;
        if (curr['Dia Bonificado'] === 'SIM') acc[curr.Motorista]['Dias Bonificados (4/4)']++;
        acc[curr.Motorista]['Total Bonificação (R$)'] += curr['Bonificacao Conducao (R$)'];
        if (curr['✓ Curva 100%'] === 'NÃO') acc[curr.Motorista]['Falhas Curva Brusca']++;
        if (curr['✓ Banguela 100%'] === 'NÃO') acc[curr.Motorista]['Falhas Banguela']++;
        if (curr['✓ Ociosidade 100%'] === 'NÃO') acc[curr.Motorista]['Falhas Ociosidade']++;
        if (curr['✓ Sem Excesso Velocidade'] === 'NÃO') acc[curr.Motorista]['Falhas Exc. Velocidade']++;
        return acc;
      }, {})).map((m: any) => ({ ...m, 'Percentual de Desempenho (%)': Number(((m['Dias Bonificados (4/4)'] / m['Dias com Atividade']) * 100).toFixed(2)) }));

      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year, month,
        data: consolidado, detailGeral: detailRows,
        summary: `vFleet: Analisados ${consolidado.length} motoristas.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // --- PONTO ---
    if (pipelineType === 'ponto') {
      const includeSundays = formData.get('includeSundays') === 'true';
      const excludedDatesSet = new Set(JSON.parse(formData.get('excludedDates') as string || '[]'));
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(start);
      const agendaOficial = eachDayOfInterval({ start, end }).filter(d => {
        const f = format(d, 'dd/MM/yyyy');
        return !excludedDatesSet.has(f) && (includeSundays || !isSunday(d));
      }).map(d => format(d, 'dd/MM/yyyy'));

      const metaDias = agendaOficial.length;
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
            if (dt.split('/')[1] === month.toString().padStart(2, '0')) {
              rawData.push({ id, nome, data: dt, marcacoes: String(row[2] || ''), situacao: String(row[4] || '') });
            }
          }
        });
      }

      const detailRows: any[] = [];
      const colabMap: Record<string, any[]> = {};
      rawData.forEach(it => { const k = `${it.id}_${it.nome}`; if (!colabMap[k]) colabMap[k] = []; colabMap[k].push(it); });

      Object.entries(colabMap).forEach(([k, items]) => {
        const [id, nome] = k.split('_');
        items.sort((a,b) => parse(a.data, 'dd/MM/yyyy', new Date()).getTime() - parse(b.data, 'dd/MM/yyyy', new Date()).getTime());
        let diasCons = 0, lastDate: Date | null = null;
        items.forEach(it => {
          const currDate = parse(it.data, 'dd/MM/yyyy', new Date());
          if (lastDate && differenceInMinutes(currDate, lastDate) === 1440) diasCons++; else diasCons = 1;
          lastDate = currDate;
          const marc = it.marcacoes.split(' ').filter((m: string) => m.includes(':'));
          const e = marc[0] || "", sa = marc[1] || "", ra = marc[2] || "", s = marc[3] || "";
          const t1 = hmsToMinutes(e), t2 = hmsToMinutes(sa), t3 = hmsToMinutes(ra), t4 = hmsToMinutes(s);
          const tt = (t2-t1)+(t4-t3), ta = t3-t2;
          const okM = marc.length === 4, okJ = tt <= 560, okH = (tt-440) <= 120, okA = ta >= 60, okI = (t2-t1) <= 360 && (t4-t3) <= 360;
          const todosOk = okJ && okH && okA && okI;
          detailRows.push({
            'ID': id, 'Motorista': nome, 'Dia': it.data, 'Dia_Semana': format(currDate, 'EEEE'),
            'Entrada': e, 'Saida_Almoco': sa, 'Retorno_Almoco': ra, 'Saida': s,
            'Tem_Ajuste_Manual': it.marcacoes.includes('*') || excludedDatesSet.has(it.data) ? 'SIM' : 'NÃO',
            'Num_Ajustes': (it.marcacoes.match(/\*/g) || []).length, 'Tempo_Trabalhado': minutesToHms(tt), 'Tempo_Almoco': minutesToHms(ta),
            'Marcacoes_Completas': marc.length, 'Marcacoes_Faltantes': 4-marc.length, '✓ Marcacoes_100%': okM ? 'SIM' : 'NÃO',
            '💰 Bonus_Marcacoes': okM ? 1.60 : 0, 'Limite_Jornada': '09:20', 'Tempo_Trabalhado_Conf': minutesToHms(tt),
            'Excesso_Jornada': minutesToHms(Math.max(0, tt-560)), '✓ Jornada_OK': okJ ? 'SIM' : 'NÃO',
            'HE_Realizada': minutesToHms(Math.max(0, tt-440)), 'Excesso_HE': minutesToHms(Math.max(0, tt-440-120)), '✓ HE_OK': okH ? 'SIM' : 'NÃO',
            'Almoco_Realizado': minutesToHms(ta), 'Deficit_Almoco': minutesToHms(Math.max(0, 60-ta)), '✓ Almoco_OK': okA ? 'SIM' : 'NÃO',
            'Periodo_Manha': minutesToHms(t2-t1), 'Periodo_Tarde': minutesToHms(t4-t3), 'Excesso_Manha': minutesToHms(Math.max(0, (t2-t1)-360)),
            'Excesso_Tarde': minutesToHms(Math.max(0, (t4-t3)-360)), '✓ Intrajornada_OK': okI ? 'SIM' : 'NÃO',
            'Interjornada_Descanso': '11:00', 'Deficit_Interjornada': '00:00', '✓ Interjornada_OK': 'SIM',
            'Todos_5_Criterios_OK': todosOk ? 'SIM' : 'NÃO', '💰 Bonus_Criterios': todosOk ? 1.60 : 0,
            '💵 Bonificacao_Total_Dia': (okM ? 1.60 : 0) + (todosOk ? 1.60 : 0), 'Dias_Consecutivos': diasCons, 'Violou_DSR': diasCons >= 7 ? 'SIM' : 'NÃO'
          });
        });
      });

      const consolidado = Object.values(detailRows.reduce((acc: any, curr: any) => {
        if (!acc[curr.ID]) acc[curr.ID] = { ID: curr.ID, Motorista: curr.Motorista, Dias_Trabalhados: 0, '💰 Total_Bonus_Marcacoes': 0, '💰 Total_Bonus_Criterios': 0, '💵 BONIFICACAO_TOTAL': 0, 'Dias_Todos_Criterios_OK': 0, 'Dias_4_Marcacoes_Completas': 0, 'Dias_Violou_DSR': 0, 'Total_Ajustes_Manuais': 0 };
        acc[curr.ID].Dias_Trabalhados++;
        acc[curr.ID]['💰 Total_Bonus_Marcacoes'] += curr['💰 Bonus_Marcacoes'];
        acc[curr.ID]['💰 Total_Bonus_Criterios'] += curr['💰 Bonus_Criterios'];
        acc[curr.ID]['💵 BONIFICACAO_TOTAL'] += curr['💵 Bonificacao_Total_Dia'];
        if (curr.Todos_5_Criterios_OK === 'SIM') acc[curr.ID].Dias_Todos_Criterios_OK++;
        if (curr['✓ Marcacoes_100%'] === 'SIM') acc[curr.ID].Dias_4_Marcacoes_Completas++;
        if (curr.Violou_DSR === 'SIM') acc[curr.ID].Dias_Violou_DSR++;
        acc[curr.ID].Total_Ajustes_Manuais += curr.Num_Ajustes;
        return acc;
      }, {}));

      const absData = consolidado.map((c: any) => {
        const perc = Number(((c.Dias_Trabalhados / metaDias) * 100).toFixed(2));
        return { ID: c.ID, Nome: c.Motorista, Grupo: 'MOTORISTA', Total_Dias: metaDias, 'Presenças Físicas': c.Dias_Trabalhados, 'Atestados/Férias': 0, 'Abonos Manuais': excludedDatesSet.size, 'Total Presenças': c.Dias_Trabalhados + excludedDatesSet.size, Faltas: Math.max(0, metaDias-c.Dias_Trabalhados), 'Percentual (%)': perc, Valor_Incentivo: perc >= 100 ? 50 : perc >= 90 ? 40 : 0, Datas_Abonos_Manuais: Array.from(excludedDatesSet).join(', ') };
      });

      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year, month,
        data: consolidado, absenteismoData: absData, detailGeral: detailRows,
        summary: `Ponto: Processados ${consolidado.length} colaboradores.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Pipeline não implementado.');
  } catch (error: any) {
    console.error('Erro no Pipeline:', error);
    return { success: false, error: error.message };
  }
}
