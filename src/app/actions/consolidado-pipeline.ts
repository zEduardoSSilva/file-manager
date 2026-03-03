'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Consolidador Final — TypeScript
 * Espelha: consolidador_pipeline.py
 *
 * Fontes de dados suportadas:
 *  A) Arquivos Excel (.xlsx) exportados pelos pipelines anteriores
 *     - resumo_analitico_performaxxi_unificado.xlsx  → detalhe motorista/ajudante
 *     - resumo_analitico_ponto_unificado.xlsx        → detalhe ponto motorista/ajudante
 *     - resumo_analitico_conducao_unificado.xlsx     → detalhe condução (motorista)
 *
 *  B) Firebase — lê os resultados salvos pelos outros pipelines
 *     ⚠️  ESTRUTURA PRONTA — integração pendente de ajuste no banco
 *
 * Lógica:
 *  1. Carrega e padroniza cada fonte
 *  2. Merge por (Colaborador + Dia) — outer join
 *  3. Penalização por devolução ≥ 15% → zera todas as bonificações do dia
 *  4. Calcula bonificação diária total e acumulada por colaborador
 *  5. Gera saída separada: Motoristas (+ condução) e Ajudantes (sem condução)
 *
 * Bonificações máximas por dia:
 *  MOTORISTA: R$ 8,00 (perf) + R$ 3,20 (ponto) + R$ 4,80 (condução) = R$ 16,00
 *  AJUDANTE : R$ 7,20 (perf) + R$ 4,80 (ponto)                      = R$ 12,00
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações financeiras ──────────────────────────────────────────────
const PERCENTUAL_MAXIMO_DEVOLUCAO  = 15.0;
const BONIFICACAO_MAXIMA_MOTORISTA = 16.00;
const BONIFICACAO_MAXIMA_AJUDANTE  = 12.00;

// ── Mapeamento de abas → nomes candidatos (primeiro que existir é usado) ────
const ABAS_PERF_MOT  = ['04_Detalhe_Motorista',       'Detalhe Diário Performance', 'Detalhe Diario Performance'];
const ABAS_PERF_AJU  = ['06_Detalhe_Ajudante',        'Detalhe Diário Performance', 'Detalhe Diario Performance'];
const ABAS_PONTO_MOT = ['03_Detalhe_Ponto_Motorista', 'Detalhe Diario Ponto',       'Detalhe Diário Ponto'];
const ABAS_PONTO_AJU = ['07_Detalhe_Ponto_Ajudante',  'Detalhe Diario Ponto',       'Detalhe Diário Ponto'];
const ABAS_COND      = ['04_Detalhe_Diario',           'Detalhe Diário Condução',   'Detalhe Diario Condução', 'Detalhe Diário Conducao'];

// ── Tipos ──────────────────────────────────────────────────────────────────

type FonteInput = 'excel' | 'firebase';

interface DiaConsolidado {
  Colaborador: string;
  Cargo: 'Motorista' | 'Ajudante';
  Dia: string;
  // Performance
  PERF_Raio_100m?: string;
  PERF_SLA_Janela?: string;
  PERF_Tempo_Min?: string;
  PERF_Sequenciamento?: string;
  PERF_Bonificacao: number;
  // Peso / devolução
  Peso_Pedido_Dia: number;
  PESO_Devolvido_Dia: number;
  PESO_Percentual_Devolvido: number;
  PESO_Penalizado: boolean;
  // Ponto
  PONTO_Entrada?: string;
  PONTO_Saida_Almoco?: string;
  PONTO_Retorno_Almoco?: string;
  PONTO_Saida?: string;
  PONTO_Todas_Batidas?: string;
  PONTO_Bonificacao: number;
  // Jornada
  JORNADA_Hora_Extra?: string;
  JORNADA_Intervalo_Almoco?: string;
  JORNADA_Intrajornada?: string;
  JORNADA_Interjornada?: string;
  JORNADA_Interjornada_Descanso?: string;
  JORNADA_Deficit_Interjornada?: string;
  JORNADA_DSR?: string;
  JORNADA_Tempo_Total?: string;
  JORNADA_Bonificacao: number;
  TOTAL_Ponto_Bonificacao: number;
  // Condução (somente motoristas)
  COND_Excesso_Velocidade?: string;
  COND_Curva_Brusca?: string;
  COND_Banguela?: string;
  COND_Ociosidade?: string;
  COND_Bonificacao: number;
  // Totais
  Bonificacao_Diaria_Total: number;
  Bonificacao_Max_Dia: number;
  Percentual_Atingido: string;
  Bonificacao_Acumulada: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normaliza texto: minúsculas, sem acentos, espaços simples.
 * Espelha: _norm()
 */
function norm(s: any): string {
  if (!s) return '';
  return String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Encontra coluna por candidatos (busca parcial normalizada).
 * Espelha: encontrar_coluna()
 */
function findCol(candidates: string[], columns: string[]): string | null {
  const normMap = new Map(columns.map(c => [norm(c), c]));
  for (const cand of candidates) {
    const nc = norm(cand);
    // exact match
    if (normMap.has(nc)) return normMap.get(nc)!;
    // partial match
    for (const [key, orig] of normMap) {
      if (key.includes(nc) || nc.includes(key)) return orig;
    }
  }
  return null;
}

/**
 * Converte valor booleano/string para "OK" | "FALHA" | "N/A".
 * Espelha: bool_para_ok()
 */
function boolParaOk(val: any, inverter = false): string {
  if (val === null || val === undefined || val === '' || val === 'N/A') return 'N/A';
  let b: boolean;
  if (typeof val === 'boolean') b = val;
  else if (typeof val === 'string') b = val.toLowerCase() === 'true' || val === '1' || val.toLowerCase() === 'ok';
  else b = Boolean(val);
  if (inverter) b = !b;
  return b ? 'OK' : 'FALHA';
}

/**
 * Converte valor de data para "DD/MM/YYYY".
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
  // Já DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s.split(' ')[0];
  // ISO ou outro formato
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  return s;
}

function toNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// ── Leitura de Excel ────────────────────────────────────────────────────────

/**
 * Lê um arquivo Excel e retorna um mapa { nomeAba: rows[] }.
 */
async function lerExcel(file: File): Promise<Map<string, Record<string, any>[]>> {
  const buffer   = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const resultado = new Map<string, Record<string, any>[]>();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    resultado.set(sheetName, XLSX.utils.sheet_to_json(sheet) as Record<string, any>[]);
  }
  return resultado;
}

/**
 * Busca a primeira aba disponível de uma lista de candidatos.
 * Espelha: ler_aba()
 */
function buscarAba(
  mapaAbas: Map<string, Record<string, any>[]>,
  candidatos: string[]
): Record<string, any>[] | null {
  for (const cand of candidatos) {
    if (mapaAbas.has(cand)) return mapaAbas.get(cand)!;
    // busca case-insensitive
    for (const [key, rows] of mapaAbas) {
      if (norm(key) === norm(cand)) return rows;
    }
  }
  return null;
}

// ── Processadores de cada fonte ─────────────────────────────────────────────

/**
 * Extrai campos de performance de um array de rows.
 * Espelha: processar_performance()
 */
function processarPerformance(
  rows: Record<string, any>[],
  tipoColaborador: 'Motorista' | 'Ajudante'
): Map<string, Record<string, any>> {
  const mapa = new Map<string, Record<string, any>>();
  if (!rows || rows.length === 0) return mapa;

  const cols = Object.keys(rows[0]);
  const colNome = findCol([tipoColaborador, 'Colaborador', 'Nome'], cols);
  const colDia  = findCol(['Dia', 'Data'], cols);

  const colRaio  = findCol(['✓ Raio', 'Raio'], cols);
  const colSla   = findCol(['✓ SLA', 'SLA'], cols);
  const colTempo = findCol(['✓ Tempo', 'Tempo'], cols);
  const colSeq   = findCol(['✓ Sequência', 'Sequencia', 'Sequência'], cols);
  const colBonif = findCol(['Bonificação', 'Bonificacao'], cols);
  const colPeso  = findCol(['Peso Pedido', 'Peso_Pedido'], cols);
  const colDev   = findCol(['Peso Devolvido', 'Peso_Devolvido', 'PESO_Devolvido'], cols);
  const colPercDev = findCol(['% Devolvido', 'Percentual_Devolvido', 'PESO_Percentual'], cols);

  for (const row of rows) {
    const colaborador = String(row[colNome!] || '').trim().toUpperCase();
    const dia         = toDateStr(row[colDia!]);
    if (!colaborador || !dia) continue;

    const chave = `${colaborador}|${dia}`;
    mapa.set(chave, {
      _colaborador: colaborador,
      _dia: dia,
      PERF_Raio_100m:          colRaio   ? boolParaOk(row[colRaio])   : 'N/A',
      PERF_SLA_Janela:         colSla    ? boolParaOk(row[colSla])    : 'N/A',
      PERF_Tempo_Min:          colTempo  ? boolParaOk(row[colTempo])  : 'N/A',
      PERF_Sequenciamento:     colSeq    ? boolParaOk(row[colSeq])    : 'N/A',
      PERF_Bonificacao:        toNum(colBonif ? row[colBonif] : 0),
      Peso_Pedido_Dia:         toNum(colPeso    ? row[colPeso]    : 0),
      PESO_Devolvido_Dia:      toNum(colDev     ? row[colDev]     : 0),
      PESO_Percentual_Devolvido: toNum(colPercDev ? row[colPercDev] : 0),
    });
  }
  return mapa;
}

/**
 * Extrai campos de ponto de um array de rows.
 * Espelha: processar_ponto()
 */
function processarPonto(
  rows: Record<string, any>[],
  tipoColaborador: 'Motorista' | 'Ajudante'
): Map<string, Record<string, any>> {
  const mapa = new Map<string, Record<string, any>>();
  if (!rows || rows.length === 0) return mapa;

  const cols    = Object.keys(rows[0]);
  const colNome = findCol([tipoColaborador, 'Colaborador', 'Nome'], cols);
  const colDia  = findCol(['Dia', 'Data'], cols);

  const colEntrada   = findCol(['Entrada'], cols);
  const colSaidaAlm  = findCol(['Saida_Almoco', 'Saída Almoço', 'SaidaAlmoco'], cols);
  const colRetAlm    = findCol(['Retorno_Almoco', 'Retorno Almoço', 'RetornoAlmoco'], cols);
  const colSaida     = findCol(['Saida', 'Saída'], cols);
  const colBatidas   = findCol(['✓ Marcacoes', 'Marcacoes_100', 'Todas_Batidas'], cols);
  const colHE        = findCol(['Excesso_Jornada', 'Hora_Extra', 'HE'], cols);
  const colAlmoco    = findCol(['Tempo_Almoco', 'Intervalo_Almoco', 'Almoco'], cols);
  const colTrabConf  = findCol(['Tempo_Trabalhado_Conf', 'Tempo_Trabalhado'], cols);
  const colIntraJ    = findCol(['✓ Intrajornada', 'Intrajornada_OK', 'Intrajornada'], cols);
  const colDSR       = findCol(['Violou_DSR', 'DSR'], cols);
  const colInterDesc = findCol(['Interjornada_Descanso', 'Descanso_Interjornada'], cols);
  const colInterDef  = findCol(['Deficit_Interjornada', 'Déficit_Interjornada'], cols);
  const colInterJ    = findCol(['✓ Interjornada', 'Interjornada_OK', 'Interjornada'], cols);
  const colBonMar    = findCol(['Bonus_Marcacoes', 'Bônus_Marcações', 'PONTO_Bonificacao'], cols);
  const colBonCrit   = findCol(['Bonus_Criterios', 'Bônus_Critérios', 'JORNADA_Bonificacao'], cols);
  const colBonTotal  = findCol(['Bonificacao_Total_Dia', 'TOTAL_Ponto_Bonificacao'], cols);

  for (const row of rows) {
    const colaborador = String(row[colNome!] || '').trim().toUpperCase();
    const dia         = toDateStr(row[colDia!]);
    if (!colaborador || !dia) continue;

    const bonMar   = toNum(colBonMar   ? row[colBonMar]   : 0);
    const bonCrit  = toNum(colBonCrit  ? row[colBonCrit]  : 0);
    const bonTotal = colBonTotal ? toNum(row[colBonTotal]) : bonMar + bonCrit;

    const chave = `${colaborador}|${dia}`;
    mapa.set(chave, {
      _colaborador: colaborador,
      _dia: dia,
      PONTO_Entrada:               colEntrada   ? String(row[colEntrada]   || '') : '',
      PONTO_Saida_Almoco:          colSaidaAlm  ? String(row[colSaidaAlm]  || '') : '',
      PONTO_Retorno_Almoco:        colRetAlm    ? String(row[colRetAlm]    || '') : '',
      PONTO_Saida:                 colSaida     ? String(row[colSaida]     || '') : '',
      PONTO_Todas_Batidas:         colBatidas   ? boolParaOk(row[colBatidas]) : 'N/A',
      JORNADA_Hora_Extra:          colHE        ? String(row[colHE]        || '') : '',
      JORNADA_Intervalo_Almoco:    colAlmoco    ? String(row[colAlmoco]    || '') : '',
      JORNADA_Tempo_Total:         colTrabConf  ? String(row[colTrabConf]  || '') : '',
      JORNADA_Intrajornada:        colIntraJ    ? boolParaOk(row[colIntraJ]) : 'N/A',
      JORNADA_DSR:                 colDSR       ? boolParaOk(row[colDSR], true) : 'N/A', // True = violação = FALHA
      JORNADA_Interjornada_Descanso: colInterDesc ? String(row[colInterDesc] || '') : '',
      JORNADA_Deficit_Interjornada:  colInterDef  ? String(row[colInterDef]  || '') : '',
      JORNADA_Interjornada:        colInterJ    ? boolParaOk(row[colInterJ]) : 'N/A',
      PONTO_Bonificacao:           bonMar,
      JORNADA_Bonificacao:         bonCrit,
      TOTAL_Ponto_Bonificacao:     bonTotal,
    });
  }
  return mapa;
}

/**
 * Extrai campos de condução de um array de rows.
 * Espelha: processar_conducao()
 */
function processarConducao(
  rows: Record<string, any>[]
): Map<string, Record<string, any>> {
  const mapa = new Map<string, Record<string, any>>();
  if (!rows || rows.length === 0) return mapa;

  const cols    = Object.keys(rows[0]);
  const colNome = findCol(['Motorista', 'MOTORISTA', 'Colaborador'], cols);
  const colDia  = findCol(['Dia', 'Data'], cols);

  const colVeloc = findCol(['✓ Sem Excesso Velocidade', 'Excesso_Velocidade', 'Velocidade'], cols);
  const colCurva = findCol(['✓ Curva 100%', 'Curva_Brusca', 'Curva'], cols);
  const colBang  = findCol(['✓ Banguela 100%', 'Banguela'], cols);
  const colOcio  = findCol(['✓ Ociosidade 100%', 'Ociosidade'], cols);
  const colBonif = findCol(['Bonificação Condução', 'COND_Bonificacao', 'Bonificacao_Conducao'], cols);

  for (const row of rows) {
    const colaborador = String(row[colNome!] || '').trim().toUpperCase();
    const dia         = toDateStr(row[colDia!]);
    if (!colaborador || !dia) continue;

    const chave = `${colaborador}|${dia}`;
    mapa.set(chave, {
      _colaborador: colaborador,
      _dia: dia,
      COND_Excesso_Velocidade: colVeloc ? boolParaOk(row[colVeloc]) : 'N/A',
      COND_Curva_Brusca:       colCurva ? boolParaOk(row[colCurva]) : 'N/A',
      COND_Banguela:           colBang  ? boolParaOk(row[colBang])  : 'N/A',
      COND_Ociosidade:         colOcio  ? boolParaOk(row[colOcio])  : 'N/A',
      COND_Bonificacao:        toNum(colBonif ? row[colBonif] : 0),
    });
  }
  return mapa;
}

// ── Consolidação ────────────────────────────────────────────────────────────

/**
 * Faz merge dos mapas de performance, ponto e condução.
 * Aplica regra de devolução e calcula totais.
 * Espelha: consolidar()
 */
function consolidar(
  mapaPerf: Map<string, Record<string, any>>,
  mapaPonto: Map<string, Record<string, any>>,
  mapaCond: Map<string, Record<string, any>> | null,
  cargo: 'Motorista' | 'Ajudante',
  bonificacaoMaxima: number
): DiaConsolidado[] {

  // União de todas as chaves (colaborador|dia)
  const todasChaves = new Set([
    ...mapaPerf.keys(),
    ...mapaPonto.keys(),
    ...(mapaCond?.keys() ?? []),
  ]);

  const resultado: DiaConsolidado[] = [];

  for (const chave of todasChaves) {
    const perf  = mapaPerf.get(chave)  || {};
    const ponto = mapaPonto.get(chave) || {};
    const cond  = mapaCond?.get(chave) || {};

    // Colaborador e Dia vêm de qualquer fonte disponível
    const colaborador = String(perf._colaborador || ponto._colaborador || cond._colaborador || '').trim();
    const dia         = String(perf._dia          || ponto._dia         || cond._dia         || '');
    if (!colaborador || !dia) continue;

    const perfBonif  = toNum(perf.PERF_Bonificacao);
    const pontoTotal = toNum(ponto.TOTAL_Ponto_Bonificacao);
    const condBonif  = toNum(cond.COND_Bonificacao);
    const percDev    = toNum(perf.PESO_Percentual_Devolvido);

    // Regra de penalização por devolução (≥ 15% → zera tudo)
    // Espelha: df.loc[df['PESO_Penalizado'], col] = 0.0
    const penalizado = percDev >= PERCENTUAL_MAXIMO_DEVOLUCAO;
    const perfBonifFinal  = penalizado ? 0 : perfBonif;
    const pontoTotalFinal = penalizado ? 0 : pontoTotal;
    const condBonifFinal  = penalizado ? 0 : condBonif;
    const pontoMar        = penalizado ? 0 : toNum(ponto.PONTO_Bonificacao);
    const pontoCrit       = penalizado ? 0 : toNum(ponto.JORNADA_Bonificacao);

    const bonificacaoDiaria = round2(perfBonifFinal + pontoTotalFinal + condBonifFinal);
    const percentualAtingido = bonificacaoMaxima > 0
      ? `${round2(bonificacaoDiaria / bonificacaoMaxima * 100)}%`
      : '0%';

    resultado.push({
      Colaborador: colaborador,
      Cargo: cargo,
      Dia: dia,
      // Performance
      PERF_Raio_100m:            perf.PERF_Raio_100m        || 'N/A',
      PERF_SLA_Janela:           perf.PERF_SLA_Janela       || 'N/A',
      PERF_Tempo_Min:            perf.PERF_Tempo_Min        || 'N/A',
      PERF_Sequenciamento:       perf.PERF_Sequenciamento   || 'N/A',
      PERF_Bonificacao:          perfBonifFinal,
      // Peso / devolução
      Peso_Pedido_Dia:           toNum(perf.Peso_Pedido_Dia),
      PESO_Devolvido_Dia:        toNum(perf.PESO_Devolvido_Dia),
      PESO_Percentual_Devolvido: percDev,
      PESO_Penalizado:           penalizado,
      // Ponto
      PONTO_Entrada:             ponto.PONTO_Entrada            || '',
      PONTO_Saida_Almoco:        ponto.PONTO_Saida_Almoco       || '',
      PONTO_Retorno_Almoco:      ponto.PONTO_Retorno_Almoco     || '',
      PONTO_Saida:               ponto.PONTO_Saida              || '',
      PONTO_Todas_Batidas:       ponto.PONTO_Todas_Batidas      || 'N/A',
      PONTO_Bonificacao:         pontoMar,
      // Jornada
      JORNADA_Hora_Extra:            ponto.JORNADA_Hora_Extra            || '',
      JORNADA_Intervalo_Almoco:      ponto.JORNADA_Intervalo_Almoco      || '',
      JORNADA_Intrajornada:          ponto.JORNADA_Intrajornada          || 'N/A',
      JORNADA_Interjornada:          ponto.JORNADA_Interjornada          || 'N/A',
      JORNADA_Interjornada_Descanso: ponto.JORNADA_Interjornada_Descanso || '',
      JORNADA_Deficit_Interjornada:  ponto.JORNADA_Deficit_Interjornada  || '',
      JORNADA_DSR:               ponto.JORNADA_DSR               || 'N/A',
      JORNADA_Tempo_Total:       ponto.JORNADA_Tempo_Total        || '',
      JORNADA_Bonificacao:       pontoCrit,
      TOTAL_Ponto_Bonificacao:   pontoTotalFinal,
      // Condução
      COND_Excesso_Velocidade:   cond.COND_Excesso_Velocidade || (cargo === 'Motorista' ? 'N/A' : undefined),
      COND_Curva_Brusca:         cond.COND_Curva_Brusca       || (cargo === 'Motorista' ? 'N/A' : undefined),
      COND_Banguela:             cond.COND_Banguela            || (cargo === 'Motorista' ? 'N/A' : undefined),
      COND_Ociosidade:           cond.COND_Ociosidade          || (cargo === 'Motorista' ? 'N/A' : undefined),
      COND_Bonificacao:          condBonifFinal,
      // Totais
      Bonificacao_Diaria_Total:  bonificacaoDiaria,
      Bonificacao_Max_Dia:       bonificacaoMaxima,
      Percentual_Atingido:       percentualAtingido,
      Bonificacao_Acumulada:     0, // preenchido abaixo
    });
  }

  // Ordena por colaborador e dia
  resultado.sort((a, b) => {
    if (a.Colaborador !== b.Colaborador) return a.Colaborador.localeCompare(b.Colaborador);
    return a.Dia.localeCompare(b.Dia);
  });

  // Calcula bonificação acumulada por colaborador
  // Espelha: df.groupby('_Colaborador')['Bonificacao_Diaria_Total'].cumsum()
  const acumulado = new Map<string, number>();
  for (const dia of resultado) {
    const prev = acumulado.get(dia.Colaborador) || 0;
    const novo  = round2(prev + dia.Bonificacao_Diaria_Total);
    acumulado.set(dia.Colaborador, novo);
    dia.Bonificacao_Acumulada = novo;
  }

  return resultado;
}

// ── Leitura Firebase (estrutura pronta — integração pendente) ───────────────

/**
 * ⚠️  STUB — Firebase não está ajustado ainda.
 * Quando o banco estiver pronto, substituir pelo fetch real dos documentos
 * salvos pelos pipelines (performaxxi, ponto, vfleet).
 *
 * Estrutura esperada no Firebase:
 *  /results/performaxxi/{year}/{month}/  → { data: DiaPerformance[] }
 *  /results/ponto/{year}/{month}/        → { detalhePonto: DiaPonto[] }
 *  /results/vfleet/{year}/{month}/       → { detalheConducao: DiaConducao[] }
 */
async function carregarDoFirebase(year: number, month: number): Promise<{
  perfMot: Record<string, any>[];
  perfAju: Record<string, any>[];
  pontoMot: Record<string, any>[];
  pontoAju: Record<string, any>[];
  cond: Record<string, any>[];
}> {
  // TODO: Implementar quando o banco estiver ajustado.
  // Exemplo de como será:
  //
  // const perfResult  = await firebaseStore.getResult('performaxxi', year, month);
  // const pontoResult = await firebaseStore.getResult('ponto', year, month);
  // const condResult  = await firebaseStore.getResult('vfleet', year, month);
  //
  // return {
  //   perfMot:  perfResult?.detalheDiarioMotorista  || [],
  //   perfAju:  perfResult?.detalheDiarioAjudante   || [],
  //   pontoMot: pontoResult?.detalhePontoMotorista  || [],
  //   pontoAju: pontoResult?.detalhePontoAjudante   || [],
  //   cond:     condResult?.detalheConducao         || [],
  // };

  throw new Error(
    'Leitura via Firebase ainda não implementada — o banco precisa ser ajustado primeiro. ' +
    'Use a opção de upload de arquivos Excel por enquanto.'
  );
}

// ── Pipeline principal ────────────────────────────────────────────────────────

export async function executeConsolidadorPipeline(formData: FormData) {
  try {
    const targetYear  = parseInt(formData.get('year')  as string);
    const targetMonth = parseInt(formData.get('month') as string);
    const fonte       = (formData.get('fonte') as FonteInput) || 'excel';
    const files       = formData.getAll('files') as File[];

    if (!targetYear || !targetMonth) {
      throw new Error('Ano e mês são obrigatórios.');
    }

    let perfMotRows:  Record<string, any>[] = [];
    let perfAjuRows:  Record<string, any>[] = [];
    let pontoMotRows: Record<string, any>[] = [];
    let pontoAjuRows: Record<string, any>[] = [];
    let condRows:     Record<string, any>[] = [];

    // ── FONTE A: Arquivos Excel ──────────────────────────────────────────
    if (fonte === 'excel') {
      if (files.length === 0) {
        throw new Error('Nenhum arquivo enviado. Envie os 3 relatórios analíticos (.xlsx).');
      }

      for (const file of files) {
        const abas = await lerExcel(file);
        const n    = file.name.toLowerCase();

        if (n.includes('performaxxi') || n.includes('performance')) {
          perfMotRows  = buscarAba(abas, ABAS_PERF_MOT)  || perfMotRows;
          perfAjuRows  = buscarAba(abas, ABAS_PERF_AJU)  || perfAjuRows;
        } else if (n.includes('ponto') || n.includes('absenteismo')) {
          pontoMotRows = buscarAba(abas, ABAS_PONTO_MOT) || pontoMotRows;
          pontoAjuRows = buscarAba(abas, ABAS_PONTO_AJU) || pontoAjuRows;
        } else if (n.includes('conducao') || n.includes('vfleet')) {
          condRows     = buscarAba(abas, ABAS_COND)       || condRows;
        } else {
          // Arquivo com nome desconhecido: tenta todas as abas relevantes
          perfMotRows  = buscarAba(abas, ABAS_PERF_MOT)  || perfMotRows;
          perfAjuRows  = buscarAba(abas, ABAS_PERF_AJU)  || perfAjuRows;
          pontoMotRows = buscarAba(abas, ABAS_PONTO_MOT) || pontoMotRows;
          pontoAjuRows = buscarAba(abas, ABAS_PONTO_AJU) || pontoAjuRows;
          condRows     = buscarAba(abas, ABAS_COND)       || condRows;
        }
      }

    // ── FONTE B: Firebase ────────────────────────────────────────────────
    } else {
      const fb = await carregarDoFirebase(targetYear, targetMonth);
      perfMotRows  = fb.perfMot;
      perfAjuRows  = fb.perfAju;
      pontoMotRows = fb.pontoMot;
      pontoAjuRows = fb.pontoAju;
      condRows     = fb.cond;
    }

    // Validação mínima
    if (perfMotRows.length === 0 && perfAjuRows.length === 0) {
      throw new Error('Nenhum dado de Performance encontrado. Verifique os arquivos ou o banco.');
    }
    if (pontoMotRows.length === 0 && pontoAjuRows.length === 0) {
      throw new Error('Nenhum dado de Ponto encontrado. Verifique os arquivos ou o banco.');
    }

    // ── Processa cada fonte ──────────────────────────────────────────────
    const mapaPerf_Mot  = processarPerformance(perfMotRows,  'Motorista');
    const mapaPerf_Aju  = processarPerformance(perfAjuRows,  'Ajudante');
    const mapaPonto_Mot = processarPonto(pontoMotRows,       'Motorista');
    const mapaPonto_Aju = processarPonto(pontoAjuRows,       'Ajudante');
    const mapaCond      = condRows.length > 0 ? processarConducao(condRows) : null;

    // ── Consolida Motoristas e Ajudantes ─────────────────────────────────
    const motoristas = consolidar(mapaPerf_Mot, mapaPonto_Mot, mapaCond, 'Motorista', BONIFICACAO_MAXIMA_MOTORISTA);
    const ajudantes  = consolidar(mapaPerf_Aju, mapaPonto_Aju, null,     'Ajudante',  BONIFICACAO_MAXIMA_AJUDANTE);

    if (motoristas.length === 0 && ajudantes.length === 0) {
      throw new Error('Consolidação gerou resultado vazio. Verifique se os nomes coincidem entre os arquivos.');
    }

    // ── Estatísticas de resumo ────────────────────────────────────────────
    const diasPenMot  = motoristas.filter(d => d.PESO_Penalizado).length;
    const diasPenAju  = ajudantes.filter(d => d.PESO_Penalizado).length;
    const totalBonMot = round2(motoristas.reduce((s, d) => s + d.Bonificacao_Diaria_Total, 0));
    const totalBonAju = round2(ajudantes.reduce((s, d)  => s + d.Bonificacao_Diaria_Total, 0));
    const motUnicos   = new Set(motoristas.map(d => d.Colaborador)).size;
    const ajuUnicos   = new Set(ajudantes.map(d  => d.Colaborador)).size;

    // ── Salva no Firebase ─────────────────────────────────────────────────
    const saved = await firebaseStore.saveResult('consolidador', {
      pipelineType : 'consolidador',
      timestamp    : Date.now(),
      year         : targetYear,
      month        : targetMonth,
      fonte        : fonte,
      // data unificada para o DataViewer (motoristas + ajudantes)
      data         : [...motoristas, ...ajudantes],
      motoristas,
      ajudantes,
      summary: [
        `${motUnicos} motoristas | ${ajuUnicos} ajudantes`,
        `Penalizados: ${diasPenMot + diasPenAju} dias`,
        `Total: R$ ${(totalBonMot + totalBonAju).toFixed(2)}`,
      ].join(' — '),
    });

    return { success: true, result: JSON.parse(JSON.stringify(saved)) };

  } catch (error: any) {
    console.error('Erro no Consolidador Pipeline:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}