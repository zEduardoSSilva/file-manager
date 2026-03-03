'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Roadshow — TypeScript (Ocupação de Jornada e Veículo)
 *
 * Módulo 1 — Carregamento
 *   • Consolidado_Entregas_V2_Geral.xlsx (fonte principal)
 *   • RelatorioAnaliticoRotaPedidos.xlsx (tempo produtivo via Performaxxi)
 *   • Veiculos.xlsx (fallback de capacidade)
 *
 * Módulo 2 — Preparação do Consolidado
 *   • Padroniza colunas, converte tipos, filtra mês/ano
 *   • Converte TEMPO para minutos (timedelta)
 *
 * Módulo 3 — Tempo Produtivo (Performaxxi)
 *   • Agrega Fim − Início por DATA + PLACA (max por dia/placa)
 *
 * Módulo 4 — Cálculo de Ocupações
 *   • Merge consolidado + tempo produtivo + capacidade veículo
 *   • Ocupação Jornada (%) = Tempo Produtivo / Tempo Total Jornada × 100
 *   • Ocupação Veículo (%) = Peso / Capacidade Nominal × 100
 *
 * Módulo 5 — Incentivo por Região
 *   • Agrega por DATA + REGIÃO
 *   • Jornada ≤ 100% → indicador = Jornada (100%) | > 100% → indicador = Veículo
 *   • Incentivo diário = (Indicador / 100) × (R$ 400,00 / 25 dias)
 *
 * Módulo 6 — Resumos
 *   • Resumo mensal por região (média e aritmética)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações ─────────────────────────────────────────────────────────────
const META_JORNADA_MAX = 100;   // % máximo ocupação jornada (acima → usa veículo)
const META_VEICULO_MIN = 85;    // % mínimo ocupação veículo (referência visual)
const VALOR_MENSAL     = 400.00;// R$ meta mensal por região
const DIAS_META        = 25;    // dias úteis de referência
const VALOR_DIA        = VALOR_MENSAL / DIAS_META; // R$ 16,00/dia

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalizeKey = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').trim();

/**
 * Encontra índice de coluna por candidatos normalizados.
 * Prioridade: todas as keywords → exato → começa com → contém.
 */
const findCol = (headers: string[], candidates: string[]): number => {
  const norm = headers.map(h => normalizeKey(String(h)));

  // Passagem 1: match exato
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h === nc);
    if (i >= 0) return i;
  }
  // Passagem 2: começa com
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h.startsWith(nc));
    if (i >= 0) return i;
  }
  // Passagem 3: contém
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h.includes(nc));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * Encontra a coluna onde o nome normalizado contém TODAS as keywords.
 * Útil para distinguir "DATA DE ENTREGA" de "DATA CARREGAMENTO".
 */
const findColMulti = (headers: string[], keywords: string[]): number => {
  const norm = headers.map(h => normalizeKey(String(h)));
  const keys = keywords.map(k => normalizeKey(k));
  return norm.findIndex(h => keys.every(k => h.includes(k)));
};

/**
 * Converte valor Excel para Date.
 */
const toDate = (val: any): Date | null => {
  if (!val && val !== 0) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const yr = match[3].length === 2 ? `20${match[3]}` : match[3];
    const d  = new Date(`${yr}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Converte valor Excel para timestamp ms (suporta serial + string).
 */
const toTimestampMs = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.getTime();
  if (typeof val === 'number') return Math.round((val - 25569) * 86400 * 1000);
  const s     = String(val).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const yr  = match[3].length === 2 ? `20${match[3]}` : match[3];
    const iso = `${yr}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}T${match[4]}:${match[5]}:${match[6] || '00'}`;
    const d   = new Date(iso);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
};

/**
 * Converte string "HH:MM" ou "HH:MM:SS" para minutos totais.
 */
const hmsToMinutes = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    // Fração de dia (serial Excel)
    return Math.round(val * 24 * 60);
  }
  const s     = String(val).trim();
  const match = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);
  return null;
};

const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

const fmtMinutes = (min: number | null): string => {
  if (min === null || min < 0) return '00:00';
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};

const toFloat = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(s) || 0;
};

const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const rnd = (v: number, dec = 2) => Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);

// ── Estruturas ────────────────────────────────────────────────────────────────

interface RegistroConsolidado {
  dataEntrega       : string;   // "YYYY-MM-DD"
  dataFmt           : string;   // "DD/MM/YYYY"
  filial            : string;
  regiao            : string;
  operacao          : string;
  motorista         : string;
  placa             : string;
  peso              : number;
  capacidade        : number;
  tempoJornadaMin   : number | null;
  tempoJornadaFmt   : string;
  km                : number;
  tipoCarga         : string;
  status            : string;
  performaxxi       : string;
  // Calculados
  tempoProdMin      : number | null;
  tempoProdFmt      : string;
  ocupJornadaPerc   : number | null;
  ocupVeiculoPerc   : number | null;
}

interface TempoProdutivo {
  dataEntrega : string;  // "YYYY-MM-DD"
  placa       : string;
  tempoProdMin: number | null;
  inicioRota  : number | null;  // timestamp ms
  fimRota     : number | null;
}

interface OcupacaoDiaria {
  dataEntrega       : string;
  dataFmt           : string;
  regiao            : string;
  ocupJornadaMedia  : number | null;
  ocupVeiculoMedia  : number | null;
  qtdeRotas         : number;
  pesoTotal         : number;
  kmTotal           : number;
}

interface IncentivoDiario extends OcupacaoDiaria {
  indicadorUsado    : string;
  percentualDia     : number;
  incentivoDiario   : number;
  metaVeiculoMin    : number;
  atingiuMetaVeiculo: boolean;
}

interface ResumoMensal {
  regiao             : string;
  diasAnalisados     : number;
  diasComIncentivo   : number;
  ocupJornadaMedia   : number;
  ocupVeiculoMedia   : number;
  incentivoTotal     : number;
  metaMensal         : number;
  percAtingido       : number;
}

interface ResumoAritmetico {
  regiao              : string;
  diasAnalisados      : number;
  pesoTotalMes        : number;
  capacidadeTotalMes  : number;
  ocupMediaDiaria     : number;
  ocupMesAritmetica   : number;
}

// ── Módulo 1: Carregamento ────────────────────────────────────────────────────

function lerSheet(buffer: Buffer): { headers: string[]; rows: any[][] } {
  const wb    = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rows.length < 2) return { headers: [], rows: [] };
  return {
    headers: rows[0].map((h: any) => String(h || '').trim()),
    rows   : rows.slice(1),
  };
}

// ── Módulo 2: Preparação do Consolidado ──────────────────────────────────────

function prepararConsolidado(
  buffer     : Buffer,
  targetYear : number,
  targetMonth: number,
  veiculosMap: Map<string, number>
): RegistroConsolidado[] {

  const { headers, rows } = lerSheet(buffer);

  const iData     = findColMulti(headers, ['data', 'entrega']) >= 0
    ? findColMulti(headers, ['data', 'entrega'])
    : findCol(headers, ['data_entrega', 'data de entrega', 'data']);
  const iFilial   = findCol(headers, ['filial']);
  const iRegiao   = findCol(headers, ['regiao', 'região', 'regiao']);
  const iOperacao = findCol(headers, ['operacao', 'operação']);
  const iMotor    = findCol(headers, ['motorista']);
  const iPlaca    = findCol(headers, ['placa']);
  const iPeso     = findCol(headers, ['peso']);
  const iCap      = findCol(headers, ['capacidade']);
  const iTempo    = findCol(headers, ['tempo']);
  const iKm       = findCol(headers, ['km']);
  const iTipo     = findCol(headers, ['tipo_carga', 'tipo carga', 'tipo']);
  const iStatus   = findCol(headers, ['status']);
  const iPerf     = findCol(headers, ['performaxxi', 'performax']);

  if (iData < 0 || iPlaca < 0) {
    throw new Error('Colunas obrigatórias (DATA DE ENTREGA, PLACA) não encontradas no Consolidado_Entregas.');
  }

  const result: RegistroConsolidado[] = [];

  for (const row of rows) {
    const data = toDate(row[iData]);
    if (!data) continue;
    if (data.getFullYear() !== targetYear || data.getMonth() + 1 !== targetMonth) continue;

    const placa       = String(row[iPlaca] ?? '').trim().toUpperCase();
    const tempoMin    = iTempo >= 0 ? hmsToMinutes(row[iTempo]) : null;
    const pesoVal     = iPeso  >= 0 ? toFloat(row[iPeso])  : 0;
    let   capVal      = iCap   >= 0 ? toFloat(row[iCap])   : 0;

    // Fallback capacidade via Veiculos.xlsx
    if (capVal === 0 && veiculosMap.has(placa)) capVal = veiculosMap.get(placa)!;

    const dateKey = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;

    result.push({
      dataEntrega    : dateKey,
      dataFmt        : fmtDate(data),
      filial         : iFilial   >= 0 ? String(row[iFilial]   ?? '').trim().toUpperCase() : 'N/A',
      regiao         : iRegiao   >= 0 ? String(row[iRegiao]   ?? '').trim().toUpperCase() : 'N/A',
      operacao       : iOperacao >= 0 ? String(row[iOperacao] ?? '').trim().toUpperCase() : 'N/A',
      motorista      : iMotor    >= 0 ? String(row[iMotor]    ?? '').trim()               : '',
      placa,
      peso           : pesoVal,
      capacidade     : capVal,
      tempoJornadaMin: tempoMin,
      tempoJornadaFmt: fmtMinutes(tempoMin),
      km             : iKm     >= 0 ? toFloat(row[iKm])                          : 0,
      tipoCarga      : iTipo   >= 0 ? String(row[iTipo]   ?? '').trim()           : '',
      status         : iStatus >= 0 ? String(row[iStatus] ?? '').trim()           : '',
      performaxxi    : iPerf   >= 0 ? String(row[iPerf]   ?? '').trim()           : '',
      // Calculados depois
      tempoProdMin   : null,
      tempoProdFmt   : '00:00',
      ocupJornadaPerc: null,
      ocupVeiculoPerc: null,
    });
  }

  return result;
}

// ── Módulo 3: Tempo Produtivo (Performaxxi) ───────────────────────────────────

function calcularTempoProdutivo(
  buffer     : Buffer,
  targetYear : number,
  targetMonth: number
): Map<string, TempoProdutivo> {

  const { headers, rows } = lerSheet(buffer);

  const iData   = findColMulti(headers, ['data', 'rota']) >= 0
    ? findColMulti(headers, ['data', 'rota'])
    : findCol(headers, ['data_rota', 'data da rota', 'data']);
  const iPlaca  = findCol(headers, ['placa']);
  const iInicio = findColMulti(headers, ['inicio', 'rota', 'realizado']) >= 0
    ? findColMulti(headers, ['inicio', 'rota', 'realizado'])
    : findCol(headers, ['inicio_rota_realizado', 'inicio rota realizado', 'inicio']);
  const iFim    = findColMulti(headers, ['fim', 'rota', 'realizado']) >= 0
    ? findColMulti(headers, ['fim', 'rota', 'realizado'])
    : findCol(headers, ['fim_rota_realizado', 'fim rota realizado', 'fim']);

  if (iData < 0 || iPlaca < 0) return new Map();

  // Acumula: key = "YYYY-MM-DD|PLACA" → { tsInicio[], tsFim[] }
  const acc = new Map<string, { tsInicio: number[]; tsFim: number[] }>();

  for (const row of rows) {
    const data = toDate(row[iData]);
    if (!data) continue;
    if (data.getFullYear() !== targetYear || data.getMonth() + 1 !== targetMonth) continue;

    const placa   = String(row[iPlaca] ?? '').trim().toUpperCase();
    const dateKey = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
    const key     = `${dateKey}|${placa}`;

    const tsI = iInicio >= 0 ? toTimestampMs(row[iInicio]) : null;
    const tsF = iFim    >= 0 ? toTimestampMs(row[iFim])    : null;

    if (!acc.has(key)) acc.set(key, { tsInicio: [], tsFim: [] });
    const a = acc.get(key)!;
    if (tsI !== null) a.tsInicio.push(tsI);
    if (tsF !== null) a.tsFim.push(tsF);
  }

  // Agrega: min(inicio), max(fim)
  const result = new Map<string, TempoProdutivo>();

  for (const [key, a] of acc) {
    const [dateKey, placa] = key.split('|');
    const tsInicio = a.tsInicio.length ? Math.min(...a.tsInicio) : null;
    const tsFim    = a.tsFim.length    ? Math.max(...a.tsFim)    : null;

    let tempoProdMin: number | null = null;
    if (tsInicio !== null && tsFim !== null && tsFim > tsInicio) {
      tempoProdMin = Math.round((tsFim - tsInicio) / 60_000);
    }

    result.set(key, { dataEntrega: dateKey, placa, tempoProdMin, inicioRota: tsInicio, fimRota: tsFim });
  }

  return result;
}

// ── Módulo 4: Cálculo de Ocupações ───────────────────────────────────────────

function calcularOcupacoes(
  consolidado: RegistroConsolidado[],
  tempoMap   : Map<string, TempoProdutivo>
): RegistroConsolidado[] {

  return consolidado.map(r => {
    const key  = `${r.dataEntrega}|${r.placa}`;
    const tp   = tempoMap.get(key);

    const tempoProdMin    = tp?.tempoProdMin ?? null;
    const tempoProdFmt    = fmtMinutes(tempoProdMin);

    // Ocupação Jornada: Tempo Produtivo / Tempo Total Jornada × 100
    const ocupJornadaPerc = (
      tempoProdMin !== null &&
      r.tempoJornadaMin !== null &&
      r.tempoJornadaMin > 0
    )
      ? rnd(tempoProdMin / r.tempoJornadaMin * 100)
      : null;

    // Ocupação Veículo: Peso / Capacidade × 100
    const ocupVeiculoPerc = (r.capacidade > 0)
      ? rnd(r.peso / r.capacidade * 100)
      : null;

    return { ...r, tempoProdMin, tempoProdFmt, ocupJornadaPerc, ocupVeiculoPerc };
  });
}

// ── Módulo 5: Incentivo por Região ───────────────────────────────────────────

function calcularIncentivo(consolidado: RegistroConsolidado[]): {
  diario : OcupacaoDiaria[];
  incent : IncentivoDiario[];
} {
  // Agrega por DATA + REGIÃO
  const acc = new Map<string, {
    jornadas: number[]; veiculos: number[]; placas: number;
    peso: number; km: number; regiao: string; data: string;
  }>();

  for (const r of consolidado) {
    const key = `${r.dataEntrega}|${r.regiao}`;
    if (!acc.has(key)) {
      acc.set(key, { jornadas: [], veiculos: [], placas: 0, peso: 0, km: 0, regiao: r.regiao, data: r.dataEntrega });
    }
    const a = acc.get(key)!;
    a.placas++;
    a.peso += r.peso;
    a.km   += r.km;
    if (r.ocupJornadaPerc !== null) a.jornadas.push(r.ocupJornadaPerc);
    if (r.ocupVeiculoPerc !== null) a.veiculos.push(r.ocupVeiculoPerc);
  }

  const diario : OcupacaoDiaria[]  = [];
  const incent : IncentivoDiario[] = [];

  for (const [, a] of acc) {
    const [y, m, d] = a.data.split('-');
    const dataFmt   = `${d}/${m}/${y}`;

    const ocupJornadaMedia = a.jornadas.length ? rnd(avg(a.jornadas)) : null;
    const ocupVeiculoMedia = a.veiculos.length ? rnd(avg(a.veiculos)) : null;

    const base: OcupacaoDiaria = {
      dataEntrega     : a.data,
      dataFmt,
      regiao          : a.regiao,
      ocupJornadaMedia,
      ocupVeiculoMedia,
      qtdeRotas       : a.placas,
      pesoTotal       : rnd(a.peso),
      kmTotal         : rnd(a.km),
    };
    diario.push(base);

    // Regra incentivo
    const jornadaOk = ocupJornadaMedia !== null && ocupJornadaMedia <= META_JORNADA_MAX;
    const indicador = jornadaOk || ocupJornadaMedia === null ? 'Jornada' : 'Veículo';
    const percDia   = jornadaOk || ocupJornadaMedia === null
      ? 100
      : Math.min(ocupVeiculoMedia ?? 0, 100);

    incent.push({
      ...base,
      indicadorUsado    : indicador,
      percentualDia     : rnd(percDia),
      incentivoDiario   : rnd(percDia / 100 * VALOR_DIA),
      metaVeiculoMin    : META_VEICULO_MIN,
      atingiuMetaVeiculo: (ocupVeiculoMedia ?? 0) >= META_VEICULO_MIN,
    });
  }

  diario.sort((a, b) => a.regiao.localeCompare(b.regiao) || a.dataEntrega.localeCompare(b.dataEntrega));
  incent.sort((a, b) => a.regiao.localeCompare(b.regiao) || a.dataEntrega.localeCompare(b.dataEntrega));

  return { diario, incent };
}

// ── Módulo 6: Resumos ─────────────────────────────────────────────────────────

function gerarResumos(
  incent     : IncentivoDiario[],
  consolidado: RegistroConsolidado[]
): { mensal: ResumoMensal[]; aritmetico: ResumoAritmetico[] } {

  // Resumo mensal por região
  const mensalAcc = new Map<string, {
    dias: number; diasInc: number;
    jornadas: number[]; veiculos: number[];
    totalInc: number;
  }>();

  for (const r of incent) {
    const prev = mensalAcc.get(r.regiao);
    if (!prev) {
      mensalAcc.set(r.regiao, {
        dias   : 1,
        diasInc: r.incentivoDiario > 0 ? 1 : 0,
        jornadas: r.ocupJornadaMedia !== null ? [r.ocupJornadaMedia] : [],
        veiculos: r.ocupVeiculoMedia !== null ? [r.ocupVeiculoMedia] : [],
        totalInc: r.incentivoDiario,
      });
    } else {
      prev.dias++;
      if (r.incentivoDiario > 0) prev.diasInc++;
      if (r.ocupJornadaMedia !== null) prev.jornadas.push(r.ocupJornadaMedia);
      if (r.ocupVeiculoMedia !== null) prev.veiculos.push(r.ocupVeiculoMedia);
      prev.totalInc += r.incentivoDiario;
    }
  }

  const mensal: ResumoMensal[] = Array.from(mensalAcc.entries()).map(([regiao, a]) => ({
    regiao,
    diasAnalisados   : a.dias,
    diasComIncentivo : a.diasInc,
    ocupJornadaMedia : rnd(avg(a.jornadas)),
    ocupVeiculoMedia : rnd(avg(a.veiculos)),
    incentivoTotal   : rnd(a.totalInc),
    metaMensal       : VALOR_MENSAL,
    percAtingido     : rnd(a.totalInc / VALOR_MENSAL * 100),
  })).sort((a, b) => b.percAtingido - a.percAtingido);

  // Resumo aritmético: soma peso / soma capacidade (evita média de médias)
  const aritmAcc = new Map<string, {
    dias: number; pesoTotal: number; capTotal: number; ocuDiarias: number[];
  }>();

  // Agrega por DATA + REGIÃO no consolidado
  const diaRegiaoMap = new Map<string, { peso: number; cap: number }>();
  for (const r of consolidado) {
    const key = `${r.dataEntrega}|${r.regiao}`;
    const prev = diaRegiaoMap.get(key);
    if (!prev) diaRegiaoMap.set(key, { peso: r.peso, cap: r.capacidade });
    else { prev.peso += r.peso; prev.cap += r.capacidade; }
  }

  for (const [key, a] of diaRegiaoMap) {
    const regiao = key.split('|')[1];
    const ocuDia = a.cap > 0 ? rnd(a.peso / a.cap * 100) : 0;
    const prev   = aritmAcc.get(regiao);
    if (!prev) {
      aritmAcc.set(regiao, { dias: 1, pesoTotal: a.peso, capTotal: a.cap, ocuDiarias: [ocuDia] });
    } else {
      prev.dias++;
      prev.pesoTotal  += a.peso;
      prev.capTotal   += a.cap;
      prev.ocuDiarias.push(ocuDia);
    }
  }

  const aritmetico: ResumoAritmetico[] = Array.from(aritmAcc.entries()).map(([regiao, a]) => ({
    regiao,
    diasAnalisados    : a.dias,
    pesoTotalMes      : rnd(a.pesoTotal),
    capacidadeTotalMes: rnd(a.capTotal),
    ocupMediaDiaria   : rnd(avg(a.ocuDiarias)),
    ocupMesAritmetica : a.capTotal > 0 ? rnd(a.pesoTotal / a.capTotal * 100) : 0,
  })).sort((a, b) => b.ocupMesAritmetica - a.ocupMesAritmetica);

  return { mensal, aritmetico };
}

// ── Pipeline principal ────────────────────────────────────────────────────────

export async function executeRoadshowPipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);
    const targetYear   = parseInt(formData.get('year')  as string);
    const targetMonth  = parseInt(formData.get('month') as string);

    if (!targetYear || !targetMonth) throw new Error('Parâmetros de ano/mês ausentes.');

    if (pipelineType === 'roadshow') {
      const fileConsolidado = formData.get('fileConsolidado') as File | null;
      const filePedidos     = formData.get('filePedidos')     as File | null;
      const fileVeiculos    = formData.get('fileVeiculos')    as File | null;

      if (!fileConsolidado) {
        throw new Error('Arquivo Consolidado_Entregas_V2_Geral.xlsx é obrigatório.');
      }

      // ── Veículos (fallback de capacidade) ──────────────────────────────────
      const veiculosMap = new Map<string, number>();
      if (fileVeiculos) {
        const { headers, rows } = lerSheet(Buffer.from(await fileVeiculos.arrayBuffer()));
        const iVPlaca = findCol(headers, ['veiculo', 'placa']);
        const iVCap   = findCol(headers, ['capacidade']);
        if (iVPlaca >= 0 && iVCap >= 0) {
          for (const row of rows) {
            const p = String(row[iVPlaca] ?? '').trim().toUpperCase();
            const c = toFloat(row[iVCap]);
            if (p && c > 0) veiculosMap.set(p, c);
          }
        }
      }

      // ── Módulo 2: Preparação do Consolidado ────────────────────────────────
      const bufConsolidado = Buffer.from(await fileConsolidado.arrayBuffer());
      const consolidadoRaw = prepararConsolidado(bufConsolidado, targetYear, targetMonth, veiculosMap);

      if (consolidadoRaw.length === 0) {
        throw new Error(`Nenhum registro encontrado para ${String(targetMonth).padStart(2,'0')}/${targetYear}.`);
      }

      // ── Módulo 3: Tempo Produtivo ───────────────────────────────────────────
      let tempoMap = new Map<string, TempoProdutivo>();
      if (filePedidos) {
        const bufPedidos = Buffer.from(await filePedidos.arrayBuffer());
        tempoMap = calcularTempoProdutivo(bufPedidos, targetYear, targetMonth);
      }

      // ── Módulo 4: Cálculo de Ocupações ─────────────────────────────────────
      const consolidado = calcularOcupacoes(consolidadoRaw, tempoMap);

      // ── Módulo 5: Incentivo ─────────────────────────────────────────────────
      const { diario, incent } = calcularIncentivo(consolidado);

      // ── Módulo 6: Resumos ───────────────────────────────────────────────────
      const { mensal, aritmetico } = gerarResumos(incent, consolidado);

      // ── Métricas de saída ───────────────────────────────────────────────────
      const totalIncentivo = incent.reduce((s, r) => s + r.incentivoDiario, 0);
      const regioes        = new Set(consolidado.map(r => r.regiao)).size;
      const avgJornada     = avg(consolidado.filter(r => r.ocupJornadaPerc !== null).map(r => r.ocupJornadaPerc!));
      const avgVeiculo     = avg(consolidado.filter(r => r.ocupVeiculoPerc !== null).map(r => r.ocupVeiculoPerc!));

      const summary =
        `${consolidado.length} rotas | ${regioes} regiões | ` +
        `Jornada média ${rnd(avgJornada)}% | Veículo médio ${rnd(avgVeiculo)}% | ` +
        `Total R$ ${rnd(totalIncentivo).toFixed(2)}`;

      // ── Firebase ────────────────────────────────────────────────────────────
      const saved = await firebaseStore.saveResult('roadshow', {
        pipelineType : 'roadshow',
        timestamp    : Date.now(),
        year         : targetYear,
        month        : targetMonth,
        data         : incent,
        consolidado  : consolidado.slice(0, 500),
        diario,
        resumoMensal : mensal,
        aritmetico,
        summary,
        config: {
          META_JORNADA_MAX,
          META_VEICULO_MIN,
          VALOR_MENSAL,
          DIAS_META,
          VALOR_DIA,
          totalIncentivo      : rnd(totalIncentivo),
          rotasProcessadas    : consolidado.length,
          comTempoProdutivo   : consolidado.filter(r => r.tempoProdMin !== null).length,
          comOcupJornada      : consolidado.filter(r => r.ocupJornadaPerc !== null).length,
          comOcupVeiculo      : consolidado.filter(r => r.ocupVeiculoPerc !== null).length,
        },
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error('Erro no Pipeline Roadshow:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}