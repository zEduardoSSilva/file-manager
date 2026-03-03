'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Coordenadores — TypeScript
 * Módulos:
 *  1. DESEMPENHO DE ROTAS     — lê Motoristas_Ajustado + Ajudantes_Ajustado
 *                               calcula % desempenho diário por empresa
 *                               remove domingos, calcula bonificação de rotas
 *  2. PROCESSADOR DE PONTO    — lê CSVs de ponto (Ponto_Original_*-*.csv)
 *                               extrai marcações por colaborador/dia
 *                               filtra pelo mês, remove duplicatas
 *  3. TEMPO INTERNO           — cruza ponto + RelatorioAnaliticoRotaPedidos
 *                               calcula T1 (chegada→início rota)
 *                               e T2 (fim rota→saída)
 *                               avalia por empresa/dia, bonificação de tempo
 *  4. CONSOLIDAÇÃO FINAL      — une rotas + tempo + peso
 *                               aplica penalização: % devolvido ≥ 15% → R$ 0,00
 *                               calcula bonificação total (rotas + tempo)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações financeiras ────────────────────────────────────────────────
const BONIFICACAO_TOTAL_DIA   = 60.00;  // R$ total máximo por dia
const BONIFICACAO_ROTAS       = 48.00;  // 80% do total → desempenho de rotas
const BONIFICACAO_TEMPO       = 12.00;  // 20% do total → tempo interno
const LIMITE_DEVOLUCAO_PERC   = 15.0;   // % devolvido ≥ valor → zera bonificação

// ── Limites de tempo interno ─────────────────────────────────────────────────
const TEMPO_INTERNO_MAX_ANTES  = 30;    // minutos (T1: chegada → início rota)
const TEMPO_INTERNO_MAX_DEPOIS = 40;    // minutos (T2: fim rota → saída)

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalize = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const normalizeKey = (s: string) =>
  normalize(s).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

/**
 * Encontra o nome original de uma coluna a partir de candidatos normalizados.
 * Prioridade: match exato → começa com → contém.
 */
const findCol = (headers: string[], candidates: string[]): number => {
  const normHeaders = headers.map(h => normalizeKey(String(h)));
  // Passagem 1 — match exato
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const idx = normHeaders.findIndex(h => h === nc);
    if (idx >= 0) return idx;
  }
  // Passagem 2 — coluna começa com candidato
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const idx = normHeaders.findIndex(h => h.startsWith(nc));
    if (idx >= 0) return idx;
  }
  // Passagem 3 — candidato contido na coluna
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const idx = normHeaders.findIndex(h => h.includes(nc));
    if (idx >= 0) return idx;
  }
  return -1;
};

/**
 * Converte valor Excel para timestamp em ms.
 * Suporta: número serial, Date, string "DD/MM/YYYY HH:MM:SS".
 */
const toTimestampMs = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();
  if (typeof val === 'number') {
    return Math.round((val - 25569) * 86400 * 1000);
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const iso  = `${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}T${match[4]}:${match[5]}:${match[6] || '00'}`;
    const d    = new Date(iso);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
};

/**
 * Converte valor Excel para objeto { str, dateKey, month, year, dayOfWeek }.
 * dateKey = "YYYY-MM-DD" para uso como chave de mapa.
 */
const toDateInfo = (val: any): { str: string; dateKey: string; month: number; year: number; dayOfWeek: number } | null => {
  if (val === null || val === undefined || val === '') return null;
  let d: Date | null = null;

  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    d = new Date(Math.round((val - 25569) * 86400 * 1000));
  } else {
    const s = String(val).trim();
    const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (match) {
      const day   = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year  = match[3].length === 2 ? `20${match[3]}` : match[3];
      const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
    if (!d) {
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }

  if (!d || isNaN(d.getTime())) return null;

  const day     = String(d.getDate()).padStart(2, '0');
  const month   = d.getMonth() + 1;
  const year    = d.getFullYear();
  const dateKey = `${year}-${String(month).padStart(2,'0')}-${day}`;

  return {
    str       : `${day}/${String(month).padStart(2,'0')}/${year}`,
    dateKey,
    month,
    year,
    dayOfWeek : d.getDay(), // 0=domingo, 6=sábado
  };
};

const toFloat = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(s) || 0;
};

/** Converte percentual: se valor entre 0 e 1, multiplica por 100. */
const normalizePercent = (values: number[]): number[] => {
  const allFractional = values.length > 0 && values.filter(v => v >= 0 && v <= 1).length / values.length > 0.9;
  return allFractional ? values.map(v => v * 100) : values;
};

/** Formata timedelta (ms) para "HH:MM". */
const fmtHHMM = (ms: number | null): string => {
  if (ms === null || ms < 0) return '00:00';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

// ── Estruturas de dados ───────────────────────────────────────────────────────

interface RotaDiariaEmpresa {
  Empresa     : string;
  Data        : string; // "YYYY-MM-DD"
  percMotorista: number;
  percAjudante : number;
  percDesempenho: number;
  bonifDia    : number;
  valorBonifRotas: number;
}

interface PontoColaborador {
  idColaborador  : string;
  nomeColaborador: string;
  data           : string; // "DD/MM/YYYY"
  diaSemana      : string;
  entrada        : string;
  saidaAlmoco    : string;
  retornoAlmoco  : string;
  saida          : string;
  tempoTotal     : string;
  entradaPrevista: string;
  saidaPrevista  : string;
}

interface TempoInternoDetalhe {
  Empresa            : string;
  Nome               : string;
  Data               : string;
  DataChegada        : string;
  DataInicioRota     : string;
  T1Max              : string;
  T1Realizado        : string;
  T1DesempPerc       : number | null;
  DataFimRota        : string;
  DataSaida          : string;
  T2Max              : string;
  T2Realizado        : string;
  T2DesempPerc       : number | null;
}

interface TempoInternoResumo {
  Empresa              : string;
  Data                 : string;
  MediaT1              : number;
  MediaT2              : number;
  PercDesempenhoTempo  : number;
  BonifDiaTempo        : number;
  ValorBonifTempo      : number;
}

interface ConsolidadoDia {
  Empresa                      : string;
  Data                         : string;
  PercAtingidoMotorista        : number;
  PercAtingidoAjudante         : number;
  PercDesempenhoRotas          : number;
  ValorBonifRotas              : number;
  PercDesempenhoTempo          : number;
  ValorBonifTempo              : number;
  PesoTotal                    : number;
  PesoDevolvido                : number;
  PercDevolvido                : number;
  PesoPenalizado               : boolean;
  BonificacaoMaxDia            : number;
  ValorBonifTotal              : number;
  PercDesempenhoConsolidado    : number;
}

interface ResumoMensalEmpresa {
  Empresa                 : string;
  DiasAnalisados          : number;
  PesoTotal               : number;
  PesoDevolvido           : number;
  PercMedioDevolvido      : number;
  PercMedioRotas          : number;
  PercMedioTempo          : number;
  PercMedioConsolidado    : number;
  TotalBonifRotas         : number;
  TotalBonifTempo         : number;
  TotalBonifMes           : number;
}

interface ResumoSimples {
  Empresa            : string;
  Mes                : number;
  BonificacaoTotal   : number;
  BonificacaoAtingida: number;
}

// ── MÓDULO 1: Desempenho de Rotas ────────────────────────────────────────────

function processarAjustado(
  buffer: Buffer,
  tipo: 'MOTORISTA' | 'AJUDANTE'
): Array<{ Empresa: string; dateKey: string; Percentual_Atingido: number; Presenca_OK: boolean }> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  // Tenta aba "Relatório Diário" ou usa a primeira
  const sheetName = workbook.SheetNames.find(n =>
    normalize(n).includes('relatorio') || normalize(n).includes('diario')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rows.length < 2) return [];

  const headers = rows[0].map((h: any) => String(h || ''));

  const iEmpresa = findCol(headers, ['empresa','filial','nome_deposito']);
  const iCargo   = findCol(headers, ['cargo','funcao']);
  const iDia     = findCol(headers, ['dia','data']);
  const iPerc    = findCol(headers, ['percentual_atingido','percentual atingido','% atingido']);
  const iPonto   = findCol(headers, ['ponto_todas_batidas','todas_batidas']);

  if (iEmpresa < 0 || iDia < 0 || iPerc < 0) return [];

  const results: Array<{ Empresa: string; dateKey: string; Percentual_Atingido: number; Presenca_OK: boolean }> = [];
  const rawPercs: number[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawPerc = toFloat(row[iPerc]);
    rawPercs.push(rawPerc);
  }

  const normalizedPercs = normalizePercent(rawPercs);

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const dateInfo = toDateInfo(row[iDia]);
    if (!dateInfo) continue;

    const cargo      = normalize(String(row[iCargo] ?? ''));
    const isTipo     = tipo === 'MOTORISTA'
      ? cargo.includes('motorista')
      : cargo.includes('ajudante');
    if (!isTipo) continue;

    const presenca = iPonto >= 0
      ? normalize(String(row[iPonto] ?? '')).includes('ok')
      : true;

    results.push({
      Empresa            : String(row[iEmpresa] ?? 'N/A').trim(),
      dateKey            : dateInfo.dateKey,
      Percentual_Atingido: normalizedPercs[i - 1],
      Presenca_OK        : presenca,
    });
  }

  return results;
}

function calcularDesempenhoRotas(
  bufferMotoristas: Buffer,
  bufferAjudantes : Buffer,
  targetMonth     : number,
  targetYear      : number
): RotaDiariaEmpresa[] {
  const motoristas = processarAjustado(bufferMotoristas, 'MOTORISTA').filter(r => r.Presenca_OK);
  const ajudantes  = processarAjustado(bufferAjudantes,  'AJUDANTE').filter(r => r.Presenca_OK);

  // Agrega média diária por empresa
  const aggregate = (
    rows: Array<{ Empresa: string; dateKey: string; Percentual_Atingido: number }>
  ): Map<string, number> => {
    const acc = new Map<string, number[]>();
    for (const r of rows) {
      const key = `${r.Empresa}|${r.dateKey}`;
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key)!.push(r.Percentual_Atingido);
    }
    const result = new Map<string, number>();
    for (const [key, vals] of acc) {
      result.set(key, vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    return result;
  };

  const motMap = aggregate(motoristas);
  const ajuMap = aggregate(ajudantes);

  // Coleta todos os pares Empresa|Data únicos
  const allKeys = new Set([...motMap.keys(), ...ajuMap.keys()]);
  const result: RotaDiariaEmpresa[] = [];

  for (const key of allKeys) {
    const [empresa, dateKey] = key.split('|');
    const dateInfo = toDateInfo(
      dateKey.split('-').reverse().join('/') // converte YYYY-MM-DD para DD/MM/YYYY
    );
    if (!dateInfo) continue;

    // Filtra mês/ano
    const [y, m] = dateKey.split('-').map(Number);
    if (m !== targetMonth || y !== targetYear) continue;

    // Remove domingos (dayofweek = 0)
    if (dateInfo.dayOfWeek === 0) continue;

    const percMot = motMap.get(key) ?? 0;
    const percAju = ajuMap.get(key) ?? 0;

    // Média das fontes disponíveis
    let percDesemp: number;
    if (motMap.has(key) && ajuMap.has(key)) {
      percDesemp = (percMot + percAju) / 2;
    } else if (motMap.has(key)) {
      percDesemp = percMot;
    } else {
      percDesemp = percAju;
    }

    percDesemp = Math.round(percDesemp * 100) / 100;
    const valorBonif = Math.round((percDesemp / 100) * BONIFICACAO_ROTAS * 100) / 100;

    result.push({
      Empresa           : empresa,
      Data              : dateKey,
      percMotorista     : Math.round(percMot * 100) / 100,
      percAjudante      : Math.round(percAju * 100) / 100,
      percDesempenho    : percDesemp,
      bonifDia          : BONIFICACAO_ROTAS,
      valorBonifRotas   : valorBonif,
    });
  }

  return result.sort((a, b) => a.Empresa.localeCompare(b.Empresa) || a.Data.localeCompare(b.Data));
}

// ── MÓDULO 2: Processador de Ponto (CSV) ────────────────────────────────────

function processarPontoCSV(content: string): PontoColaborador[] {
  const linhas      = content.split(/\r?\n/);
  const dados: PontoColaborador[] = [];
  let idAtual = '', nomeAtual = '', horarioPrev = '';

  for (const linha of linhas) {
    const cols = linha.split(';').map(c => c.trim());
    const c0 = cols[0] ?? '', c1 = cols[1] ?? '', c2 = cols[2] ?? '';

    // Pula cabeçalhos/rodapés
    if (['PONTO_ORIGINAL','APURACAO','TRANSMENDES','PAG:','PERIODO','TOTAL COLABORADOR','TOTAL GERAL'].some(x =>
      c0.toUpperCase().includes(x) || c1.toUpperCase().includes(x)
    )) continue;

    if (!c0 && !c1) continue;

    // Linha de colaborador: c0 é numérico, c1 é nome
    if (/^\d{2,}$/.test(c0) && c1 && !c0.includes('/')) {
      idAtual = c0; nomeAtual = c1; horarioPrev = '';
      continue;
    }

    // Linha com horário previsto (escala)
    if (idAtual && !c0 && cols.some(v => v.includes(':'))) {
      const horarios = cols.filter(v => v.includes(':'));
      if (!horarioPrev && horarios.length > 0) horarioPrev = horarios.join(' ');
      continue;
    }

    // Linha de data + marcações: c0 tem formato DD/MM ou DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}/.test(c0)) {
      const marcacoes = c2.split(/\s+/).filter(h => /^\d{2}:\d{2}/.test(h));
      const entrada     = marcacoes[0] ?? '';
      const saidaAlmoco = marcacoes[1] ?? '';
      const retornoAlm  = marcacoes[2] ?? '';
      const saida       = marcacoes[3] ?? '';

      let tempoTotal = '';
      if (marcacoes.length >= 2) {
        try {
          const [h1, m1] = marcacoes[0].split(':').map(Number);
          const [h2, m2] = marcacoes[marcacoes.length - 1].split(':').map(Number);
          let ini = h1 * 60 + m1, fim = h2 * 60 + m2;
          if (fim < ini) fim += 1440;
          const d = fim - ini;
          tempoTotal = `${String(Math.floor(d / 60)).padStart(2,'0')}:${String(d % 60).padStart(2,'0')}`;
        } catch { tempoTotal = ''; }
      }

      const prevHorarios = horarioPrev.split(/\s+/).filter(h => /^\d{2}:\d{2}/.test(h));
      dados.push({
        idColaborador  : idAtual,
        nomeColaborador: nomeAtual,
        data           : c0.length <= 5 ? `${c0}/2025` : c0, // fallback sem ano
        diaSemana      : c1,
        entrada,
        saidaAlmoco,
        retornoAlmoco  : retornoAlm,
        saida,
        tempoTotal,
        entradaPrevista: prevHorarios[0] ?? '',
        saidaPrevista  : prevHorarios[3] ?? '',
      });
    }
  }

  return dados;
}

function filtrarDeduplicarPonto(
  registros: PontoColaborador[],
  targetMonth: number,
  targetYear : number
): PontoColaborador[] {
  // Filtro por mês/ano
  const filtrados = registros.filter(r => {
    const partes = r.data.split('/');
    if (partes.length < 3) return false;
    const m = parseInt(partes[1]), y = parseInt(partes[2]);
    return m === targetMonth && y === targetYear;
  });

  // Deduplicação: prioriza registro mais completo (mais marcações)
  const pontoMap = new Map<string, PontoColaborador>();
  for (const r of filtrados) {
    const key   = `${r.idColaborador}|${r.data}`;
    const score = [r.entrada, r.saidaAlmoco, r.retornoAlmoco, r.saida].filter(Boolean).length;
    const prev  = pontoMap.get(key);
    if (!prev) {
      pontoMap.set(key, r);
    } else {
      const prevScore = [prev.entrada, prev.saidaAlmoco, prev.retornoAlmoco, prev.saida].filter(Boolean).length;
      if (score > prevScore) pontoMap.set(key, r);
    }
  }

  return Array.from(pontoMap.values());
}

// ── MÓDULO 3: Tempo Interno ──────────────────────────────────────────────────

interface RotaPessoaDia {
  nome   : string;
  empresa: string;
  data   : string; // "YYYY-MM-DD"
  dtInicio: number | null; // timestamp ms
  dtFim   : number | null; // timestamp ms
}

function extrairRotasPorPessoa(buffer: Buffer): RotaPessoaDia[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rows.length < 2) return [];

  const headers = rows[0].map((h: any) => String(h || ''));

  const iEmpresa  = findCol(headers, ['nome_deposito','empresa','deposito']);
  const iData     = findCol(headers, ['data_rota','data_da_rota','data']);
  const iMotorista= findCol(headers, ['nome_motorista','motorista']);
  const iAjud1    = findCol(headers, ['nome_primeiro_ajudante','primeiro_ajudante']);
  const iAjud2    = findCol(headers, ['nome_segundo_ajudante','segundo_ajudante']);
  const iInicio   = findCol(headers, ['inicio_rota_realizado','inicio_rota']);
  const iFim      = findCol(headers, ['fim_rota_realizado','fim_rota']);

  if (iData < 0 || iMotorista < 0) return [];

  const result: RotaPessoaDia[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dateInfo = toDateInfo(row[iData]);
    if (!dateInfo) continue;

    const empresa  = iEmpresa >= 0 ? String(row[iEmpresa] ?? 'N/A').trim() : 'N/A';
    const tsInicio = iInicio >= 0 ? toTimestampMs(row[iInicio]) : null;
    const tsFim    = iFim    >= 0 ? toTimestampMs(row[iFim])    : null;

    const addPessoa = (nomeRaw: any) => {
      const nome = String(nomeRaw ?? '').trim();
      if (!nome || /^(0|null|nan|sem ajudante|nao|nao informado)$/i.test(nome)) return;
      result.push({ nome, empresa, data: dateInfo.dateKey, dtInicio: tsInicio, dtFim: tsFim });
    };

    if (iMotorista >= 0) addPessoa(row[iMotorista]);
    if (iAjud1     >= 0) addPessoa(row[iAjud1]);
    if (iAjud2     >= 0) addPessoa(row[iAjud2]);
  }

  // Agrega por pessoa+data: min(dtInicio), max(dtFim)
  const agg = new Map<string, RotaPessoaDia>();
  for (const r of result) {
    const key = `${r.nome}|${r.data}`;
    const prev = agg.get(key);
    if (!prev) {
      agg.set(key, { ...r });
    } else {
      if (r.dtInicio !== null && (prev.dtInicio === null || r.dtInicio < prev.dtInicio))
        prev.dtInicio = r.dtInicio;
      if (r.dtFim !== null && (prev.dtFim === null || r.dtFim > prev.dtFim))
        prev.dtFim = r.dtFim;
    }
  }

  return Array.from(agg.values());
}

function matchNome(nome: string, pontNomes: string[]): string | null {
  const n = normalize(nome);
  // Match exato
  const exato = pontNomes.find(p => normalize(p) === n);
  if (exato) return exato;
  // Match por contenção
  const contem = pontNomes.find(p => normalize(p).includes(n) || n.includes(normalize(p)));
  return contem ?? null;
}

function calcularTempoInterno(
  ponto : PontoColaborador[],
  rotas : RotaPessoaDia[],
): { resumo: TempoInternoResumo[]; detalhe: TempoInternoDetalhe[] } {
  const pontoNomes = [...new Set(ponto.map(p => p.nomeColaborador))];

  // Monta mapa de ponto: "nome|YYYY-MM-DD" → { dtEntrada, dtSaida }
  const pontoMap = new Map<string, { dtEntrada: number | null; dtSaida: number | null }>();
  for (const p of ponto) {
    // Converte "DD/MM/YYYY" → "YYYY-MM-DD"
    const parts = p.data.split('/');
    if (parts.length < 3) continue;
    const dateKey = `${parts[2]}-${parts[1]}-${parts[0]}`;
    const nome    = p.nomeColaborador;
    const key     = `${nome}|${dateKey}`;

    // Constrói timestamps de entrada/saída
    const baseTs = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
    const parseHHMM = (hhmm: string): number | null => {
      if (!hhmm) return null;
      const [h, m] = hhmm.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return baseTs + h * 3600_000 + m * 60_000;
    };

    const dtEntrada = parseHHMM(p.entrada);
    const dtSaida   = parseHHMM(p.saida);

    const prev = pontoMap.get(key);
    if (!prev) {
      pontoMap.set(key, { dtEntrada, dtSaida });
    } else {
      // Prioriza menor entrada, maior saída
      if (dtEntrada !== null && (prev.dtEntrada === null || dtEntrada < prev.dtEntrada))
        prev.dtEntrada = dtEntrada;
      if (dtSaida !== null && (prev.dtSaida === null || dtSaida > prev.dtSaida))
        prev.dtSaida = dtSaida;
    }
  }

  const detalhe: TempoInternoDetalhe[] = [];
  const maxT1Ms = TEMPO_INTERNO_MAX_ANTES  * 60_000;
  const maxT2Ms = TEMPO_INTERNO_MAX_DEPOIS * 60_000;

  for (const rota of rotas) {
    // Tenta encontrar correspondência no ponto
    const nomeMatch = matchNome(rota.nome, pontoNomes);
    if (!nomeMatch) continue;

    const pontoKey = `${nomeMatch}|${rota.data}`;
    const p        = pontoMap.get(pontoKey);
    if (!p) continue;

    // T1: chegada → início rota
    let t1Ms: number | null = null;
    let t1Perc: number | null = null;
    if (p.dtEntrada !== null && rota.dtInicio !== null && rota.dtInicio >= p.dtEntrada) {
      t1Ms   = rota.dtInicio - p.dtEntrada;
      t1Perc = (t1Ms > 0 && t1Ms <= maxT1Ms) ? 100 : 0;
    }

    // T2: fim rota → saída
    let t2Ms: number | null = null;
    let t2Perc: number | null = null;
    if (p.dtSaida !== null && rota.dtFim !== null && p.dtSaida >= rota.dtFim) {
      t2Ms   = p.dtSaida - rota.dtFim;
      t2Perc = (t2Ms > 0 && t2Ms <= maxT2Ms) ? 100 : 0;
    }

    const fmtTs = (ts: number | null) => ts
      ? new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '';

    const [y, m, d] = rota.data.split('-');

    detalhe.push({
      Empresa        : rota.empresa,
      Nome           : rota.nome,
      Data           : `${d}/${m}/${y}`,
      DataChegada    : fmtTs(p.dtEntrada),
      DataInicioRota : fmtTs(rota.dtInicio),
      T1Max          : fmtHHMM(maxT1Ms),
      T1Realizado    : fmtHHMM(t1Ms),
      T1DesempPerc   : t1Perc,
      DataFimRota    : fmtTs(rota.dtFim),
      DataSaida      : fmtTs(p.dtSaida),
      T2Max          : fmtHHMM(maxT2Ms),
      T2Realizado    : fmtHHMM(t2Ms),
      T2DesempPerc   : t2Perc,
    });
  }

  // Agrega resumo por empresa/data
  const resumoMap = new Map<string, { t1s: number[]; t2s: number[]; empresa: string; data: string }>();
  for (const d of detalhe) {
    const parts  = d.Data.split('/');
    const dateKey = `${parts[2]}-${parts[1]}-${parts[0]}`;
    const key     = `${d.Empresa}|${dateKey}`;
    if (!resumoMap.has(key)) resumoMap.set(key, { t1s: [], t2s: [], empresa: d.Empresa, data: dateKey });
    const acc = resumoMap.get(key)!;
    if (d.T1DesempPerc !== null) acc.t1s.push(d.T1DesempPerc);
    if (d.T2DesempPerc !== null) acc.t2s.push(d.T2DesempPerc);
  }

  const resumo: TempoInternoResumo[] = [];
  for (const [, acc] of resumoMap) {
    const mediaT1 = acc.t1s.length ? acc.t1s.reduce((a, b) => a + b, 0) / acc.t1s.length : 0;
    const mediaT2 = acc.t2s.length ? acc.t2s.reduce((a, b) => a + b, 0) / acc.t2s.length : 0;
    const percTempo = Math.round(((mediaT1 + mediaT2) / 2) * 100) / 100;
    const valorBonif = Math.round((percTempo / 100) * BONIFICACAO_TEMPO * 100) / 100;

    resumo.push({
      Empresa             : acc.empresa,
      Data                : acc.data,
      MediaT1             : Math.round(mediaT1 * 100) / 100,
      MediaT2             : Math.round(mediaT2 * 100) / 100,
      PercDesempenhoTempo : percTempo,
      BonifDiaTempo       : BONIFICACAO_TEMPO,
      ValorBonifTempo     : valorBonif,
    });
  }

  return { resumo, detalhe };
}

// ── MÓDULO 4: Consolidação Final ─────────────────────────────────────────────

function extrairPesoPorEmpresaDia(buffer: Buffer): Map<string, { total: number; devolvido: number }> {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  // Tenta aba "base_dados" ou usa a primeira
  const sheetName = workbook.SheetNames.find(n =>
    normalize(n).includes('base_dados') || normalize(n).includes('base dados')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rows.length < 2) return new Map();

  const headers = rows[0].map((h: any) => String(h || ''));

  const iEmpresa     = findCol(headers, ['nome_deposito','empresa','deposito']);
  const iData        = findCol(headers, ['data_rota','data_da_rota','data']);
  const iPesoTotal   = findCol(headers, ['peso_total_calc','peso_total']);
  const iPesoDevolv  = findCol(headers, ['peso_devolvido_calc','peso_devolvido']);

  if (iEmpresa < 0 || iData < 0 || iPesoTotal < 0 || iPesoDevolv < 0) return new Map();

  const acc = new Map<string, { total: number; devolvido: number }>();

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const dateInfo = toDateInfo(row[iData]);
    if (!dateInfo) continue;
    const empresa = String(row[iEmpresa] ?? '').trim();
    const key     = `${empresa}|${dateInfo.dateKey}`;
    const total   = toFloat(row[iPesoTotal]);
    const dev     = toFloat(row[iPesoDevolv]);

    const prev = acc.get(key);
    if (!prev) acc.set(key, { total, devolvido: dev });
    else { prev.total += total; prev.devolvido += dev; }
  }

  return acc;
}

function consolidarFinal(
  rotas       : RotaDiariaEmpresa[],
  tempoResumo : TempoInternoResumo[],
  pesoMap     : Map<string, { total: number; devolvido: number }>
): { consolidado: ConsolidadoDia[]; resumoMensal: ResumoMensalEmpresa[]; resumoSimples: ResumoSimples[] } {

  // Une rotas + tempo por empresa|data
  const allKeys = new Set<string>();
  const rotasMap = new Map<string, RotaDiariaEmpresa>();
  const tempoMap = new Map<string, TempoInternoResumo>();

  for (const r of rotas)       { const k = `${r.Empresa}|${r.Data}`; rotasMap.set(k, r); allKeys.add(k); }
  for (const t of tempoResumo) { const k = `${t.Empresa}|${t.Data}`; tempoMap.set(k, t); allKeys.add(k); }

  const consolidado: ConsolidadoDia[] = [];

  for (const key of allKeys) {
    const rota  = rotasMap.get(key);
    const tempo = tempoMap.get(key);
    const empresa = (rota?.Empresa ?? tempo?.Empresa)!;
    const data    = (rota?.Data    ?? tempo?.Data)!;

    const percRotas     = rota?.percDesempenho      ?? 0;
    const valorRotas    = rota?.valorBonifRotas      ?? 0;
    const percMotorista = rota?.percMotorista        ?? 0;
    const percAjudante  = rota?.percAjudante         ?? 0;
    const percTempo     = tempo?.PercDesempenhoTempo ?? 0;
    const valorTempo    = tempo?.ValorBonifTempo     ?? 0;

    const pesoInfo      = pesoMap.get(key);
    const pesoTotal     = pesoInfo?.total     ?? 0;
    const pesoDevolvido = pesoInfo?.devolvido ?? 0;
    const percDevolv    = pesoTotal > 0 ? Math.round((pesoDevolvido / pesoTotal) * 100 * 100) / 100 : 0;

    const valorTotal  = Math.round((valorRotas + valorTempo) * 100) / 100;
    const penalizado  = percDevolv >= LIMITE_DEVOLUCAO_PERC && pesoTotal > 0;
    const bonifFinal  = penalizado ? 0 : valorTotal;
    const percConsolid = Math.round((bonifFinal / BONIFICACAO_TOTAL_DIA) * 100 * 100) / 100;

    consolidado.push({
      Empresa                    : empresa,
      Data                       : data,
      PercAtingidoMotorista      : percMotorista,
      PercAtingidoAjudante       : percAjudante,
      PercDesempenhoRotas        : percRotas,
      ValorBonifRotas            : valorRotas,
      PercDesempenhoTempo        : percTempo,
      ValorBonifTempo            : valorTempo,
      PesoTotal                  : pesoTotal,
      PesoDevolvido              : pesoDevolvido,
      PercDevolvido              : percDevolv,
      PesoPenalizado             : penalizado,
      BonificacaoMaxDia          : BONIFICACAO_TOTAL_DIA,
      ValorBonifTotal            : bonifFinal,
      PercDesempenhoConsolidado  : percConsolid,
    });
  }

  consolidado.sort((a, b) => a.Empresa.localeCompare(b.Empresa) || a.Data.localeCompare(b.Data));

  // ── Resumo mensal por empresa ───────────────────────────────────────────
  const mensalAcc = new Map<string, {
    dias: number; pesoTotal: number; pesoDev: number; percDevs: number[];
    percRotas: number[]; percTempo: number[]; percConsol: number[];
    bonifRotas: number; bonifTempo: number; bonifTotal: number;
  }>();

  for (const c of consolidado) {
    const prev = mensalAcc.get(c.Empresa);
    if (!prev) {
      mensalAcc.set(c.Empresa, {
        dias: 1, pesoTotal: c.PesoTotal, pesoDev: c.PesoDevolvido,
        percDevs: [c.PercDevolvido], percRotas: [c.PercDesempenhoRotas],
        percTempo: [c.PercDesempenhoTempo], percConsol: [c.PercDesempenhoConsolidado],
        bonifRotas: c.ValorBonifRotas, bonifTempo: c.ValorBonifTempo, bonifTotal: c.ValorBonifTotal,
      });
    } else {
      prev.dias++;
      prev.pesoTotal  += c.PesoTotal;
      prev.pesoDev    += c.PesoDevolvido;
      prev.percDevs.push(c.PercDevolvido);
      prev.percRotas.push(c.PercDesempenhoRotas);
      prev.percTempo.push(c.PercDesempenhoTempo);
      prev.percConsol.push(c.PercDesempenhoConsolidado);
      prev.bonifRotas  += c.ValorBonifRotas;
      prev.bonifTempo  += c.ValorBonifTempo;
      prev.bonifTotal  += c.ValorBonifTotal;
    }
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const resumoMensal: ResumoMensalEmpresa[] = Array.from(mensalAcc.entries()).map(([empresa, acc]) => ({
    Empresa               : empresa,
    DiasAnalisados        : acc.dias,
    PesoTotal             : Math.round(acc.pesoTotal * 100) / 100,
    PesoDevolvido         : Math.round(acc.pesoDev   * 100) / 100,
    PercMedioDevolvido    : Math.round(avg(acc.percDevs)  * 100) / 100,
    PercMedioRotas        : Math.round(avg(acc.percRotas) * 100) / 100,
    PercMedioTempo        : Math.round(avg(acc.percTempo) * 100) / 100,
    PercMedioConsolidado  : Math.round(avg(acc.percConsol)* 100) / 100,
    TotalBonifRotas       : Math.round(acc.bonifRotas * 100) / 100,
    TotalBonifTempo       : Math.round(acc.bonifTempo * 100) / 100,
    TotalBonifMes         : Math.round(acc.bonifTotal * 100) / 100,
  })).sort((a, b) => b.PercMedioConsolidado - a.PercMedioConsolidado);

  // ── Resumo simples ──────────────────────────────────────────────────────
  const simplesAcc = new Map<string, { total: number; atingida: number; mes: number }>();
  for (const c of consolidado) {
    const mes = parseInt(c.Data.split('-')[1]);
    const key = `${c.Empresa}|${mes}`;
    const prev = simplesAcc.get(key);
    if (!prev) simplesAcc.set(key, { total: c.BonificacaoMaxDia, atingida: c.ValorBonifTotal, mes });
    else { prev.total += c.BonificacaoMaxDia; prev.atingida += c.ValorBonifTotal; }
  }

  const resumoSimples: ResumoSimples[] = Array.from(simplesAcc.entries()).map(([key, acc]) => {
    const [empresa] = key.split('|');
    return {
      Empresa            : empresa,
      Mes                : acc.mes,
      BonificacaoTotal   : Math.round(acc.total   * 100) / 100,
      BonificacaoAtingida: Math.round(acc.atingida * 100) / 100,
    };
  });

  return { consolidado, resumoMensal, resumoSimples };
}

// ── Pipeline principal exportado ─────────────────────────────────────────────

export async function executeCoordenadorPipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);
    const targetYear   = parseInt(formData.get('year')  as string);
    const targetMonth  = parseInt(formData.get('month') as string);

    if (!targetYear || !targetMonth) {
      throw new Error('Parâmetros de ano/mês ausentes.');
    }

    if (pipelineType === 'coordenadores') {

      // ── Coleta os arquivos por tipo ──────────────────────────────────────
      const fileMotoristas  = formData.get('fileMotoristas')  as File | null;
      const fileAjudantes   = formData.get('fileAjudantes')   as File | null;
      const fileRotas       = formData.get('fileRotas')       as File | null;
      const fileAnaliseRotas= formData.get('fileAnaliseRotas')as File | null;
      const pontoFiles      = formData.getAll('filesPonto')   as File[];

      if (!fileMotoristas || !fileAjudantes) {
        throw new Error('Arquivos de Motoristas_Ajustado e Ajudantes_Ajustado são obrigatórios.');
      }

      // ── Módulo 1: Desempenho de Rotas ────────────────────────────────────
      const bufMotoristas = Buffer.from(await fileMotoristas.arrayBuffer());
      const bufAjudantes  = Buffer.from(await fileAjudantes.arrayBuffer());
      const rotas = calcularDesempenhoRotas(bufMotoristas, bufAjudantes, targetMonth, targetYear);

      // ── Módulo 2: Processador de Ponto ───────────────────────────────────
      let pontoProcessado: PontoColaborador[] = [];
      for (const pontoFile of pontoFiles) {
        const text  = await pontoFile.text();
        const dados = processarPontoCSV(text);
        pontoProcessado.push(...dados);
      }
      pontoProcessado = filtrarDeduplicarPonto(pontoProcessado, targetMonth, targetYear);

      // ── Módulo 3: Tempo Interno ──────────────────────────────────────────
      let tempoResumo : TempoInternoResumo[]  = [];
      let tempoDetalhe: TempoInternoDetalhe[] = [];

      if (fileRotas && pontoProcessado.length > 0) {
        const bufRotas = Buffer.from(await fileRotas.arrayBuffer());
        const rotasPD  = extrairRotasPorPessoa(bufRotas);
        const { resumo, detalhe } = calcularTempoInterno(pontoProcessado, rotasPD);
        tempoResumo  = resumo;
        tempoDetalhe = detalhe;
      }

      // ── Módulo 4: Consolidação Final ─────────────────────────────────────
      let pesoMap = new Map<string, { total: number; devolvido: number }>();
      if (fileAnaliseRotas) {
        const bufAnalise = Buffer.from(await fileAnaliseRotas.arrayBuffer());
        pesoMap = extrairPesoPorEmpresaDia(bufAnalise);
      }

      const { consolidado, resumoMensal, resumoSimples } = consolidarFinal(rotas, tempoResumo, pesoMap);

      // ── Salva no Firebase ─────────────────────────────────────────────────
      const saved = await firebaseStore.saveResult('coordenadores', {
        pipelineType : 'coordenadores',
        timestamp    : Date.now(),
        year         : targetYear,
        month        : targetMonth,
        data         : consolidado,
        resumoMensal,
        resumoSimples,
        tempoDetalhe : tempoDetalhe.slice(0, 500), // limita payload
        ponto        : pontoProcessado.slice(0, 500),
        summary      : `${consolidado.length} dias | ${resumoMensal.length} empresas | ${pontoProcessado.length} registros de ponto.`,
        config: {
          BONIFICACAO_TOTAL_DIA,
          BONIFICACAO_ROTAS,
          BONIFICACAO_TEMPO,
          LIMITE_DEVOLUCAO_PERC,
          TEMPO_INTERNO_MAX_ANTES,
          TEMPO_INTERNO_MAX_DEPOIS,
        },
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error('Erro no Pipeline Coordenadores:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}