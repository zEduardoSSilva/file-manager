'use server';

import { firebaseStore, PipelineResult } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday } from 'date-fns';

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
    // Converte serial do Excel para data JS (ajustando para o bug de 1900 do Excel)
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

    if (pipelineType === 'vfleet') {
      let vehicleBulletins: any[] = [];
      let alerts: any[] = [];
      const VFLEET_BONUS = 4.80;

      for (const file of files) {
        const buffer = await fileToBuffer(file);
        const name = file.name.toUpperCase();

        if (name.includes('BOLETIM')) {
          const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
          vehicleBulletins.push(...data);
        }
        else if (name.includes('ALERTAS') || name.includes('HISTORICO')) {
          const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
          const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
          alerts.push(...data);
        }
      }

      if (vehicleBulletins.length === 0) throw new Error('Boletim do Veículo não encontrado.');

      const dailyAnalysis: Record<string, any> = {};

      vehicleBulletins.forEach(row => {
        const placa = normalizePlate(row['PLACA']);
        const diaRaw = row['DIA'] || row['DATA'];
        if (!placa || !diaRaw) return;

        const dateStr = excelSerialToDateStr(diaRaw, year);
        
        let motorista = String(row['MOTORISTAS'] || row['MOTORISTA'] || '').split('-')[0].trim();
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

        dailyAnalysis[key].curvaBrusca += parseInt(row['CURVA BRUSCA'] || 0);
        dailyAnalysis[key].banguelaSegundos += hmsToSeconds(row['BANGUELA']);
        dailyAnalysis[key].ociosidadeSegundos += hmsToSeconds(row['PARADO LIGADO']);
      });

      alerts.forEach(alert => {
        const dataRaw = alert['DATA'] || alert['DIA'];
        if (!dataRaw) return;

        const dateStr = excelSerialToDateStr(dataRaw, year);
        const motorista = String(alert['MOTORISTA'] || '').trim();

        if (motorista && !motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO') && alert['TIPO'] === 'EXCESSO_VELOCIDADE') {
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
        const totalPresencas = presencasFisicas + 0; // Simplificado: sem atestados manuais aqui
        const faltas = Math.max(0, metaDias - totalPresencas);
        const percentual = Number(((totalPresencas / metaDias) * 100).toFixed(2));
        
        return {
          ID: c.ID,
          Nome: c.Motorista,
          Grupo: 'MOTORISTA',
          Total_Dias: metaDias,
          'Presenças Físicas': presencasFisicas,
          'Atestados/Férias': 0,
          'Abonos Manuais': 0,
          'Total Presenças': totalPresencas,
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