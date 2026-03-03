'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Faturista — TypeScript (Cintas + Liberação unificado)
 *
 * Etapa 1 — Análise de Faturamento (01_analise_faturamento.py)
 *   • Carrega "Tempos e Movimentos" (aba Faturamento)
 *   • Ajusta horários com virada de dia (após meia-noite)
 *   • Calcula dias úteis e meta diária proporcional
 *   • CINTAS    : ≤22h=100% | 22–23h=85% | 23–00h=75% | >00h=0%
 *   • LIBERAÇÃO : ≤20h30=100% | 20h30–21h=85% | 21–22h=75% | >22h=0%
 *
 * Etapa 2 — Consolidador Faturista (05_consolidador_faturista.py)
 *   • Agrupa por dia/empresa
 *   • Calcula valor total e percentual médio
 *   • Gera resumo mensal por empresa
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações ────────────────────────────────────────────────────────────
const EMPRESAS_META        = ['RK01', 'BV01'];
const PROCESSO_CINTAS      = 'ENTREGA DE CINTAS PARA SEPARAÇÃO';
const PROCESSO_LIBERACAO   = 'LIBERAÇÃO PARA ROTEIRIZAÇÃO';

// Limites de horário — CINTAS (minutos desde 00:00)
const CINTAS_100 = 22 * 60;        // 22:00
const CINTAS_85  = 23 * 60;        // 23:00
const CINTAS_75  = 24 * 60;        // 00:00 do dia seguinte

// Limites de horário — LIBERAÇÃO (minutos desde 00:00)
const LIB_100 = 20 * 60 + 30;      // 20:30
const LIB_85  = 21 * 60;           // 21:00
const LIB_75  = 22 * 60;           // 22:00

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalizeKey = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/**
 * Encontra índice de coluna por candidatos normalizados.
 * Prioridade: exato → começa com → contém.
 */
const findCol = (headers: string[], candidates: string[]): number => {
  const norm = headers.map(h => normalizeKey(String(h)));
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h === nc);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h.startsWith(nc));
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const i  = norm.findIndex(h => h.includes(nc));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * Converte valor Excel para Date (serial numérico, string "DD/MM/YYYY", Date).
 */
const toDate = (val: any): Date | null => {
  if (!val && val !== 0) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s     = String(val).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const d    = new Date(`${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Converte string "HH:MM" ou "H:MM" para minutos desde 00:00.
 * Retorna null se inválido.
 */
const toMinutes = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;

  // Número serial Excel (fração de dia)
  if (typeof val === 'number') {
    // Fração de dia → segundos → minutos
    const totalMinutes = Math.round(val * 24 * 60);
    return totalMinutes;
  }

  const s = String(val).trim();
  // Formato "HH:MM" ou "H:MM" ou "HH:MM:SS"
  const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) return parseInt(match[1]) * 60 + parseInt(match[2]);

  // Fallback: tenta parsear como Date e extrai hora
  const d = new Date(`1970-01-01T${s}`);
  if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();

  return null;
};

/**
 * Conta dias úteis (segunda a sexta) em um mês.
 */
const contarDiasUteis = (year: number, month: number): number => {
  let count = 0;
  const d   = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
};

/**
 * Formata data para "DD/MM/YYYY".
 */
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

// ── Estruturas de dados ───────────────────────────────────────────────────────

interface RegistroFaturamento {
  data           : string;   // "DD/MM/YYYY"
  dateKey        : string;   // "YYYY-MM-DD"
  empresa        : string;
  cidade         : string;
  processo       : string;
  inicio         : string;
  termino        : string;
  pedidos        : number;
  terminoAjustado: string;   // horário após ajuste virada
  percMeta       : number;   // 0 | 0.75 | 0.85 | 1.00
  metaOk         : boolean;
  valorDia       : number;
}

interface DiariaEmpresa {
  data           : string;
  empresa        : string;
  valorCintasReal: number;
  percCintasMedio: number;
  valorLibReal   : number;
  percLibMedio   : number;
  valorTotalReal : number;
  percTotalMedio : number;
}

interface ResumoMensal {
  empresa            : string;
  mes                : number;
  bonificacaoTotal   : number;
  bonificacaoAtingida: number;
}

// ── Etapa 1: Análise de Faturamento ──────────────────────────────────────────

interface EtapaAnaliseResult {
  cintas      : RegistroFaturamento[];
  liberacao   : RegistroFaturamento[];
  diasUteis   : number;
  metaDiaCintas: number;
  metaDiaLib  : number;
  totalCintas : number;
  totalLib    : number;
}

function analisarFaturamento(
  buffer        : Buffer,
  targetYear    : number,
  targetMonth   : number,
  metaMensalCintas: number,
  metaMensalLib   : number
): EtapaAnaliseResult {

  const workbook   = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName  = workbook.SheetNames.find(n =>
    normalizeKey(n).includes('faturamento')
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rows.length < 2) {
    return { cintas: [], liberacao: [], diasUteis: 0, metaDiaCintas: 0, metaDiaLib: 0, totalCintas: 0, totalLib: 0 };
  }

  const headers = rows[0].map((h: any) => String(h || '').trim());

  const iData     = findCol(headers, ['data']);
  const iEmpresa  = findCol(headers, ['empresa']);
  const iCidade   = findCol(headers, ['cidade']);
  const iProcesso = findCol(headers, ['processos', 'processo']);
  const iInicio   = findCol(headers, ['inicio', 'início']);
  const iTermino  = findCol(headers, ['termino', 'término']);
  const iPedidos  = findCol(headers, ['pedidos']);

  if (iData < 0 || iEmpresa < 0 || iProcesso < 0 || iInicio < 0 || iTermino < 0) {
    throw new Error('Colunas obrigatórias não encontradas no arquivo de Tempos e Movimentos.');
  }

  // Dias úteis e metas diárias
  const diasUteis     = contarDiasUteis(targetYear, targetMonth);
  if (diasUteis === 0) throw new Error('Nenhum dia útil encontrado no período.');

  const metaDiaCintas = metaMensalCintas / diasUteis;
  const metaDiaLib    = metaMensalLib    / diasUteis;

  const cintas    : RegistroFaturamento[] = [];
  const liberacao : RegistroFaturamento[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const data = toDate(row[iData]);
    if (!data) continue;
    if (data.getFullYear() !== targetYear || data.getMonth() + 1 !== targetMonth) continue;

    const empresa  = String(row[iEmpresa]  ?? '').trim().toUpperCase();
    const processo = String(row[iProcesso] ?? '').trim().toUpperCase();

    if (!EMPRESAS_META.includes(empresa)) continue;

    const isCintas    = processo.includes('CINTAS');
    const isLiberacao = processo.includes('LIBERA');
    if (!isCintas && !isLiberacao) continue;

    const inicioMin  = toMinutes(row[iInicio]);
    const terminoMin = toMinutes(row[iTermino]);
    if (inicioMin === null || terminoMin === null) continue;

    // Ajuste virada de dia: término < início → soma 24h (1440 min)
    const terminoAj = terminoMin < inicioMin ? terminoMin + 1440 : terminoMin;

    // Formata horário ajustado como "HH:MM"
    const fmtMin = (m: number) => {
      const real = m % 1440;
      return `${String(Math.floor(real / 60)).padStart(2,'0')}:${String(real % 60).padStart(2,'0')}`;
    };

    const dateKey = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;

    const base: Omit<RegistroFaturamento, 'percMeta' | 'metaOk' | 'valorDia'> = {
      data           : fmtDate(data),
      dateKey,
      empresa,
      cidade         : String(row[iCidade]  ?? '').trim(),
      processo       : String(row[iProcesso]?? '').trim(),
      inicio         : fmtMin(inicioMin),
      termino        : fmtMin(terminoMin),
      pedidos        : Number(row[iPedidos] ?? 0) || 0,
      terminoAjustado: fmtMin(terminoAj),
    };

    if (isCintas) {
      let perc = 0;
      if      (terminoAj <= CINTAS_100) perc = 1.00;
      else if (terminoAj <= CINTAS_85)  perc = 0.85;
      else if (terminoAj <= CINTAS_75)  perc = 0.75;
      const valor = perc * metaDiaCintas;
      cintas.push({ ...base, percMeta: perc, metaOk: perc === 1.00, valorDia: Math.round(valor * 100) / 100 });
    }

    if (isLiberacao) {
      let perc = 0;
      if      (terminoAj <= LIB_100) perc = 1.00;
      else if (terminoAj <= LIB_85)  perc = 0.85;
      else if (terminoAj <= LIB_75)  perc = 0.75;
      const valor = perc * metaDiaLib;
      liberacao.push({ ...base, percMeta: perc, metaOk: perc === 1.00, valorDia: Math.round(valor * 100) / 100 });
    }
  }

  const totalCintas = cintas.reduce((s, r) => s + r.valorDia, 0);
  const totalLib    = liberacao.reduce((s, r) => s + r.valorDia, 0);

  return { cintas, liberacao, diasUteis, metaDiaCintas, metaDiaLib, totalCintas, totalLib };
}

// ── Etapa 2: Consolidador Faturista ──────────────────────────────────────────

function consolidarFaturista(
  cintas    : RegistroFaturamento[],
  liberacao : RegistroFaturamento[],
  metaMensalTotal: number
): { diaria: DiariaEmpresa[]; mensal: ResumoMensal[] } {

  // Agrega diário — cintas
  const cintasMap = new Map<string, { valor: number[]; perc: number[] }>();
  for (const r of cintas) {
    const key = `${r.dateKey}|${r.empresa}`;
    if (!cintasMap.has(key)) cintasMap.set(key, { valor: [], perc: [] });
    cintasMap.get(key)!.valor.push(r.valorDia);
    cintasMap.get(key)!.perc.push(r.percMeta);
  }

  // Agrega diário — liberacao
  const libMap = new Map<string, { valor: number[]; perc: number[] }>();
  for (const r of liberacao) {
    const key = `${r.dateKey}|${r.empresa}`;
    if (!libMap.has(key)) libMap.set(key, { valor: [], perc: [] });
    libMap.get(key)!.valor.push(r.valorDia);
    libMap.get(key)!.perc.push(r.percMeta);
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => arr.length ? sum(arr) / arr.length : 0;

  const allKeys = new Set([...cintasMap.keys(), ...libMap.keys()]);
  const diaria  : DiariaEmpresa[] = [];

  for (const key of allKeys) {
    const [dateKey, empresa] = key.split('|');
    const c = cintasMap.get(key);
    const l = libMap.get(key);

    const valorCintas = c ? sum(c.valor) : 0;
    const percCintas  = c ? avg(c.perc)  : 0;
    const valorLib    = l ? sum(l.valor) : 0;
    const percLib     = l ? avg(l.perc)  : 0;

    const [y, m, d]   = dateKey.split('-');
    const dataFmt     = `${d}/${m}/${y}`;

    diaria.push({
      data           : dataFmt,
      empresa,
      valorCintasReal: Math.round(valorCintas * 100) / 100,
      percCintasMedio: Math.round(percCintas  * 10000) / 10000,
      valorLibReal   : Math.round(valorLib    * 100) / 100,
      percLibMedio   : Math.round(percLib     * 10000) / 10000,
      valorTotalReal : Math.round((valorCintas + valorLib) * 100) / 100,
      percTotalMedio : Math.round(((percCintas + percLib) / 2) * 10000) / 10000,
    });
  }

  diaria.sort((a, b) => a.empresa.localeCompare(b.empresa) || a.data.localeCompare(b.data));

  // Resumo mensal por empresa
  const mensalAcc = new Map<string, { atingida: number; mes: number }>();
  for (const d of diaria) {
    const mes   = parseInt(d.data.split('/')[1]);
    const prev  = mensalAcc.get(d.empresa);
    if (!prev) mensalAcc.set(d.empresa, { atingida: d.valorTotalReal, mes });
    else        prev.atingida += d.valorTotalReal;
  }

  const mensal: ResumoMensal[] = Array.from(mensalAcc.entries()).map(([empresa, a]) => ({
    empresa,
    mes                : a.mes,
    bonificacaoTotal   : Math.round(metaMensalTotal * 100) / 100,
    bonificacaoAtingida: Math.round(a.atingida      * 100) / 100,
  }));

  return { diaria, mensal };
}

// ── Pipeline principal exportado ─────────────────────────────────────────────

export async function executeFaturistaPipeline(formData: FormData, type?: string) {
  try {
    const pipelineType    = type || (formData.get('pipelineType') as string);
    const targetYear      = parseInt(formData.get('year')   as string);
    const targetMonth     = parseInt(formData.get('month')  as string);

    if (!targetYear || !targetMonth) throw new Error('Parâmetros de ano/mês ausentes.');

    if (pipelineType === 'faturista') {
      const fileTempos = formData.get('fileTempos') as File | null;
      if (!fileTempos) throw new Error('Arquivo "Tempos e Movimentos" é obrigatório.');

      const metaMensalCintas = parseFloat(formData.get('metaCintas') as string) || 200.0;
      const metaMensalLib    = parseFloat(formData.get('metaLib')    as string) || 200.0;
      const metaMensalTotal  = metaMensalCintas + metaMensalLib;

      // ── Etapa 1: Análise de Faturamento ────────────────────────────────────
      const buffer = Buffer.from(await fileTempos.arrayBuffer());
      const etapa1 = analisarFaturamento(buffer, targetYear, targetMonth, metaMensalCintas, metaMensalLib);

      if (etapa1.cintas.length === 0 && etapa1.liberacao.length === 0) {
        throw new Error(`Nenhum registro encontrado para ${String(targetMonth).padStart(2,'0')}/${targetYear} nas empresas ${EMPRESAS_META.join(', ')}.`);
      }

      // ── Etapa 2: Consolidador ───────────────────────────────────────────────
      const { diaria, mensal } = consolidarFaturista(etapa1.cintas, etapa1.liberacao, metaMensalTotal);

      // ── Métricas de resumo ──────────────────────────────────────────────────
      const summary =
        `${etapa1.cintas.length} cintas | ${etapa1.liberacao.length} liberações | ` +
        `${etapa1.diasUteis} dias úteis | ` +
        `Total R$ ${(etapa1.totalCintas + etapa1.totalLib).toFixed(2)}`;

      // ── Firebase ────────────────────────────────────────────────────────────
      const saved = await firebaseStore.saveResult('faturista', {
        pipelineType   : 'faturista',
        timestamp      : Date.now(),
        year           : targetYear,
        month          : targetMonth,
        data           : diaria,
        cintas         : etapa1.cintas,
        liberacao      : etapa1.liberacao,
        resumoMensal   : mensal,
        summary,
        config: {
          metaMensalCintas,
          metaMensalLib,
          metaMensalTotal,
          diasUteis     : etapa1.diasUteis,
          metaDiaCintas : etapa1.metaDiaCintas,
          metaDiaLib    : etapa1.metaDiaLib,
          totalCintas   : etapa1.totalCintas,
          totalLib      : etapa1.totalLib,
          totalGeral    : etapa1.totalCintas + etapa1.totalLib,
          empresasMeta  : EMPRESAS_META,
        },
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error('Erro no Pipeline Faturista:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}