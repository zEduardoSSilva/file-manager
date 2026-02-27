'use server';

import { firebaseStore, DriverConsolidated, PipelineResult, AbsenteismoData } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format, isSunday, parse } from 'date-fns';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string };

// Helpers de Tempo
const h2m = (hStr: string | null | undefined): number | null => {
  if (!hStr || hStr.trim() === '') return null;
  try {
    const parts = hStr.replace('*', '').trim().split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } catch { return null; }
};

const m2h = (min: number | null | undefined): string => {
  if (min === null || min === undefined) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const normalizeDateStr = (dateStr: string, defaultYear: number): string => {
  const clean = dateStr.trim();
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})(\/\d{2,4})?$/);
  if (!match) return clean;
  
  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  let year = match[3] ? match[3].replace('/', '') : String(defaultYear);
  if (year.length === 2) year = `20${year}`;
  
  return `${day}/${month}/${year}`;
};

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function executePipeline(formData: FormData, pipelineType: 'vfleet' | 'performaxxi' | 'ponto'): Promise<PipelineResponse> {
  try {
    const rawYear = formData.get('year');
    const rawMonth = formData.get('month');
    const rawExcludedDates = formData.get('excludedDates');
    const rawIncludeSundays = formData.get('includeSundays');
    const files = formData.getAll('files') as File[];
    
    if (!rawYear || !rawMonth) throw new Error('Período ausente.');
    if (!files || files.length === 0) throw new Error('Nenhum arquivo enviado.');

    const year = parseInt(rawYear as string);
    const month = parseInt(rawMonth as string);
    const excludedDates: string[] = rawExcludedDates ? JSON.parse(rawExcludedDates as string) : [];
    const includeSundays = rawIncludeSundays === 'true';
    
    const colabMap: Record<string, { 
      id: string, 
      nome: string, 
      days: Record<string, any> 
    }> = {};

    const situacoesPresenca = ['FERIAS', 'FÉRIAS', 'ATESTADO', 'LICENCA', 'LICENÇA', 'ABONO', 'PRESENÇA', 'AUXILIO', 'AUXÍLIO', 'FALTA ABONADA'];

    // 1. Extração Bruta
    for (const file of files) {
      const buffer = await fileToBuffer(file);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];

      let currentId = '';
      let currentName = '';

      jsonData.forEach((row) => {
        const col0 = String(row[0] || '').trim();
        const col1 = String(row[1] || '').trim();
        const col2 = String(row[2] || '').trim();

        // Identificação do Colaborador
        if (/^\d+$/.test(col0) && !col0.includes('/') && col1.length > 5 && parseInt(col0) > 30) {
          currentId = col0;
          currentName = col1;
          if (!colabMap[currentId]) colabMap[currentId] = { id: currentId, nome: currentName, days: {} };
        }

        const dateMatch = col0.match(/^(\d{1,2})\/(\d{1,2})(\/\d{2,4})?$/);
        if (currentId && dateMatch) {
          const rowMonth = parseInt(dateMatch[2]);
          if (rowMonth === month) {
            const dateStr = normalizeDateStr(col0, year);
            const timesStr = col2.trim();
            const times = timesStr.split(/\s+/).filter(t => t.includes(':'));
            const manualCount = (timesStr.match(/\*/g) || []).length;
            
            let situacao = '';
            for (let i = 3; i < row.length; i++) {
              const val = String(row[i] || '').trim();
              if (val && !/^\d+$/.test(val) && !val.includes(':') && val.length > 2) {
                situacao = val.toUpperCase();
                break;
              }
            }

            const existing = colabMap[currentId].days[dateStr];
            // Score de deduplicação: prioriza o registro com mais batidas
            if (!existing || times.length >= (existing.score || 0)) {
              colabMap[currentId].days[dateStr] = {
                data: dateStr,
                diaSemana: col1,
                marcacoes: times,
                ajustes: manualCount,
                situacao: situacao,
                score: times.length
              };
            }
          }
        }
      });
    }

    // 2. Processamento
    const detalhePonto: any[] = [];
    const consolidado: any[] = [];
    const absenteismo: AbsenteismoData[] = [];

    // Datas únicas no mês para cálculo de dias úteis base (Denominador)
    const allDatesInMonth = new Set<string>();
    Object.values(colabMap).forEach(c => Object.keys(c.days).forEach(d => allDatesInMonth.add(d)));
    
    // Filtrar domingos e feriados (excluídos) da base de cálculo (Agenda Oficial do Mês)
    const agendaOficial = Array.from(allDatesInMonth).filter(dStr => {
      const date = parse(dStr, 'dd/MM/yyyy', new Date());
      const isExcl = excludedDates.includes(dStr);
      const isSun = isSunday(date);
      
      if (isExcl) return false;
      if (!includeSundays && isSun) return false;
      
      return true;
    });
    
    const totalWorkingDays = agendaOficial.length || 26;

    const MOT_VAL = 1.60;
    const AJU_VAL = 2.40;

    Object.values(colabMap).forEach(colab => {
      const isAjudante = colab.nome.toUpperCase().includes('AJUDANTE');
      const valMarc = isAjudante ? AJU_VAL : MOT_VAL;
      const valCrit = isAjudante ? AJU_VAL : MOT_VAL;

      const sortedDates = Object.keys(colab.days).sort((a, b) => {
        const [d1, m1, y1] = a.split('/').map(Number);
        const [d2, m2, y2] = b.split('/').map(Number);
        return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
      });

      let stats = {
        diasTrabalhados: 0,
        bonusMarc: 0,
        bonusCrit: 0,
        critOkCount: 0,
        marcOkCount: 0,
        ajustesTotais: 0,
        presencasFisicas: 0,
        presencasJustificadas: 0,
        presencasDentroAgenda: 0
      };

      let lastExit: number | null = null;
      let consecutiveDays = 0;

      sortedDates.forEach((dStr) => {
        const d = colab.days[dStr];
        const dateObj = parse(dStr, 'dd/MM/yyyy', new Date());
        const isExcl = excludedDates.includes(dStr);
        const isSun = isSunday(dateObj);
        const estaNaAgenda = agendaOficial.includes(dStr);

        // Lógica de trabalho (Horários)
        const e = h2m(d.marcacoes[0]);
        const sa = h2m(d.marcacoes[1]);
        const ra = h2m(d.marcacoes[2]);
        const s = h2m(d.marcacoes[3]);

        let tempoTrabalhado: number | null = null;
        let tempoAlmoco: number | null = null;
        if (e !== null && s !== null) {
          let total = s - e; if (total < 0) total += 1440;
          let almoco = 0;
          if (sa !== null && ra !== null) {
            almoco = ra - sa; if (almoco < 0) almoco += 1440;
          }
          tempoTrabalhado = total - almoco;
          tempoAlmoco = almoco;
        }

        const marcOk = d.marcacoes.length >= 4;
        const jornadaOk = tempoTrabalhado !== null ? tempoTrabalhado <= 560 : false;
        const heOk = tempoTrabalhado !== null ? (Math.max(0, tempoTrabalhado - 440) <= 120) : true;
        const almocoOk = tempoAlmoco !== null ? tempoAlmoco >= 60 : false;
        
        let pm = 0, pt = 0;
        if (e !== null && sa !== null) { pm = sa - e; if (pm < 0) pm += 1440; }
        if (ra !== null && s !== null) { pt = s - ra; if (pt < 0) pt += 1440; }
        const intraOk = pm <= 360 && pt <= 360;

        let interDescanso: number | null = null;
        if (lastExit !== null && e !== null) {
          interDescanso = e - lastExit;
          if (interDescanso < 0) interDescanso += 1440;
        }
        const interOk = interDescanso !== null ? interDescanso >= 660 : true;

        const todosCritOk = marcOk && jornadaOk && heOk && almocoOk && intraOk && interOk;
        const isPresencaJust = situacoesPresenca.some(sit => d.situacao.includes(sit));
        const hasPhysActivity = d.marcacoes.length > 0;

        // Se o dia está na agenda oficial ou teve atividade física, processamos
        if (hasPhysActivity) {
          stats.presencasFisicas++;
          stats.bonusMarc += (marcOk ? valMarc : 0);
          stats.bonusCrit += (todosCritOk ? valCrit : 0);
          if (todosCritOk) stats.critOkCount++;
          if (marcOk) stats.marcOkCount++;
          stats.ajustesTotais += d.ajustes;
          stats.diasTrabalhados++;
          if (estaNaAgenda) stats.presencasDentroAgenda++;
        } else if (isPresencaJust && estaNaAgenda) {
          stats.presencasJustificadas++;
          stats.presencasDentroAgenda++;
        }

        detalhePonto.push({
          'ID': colab.id,
          'Motorista': colab.nome,
          'Dia': dStr,
          'Dia_Semana': d.diaSemana,
          'Entrada': d.marcacoes[0] || '',
          'Saida_Almoco': d.marcacoes[1] || '',
          'Retorno_Almoco': d.marcacoes[2] || '',
          'Saida': d.marcacoes[3] || '',
          'Tem_Ajuste_Manual': (d.ajustes > 0 || isExcl) ? 'SIM' : 'NÃO',
          'Num_Ajustes': d.ajustes,
          'Tempo_Trabalhado': m2h(tempoTrabalhado),
          'Tempo_Almoco': m2h(tempoAlmoco),
          'Marcacoes_Completas': d.marcacoes.length,
          'Marcacoes_Faltantes': Math.max(0, 4 - d.marcacoes.length),
          '✓ Marcacoes_100%': marcOk ? 'SIM' : 'NÃO',
          '💰 Bonus_Marcacoes': (marcOk ? valMarc : 0).toFixed(2),
          'Limite_Jornada': '09:20',
          'Tempo_Trabalhado_Conf': m2h(tempoTrabalhado),
          'Excesso_Jornada': tempoTrabalhado && tempoTrabalhado > 560 ? m2h(tempoTrabalhado - 560) : '00:00',
          '✓ Jornada_OK': jornadaOk ? 'SIM' : 'NÃO',
          'HE_Realizada': tempoTrabalhado ? m2h(Math.max(0, tempoTrabalhado - 440)) : '00:00',
          'Excesso_HE': tempoTrabalhado && tempoTrabalhado > 560 ? m2h(tempoTrabalhado - 560) : '00:00',
          '✓ HE_OK': heOk ? 'SIM' : 'NÃO',
          'Almoco_Realizado': m2h(tempoAlmoco),
          'Deficit_Almoco': tempoAlmoco && tempoAlmoco < 60 ? m2h(60 - tempoAlmoco) : '00:00',
          '✓ Almoco_OK': almocoOk ? 'SIM' : 'NÃO',
          'Periodo_Manha': m2h(pm),
          'Periodo_Tarde': m2h(pt),
          'Excesso_Manha': pm > 360 ? m2h(pm - 360) : '00:00',
          'Excesso_Tarde': pt > 360 ? m2h(pt - 360) : '00:00',
          '✓ Intrajornada_OK': intraOk ? 'SIM' : 'NÃO',
          'Interjornada_Descanso': m2h(interDescanso),
          'Deficit_Interjornada': interDescanso && interDescanso < 660 ? m2h(660 - interDescanso) : '00:00',
          '✓ Interjornada_OK': interOk ? 'SIM' : 'NÃO',
          'Todos_5_Criterios_OK': todosCritOk ? 'SIM' : 'NÃO',
          '💰 Bonus_Criterios': (todosCritOk ? valCrit : 0).toFixed(2),
          '💵 Bonificacao_Total_Dia': ((marcOk ? valMarc : 0) + (todosCritOk ? valCrit : 0)).toFixed(2),
          'Dias_Consecutivos': 0, // Placeholder para lógica de DSR futura se necessário
          'Violou_DSR': 'NÃO'
        });

        lastExit = s;
      });

      if (stats.diasTrabalhados > 0 || stats.presencasJustificadas > 0) {
        consolidado.push({
          'ID': colab.id,
          'Motorista': colab.nome,
          'Dias_Trabalhados': stats.diasTrabalhados,
          '💰 Total_Bonus_Marcacoes': Number(stats.bonusMarc.toFixed(2)),
          '💰 Total_Bonus_Criterios': Number(stats.bonusCrit.toFixed(2)),
          '💵 BONIFICACAO_TOTAL': Number((stats.bonusMarc + stats.bonusCrit).toFixed(2)),
          'Dias_Todos_Criterios_OK': stats.critOkCount,
          'Dias_4_Marcacoes_Completas': stats.marcOkCount,
          'Dias_Violou_DSR': 0,
          'Total_Ajustes_Manuais': stats.ajustesTotais
        });

        const perc = Number(((stats.presencasDentroAgenda / totalWorkingDays) * 100).toFixed(2));
        const faltas = Math.max(0, totalWorkingDays - stats.presencasDentroAgenda);

        absenteismo.push({
          'ID': colab.id,
          'Nome': colab.nome,
          'Grupo': isAjudante ? 'Ajudante' : 'Motorista',
          'Total_Dias': totalWorkingDays,
          'Presenças Físicas': stats.presencasFisicas,
          'Atestados/Férias': stats.presencasJustificadas,
          'Abonos Manuais': excludedDates.length,
          'Total Presenças': stats.presencasDentroAgenda,
          'Faltas': faltas,
          'Percentual (%)': perc,
          'Valor_Incentivo': perc >= 100 ? 50 : perc >= 90 ? 40 : perc >= 75 ? 25 : 0,
          'Datas_Abonos_Manuais': excludedDates.length > 0 ? excludedDates.join(', ') : '-'
        });
      }
    });

    const saved = await firebaseStore.saveResult(pipelineType, {
      pipelineType,
      timestamp: Date.now(),
      year,
      month,
      data: consolidado,
      absenteismoData: absenteismo,
      detalhePonto,
      summary: `Processamento concluído. ${consolidado.length} colaboradores analisados. Base de dias úteis (Denominador): ${totalWorkingDays}. Feriados/Abonos: ${excludedDates.length}.`
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };
  } catch (error: any) {
    console.error('Erro no Pipeline:', error);
    return { success: false, error: error.message };
  }
}
