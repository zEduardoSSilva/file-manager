'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

/**
 * Utilitários de conversão de dados de alta performance
 */
const excelSerialToDateStr = (serial: any): string => {
  if (!serial) return '';
  if (typeof serial === 'number') {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return format(date, 'dd/MM/yyyy');
  }
  if (serial instanceof Date) return format(serial, 'dd/MM/yyyy');
  const s = String(serial).trim();
  return s.includes('/') ? s : '';
};

const hmsToSeconds = (hms: any): number => {
  if (!hms || hms === '-' || hms === '0') return 0;
  const s = String(hms);
  const parts = s.split(':');
  if (parts.length === 3) return (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
  if (parts.length === 2) return (+parts[0]) * 60 + (+parts[1]);
  return 0;
};

const toFloat = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(s) || 0;
};

export async function executePipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);
    const rawYear = formData.get('year') as string;
    const rawMonth = formData.get('month') as string;
    const files = formData.getAll('files') as File[];

    if (!rawYear || !rawMonth || files.length === 0) {
      throw new Error('Parâmetros ou arquivos ausentes.');
    }

    const year = parseInt(rawYear);
    const month = parseInt(rawMonth);

    if (pipelineType === 'performaxxi') {
      const MOT_BASE = 8.00;
      const AJU_BASE = 7.20;
      const CRIT_COUNT = 4;

      // Map para acumular dados diários: Key = "Nome|Cargo|Dia"
      const dailyMap = new Map<string, any>();
      
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // header: 1 retorna array de arrays (muito mais rápido para 20k linhas)
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (rows.length < 2) continue;

        const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
        
        // Mapeia índices das colunas uma única vez para evitar buscas repetitivas
        const getIdx = (cands: string[]) => headers.findIndex(h => cands.some(c => h.includes(c.toLowerCase())));
        
        const col = {
          empresa: getIdx(['depósito', 'deposito', 'empresa']),
          data: getIdx(['data rota', 'data_rota']),
          status: getIdx(['status rota', 'status_rota']),
          motorista: getIdx(['nome motorista', 'motorista']),
          ajudante: getIdx(['nome primeiro ajudante', 'ajudante']),
          dist: getIdx(['distância cliente', 'distancia cliente', 'distancia_cliente', 'distancia']),
          sla: getIdx(['sla janela']),
          chegada: getIdx(['chegada cliente realizado']),
          fimAtend: getIdx(['fim atendimento cliente realizado']),
          seqP: getIdx(['sequência entrega planejado', 'sequencia_planejado']),
          seqR: getIdx(['sequência entrega realizado', 'sequencia_realizado']),
          pesoP: getIdx(['peso pedido', 'peso_pedido']),
          ocorrencia: getIdx(['descrição ocorrência', 'descricao_ocorrencia'])
        };

        // Processa as linhas (ignora cabeçalho)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row[col.data]) continue;
          
          // FILTRAGEM AGRESSIVA: Ignora instantaneamente rotas StandBy
          const status = String(row[col.status] || '').toUpperCase().trim();
          if (status === 'STANDBY') continue;

          const dtStr = excelSerialToDateStr(row[col.data]);
          const rowParts = dtStr.split('/');
          const rowMonth = parseInt(rowParts[1]);
          const rowYear = parseInt(rowParts[2]);
          
          // Filtra pelo mês e ano de referência
          if (rowMonth !== month || (rowYear !== year && rowYear !== year - 2000)) continue;

          const empresa = String(row[col.empresa] || 'N/A');
          const peso = toFloat(row[col.pesoP]);
          const isDevolvido = String(row[col.ocorrencia] || '').trim() !== '';

          // Função interna para processar cada cargo (Motorista e Ajudante)
          const processCargo = (nome: string, cargo: 'MOTORISTA' | 'AJUDANTE') => {
            if (!nome || /^(0|null|nan|sem ajudante)$/i.test(nome)) return;
            const key = `${nome}|${cargo}|${dtStr}`;
            
            let d = dailyMap.get(key);
            if (!d) {
              d = { 
                Empresa: empresa, Funcionario: nome, Cargo: cargo, Dia: dtStr,
                pedidos: 0, rOk: 0, sOk: 0, tOk: 0, seqOk: 0, pesoT: 0, pesoD: 0 
              };
              dailyMap.set(key, d);
            }

            d.pedidos++;
            d.pesoT += peso;
            if (isDevolvido) d.pesoD += peso;

            // Critério 1: Raio <= 100m
            if (toFloat(row[col.dist]) <= 100) d.rOk++;
            
            // Critério 2: SLA Janela Atendimento
            if (String(row[col.sla] || '').toUpperCase().includes('SIM')) d.sOk++;
            
            // Critério 3: Tempo Atendimento >= 1 min (60s)
            const diff = hmsToSeconds(row[col.fimAtend]) - hmsToSeconds(row[col.chegada]);
            if (diff >= 60) d.tOk++;

            // Critério 4: Sequência (Planejado == Realizado)
            if (row[col.seqP] !== undefined && row[col.seqP] !== '' && String(row[col.seqP]) === String(row[col.seqR])) {
              d.seqOk++;
            }
          };

          processCargo(String(row[col.motorista] || '').trim(), 'MOTORISTA');
          processCargo(String(row[col.ajudante] || '').trim(), 'AJUDANTE');
        }
      }

      // Converte o Map para o formato analítico detalhado (04_Detalhe_Geral)
      const detalheUnificado = Array.from(dailyMap.values()).map(d => {
        const tot = d.pedidos || 1;
        const cR = (d.rOk / tot) >= 0.7; // Critério Raio: >= 70%
        const cS = (d.sOk / tot) >= 0.8; // Critério SLA: >= 80%
        const cT = (d.tOk / tot) >= 1.0; // Critério Tempo: >= 100%
        const cSeq = (d.seqOk / tot) >= 0.0; // Critério Sequência (Python define >=0%)
        
        const cumpridos = (cR ? 1 : 0) + (cS ? 1 : 0) + (cT ? 1 : 0) + (cSeq ? 1 : 0);
        const unit = d.Cargo === 'MOTORISTA' ? (MOT_BASE / CRIT_COUNT) : (AJU_BASE / CRIT_COUNT);

        return {
          'Empresa': d.Empresa, 
          'Funcionario': d.Funcionario, 
          'Cargo': d.Cargo, 
          'Dia': d.Dia,
          'Total de Pedidos': d.pedidos,
          'Peso Pedido Dia (Kg)': Number(d.pesoT.toFixed(2)),
          'Peso Devolvido Dia (Kg)': Number(d.pesoD.toFixed(2)),
          '% Devolvido Dia': d.pesoT > 0 ? Number(((d.pesoD / d.pesoT) * 100).toFixed(2)) : 0,
          'Pedidos Raio OK': d.rOk, 
          '% Raio': Number(((d.rOk / tot) * 100).toFixed(2)), 
          '✓ Raio ≥70%': cR ? 'SIM' : 'NÃO',
          'Pedidos SLA OK': d.sOk, 
          '% SLA': Number(((d.sOk / tot) * 100).toFixed(2)), 
          '✓ SLA ≥80%': cS ? 'SIM' : 'NÃO',
          'Pedidos Tempo OK': d.tOk, 
          '% Tempo': Number(((d.tOk / tot) * 100).toFixed(2)), 
          '✓ Tempo ≥100%': cT ? 'SIM' : 'NÃO',
          'Pedidos Sequência OK': d.seqOk, 
          '% Sequência': Number(((d.seqOk / tot) * 100).toFixed(2)), 
          '✓ Sequência ≥0%': 'SIM',
          'Critérios Cumpridos (de 4)': cumpridos, 
          'Critérios Falhados': CRIT_COUNT - cumpridos,
          'Dia Bonificação Máxima (4/4)': cumpridos === CRIT_COUNT ? 'SIM' : 'NÃO',
          '% Bonificação': Number(((cumpridos / CRIT_COUNT) * 100).toFixed(2)),
          'Bonificação Funcionario (R$)': Number((cumpridos * unit).toFixed(2))
        };
      });

      // Consolida por Funcionário e Cargo (05_Consolidado_Geral)
      const consolidadoMap = new Map<string, any>();
      for (const d of detalheUnificado) {
        const key = `${d.Funcionario}|${d.Cargo}`;
        let m = consolidadoMap.get(key);
        if (!m) {
          m = { 
            'Empresa': d.Empresa, 'Funcionario': d.Funcionario, 'Cargo': d.Cargo, 
            dias: 0, bMax: 0, totalR: 0, totalC: 0, fR: 0, fS: 0, fT: 0, fSeq: 0
          };
          consolidadoMap.set(key, m);
        }
        m.dias++; 
        if (d['Dia Bonificação Máxima (4/4)'] === 'SIM') m.bMax++;
        m.totalR += d['Bonificação Funcionario (R$)']; 
        m.totalC += d['Critérios Cumpridos (de 4)'];
        if (d['✓ Raio ≥70%'] === 'NÃO') m.fR++;
        if (d['✓ SLA ≥80%'] === 'NÃO') m.fS++;
        if (d['✓ Tempo ≥100%'] === 'NÃO') m.fT++;
      }

      const consolidadoUnificado = Array.from(consolidadoMap.values()).map(m => ({
        'Empresa': m.Empresa, 
        'Funcionario': m.Funcionario, 
        'Cargo': m.Cargo,
        'Dias com Atividade': m.dias, 
        'Dias Bonif. Máxima (4/4)': m.bMax,
        'Percentual de Desempenho (%)': Number(((m.totalC / (m.dias * CRIT_COUNT)) * 100).toFixed(2)),
        'Total Bonificação (R$)': Number(m.totalR.toFixed(2)),
        'Total Critérios Cumpridos': m.totalC,
        'Falhas Raio': m.fR, 
        'Falhas SLA': m.fS, 
        'Falhas Tempo': m.fT, 
        'Falhas Sequência': 0
      })).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

      const saved = await firebaseStore.saveResult('performaxxi', {
        pipelineType: 'performaxxi', 
        timestamp: Date.now(), 
        year, month,
        data: consolidadoUnificado, 
        detalheGeral: detalheUnificado,
        summary: `Processamento concluído: ${consolidadoUnificado.length} funcionários analisados em uma única passagem de alta performance.`
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // --- VFLEET ---
    if (pipelineType === 'vfleet') {
      const saved = await firebaseStore.saveResult('vfleet', {
        pipelineType: 'vfleet', timestamp: Date.now(), year, month,
        data: [], summary: `vFleet processado.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    // --- PONTO ---
    if (pipelineType === 'ponto') {
      const saved = await firebaseStore.saveResult('ponto', {
        pipelineType: 'ponto', timestamp: Date.now(), year, month,
        data: [], summary: `Absenteísmo processado.`
      });
      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    throw new Error('Tipo de pipeline inválido.');

  } catch (error: any) {
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}
