'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE vFleet — TypeScript
 *
 * Etapas:
 *  1. Carrega Boletim_do_Veiculo (CSV) e extrai nome/CPF do campo MOTORISTAS
 *  2. Consolida múltiplos Historico_Alertas (CSV), remove duplicatas
 *  3. Analisa condução por motorista/dia:
 *     - Curva Brusca   : 100% registros sem violação
 *     - Banguela        : 100% registros sem violação
 *     - Ociosidade      : 100% registros sem violação
 *     - Exc. Velocidade : 0 alertas do tipo EXCESSO_VELOCIDADE no dia
 *     → TUDO OU NADA: qualquer falha = R$ 0,00
 *     → Bonificação dia OK = R$ 4,80 (30% de R$ 16,00)
 *
 * Nota: O Controle de Rota (Consolidado_Entregas) foi removido do fluxo
 * por limitação de tamanho no React. O nome do motorista é lido diretamente
 * do campo MOTORISTAS do Boletim_do_Veiculo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações financeiras ──────────────────────────────────────────────
const BONIFICACAO_DIARIA_TOTAL = 16.00;
const PERCENTUAL_CONDUCAO      = 0.30;
const VALOR_CONDUCAO           = round2(BONIFICACAO_DIARIA_TOTAL * PERCENTUAL_CONDUCAO); // 4.80

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DiaConducao {
  Motorista: string;
  Dia: string;
  'Total de Registros': number;
  'Registros Sem Curva Brusca': number;
  '% Sem Curva': number;
  '✓ Curva 100%': boolean;
  'Total Eventos Curva': number;
  'Registros Sem Banguela': number;
  '% Sem Banguela': number;
  '✓ Banguela 100%': boolean;
  'Total Banguela (seg)': number;
  'Registros Sem Ociosidade': number;
  '% Sem Ociosidade': number;
  '✓ Ociosidade 100%': boolean;
  'Total Ociosidade (seg)': number;
  '✓ Sem Excesso Velocidade': boolean;
  'Critérios Cumpridos (de 4)': number;
  'Critérios Falhados': number;
  'Dia Bonificado': boolean;
  'Bonificação Condução (R$)': number;
}

interface ConsolidadoMotorista {
  Motorista: string;
  'Dias com Atividade': number;
  'Dias Bonificados (4/4)': number;
  'Percentual de Desempenho (%)': number;
  'Total Bonificação (R$)': number;
  'Falhas Curva Brusca': number;
  'Falhas Banguela': number;
  'Falhas Ociosidade': number;
  'Falhas Exc. Velocidade': number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeHeader(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Converte "HH:MM:SS" para total em segundos.
 * Espelha: converter_para_segundos()
 */
function toSeconds(s: any): number {
  if (!s || s === '-') return 0;
  const parts = String(s).trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * Extrai (nome, cpf) de "NOME - 12345678901".
 * Espelha: extrair_nome_cpf()
 */
function extrairNomeCpf(texto: any): { nome: string; cpf: string } {
  if (!texto || String(texto).trim() === '') return { nome: '', cpf: '' };
  const s = String(texto).trim();
  const cpfMatch = s.match(/(\d{11})/);
  if (cpfMatch) {
    const cpf  = cpfMatch[1];
    const nome = s.replace(/[-\s]*\d{11}[-\s]*/g, '')
                  .replace(/\s*-\s*$/, '').replace(/^\s*-\s*/, '').trim();
    return { nome, cpf };
  }
  return { nome: s, cpf: '' };
}

/**
 * Converte serial Excel, Date ou string DD/MM/YYYY para "DD/MM/YYYY".
 */
function toDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  if (val instanceof Date) {
    return `${String(val.getDate()).padStart(2,'0')}/${String(val.getMonth()+1).padStart(2,'0')}/${val.getFullYear()}`;
  }
  const s = String(val).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s.split(' ')[0];
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  return s;
}

function parseDate(s: string): Date | null {
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

/**
 * Lê CSV (texto) separado por ';' ou ',' e retorna array de objetos.
 */
function parseCSV(texto: string): Record<string, any>[] {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
  if (linhas.length < 2) return [];
  const sep     = linhas[0].includes(';') ? ';' : ',';
  const headers = linhas[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  return linhas.slice(1).map(linha => {
    const vals = linha.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

/**
 * Encontra coluna por candidatos (busca parcial normalizada).
 * Espelha: find_col()
 */
function findCol(candidates: string[], columns: string[]): string | null {
  const normMap = new Map(columns.map(c => [normalizeHeader(c), c]));
  for (const cand of candidates) {
    const nc = normalizeHeader(cand);
    for (const [key, orig] of normMap) {
      if (key === nc || key.includes(nc)) return orig;
    }
  }
  return null;
}

// ── ETAPA 1 — Carregar boletim e extrair nome/CPF ────────────────────────────

/**
 * Extrai nome/CPF do campo MOTORISTAS e cria coluna MOTORISTA (singular).
 * Espelha: converter_veiculo_para_motorista()
 */
function converterParaBoletimMotorista(
  boletimVeiculo: Record<string, any>[]
): Record<string, any>[] {
  return boletimVeiculo.map(row => {
    const cols    = Object.keys(row);
    const colMots = findCol(['MOTORISTAS', 'motoristas'], cols) || 'MOTORISTAS';
    const { nome, cpf } = extrairNomeCpf(row[colMots]);
    return { ...row, MOTORISTA: nome, CPF: cpf };
  });
}

// ── ETAPA 2 — Consolidar alertas ──────────────────────────────────────────────

/**
 * Concatena arrays de alertas e remove duplicatas.
 * Espelha: consolidar_alertas()
 */
function consolidarAlertas(alertasArrays: Record<string, any>[][]): Record<string, any>[] {
  const todos = alertasArrays.flat();
  if (todos.length === 0) return [];

  const seen  = new Set<string>();
  const unicos: Record<string, any>[] = [];
  for (const row of todos) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) { seen.add(key); unicos.push(row); }
  }

  return unicos.sort((a, b) => {
    const colData = findCol(['DATA', 'data'], Object.keys(a)) || 'DATA';
    const da = parseDate(String(a[colData] || ''));
    const db = parseDate(String(b[colData] || ''));
    if (!da || !db) return 0;
    return da.getTime() - db.getTime();
  });
}

// ── ETAPA 3 — Análise de condução ─────────────────────────────────────────────

/**
 * Avalia 4 critérios por motorista/dia com regra TUDO OU NADA.
 * Espelha: analisar_conducao()
 */
function analisarConducao(
  boletimMotorista: Record<string, any>[],
  alertas: Record<string, any>[]
): { detalhe: DiaConducao[]; consolidado: ConsolidadoMotorista[] } {

  if (boletimMotorista.length === 0) return { detalhe: [], consolidado: [] };

  const cols       = Object.keys(boletimMotorista[0]);
  const colMot     = findCol(['MOTORISTA'],                                                 cols) || 'MOTORISTA';
  const colDia     = findCol(['DIA', 'data'],                                               cols) || 'DIA';
  const colCurva   = findCol(['CURVA BRUSCA', 'curva brusca', 'curva'],                    cols) || 'CURVA BRUSCA';
  const colBang    = findCol(['BANGUELA'],                                                  cols) || 'BANGUELA';
  const colParado  = findCol(['PARADO LIGADO', 'parado ligado', 'ociosidade'],              cols) || 'PARADO LIGADO';
  const colDist    = findCol(['DISTANCIA PERCORRIDA', 'distância percorrida', 'distancia'], cols) || 'DISTÂNCIA PERCORRIDA';
  const colIgnicao = findCol(['TEMPO IGNICAO LIGADA', 'tempo ignição ligada', 'ignicao'],  cols) || 'TEMPO IGNIÇÃO LIGADA';

  // Filtra registros com atividade real (ignição > 0 OU distância > 0)
  const ativos = boletimMotorista.filter(row => {
    const ign  = toSeconds(row[colIgnicao]);
    const dist = parseFloat(String(row[colDist] || '0').replace(',', '.')) || 0;
    return ign > 0 || dist > 0;
  });

  if (ativos.length === 0) return { detalhe: [], consolidado: [] };

  // Mapa de excesso de velocidade por "motorista|dia"
  const excessoMap = new Map<string, boolean>();
  if (alertas.length > 0) {
    const colsA   = Object.keys(alertas[0]);
    const colMotA = findCol(['MOTORISTA', 'motorista'], colsA) || 'MOTORISTA';
    const colDatA = findCol(['DATA', 'data'],           colsA) || 'DATA';
    const colTipo = findCol(['TIPO', 'tipo'],           colsA) || 'TIPO';

    for (const alerta of alertas) {
      const motA = String(alerta[colMotA] || '').trim();
      if (!motA || motA === '-' || motA.toLowerCase().includes('sem identif')) continue;
      const tipo = String(alerta[colTipo] || '').toUpperCase().trim();
      if (tipo !== 'EXCESSO_VELOCIDADE' && tipo !== 'EXCESSO DE VELOCIDADE') continue;
      excessoMap.set(`${motA}|${toDateStr(alerta[colDatA])}`, true);
    }
  }

  // Agrega por motorista/dia
  type DiaAgg = {
    total: number;
    curvaOK: number; curvaTotalEventos: number;
    bangOK: number;  bangSeg: number;
    ocioOK: number;  ocioSeg: number;
  };
  const diaMap = new Map<string, DiaAgg>();

  for (const row of ativos) {
    const mot = String(row[colMot] || '').trim();
    const dia = toDateStr(row[colDia]);
    if (!mot || !dia) continue;

    const chave = `${mot}|${dia}`;
    let agg = diaMap.get(chave);
    if (!agg) {
      agg = { total: 0, curvaOK: 0, curvaTotalEventos: 0, bangOK: 0, bangSeg: 0, ocioOK: 0, ocioSeg: 0 };
      diaMap.set(chave, agg);
    }

    const curvaEvt = parseFloat(String(row[colCurva] || '0')) || 0;
    const bangSeg  = toSeconds(row[colBang]);
    const ocioSeg  = toSeconds(row[colParado]);

    agg.total++;
    agg.curvaTotalEventos += curvaEvt;
    agg.bangSeg           += bangSeg;
    agg.ocioSeg           += ocioSeg;
    if (curvaEvt === 0) agg.curvaOK++;
    if (bangSeg  === 0) agg.bangOK++;
    if (ocioSeg  === 0) agg.ocioOK++;
  }

  // Gera detalhe diário
  const detalhe: DiaConducao[] = [];

  for (const [chave, agg] of diaMap) {
    const [mot, dia] = chave.split('|');
    const total = agg.total;

    const percCurva = total > 0 ? round2(agg.curvaOK / total * 100) : 0;
    const percBang  = total > 0 ? round2(agg.bangOK  / total * 100) : 0;
    const percOcio  = total > 0 ? round2(agg.ocioOK  / total * 100) : 0;

    const cumpriuCurva = percCurva === 100;
    const cumpriuBang  = percBang  === 100;
    const cumpriuOcio  = percOcio  === 100;
    const cumpriuVeloc = !excessoMap.has(`${mot}|${dia}`);

    const criteriosCumpridos = (cumpriuCurva?1:0) + (cumpriuBang?1:0) + (cumpriuOcio?1:0) + (cumpriuVeloc?1:0);
    const criteriosFalhados  = 4 - criteriosCumpridos;
    const diaBonificado      = criteriosFalhados === 0;

    detalhe.push({
      Motorista: mot,
      Dia: dia,
      'Total de Registros': total,
      'Registros Sem Curva Brusca': agg.curvaOK,
      '% Sem Curva': percCurva,
      '✓ Curva 100%': cumpriuCurva,
      'Total Eventos Curva': agg.curvaTotalEventos,
      'Registros Sem Banguela': agg.bangOK,
      '% Sem Banguela': percBang,
      '✓ Banguela 100%': cumpriuBang,
      'Total Banguela (seg)': agg.bangSeg,
      'Registros Sem Ociosidade': agg.ocioOK,
      '% Sem Ociosidade': percOcio,
      '✓ Ociosidade 100%': cumpriuOcio,
      'Total Ociosidade (seg)': agg.ocioSeg,
      '✓ Sem Excesso Velocidade': cumpriuVeloc,
      'Critérios Cumpridos (de 4)': criteriosCumpridos,
      'Critérios Falhados': criteriosFalhados,
      'Dia Bonificado': diaBonificado,
      'Bonificação Condução (R$)': diaBonificado ? VALOR_CONDUCAO : 0,
    });
  }

  detalhe.sort((a, b) => {
    if (a.Motorista !== b.Motorista) return a.Motorista.localeCompare(b.Motorista);
    const da = parseDate(a.Dia);
    const db = parseDate(b.Dia);
    if (!da || !db) return 0;
    return da.getTime() - db.getTime();
  });

  // Consolida por motorista
  const consMap = new Map<string, ConsolidadoMotorista>();
  for (const dia of detalhe) {
    let m = consMap.get(dia.Motorista);
    if (!m) {
      m = {
        Motorista: dia.Motorista,
        'Dias com Atividade': 0,
        'Dias Bonificados (4/4)': 0,
        'Percentual de Desempenho (%)': 0,
        'Total Bonificação (R$)': 0,
        'Falhas Curva Brusca': 0,
        'Falhas Banguela': 0,
        'Falhas Ociosidade': 0,
        'Falhas Exc. Velocidade': 0,
      };
      consMap.set(dia.Motorista, m);
    }
    m['Dias com Atividade']++;
    if (dia['Dia Bonificado'])            m['Dias Bonificados (4/4)']++;
    m['Total Bonificação (R$)']          += dia['Bonificação Condução (R$)'];
    if (!dia['✓ Curva 100%'])             m['Falhas Curva Brusca']++;
    if (!dia['✓ Banguela 100%'])          m['Falhas Banguela']++;
    if (!dia['✓ Ociosidade 100%'])        m['Falhas Ociosidade']++;
    if (!dia['✓ Sem Excesso Velocidade']) m['Falhas Exc. Velocidade']++;
  }

  const consolidado: ConsolidadoMotorista[] = Array.from(consMap.values()).map(m => ({
    ...m,
    'Total Bonificação (R$)': round2(m['Total Bonificação (R$)']),
    'Percentual de Desempenho (%)': m['Dias com Atividade'] > 0
      ? round2(m['Dias Bonificados (4/4)'] / m['Dias com Atividade'] * 100)
      : 0,
  })).sort((a, b) => b['Percentual de Desempenho (%)'] - a['Percentual de Desempenho (%)']);

  return { detalhe, consolidado };
}

// ── Pipeline principal ────────────────────────────────────────────────────────

/**
 * Classifica arquivo pelo nome:
 *  - Histórico de Alertas : "Historico_Alertas" ou "alerta"
 *  - Demais               : tratados como Boletim_do_Veiculo
 */
function tipoArquivo(nome: string): 'boletim' | 'alerta' {
  const n = nome.toLowerCase();
  if (n.includes('historico_alertas') || n.includes('alerta')) return 'alerta';
  return 'boletim';
}

export async function executeVFleetPipeline(formData: FormData) {
  try {
    const targetYear  = parseInt(formData.get('year')  as string);
    const targetMonth = parseInt(formData.get('month') as string);
    const files       = formData.getAll('files') as File[];

    if (!targetYear || !targetMonth || files.length === 0) {
      throw new Error('Parâmetros ou arquivos ausentes.');
    }

    const boletimFiles: File[] = [];
    const alertaFiles:  File[] = [];

    for (const f of files) {
      if (tipoArquivo(f.name) === 'alerta') alertaFiles.push(f);
      else                                   boletimFiles.push(f);
    }

    if (boletimFiles.length === 0) {
      throw new Error('Nenhum arquivo Boletim_do_Veiculo encontrado.');
    }

    // ── Etapa 1: Carrega boletins e extrai nome/CPF ───────────────────────
    let boletimRows: Record<string, any>[] = [];
    for (const f of boletimFiles) {
      boletimRows.push(...parseCSV(await f.text()));
    }

    if (boletimRows.length === 0) {
      throw new Error('Nenhum dado encontrado nos arquivos Boletim_do_Veiculo.');
    }

    const boletimMotorista = converterParaBoletimMotorista(boletimRows);

    // ── Etapa 2: Consolida alertas ────────────────────────────────────────
    const alertasArrays: Record<string, any>[][] = [];
    for (const f of alertaFiles) {
      alertasArrays.push(parseCSV(await f.text()));
    }
    const alertas = consolidarAlertas(alertasArrays);

    // ── Etapa 3: Análise de condução ──────────────────────────────────────
    const { detalhe, consolidado } = analisarConducao(boletimMotorista, alertas);

    if (detalhe.length === 0) {
      throw new Error('Nenhum registro com atividade encontrado. Verifique se os arquivos correspondem ao período selecionado.');
    }

    const totalBon  = consolidado.reduce((s, m) => s + m['Total Bonificação (R$)'], 0);
    const diasBon   = detalhe.filter(d => d['Dia Bonificado']).length;
    const totalDias = detalhe.length;

    const saved = await firebaseStore.saveResult('vfleet', {
      pipelineType    : 'vfleet',
      timestamp       : Date.now(),
      year            : targetYear,
      month           : targetMonth,
      data            : consolidado,
      detalheConducao : detalhe,
      summary         : [
        `${consolidado.length} motoristas analisados`,
        `${diasBon}/${totalDias} dias bonificados`,
        `Total: R$ ${round2(totalBon).toFixed(2)}`,
      ].join(' — '),
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };

  } catch (error: any) {
    console.error('Erro no vFleet Pipeline:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}