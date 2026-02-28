
'use server';

import { firebaseStore, PipelineResult } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export type PipelineResponse = 
  | { success: true; result: PipelineResult }
  | { success: false; error: string };

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

      if (baseDados.length === 0) throw new Error('Nenhum dado válido após filtrar StandBy.');

      const sample = baseDados[0];
      const colEmpresa = findCol(sample, ['empresa', 'deposito']) || 'Empresa';
      const colData = findCol(sample, ['data_rota', 'data']) || 'Data';
      const colDist = findCol(sample, ['distancia_cliente_metros', 'distancia']) || 'Distancia';
      const colSla = findCol(sample, ['sla_janela_atendimento', 'sla']) || 'SLA';
      const colChegada = findCol(sample, ['chegada_cliente_realizado', 'chegada']) || 'Chegada';
      const colFim = findCol(sample, ['fim_atendimento_cliente_realizado', 'fim_atendimento']) || 'Fim';
      const colPeso = findCol(sample, ['peso_pedido', 'peso']) || 'Peso';
      const colOc = findCol(sample, ['descricao_ocorrencia', 'ocorrencia']) || 'Ocorrencia';
      const colMot = findCol(sample, ['nome_motorista', 'motorista']) || 'Motorista';
      const colAju = findCol(sample, ['nome_primeiro_ajudante', 'ajudante']) || 'Ajudante';

      const processarEquipe = (tipo: 'MOTORISTA' | 'AJUDANTE') => {
        const colNome = tipo === 'MOTORISTA' ? colMot : colAju;
        const valorBase = tipo === 'MOTORISTA' ? MOT_BASE : AJU_BASE;
        const valorCriterio = valorBase / 4;
        const dailyMap: Record<string, any> = {};

        baseDados.forEach(row => {
          const nome = String(row[colNome] || '').trim();
          if (!nome || nome === 'N.R.' || nome === '0') return;

          const dtStr = excelSerialToDateStr(row[colData], year);
          if (!dtStr) return;
          const key = `${nome}_${dtStr}`;

          if (!dailyMap[key]) {
            dailyMap[key] = {
              Empresa: String(row[colEmpresa] || 'N/A'), Funcionario: nome, Cargo: tipo, Dia: dtStr,
              Total_Pedidos: 0, Raio_OK: 0, SLA_OK: 0, Tempo_OK: 0, Seq_OK: 0, Peso_Total: 0, Peso_Devolvido: 0
            };
          }

          dailyMap[key].Total_Pedidos++;
          if (toFloat(row[colDist]) <= 100) dailyMap[key].Raio_OK++;
          if (String(row[colSla] || '').toUpperCase().includes('SIM')) dailyMap[key].SLA_OK++;
          
          const t1 = hmsToSeconds(row[colChegada]);
          const t2 = hmsToSeconds(row[colFim]);
          if (t2 - t1 >= 60) dailyMap[key].Tempo_OK++;

          const sP = String(row['sequencia_entrega_planejado'] || '');
          const sR = String(row['sequencia_entrega_realizado'] || '');
          if (sP === sR && sP !== '') dailyMap[key].Seq_OK++;

          const p = toFloat(row[colPeso]);
          dailyMap[key].Peso_Total += p;
          if (String(row[colOc] || '').trim() !== '' && String(row[colOc]).toUpperCase() !== 'NULL') dailyMap[key].Peso_Devolvido += p;
        });

        return Object.values(dailyMap).map(d => {
          const pR = Number(((d.Raio_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pS = Number(((d.SLA_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pT = Number(((d.Tempo_OK / d.Total_Pedidos) * 100).toFixed(2));
          const pSeq = Number(((d.Seq_OK / d.Total_Pedidos) * 100).toFixed(2));

          const cR = pR >= 70;
          const cS = pS >= 80;
          const cT = pT >= 100;
          const cSeq = pSeq >= 0;

          const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + (cSeq ? 1 : 0);
          
          return {
            'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 'Dia': d.Dia,
            'Total de Pedidos': d.Total_Pedidos, 'Peso Pedido Dia (Kg)': Number(d.Peso_Total.toFixed(2)),
            'Peso Devolvido Dia (Kg)': Number(d.Peso_Devolvido.toFixed(2)),
            '% Devolvido Dia': d.Peso_Total > 0 ? Number(((d.Peso_Devolvido / d.Peso_Total) * 100).toFixed(2)) : 0,
            'Pedidos Raio OK': d.Raio_OK, '% Raio': pR, '✓ Raio ≥70.0%': cR ? 'SIM' : 'NÃO',
            'Pedidos SLA OK': d.SLA_OK, '% SLA': pS, '✓ SLA ≥80.0%': cS ? 'SIM' : 'NÃO',
            'Pedidos Tempo OK': d.Tempo_OK, '% Tempo': pT, '✓ Tempo ≥100.0%': cT ? 'SIM' : 'NÃO',
            'Pedidos Sequência OK': d.Seq_OK, '% Sequência': pSeq, '✓ Sequência ≥0.0%': cSeq ? 'SIM' : 'NÃO',
            'Critérios Cumpridos (de 4)': cumpridos, 'Critérios Falhados': 4 - cumpridos,
            'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
            '% Bonificação': Number((cumpridos / 4 * 100).toFixed(2)),
            'Bonificação Funcionario (R$)': Number((cumpridos * valorCriterio).toFixed(2))
          };
        });
      };

      const detalheUnificado = [...processarEquipe('MOTORISTA'), ...processarEquipe('AJUDANTE')];

      const consolidadoUnificado = Object.values(detalheUnificado.reduce((acc: any, curr: any) => {
        const key = `${curr.Funcionario}_${curr.Cargo}`;
        if (!acc[key]) {
          acc[key] = {
            'Empresa': curr.Empresa, 'Funcionario': curr.Funcionario, 'Cargo': curr.Cargo, 
            'Dias com Atividade': 0, 'Dias Bonif. Máxima (4/4)': 0, 'Total Bonificação (R$)': 0, 
            'Total Critérios Cumpridos': 0, 'Falhas Raio': 0, 'Falhas SLA': 0, 'Falhas Tempo': 0, 'Falhas Sequência': 0
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
        pipelineType: 'performaxxi', timestamp: Date.now(), year, month,
        data: consolidadoUnificado, detalheGeral: detalheUnificado,
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
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
        if (file.name.toUpperCase().includes('BOLETIM')) bulletins.push(...sheet);
        else alerts.push(...sheet);
      }

      const dailyAnalysis: Record<string, any> = {};
      bulletins.forEach(row => {
        const dt = excelSerialToDateStr(row['DIA'] || row['DATA'], year);
        if (!dt) return;
        const motorista = String(row['MOTORISTAS'] || '').split('-')[0].trim();
        if (!motorista || motorista.toUpperCase().includes('SEM IDENTIFICAÇÃO')) return;
        const key = `${motorista}_${dt}`;
        if (!dailyAnalysis[key]) dailyAnalysis[key] = { motorista, dia: dt, curva: 0, banguela: 0, ociosidade: 0, velocidade: 0 };
        dailyAnalysis[key].curva += parseInt(row['CURVA BRUSCA'] || 0);
        dailyAnalysis[key].banguela += hmsToSeconds(row['BANGUELA']);
        dailyAnalysis[key].ociosidade += hmsToSeconds(row['PARADO LIGADO']);
      });

      alerts.forEach(alert => {
        const dt = excelSerialToDateStr(alert['DATA'] || alert['DIA'], year);
        const mot = String(alert['MOTORISTA'] || '').trim();
        if (mot && dailyAnalysis[`${mot}_${dt}`] && String(alert['TIPO']).includes('VELOCIDADE')) dailyAnalysis[`${mot}_${dt}`].velocidade++;
      });

      const detailRows = Object.values(dailyAnalysis).map(d => {
        const ok = d.curva === 0 && d.banguela === 0 && d.ociosidade === 0 && d.velocidade === 0;
        return { 'Motorista': d.motorista, 'Dia': d.dia, 'Dia Bonificado': ok ? 'SIM' : 'NÃO', 'Bonificação Condução (R$)': ok ? VFLEET_BONUS : 0 };
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
      let rawData: any[] = [];
      for (const file of files) {
        const workbook = XLSX.read(await fileToBuffer(file), { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
        let id = '', nome = '';
        data.forEach(row => {
          const c0 = String(row[0] || '').trim(), c1 = String(row[1] || '').trim();
          if (c0 && /^\d+$/.test(c0) && c1.length > 5) { id = c0; nome = c1; }
          else if (id && c0.includes('/')) {
            const dt = excelSerialToDateStr(row[0], year);
            if (dt.split('/')[1] === month.toString().padStart(2, '0')) rawData.push({ id, nome, data: dt });
          }
        });
      }

      const consolidado = Object.values(rawData.reduce((acc: any, curr: any) => {
        const k = `${curr.id}_${curr.nome}`;
        if (!acc[k]) acc[k] = { ID: curr.id, Funcionario: curr.nome, 'Dias com Atividade': 0, 'Total Bonificação (R$)': 0 };
        acc[k]['Dias com Atividade']++;
        return acc;
      }, {}));

      const absData = consolidado.map((c: any) => ({
        ID: c.ID, Nome: c.Funcionario, Total_Dias: 26, 'Total Presenças': c['Dias com Atividade'], 
        Faltas: Math.max(0, 26 - c['Dias com Atividade']), 'Percentual (%)': Number(((c['Dias com Atividade'] / 26) * 100).toFixed(2)), Valor_Incentivo: 0
      }));

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
