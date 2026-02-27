
'use server';

import { firebaseStore, PipelineResult } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday, parse } from 'date-fns';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string };

// Helpers de Normalização
const normalizePlate = (plate: any): string => {
  if (!plate) return "";
  return String(plate).toUpperCase().replace(/[^A-Z0-9]/g, "");
};

const normalizeDateStr = (dateStr: string, defaultYear: number): string => {
  const clean = String(dateStr).trim();
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})(\/\d{2,4})?$/);
  if (!match) return clean;
  
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  let year = match[3] ? match[3].replace('/', '') : String(defaultYear);
  if (year.length === 2) year = `20${year}`;
  
  return `${day}/${month}/${year}`;
};

const excelSerialToDateStr = (serial: any, defaultYear: number): string => {
  if (typeof serial === 'number' && serial > 30000 && serial < 60000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return format(date, 'dd/MM/yyyy');
  }
  if (serial instanceof Date) return format(serial, 'dd/MM/yyyy');
  return normalizeDateStr(String(serial || ""), defaultYear);
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

    if (pipelineType === 'performaxxi') {
      let rawData: any[] = [];
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;
      const CRITERIOS_TOTAL = 4;

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet) as any[];
        rawData.push(...data);
      }

      // Filtrar StandBy
      const baseDados = rawData.filter(row => {
        const statusCol = findCol(row, ['status_rota', 'status_da_rota', 'status']);
        const status = String(row[statusCol || ''] || '').toUpperCase();
        return status !== 'STANDBY';
      });

      const analisarGrupo = (grupoTipo: 'Motorista' | 'Ajudante') => {
        const colNomeCand = grupoTipo === 'Motorista' ? ['nome_motorista', 'motorista'] : ['nome_primeiro_ajudante', 'nome_segundo_ajudante', 'ajudante'];
        const baseValor = grupoTipo === 'Motorista' ? MOT_BASE : AJU_BASE;
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
              Nome: nome,
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

          const item: any = {
            'Empresa': d.Empresa,
            'Dia': d.Dia,
            'Total de Pedidos': d.Total_Pedidos,
            'Peso Pedido Dia (Kg)': d.Peso_Total.toFixed(2),
            'Peso Devolvido Dia (Kg)': d.Peso_Devolvido.toFixed(2),
            '% Devolvido Dia': d.Peso_Total > 0 ? ((d.Peso_Devolvido / d.Peso_Total) * 100).toFixed(2) : '0.00',
            'Pedidos Raio OK': d.Raio_OK,
            '% Raio': pRaio,
            'Pedidos SLA OK': d.SLA_OK,
            '% SLA': pSla,
            'Pedidos Tempo OK': d.Tempo_OK,
            '% Tempo': pTempo,
            'Pedidos Sequência OK': d.Seq_OK,
            '% Sequência': pSeq,
            'Critérios Cumpridos (de 4)': cumpridos,
            'Critérios Falhados': 4 - cumpridos,
            'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
            '% Bonificação': (cumpridos / 4 * 100).toFixed(2),
          };
          
          item[grupoTipo] = d.Nome;
          item[`✓ Raio ≥70%`] = cRaio ? 'SIM' : 'NÃO';
          item[`✓ SLA ≥80%`] = cSla ? 'SIM' : 'NÃO';
          item[`✓ Tempo ≥100%`] = cTempo ? 'SIM' : 'NÃO';
          item[`✓ Sequência ≥0%`] = cSeq ? 'SIM' : 'NÃO';
          item[`Bonificação ${grupoTipo} (R$)`] = bonus;

          return item;
        });

        const consolidado = Object.values(detalhe.reduce((acc: any, curr: any) => {
          const nome = curr[grupoTipo];
          if (!acc[nome]) {
            acc[nome] = {
              'Empresa': curr.Empresa,
              'Dias com Atividade': 0,
              'Dias Bonif. Máxima (4/4)': 0,
              'Total Bonificação (R$)': 0,
              'Total Critérios Cumpridos': 0,
              'Falhas Raio': 0,
              'Falhas SLA': 0,
              'Falhas Tempo': 0,
              'Falhas Sequência': 0
            };
            acc[nome][grupoTipo] = nome;
          }
          acc[nome]['Dias com Atividade']++;
          if (curr['Dia Bonificação Máxima (4/4)'] === 'SIM') acc[nome]['Dias Bonif. Máxima (4/4)']++;
          acc[nome]['Total Bonificação (R$)'] += curr[`Bonificação ${grupoTipo} (R$)` || 0];
          acc[nome]['Total Critérios Cumpridos'] += curr['Critérios Cumpridos (de 4)'];
          if (curr[`✓ Raio ≥70%`] === 'NÃO') acc[nome]['Falhas Raio']++;
          if (curr[`✓ SLA ≥80%`] === 'NÃO') acc[nome]['Falhas SLA']++;
          if (curr[`✓ Tempo ≥100%`] === 'NÃO') acc[nome]['Falhas Tempo']++;
          if (curr[`✓ Sequência ≥0%`] === 'NÃO') acc[nome]['Falhas Sequência']++;
          return acc;
        }, {})).map((m: any) => ({
          ...m,
          'Percentual de Desempenho (%)': Number(((m['Total Critérios Cumpridos'] / (m['Dias com Atividade'] * 4)) * 100).toFixed(2))
        }));

        return { detalhe, consolidado };
      };

      const resMot = analisar_Grupo('Motorista');
      const resAju = analisar_Grupo('Ajudante');

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi',
        timestamp: Date.now(),
        year, month,
        data: resMot.consolidado as any,
        detalhePonto: resMot.detalhe,
        helpersData: resAju.consolidado as any,
        helpersDetail: resAju.detalhe,
        summary: `Performaxxi: Analisados ${resMot.consolidado.length} motoristas e ${resAju.consolidado.length} ajudantes.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    if (pipelineType === 'vfleet') {
      let vehicleBulletins: any[] = [];
      let alerts: any[] = [];
      const VFLEET_BONUS = 4.80;

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const name = file.name.toUpperCase();

        if (name.includes('BOLETIM')) {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
          vehicleBulletins.push(...data);
        }
        else if (name.includes('ALERTAS') || name.includes('HISTORICO')) {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
          alerts.push(...data);
        }
      }

      if (vehicleBulletins.length === 0) throw new Error('Boletim do Veículo não encontrado.');

      const dailyAnalysis: Record<string, any> = {};

      vehicleBulletins.forEach(row => {
        const placaCol = findCol(row, ['PLACA']);
        const diaCol = findCol(row, ['DIA', 'DATA']);
        const motCol = findCol(row, ['MOTORISTAS', 'MOTORISTA']);
        const curvaCol = findCol(row, ['CURVA BRUSCA']);
        const banguelaCol = findCol(row, ['BANGUELA']);
        const paradoCol = findCol(row, ['PARADO LIGADO']);

        const placa = normalizePlate(row[placaCol || '']);
        const diaRaw = row[diaCol || ''];
        if (!placa || !diaRaw) return;

        const dateStr = excelSerialToDateStr(diaRaw, year);
        let motorista = String(row[motCol || ''] || '').split('-')[0].trim();
        if (!motorista || motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO')) return;

        const key = `${motorista}_${dateStr}`;
        if (!dailyAnalysis[key]) {
          dailyAnalysis[key] = {
            motorista,
            dia: dateStr,
            curvaBrusca: 0,
            banguelaSegundos: 0,
            ociosidadeSegundos: 0,
            excessosVelocidade: 0
          };
        }

        dailyAnalysis[key].curvaBrusca += parseInt(row[curvaCol || ''] || 0);
        dailyAnalysis[key].banguelaSegundos += hmsToSeconds(row[banguelaCol || '']);
        dailyAnalysis[key].ociosidadeSegundos += hmsToSeconds(row[paradoCol || '']);
      });

      alerts.forEach(alert => {
        const dataCol = findCol(alert, ['DATA', 'DIA']);
        const motCol = findCol(alert, ['MOTORISTA']);
        const tipoCol = findCol(alert, ['TIPO']);

        const dataRaw = alert[dataCol || ''];
        if (!dataRaw) return;

        const dateStr = excelSerialToDateStr(dataRaw, year);
        const motorista = String(alert[motCol || ''] || '').trim();

        if (motorista && !motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO') && String(alert[tipoCol || '']).includes('VELOCIDADE')) {
          const key = `${motorista}_${dateStr}`;
          if (dailyAnalysis[key]) {
            dailyAnalysis[key].excessosVelocidade++;
          }
        }
      });

      const detailRows = Object.values(dailyAnalysis).map(d => {
        const condCurva = d.curvaBrusca === 0;
        const condBanguela = d.banguelaSegundos === 0;
        const condOciosidade = d.ociosidadeSegundos === 0;
        const condVelocidade = d.excessosVelocidade === 0;
        const todosOk = condCurva && condBanguela && condOciosidade && condVelocidade;

        return {
          'Motorista': d.motorista,
          'Dia': d.dia,
          '✓ Curva 100%': condCurva ? 'SIM' : 'NÃO',
          '✓ Banguela 100%': condBanguela ? 'SIM' : 'NÃO',
          '✓ Ociosidade 100%': condOciosidade ? 'SIM' : 'NÃO',
          '✓ Sem Excesso Velocidade': condVelocidade ? 'SIM' : 'NÃO',
          'Dia Bonificado': todosOk ? 'SIM' : 'NÃO',
          'Bonificacao Conducao (R$)': todosOk ? VFLEET_BONUS : 0,
          'Total Eventos Curva': d.curvaBrusca,
          'Total Banguela (seg)': d.banguelaSegundos,
          'Total Ociosidade (seg)': d.ociosidadeSegundos
        };
      });

      const consolidado = Object.values(
        detailRows.reduce((acc: any, curr: any) => {
          if (!acc[curr.Motorista]) {
            acc[curr.Motorista] = {
              'Motorista': curr.Motorista,
              'Dias com Atividade': 0,
              'Dias Bonificados (4/4)': 0,
              'Total Bonificação (R$)': 0,
              'Falhas Curva Brusca': 0,
              'Falhas Banguela': 0,
              'Falhas Ociosidade': 0,
              'Falhas Exc. Velocidade': 0
            };
          }
          acc[curr.Motorista]['Dias com Atividade']++;
          if (curr['Dia Bonificado'] === 'SIM') acc[curr.Motorista]['Dias Bonificados (4/4)']++;
          acc[curr.Motorista]['Total Bonificação (R$)'] += curr['Bonificacao Conducao (R$)'];
          if (curr['✓ Curva 100%'] === 'NÃO') acc[curr.Motorista]['Falhas Curva Brusca']++;
          if (curr['✓ Banguela 100%'] === 'NÃO') acc[curr.Motorista]['Falhas Banguela']++;
          if (curr['✓ Ociosidade 100%'] === 'NÃO') acc[curr.Motorista]['Falhas Ociosidade']++;
          if (curr['✓ Sem Excesso Velocidade'] === 'NÃO') acc[curr.Motorista]['Falhas Exc. Velocidade']++;
          return acc;
        }, {})
      ).map((m: any) => ({
        ...m,
        'Percentual de Desempenho (%)': Number(((m['Dias Bonificados (4/4)'] / m['Dias com Atividade']) * 100).toFixed(2))
      }));

      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet',
        timestamp: Date.now(),
        year, month,
        data: consolidado as any,
        detalhePonto: detailRows,
        summary: `vFleet: Analisados ${consolidado.length} motoristas a partir do Boletim e Alertas.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    if (pipelineType === 'ponto') {
      const includeSundays = formData.get('includeSundays') === 'true';
      const excludedDatesStr = formData.get('excludedDates') as string;
      const excludedDatesSet = new Set(JSON.parse(excludedDatesStr || '[]'));
      
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(start);
      const agendaOficial = eachDayOfInterval({ start, end })
        .filter(d => {
          const formatted = format(d, 'dd/MM/yyyy');
          if (excludedDatesSet.has(formatted)) return false;
          if (!includeSundays && isSunday(d)) return false;
          return true;
        })
        .map(d => format(d, 'dd/MM/yyyy'));

      const metaDias = agendaOficial.length;
      let rawData: any[] = [];

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        let currentId = '';
        let currentName = '';

        for (const row of data) {
          const col0 = String(row[0] || '').trim();
          const col1 = String(row[1] || '').trim();

          if (col0 && /^\d+$/.test(col0) && col1 && col1.length > 5 && !col0.includes('/')) {
            currentId = col0;
            currentName = col1;
            continue;
          }

          if (currentId && col0 && col0.includes('/')) {
            const dateStr = excelSerialToDateStr(row[0], year);
            if (dateStr.split('/')[1] === month.toString().padStart(2, '0')) {
              rawData.push({
                id: currentId,
                nome: currentName,
                data: dateStr,
                marcacoes: String(row[2] || ''),
                situacao: String(row[4] || '')
              });
            }
          }
        }
      }

      const consolidado = Object.values(rawData.reduce((acc: any, curr: any) => {
        const key = `${curr.id}_${curr.nome}`;
        if (!acc[key]) {
          acc[key] = { 
            ID: curr.id, 
            Motorista: curr.nome, 
            Dias_Trabalhados: 0, 
            '💰 Total_Bonus_Marcacoes': 0,
            '💰 Total_Bonus_Criterios': 0,
            '💵 BONIFICACAO_TOTAL': 0,
            'Dias_Todos_Criterios_OK': 0,
            'Dias_4_Marcacoes_Completas': 0,
            'Dias_Violou_DSR': 0,
            'Total_Ajustes_Manuais': 0,
            presencasNoMes: new Set()
          };
        }
        
        const marcList = curr.marcacoes.split(' ').filter((m: string) => m.includes(':'));
        const ok = marcList.length === 4;
        const bonus = ok ? 1.60 : 0;
        
        acc[key].Dias_Trabalhados++;
        if (ok) acc[key].Dias_4_Marcacoes_Completas++;
        acc[key]['💰 Total_Bonus_Marcacoes'] += bonus;
        acc[key]['💵 BONIFICACAO_TOTAL'] += (bonus + (ok ? 1.60 : 0));
        acc[key].presencasNoMes.add(curr.data);
        
        return acc;
      }, {}));

      const absData = consolidado.map((c: any) => {
        const presencasFisicas = c.presencasNoMes.size;
        const totalPresencas = presencasFisicas + (excludedDatesSet.size); // Simplificado
        const faltas = Math.max(0, metaDias - presencasFisicas);
        const percentual = Number(((presencasFisicas / metaDias) * 100).toFixed(2));
        
        return {
          ID: c.ID,
          Nome: c.Motorista,
          Grupo: 'MOTORISTA',
          Total_Dias: metaDias,
          'Presenças Físicas': presencasFisicas,
          'Atestados/Férias': 0,
          'Abonos Manuais': excludedDatesSet.size,
          'Total Presenças': presencasFisicas,
          Faltas: faltas,
          'Percentual (%)': percentual,
          Valor_Incentivo: percentual >= 100 ? 50 : percentual >= 90 ? 40 : 0,
          Datas_Abonos_Manuais: Array.from(excludedDatesSet).join(', ') || '-'
        };
      });

      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto',
        timestamp: Date.now(),
        year, month,
        data: consolidado,
        absenteismoData: absData,
        summary: `Ponto: Processados ${consolidado.length} colaboradores para o mês de ${month}/${year}.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Pipeline não implementado.');
  } catch (error: any) {
    console.error('Erro no Pipeline:', error);
    return { success: false, error: error.message };
  }
}
