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

// Encontra coluna por nome parcial (case-insensitive)
const findCol = (row: any, candidates: string[]): any => {
  const keys = Object.keys(row);
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
        const buffer   = await fileToBuffer(file);

        // Lê apenas os dados crus — sem parsear datas automaticamente (mais rápido)
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const data     = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];

        if (data.length === 0) throw new Error(`Arquivo "${file.name}" está vazio ou não contém dados na 1ª aba.`);

        // Log de colunas disponíveis para debug (retornado na resposta)
        const sampleCols = Object.keys(data[0] || {});
        console.log(`[Performaxxi] Colunas detectadas (${sampleCols.length}):`, sampleCols.join(' | '));

        const processarEntidade = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE', row: any, dtStr: string, empresa: string) => {
          const nomeTrim = nome.trim();
          if (!nomeTrim || nomeTrim === '0' || /^(null|sem ajudante|nan)$/i.test(nomeTrim)) return;

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
          const dist = toFloat(findCol(row, ['Distância Cliente', 'Distancia Cliente', 'distancia_cliente']));
          if (dist <= 100) d.Raio_OK++;

          // SLA
          const sla = String(findCol(row, ['SLA Janela', 'SLA', 'sla']) || '').toUpperCase();
          if (sla.includes('SIM') || sla === 'OK') d.SLA_OK++;

          // Tempo de atendimento >= 60s
          const chegada = hmsToSeconds(findCol(row, ['Chegada Cliente Realizado', 'chegada_cliente_realizado', 'Chegada Realizado']));
          const fim     = hmsToSeconds(findCol(row, ['Fim Atendimento Cliente Realizado', 'fim_atendimento_cliente_realizado', 'Fim Atendimento']));
          if (fim - chegada >= 60) d.Tempo_OK++;

          // Sequência
          const sP = String(findCol(row, ['Sequência Entrega Planejado', 'Sequencia Entrega Planejado', 'sequencia_entrega_planejado']) || '');
          const sR = String(findCol(row, ['Sequência Entrega Realizado', 'Sequencia Entrega Realizado', 'sequencia_entrega_realizado']) || '');
          if (sP !== '' && sP === sR) d.Seq_OK++;

          // Peso
          const peso = toFloat(findCol(row, ['Peso Pedido', 'peso_pedido', 'Peso']));
          d.Peso_Total += peso;
          const oc = String(findCol(row, ['Descrição Ocorrência', 'Descricao Ocorrencia', 'descricao_ocorrencia']) || '').trim();
          if (oc && !/^(null|nan|)$/i.test(oc)) d.Peso_Devolvido += peso;
        };

        for (const row of data) {
          // Status (filtra StandBy)
          const status = String(findCol(row, ['Status Rota', 'status_rota', 'Status']) || '').toUpperCase();
          if (status === 'STANDBY') continue;

          const dtStr  = excelSerialToDateStr(findCol(row, ['Data Rota', 'data_rota', 'Data']), year);
          if (!dtStr) continue;

          // Filtra pelo mês configurado
          const dtParts = dtStr.split('/');
          if (dtParts.length >= 2 && parseInt(dtParts[1]) !== month) continue;

          const empresa  = String(findCol(row, ['Nome Depósito', 'Nome Deposito', 'nome_deposito', 'Empresa']) || 'N/A');
          const motorista = String(findCol(row, ['Nome Motorista', 'nome_motorista', 'Motorista']) || '');
          const ajudante  = String(findCol(row, ['Nome Primeiro Ajudante', 'nome_primeiro_ajudante', 'Ajudante']) || '');

          processarEntidade(motorista, 'MOTORISTA', row, dtStr, empresa);
          processarEntidade(ajudante,  'AJUDANTE',  row, dtStr, empresa);
        }
      }

      if (Object.keys(dailyMap).length === 0) {
        throw new Error('Nenhum registro válido encontrado. Verifique se as colunas do arquivo correspondem ao esperado (Nome Motorista, Data Rota, Status Rota, etc.).');
      }

      // ── Detalhe ────────────────────────────────────────────────────────────
      const detalheUnificado = Object.values(dailyMap).map(d => {
        const tot = d.Total_Pedidos || 1;
        const pR   = Number(((d.Raio_OK  / tot) * 100).toFixed(2));
        const pS   = Number(((d.SLA_OK   / tot) * 100).toFixed(2));
        const pT   = Number(((d.Tempo_OK / tot) * 100).toFixed(2));
        const pSeq = Number(((d.Seq_OK   / tot) * 100).toFixed(2));

        const cR   = pR   >= 70;
        const cS   = pS   >= 80;
        const cT   = pT   >= 100;
        const cSeq = pSeq >= 0;   // sempre true (critério inclusivo)

        const cumpridos    = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + (cSeq ? 1 : 0);
        const valorCrit    = d.Cargo === 'MOTORISTA' ? MOT_BASE / 4 : AJU_BASE / 4;

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
          '✓ Raio ≥70%'               : cR   ? 'SIM' : 'NÃO',
          'Pedidos SLA OK'             : d.SLA_OK,
          '% SLA'                      : pS,
          '✓ SLA ≥80%'                : cS   ? 'SIM' : 'NÃO',
          'Pedidos Tempo OK'           : d.Tempo_OK,
          '% Tempo'                    : pT,
          '✓ Tempo ≥100%'             : cT   ? 'SIM' : 'NÃO',
          'Pedidos Sequência OK'       : d.Seq_OK,
          '% Sequência'                : pSeq,
          '✓ Sequência ≥0%'           : cSeq ? 'SIM' : 'NÃO',
          'Critérios Cumpridos (de 4)' : cumpridos,
          'Critérios Falhados'         : 4 - cumpridos,
          'Dia Bonificação Máxima (4/4)': cumpridos === 4 ? 'SIM' : 'NÃO',
          '% Bonificação'              : Number((cumpridos / 4 * 100).toFixed(2)),
          'Bonificação Funcionario (R$)': Number((cumpridos * valorCrit).toFixed(2)),
        };
      });

      // ── Consolidado ────────────────────────────────────────────────────────
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
        if (d['✓ Raio ≥70%']      === 'NÃO') m.fR++;
        if (d['✓ SLA ≥80%']       === 'NÃO') m.fS++;
        if (d['✓ Tempo ≥100%']    === 'NÃO') m.fT++;
        if (d['✓ Sequência ≥0%']  === 'NÃO') m.fSeq++;
      }

      const consolidadoUnificado = Object.values(consolidadoMap)
        .map((m: any) => ({
          'Empresa'                     : m['Empresa'],
          'Funcionario'                 : m['Funcionario'],
          'Cargo'                       : m['Cargo'],
          'Dias com Atividade'          : m.dias,
          'Dias Bonif. Máxima (4/4)'   : m.diasMax,
          'Percentual de Desempenho (%)': Number(((m.totalCrit / (m.dias * 4)) * 100).toFixed(2)),
          'Total Bonificação (R$)'      : Number(m.totalBon.toFixed(2)),
          'Total Critérios Cumpridos'   : m.totalCrit,
          'Falhas Raio'                 : m.fR,
          'Falhas SLA'                  : m.fS,
          'Falhas Tempo'                : m.fT,
          'Falhas Sequência'            : m.fSeq,
        }))
        .sort((a: any, b: any) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', timestamp: Date.now(), year, month,
        data: consolidadoUnificado,
        detalheGeral: detalheUnificado,
        summary: `Performaxxi Unificado: ${consolidadoUnificado.length} funcionários analisados (${detalheUnificado.length} registros diários).`,
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // ── VFLEET ───────────────────────────────────────────────────────────────
    if (pipelineType === 'vfleet') {
      const VFLEET_BONUS = 4.80;
      const dailyAnalysis: Record<string, any> = {};
      let bulletins: any[] = [];
      let alerts: any[] = [];

      for (const file of files) {
        const buffer   = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
        const sheet    = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) as any[];
        if (file.name.toUpperCase().includes('BOLETIM')) bulletins.push(...sheet);
        else alerts.push(...sheet);
      }

      for (const row of bulletins) {
        const dt = excelSerialToDateStr(row['DIA'] || row['DATA'], year);
        if (!dt) continue;
        const motorista = String(row['MOTORISTAS'] || '').split('-')[0].trim();
        if (!motorista || /sem identificação/i.test(motorista)) continue;

        const key = `${motorista}_${dt}`;
        if (!dailyAnalysis[key]) {
          dailyAnalysis[key] = { motorista, dia: dt, curva: 0, banguela: 0, ociosidade: 0, velocidade: 0 };
        }
        dailyAnalysis[key].curva     += parseInt(row['CURVA BRUSCA'] || 0);
        dailyAnalysis[key].banguela  += hmsToSeconds(row['BANGUELA']);
        dailyAnalysis[key].ociosidade += hmsToSeconds(row['PARADO LIGADO']);
      }

      for (const alert of alerts) {
        const dt  = excelSerialToDateStr(alert['DATA'] || alert['DIA'], year);
        const mot = String(alert['MOTORISTA'] || '').trim();
        const key = `${mot}_${dt}`;
        if (mot && dailyAnalysis[key] && String(alert['TIPO']).toUpperCase().includes('VELOCIDADE')) {
          dailyAnalysis[key].velocidade++;
        }
      }

      const detalheConducao = Object.values(dailyAnalysis).map(d => {
        const ok = d.curva === 0 && d.banguela === 0 && d.ociosidade === 0 && d.velocidade === 0;
        return {
          'Motorista'               : d.motorista,
          'Dia'                     : d.dia,
          'Falhas Curva'            : d.curva,
          'Falhas Banguela (seg)'   : d.banguela,
          'Falhas Ociosidade (seg)' : d.ociosidade,
          'Falhas Velocidade'       : d.velocidade,
          'Dia Bonificado'          : ok ? 'SIM' : 'NÃO',
          'Bonificação Condução (R$)': ok ? VFLEET_BONUS : 0,
        };
      });

      const consolidadoMap: Record<string, any> = {};
      for (const d of detalheConducao) {
        if (!consolidadoMap[d.Motorista]) {
          consolidadoMap[d.Motorista] = { 'Motorista': d.Motorista, dias: 0, diasBon: 0, totalBon: 0 };
        }
        consolidadoMap[d.Motorista].dias++;
        if (d['Dia Bonificado'] === 'SIM') consolidadoMap[d.Motorista].diasBon++;
        consolidadoMap[d.Motorista].totalBon += d['Bonificação Condução (R$)'];
      }

      const consolidado = Object.values(consolidadoMap).map((m: any) => ({
        'Motorista'                    : m['Motorista'],
        'Dias com Atividade'           : m.dias,
        'Dias Bonificados (4/4)'       : m.diasBon,
        'Percentual de Desempenho (%)' : Number(((m.diasBon / m.dias) * 100).toFixed(2)),
        'Total Bonificação (R$)'       : Number(m.totalBon.toFixed(2)),
      })).sort((a: any, b: any) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year, month,
        data: consolidado,
        detalheConducao,
        summary: `vFleet: ${consolidado.length} motoristas analisados.`,
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // ── PONTO ────────────────────────────────────────────────────────────────
    if (pipelineType === 'ponto') {
      const includeSundays   = formData.get('includeSundays') === 'true';
      const excludedDatesRaw = formData.get('excludedDates');
      const excludedDates: string[] = excludedDatesRaw ? JSON.parse(excludedDatesRaw as string) : [];

      const MOT_MARC  = 1.60; const MOT_CRIT  = 1.60;
      const AJU_MARC  = 2.40; const AJU_CRIT  = 2.40;

      const SITUACOES_PRESENCA = ['ATESTADO', 'AUXILIO DOENCA', 'AUXÍLIO DOENÇA', 'FERIAS', 'FÉRIAS',
        'LICENCA MATERNIDADE', 'LICENÇA MATERNIDADE', 'LICENCA PATERNIDADE', 'LICENÇA PATERNIDADE',
        'FALTA ABONADA', 'ABONADA'];

      const dailyMap: Record<string, { id: string; nome: string; data: string; marcacoes: number; situacao: string }[]> = {};

      for (const file of files) {
        const buffer   = await fileToBuffer(file);
        const workbook = XLSX.read(buffer, { type: 'buffer', header: 1 });
        const data     = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }) as any[][];

        let id = '', nome = '';
        for (const row of data) {
          const c0 = String(row[0] || '').trim();
          const c1 = String(row[1] || '').trim();
          const c2 = String(row[2] || '').trim();

          // Linha de colaborador
          if (/^\d+$/.test(c0) && c1.length > 3 && !c0.includes('/')) { id = c0; nome = c1; continue; }

          // Linha de data
          if (id && (c0.includes('/') || /^\d{1,2}\/\d{1,2}/.test(c0))) {
            const dtStr = excelSerialToDateStr(c0, year);
            if (!dtStr) continue;

            const dtParts = dtStr.split('/');
            if (dtParts.length < 3) continue;
            if (parseInt(dtParts[1]) !== month) continue;
            if (excludedDates.includes(dtStr)) continue;

            // Exclui domingos
            const dtObj    = new Date(parseInt(dtParts[2]), parseInt(dtParts[1]) - 1, parseInt(dtParts[0]));
            const weekday  = dtObj.getDay(); // 0=domingo
            if (!includeSundays && weekday === 0) continue;

            // Conta marcações (horários no formato HH:MM)
            const horarios = row.slice(2).filter((v: any) => /^\d{1,2}:\d{2}/.test(String(v || '').trim()));
            const marcacoes = horarios.length;

            // Situação (atestado, férias, etc.)
            const situacao = row.slice(3).map((v: any) => String(v || '').toUpperCase().trim())
              .find((v: string) => SITUACOES_PRESENCA.some(s => v.includes(s))) || '';

            const key = `${id}_${nome}`;
            if (!dailyMap[key]) dailyMap[key] = [];
            dailyMap[key].push({ id, nome, data: dtStr, marcacoes, situacao });
          }
        }
      }

      if (Object.keys(dailyMap).length === 0) {
        throw new Error('Nenhum colaborador encontrado. Verifique se os CSVs de ponto estão no formato esperado (Ponto_Original_*-*.csv).');
      }

      // Detalhes diários
      const detalhePonto: any[] = [];
      for (const registros of Object.values(dailyMap)) {
        for (const r of registros) {
          const marcOk   = r.marcacoes === 4;
          const presencaJustificada = SITUACOES_PRESENCA.some(s => r.situacao.includes(s));
          detalhePonto.push({
            'ID'                    : r.id,
            'Funcionario'           : r.nome,
            'Dia'                   : r.data,
            'Marcações'             : r.marcacoes,
            '✓ 4 Marcações'        : marcOk ? 'SIM' : 'NÃO',
            'Situação'              : r.situacao || '-',
            'Presença Justificada'  : presencaJustificada ? 'SIM' : 'NÃO',
            'Bônus Marcações (R$)'  : marcOk ? MOT_MARC : 0,
          });
        }
      }

      // Consolidado por colaborador
      const consolidadoMap: Record<string, any> = {};
      for (const d of detalhePonto) {
        const key = `${d.ID}_${d.Funcionario}`;
        if (!consolidadoMap[key]) {
          consolidadoMap[key] = { ID: d.ID, Funcionario: d.Funcionario, totalDias: 0, presencas: 0, marcacoesOk: 0, totalBon: 0 };
        }
        const m = consolidadoMap[key];
        m.totalDias++;
        const presente = d['✓ 4 Marcações'] === 'SIM' || d['Presença Justificada'] === 'SIM';
        if (presente) m.presencas++;
        if (d['✓ 4 Marcações'] === 'SIM') { m.marcacoesOk++; m.totalBon += MOT_MARC; }
      }

      const consolidado = Object.values(consolidadoMap).map((m: any) => ({
        'ID'                    : m.ID,
        'Funcionario'           : m.Funcionario,
        'Dias com Atividade'    : m.totalDias,
        'Presenças'             : m.presencas,
        'Faltas'                : Math.max(0, m.totalDias - m.presencas),
        'Percentual (%)'        : Number(((m.presencas / Math.max(m.totalDias, 1)) * 100).toFixed(2)),
        'Dias 4 Marcações OK'   : m.marcacoesOk,
        'Total Bonificação (R$)': Number(m.totalBon.toFixed(2)),
      }));

      // Absenteísmo
      const absenteismoData = consolidado.map((c: any) => {
        const pct = c['Percentual (%)'];
        const incentivo = pct >= 100 ? 50 : pct >= 90 ? 40 : pct >= 75 ? 25 : 0;
        return {
          'ID'               : c.ID,
          'Nome'             : c.Funcionario,
          'Total Dias'       : c['Dias com Atividade'],
          'Total Presenças'  : c.Presenças,
          'Faltas'           : c.Faltas,
          'Percentual (%)'   : pct,
          'Valor Incentivo'  : incentivo,
        };
      });

      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year, month,
        data: consolidado,
        detalhePonto,
        absenteismoData,
        summary: `Ponto: ${consolidado.length} colaboradores processados (${detalhePonto.length} registros diários).`,
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Pipeline não implementado.');

  } catch (error: any) {
    console.error('[Pipeline Error]', error);
    return {
      success: false,
      error  : error.message || 'Erro desconhecido',
      stack  : error.stack,
      code   : error.code,
      detail : error.detail,
    };
  }
}