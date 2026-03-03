'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Mercanete × Roadshow — TypeScript
 * Sistema de Matching com Prioridade e Propagação
 *
 * 1. Carregamento
 *    • STATUS_PEDIDOS_MERCANTE.xlsx  (sheet "STATUS" ou padrão)
 *    • STATUS_PEDIDOS_ROADSHOW.xlsx
 *
 * 2. Preparação
 *    • clean_digits: remove tudo exceto dígitos
 *    • clean_text: uppercase + trim
 *    • Calcula Semana_Ano (YYYY-WW)
 *
 * 3. Lookups do Roadshow (deduplicados, mais recente)
 *    • LK1: Pedido + Empresa
 *    • LK2: Nº do Pedido + Empresa
 *    • LK3: Cliente + Empresa + Semana (fallback)
 *
 * 4. Matching (left-merge) + Coalescência
 *    • Prioridade: LK1 > LK2 > LK3
 *    • Pedidos vazios → mantém Status_Atual
 *    • Não casados → Status_RoadShow = "-"
 *
 * 5. Propagação
 *    • Propaga Status_RoadShow e Data_S_RoadShow dentro de
 *      mesmo Cliente + Empresa + Semana
 *
 * 6. Relatório
 *    • Total / com match / sem match
 *    • Lista não casados (pedidos com valor, sem match)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações de colunas ──────────────────────────────────────────────────

const COL_MERC = {
  pedidoOriginal : 'Pedido_original',
  codigo         : 'Código',
  statusAtual    : 'Status_Atual',
  codigoCliente  : 'Código_Cliente',
  dataEmissao    : 'Data_de_emissão',
  empresa        : 'Empresa',
};

const COL_ROAD = {
  clienteId  : 'Cliente ID',
  pedido     : 'Pedido',
  nPedido    : 'Nº do pedido',
  nomeRota   : 'Nome da Rota',
  data       : 'Data',
  empresa    : 'Empresa',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalizeKey = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Remove tudo exceto dígitos. */
const cleanDigits = (v: any): string =>
  String(v ?? '').trim().replace(/\.0$/, '').replace(/[^0-9]/g, '');

/** Uppercase + trim. */
const cleanText = (v: any): string =>
  String(v ?? '').trim().toUpperCase();

/** Formata Date como 'YYYY-WW' (ISO week simplificado). */
const toWeekKey = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  const y    = d.getFullYear();
  const start = new Date(y, 0, 1);
  const week  = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${y}-${String(week).padStart(2, '0')}`;
};

/** Converte valor Excel para Date. */
const toDate = (val: any): Date | null => {
  if (!val && val !== 0) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const fmtDate = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

/** Primeira coluna cujo nome normalizado corresponde a algum candidato. */
const findCol = (headers: string[], candidates: string[]): string | null => {
  const norm = headers.map(h => normalizeKey(String(h)));
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h === nc);
    if (i >= 0) return headers[i];
  }
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h.startsWith(nc));
    if (i >= 0) return headers[i];
  }
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h.includes(nc));
    if (i >= 0) return headers[i];
  }
  return null;
};

// ── Estruturas ────────────────────────────────────────────────────────────────

interface RowMerc {
  [key: string]: any;
  _pedidoClean  : string;
  _clienteClean : string;
  _empresaClean : string;
  _semana       : string;
  _dataEmissao  : Date | null;
}

interface RowRoad {
  [key: string]: any;
  _pedidoClean  : string;
  _nPedidoClean : string;
  _clienteClean : string;
  _empresaClean : string;
  _semana       : string;
  _dataRoad     : Date | null;
}

interface ResultRow extends RowMerc {
  Status_RoadShow : string;
  Data_S_RoadShow : string;
  Semana_Ano      : string;
}

interface ResumoMatch {
  total           : number;
  comMatch        : number;
  semMatch        : number;
  percMatch       : number;
  matchVia        : { lk1: number; lk2: number; lk3: number; propagado: number };
  naoCasados      : { pedido: string; cliente: string; semana: string }[];
}

// ── Leitura de Excel ──────────────────────────────────────────────────────────

function lerExcel(buffer: Buffer, preferSheet?: string): { headers: string[]; rows: any[][] } {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  let sheetName = wb.SheetNames[0];
  if (preferSheet) {
    const found = wb.SheetNames.find(n =>
      normalizeKey(n).includes(normalizeKey(preferSheet))
    );
    if (found) sheetName = found;
  }

  const sheet = wb.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rows.length < 2) return { headers: [], rows: [] };

  return {
    headers: rows[0].map((h: any) => String(h || '').trim()),
    rows   : rows.slice(1),
  };
}

// ── Preparação dos dados ──────────────────────────────────────────────────────

function prepararMercante(buffer: Buffer): {
  rows     : RowMerc[];
  colMap   : Record<string, string>;
  headers  : string[];
} {
  const { headers, rows: rawRows } = lerExcel(buffer, 'STATUS');

  // Detecção flexível de colunas
  const col = (cands: string[]) => findCol(headers, cands) ?? '';

  const colMap = {
    pedidoOriginal : col([COL_MERC.pedidoOriginal, 'pedido_original', 'pedido original', 'pedido']),
    codigo         : col([COL_MERC.codigo, 'codigo']),
    statusAtual    : col([COL_MERC.statusAtual, 'status_atual', 'status atual', 'status']),
    codigoCliente  : col([COL_MERC.codigoCliente, 'codigo_cliente', 'codigo cliente', 'cliente']),
    dataEmissao    : col([COL_MERC.dataEmissao, 'data_de_emissao', 'data emissao', 'data']),
    empresa        : col([COL_MERC.empresa, 'empresa']),
  };

  const idx = (col: string) => headers.indexOf(col);

  const result: RowMerc[] = rawRows
    .filter(r => r.some((v: any) => v !== null && v !== undefined && v !== ''))
    .map(r => {
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });

      const pedVal    = colMap.pedidoOriginal ? r[idx(colMap.pedidoOriginal)] : '';
      const cliVal    = colMap.codigoCliente  ? r[idx(colMap.codigoCliente)]  : '';
      const empVal    = colMap.empresa        ? r[idx(colMap.empresa)]         : '';
      const dataVal   = colMap.dataEmissao    ? r[idx(colMap.dataEmissao)]    : null;
      const dateObj   = toDate(dataVal);

      obj._pedidoClean  = cleanDigits(pedVal);
      obj._clienteClean = cleanText(cliVal);
      obj._empresaClean = cleanText(empVal);
      obj._dataEmissao  = dateObj;
      obj._semana       = toWeekKey(dateObj);

      return obj as RowMerc;
    });

  return { rows: result, colMap, headers };
}

function prepararRoadshow(buffer: Buffer): RowRoad[] {
  const { headers, rows: rawRows } = lerExcel(buffer);

  const col = (cands: string[]) => findCol(headers, cands) ?? '';

  const colMap = {
    pedido    : col([COL_ROAD.pedido,    'pedido']),
    nPedido   : col([COL_ROAD.nPedido,   'n do pedido', 'numero do pedido', 'npedido']),
    clienteId : col([COL_ROAD.clienteId, 'cliente_id', 'cliente id', 'cliente']),
    nomeRota  : col([COL_ROAD.nomeRota,  'nome_da_rota', 'nome da rota', 'rota', 'nome rota']),
    data      : col([COL_ROAD.data,      'data']),
    empresa   : col([COL_ROAD.empresa,   'empresa']),
  };

  const idx = (col: string) => headers.indexOf(col);

  return rawRows
    .filter(r => r.some((v: any) => v !== null && v !== undefined && v !== ''))
    .map(r => {
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });

      const dataVal = colMap.data ? r[idx(colMap.data)] : null;
      const dateObj = toDate(dataVal);

      obj._pedidoClean  = cleanDigits(colMap.pedido    ? r[idx(colMap.pedido)]    : '');
      obj._nPedidoClean = cleanDigits(colMap.nPedido   ? r[idx(colMap.nPedido)]   : '');
      obj._clienteClean = cleanText(colMap.clienteId   ? r[idx(colMap.clienteId)] : '');
      obj._empresaClean = cleanText(colMap.empresa      ? r[idx(colMap.empresa)]   : '');
      obj._dataRoad     = dateObj;
      obj._semana       = toWeekKey(dateObj);

      // Expõe nomeRota canonicamente
      obj._nomeRota = colMap.nomeRota ? String(r[idx(colMap.nomeRota)] ?? '').trim() : '';

      return obj as RowRoad;
    });
}

// ── Criação de Lookups ────────────────────────────────────────────────────────

type LkEntry = { status: string; data: Date | null };

function criarLookups(roadRows: RowRoad[]): {
  lk1: Map<string, LkEntry>; // pedido|empresa
  lk2: Map<string, LkEntry>; // nPedido|empresa
  lk3: Map<string, LkEntry>; // cliente|empresa|semana
} {
  // Ordena decrescente por data (mais recente primeiro → deduplicação keep=first)
  const sorted = [...roadRows].sort((a, b) => {
    const ta = a._dataRoad?.getTime() ?? 0;
    const tb = b._dataRoad?.getTime() ?? 0;
    return tb - ta;
  });

  const lk1 = new Map<string, LkEntry>();
  const lk2 = new Map<string, LkEntry>();
  const lk3 = new Map<string, LkEntry>();

  for (const r of sorted) {
    const entry: LkEntry = { status: r._nomeRota, data: r._dataRoad };

    const k1 = `${r._pedidoClean}|${r._empresaClean}`;
    if (r._pedidoClean && !lk1.has(k1)) lk1.set(k1, entry);

    const k2 = `${r._nPedidoClean}|${r._empresaClean}`;
    if (r._nPedidoClean && !lk2.has(k2)) lk2.set(k2, entry);

    const k3 = `${r._clienteClean}|${r._empresaClean}|${r._semana}`;
    if (r._clienteClean && r._semana && !lk3.has(k3)) lk3.set(k3, entry);
  }

  return { lk1, lk2, lk3 };
}

// ── Matching + Coalescência ───────────────────────────────────────────────────

function realizarMatching(
  mercRows: RowMerc[],
  lk1     : Map<string, LkEntry>,
  lk2     : Map<string, LkEntry>,
  lk3     : Map<string, LkEntry>,
  colMap  : Record<string, string>
): ResultRow[] {
  const isBlank = (v: any) =>
    v === null || v === undefined || String(v).trim() === '' || String(v).toLowerCase() === 'nan';

  return mercRows.map(r => {
    const pedidoVazio = isBlank(r[colMap.pedidoOriginal ?? '']);

    if (pedidoVazio) {
      // Mantém Status_Atual, sem data
      const statusAtual = colMap.statusAtual ? String(r[colMap.statusAtual] ?? '') : '';
      return { ...r, Status_RoadShow: statusAtual, Data_S_RoadShow: '', Semana_Ano: r._semana } as ResultRow;
    }

    // LK1: Pedido + Empresa
    const k1   = `${r._pedidoClean}|${r._empresaClean}`;
    const hit1 = lk1.get(k1);

    // LK2: Nº do Pedido + Empresa (usa mesmo pedido_clean como npedido)
    const k2   = `${r._pedidoClean}|${r._empresaClean}`;
    const hit2 = lk2.get(k2);

    // LK3: Cliente + Empresa + Semana
    const k3   = `${r._clienteClean}|${r._empresaClean}|${r._semana}`;
    const hit3 = lk3.get(k3);

    // Coalescência: primeiro não-vazio
    const winner = [hit1, hit2, hit3].find(h => h && h.status && h.status.trim() !== '');

    return {
      ...r,
      Status_RoadShow : winner?.status ?? '-',
      Data_S_RoadShow : winner?.data   ? fmtDate(winner.data) : '',
      Semana_Ano      : r._semana,
    } as ResultRow;
  });
}

// ── Propagação ────────────────────────────────────────────────────────────────

function propagarValores(rows: ResultRow[], colMap: Record<string, string>): ResultRow[] {
  // Agrupa por Cliente + Empresa + Semana
  const groups = new Map<string, ResultRow[]>();

  for (const r of rows) {
    const key = `${r._clienteClean}|${r._empresaClean}|${r._semana}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const isBlank = (v: string) =>
    !v || v === '-' || v.trim() === '' || v.toLowerCase() === 'nan';

  for (const [, group] of groups) {
    // Primeiro valor válido de Status_RoadShow
    const validStatus = group.find(r => !isBlank(r.Status_RoadShow))?.Status_RoadShow;
    const validData   = group.find(r => !isBlank(r.Data_S_RoadShow))?.Data_S_RoadShow;

    if (validStatus) {
      for (const r of group) {
        if (isBlank(r.Status_RoadShow)) r.Status_RoadShow = validStatus;
        if (validData && isBlank(r.Data_S_RoadShow)) r.Data_S_RoadShow = validData;
      }
    }
  }

  return rows;
}

// ── Resumo ────────────────────────────────────────────────────────────────────

function gerarResumo(
  rows       : ResultRow[],
  colMapMerc : Record<string, string>,
  lk1        : Map<string, LkEntry>,
  lk2        : Map<string, LkEntry>,
  lk3        : Map<string, LkEntry>
): ResumoMatch {
  const isBlank = (v: any) => !v || v === '-' || String(v).trim() === '' || String(v).toLowerCase() === 'nan';

  const total     = rows.length;
  const comMatch  = rows.filter(r => !isBlank(r.Status_RoadShow)).length;
  const semMatch  = total - comMatch;

  // Conta por nível de lookup (approximate — baseado em key hits)
  let cLk1 = 0, cLk2 = 0, cLk3 = 0;
  for (const r of rows) {
    if (isBlank(r.Status_RoadShow)) continue;
    const k1 = `${r._pedidoClean}|${r._empresaClean}`;
    const k2 = `${r._pedidoClean}|${r._empresaClean}`;
    const k3 = `${r._clienteClean}|${r._empresaClean}|${r._semana}`;
    if (lk1.has(k1) && lk1.get(k1)!.status === r.Status_RoadShow) cLk1++;
    else if (lk2.has(k2) && lk2.get(k2)!.status === r.Status_RoadShow) cLk2++;
    else if (lk3.has(k3) && lk3.get(k3)!.status === r.Status_RoadShow) cLk3++;
  }

  const propagado = comMatch - cLk1 - cLk2 - cLk3;

  const naoCasados = rows
    .filter(r => {
      const pedido = colMapMerc.pedidoOriginal ? r[colMapMerc.pedidoOriginal] : '';
      return !isBlank(pedido) && isBlank(r.Status_RoadShow);
    })
    .slice(0, 100)
    .map(r => ({
      pedido  : String(r[colMapMerc.pedidoOriginal ?? ''] ?? ''),
      cliente : r._clienteClean,
      semana  : r._semana,
    }));

  return {
    total,
    comMatch,
    semMatch,
    percMatch    : total > 0 ? Math.round(comMatch / total * 100 * 100) / 100 : 0,
    matchVia     : { lk1: cLk1, lk2: cLk2, lk3: cLk3, propagado: Math.max(0, propagado) },
    naoCasados,
  };
}

// ── Pipeline principal ────────────────────────────────────────────────────────

export async function executeMercaneteRoadshowPipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);

    if (pipelineType === 'mercanete-roadshow') {
      const fileMercante = formData.get('fileMercante') as File | null;
      const fileRoadshow = formData.get('fileRoadshow') as File | null;

      if (!fileMercante) throw new Error('Arquivo STATUS_PEDIDOS_MERCANTE.xlsx é obrigatório.');
      if (!fileRoadshow) throw new Error('Arquivo STATUS_PEDIDOS_ROADSHOW.xlsx é obrigatório.');

      // ── 1. Preparação ─────────────────────────────────────────────────────
      const bufMerc = Buffer.from(await fileMercante.arrayBuffer());
      const bufRoad = Buffer.from(await fileRoadshow.arrayBuffer());

      const { rows: mercRows, colMap: colMapMerc, headers: mercHeaders } = prepararMercante(bufMerc);
      const roadRows = prepararRoadshow(bufRoad);

      if (mercRows.length === 0) throw new Error('Nenhuma linha válida encontrada no MERCANTE.');
      if (roadRows.length === 0) throw new Error('Nenhuma linha válida encontrada no ROADSHOW.');

      // ── 2. Lookups ────────────────────────────────────────────────────────
      const { lk1, lk2, lk3 } = criarLookups(roadRows);

      // ── 3. Matching ───────────────────────────────────────────────────────
      let resultRows = realizarMatching(mercRows, lk1, lk2, lk3, colMapMerc);

      // ── 4. Propagação ─────────────────────────────────────────────────────
      resultRows = propagarValores(resultRows, colMapMerc);

      // ── 5. Resumo ─────────────────────────────────────────────────────────
      const resumo = gerarResumo(resultRows, colMapMerc, lk1, lk2, lk3);

      // ── 6. Limpa colunas auxiliares para output ───────────────────────────
      const colsAux = [
        '_pedidoClean', '_clienteClean', '_empresaClean', '_nPedidoClean',
        '_semana', '_dataEmissao', '_nomeRota',
      ];
      const data = resultRows.map(r => {
        const out: any = {};
        for (const [k, v] of Object.entries(r)) {
          if (!colsAux.includes(k)) {
            out[k] = v instanceof Date ? fmtDate(v) : v;
          }
        }
        return out;
      });

      const summary =
        `${resumo.total} registros | ` +
        `✅ ${resumo.comMatch} com match (${resumo.percMatch}%) | ` +
        `❌ ${resumo.semMatch} sem match | ` +
        `LK1: ${resumo.matchVia.lk1} · LK2: ${resumo.matchVia.lk2} · ` +
        `LK3: ${resumo.matchVia.lk3} · Prop: ${resumo.matchVia.propagado}`;

      const saved = await firebaseStore.saveResult('mercanete-roadshow', {
        pipelineType : 'mercanete-roadshow',
        timestamp    : Date.now(),
        data,
        resumoMatch  : resumo,
        resumoMensal : [],   // compatibilidade com DataViewer
        summary,
        config       : {
          lk1Size : lk1.size,
          lk2Size : lk2.size,
          lk3Size : lk3.size,
          mercRows: mercRows.length,
          roadRows: roadRows.length,
        },
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error('Erro no Pipeline Mercanete x Roadshow:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}