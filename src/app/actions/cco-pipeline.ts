'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Consolidador CCO — TypeScript
 * Objetivo:
 *  • Consolidar percentuais diários de Motoristas e Ajudantes por EMPRESA
 *  • Calcular bonificação proporcional (base R$ 16,00/dia)
 *  • Remover domingos da análise
 *
 * Lógica de desempenho:
 *  • Idêntica ao pipeline_coordenadores — mesmas fontes, mesmo cálculo
 *  • Única diferença: bonificação diária (R$ 16,00 vs R$ 48,00)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Configurações ────────────────────────────────────────────────────────────
const BONIFICACAO_ROTAS = 16.00; // R$ 16,00/dia (100% = R$ 16,00)

// ── Helpers ──────────────────────────────────────────────────────────────────

const normalize = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const normalizeKey = (s: string) =>
  normalize(s).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

/**
 * Encontra o índice da coluna pelo nome normalizado.
 * Prioridade: match exato → começa com → contém.
 */
const findCol = (headers: string[], candidates: string[]): number => {
  const normHeaders = headers.map(h => normalizeKey(String(h)));
  for (const c of candidates) {
    const nc  = normalizeKey(c);
    const idx = normHeaders.findIndex(h => h === nc);
    if (idx >= 0) return idx;
  }
  for (const c of candidates) {
    const nc  = normalizeKey(c);
    const idx = normHeaders.findIndex(h => h.startsWith(nc));
    if (idx >= 0) return idx;
  }
  for (const c of candidates) {
    const nc  = normalizeKey(c);
    const idx = normHeaders.findIndex(h => h.includes(nc));
    if (idx >= 0) return idx;
  }
  return -1;
};

/**
 * Converte valor Excel para { dateKey: "YYYY-MM-DD", dayOfWeek, month, year }.
 */
const toDateInfo = (val: any): { dateKey: string; dayOfWeek: number; month: number; year: number } | null => {
  if (val === null || val === undefined || val === '') return null;

  let d: Date | null = null;

  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    d = new Date(Math.round((val - 25569) * 86400 * 1000));
  } else {
    const s     = String(val).trim();
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

  const month   = d.getMonth() + 1;
  const year    = d.getFullYear();
  const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  return { dateKey, dayOfWeek: d.getDay(), month, year };
};

/** Normaliza percentual: se todos entre 0–1, multiplica por 100. */
const normalizePercent = (values: number[]): number[] => {
  const allFractional =
    values.length > 0 &&
    values.filter(v => v >= 0 && v <= 1).length / values.length > 0.9;
  return allFractional ? values.map(v => v * 100) : values;
};

// ── Estruturas de dados ───────────────────────────────────────────────────────

interface RegistroAjustado {
  empresa    : string;
  cargo      : string;
  dateKey    : string;
  dayOfWeek  : number;
  percentual : number;
}

interface AnaliseDiaria {
  Empresa                       : string;
  Data                          : string; // "YYYY-MM-DD"
  PercAtingidoMotorista         : number;
  PercAtingidoAjudante          : number;
  PercDesempenho                : number;
  BonificacaoDiaTotal           : number;
  ValorBonificacao              : number;
}

interface ResumoMensal {
  Empresa              : string;
  DiasAnalisados       : number;
  PercMedioMotorista   : number;
  PercMedioAjudante    : number;
  PercMedioDesempenho  : number;
  TotalBonifMes        : number;
}

interface ResumoSimples {
  Empresa             : string;
  Mes                 : number;
  BonificacaoTotal    : number;
  BonificacaoAtingida : number;
}

// ── Carregamento dos arquivos _Ajustado.xlsx ──────────────────────────────────

function carregarAjustado(buffer: Buffer): RegistroAjustado[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  // Tenta aba "Relatório Diário" ou usa a primeira
  const sheetName =
    workbook.SheetNames.find(n =>
      normalize(n).includes('relatorio') || normalize(n).includes('diario')
    ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (rows.length < 2) return [];

  const headers = rows[0].map((h: any) => String(h || ''));

  const iEmpresa = findCol(headers, ['empresa', 'filial', 'nome_deposito']);
  const iCargo   = findCol(headers, ['cargo', 'funcao']);
  const iDia     = findCol(headers, ['dia', 'data']);
  const iPerc    = findCol(headers, ['percentual_atingido', 'percentual atingido', '% atingido']);

  if (iEmpresa < 0 || iDia < 0 || iPerc < 0) return [];

  // Coleta valores brutos para normalização
  const rawPercs: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const s   = String(row[iPerc] ?? '').replace('%', '').replace(',', '.').trim();
    rawPercs.push(parseFloat(s) || 0);
  }
  const normPercs = normalizePercent(rawPercs);

  const result: RegistroAjustado[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const dateInfo = toDateInfo(row[iDia]);
    if (!dateInfo) continue;

    const percentual = normPercs[i - 1];
    if (isNaN(percentual)) continue;

    result.push({
      empresa  : String(row[iEmpresa] ?? 'N/A').trim(),
      cargo    : String(row[iCargo]   ?? '').trim(),
      dateKey  : dateInfo.dateKey,
      dayOfWeek: dateInfo.dayOfWeek,
      percentual,
    });
  }

  return result;
}

// ── Cálculo de desempenho (lógica idêntica ao coordenador — módulo 1) ─────────

function calcularDesempenho(
  motoristas : RegistroAjustado[],
  ajudantes  : RegistroAjustado[],
  targetMonth: number,
  targetYear : number
): AnaliseDiaria[] {

  // Filtra mês/ano e remove domingos
  const filtrar = (rows: RegistroAjustado[], cargoFiltro: string) =>
    rows.filter(r => {
      const [y, m] = r.dateKey.split('-').map(Number);
      return (
        r.cargo.toLowerCase().includes(cargoFiltro) &&
        m === targetMonth &&
        y === targetYear   &&
        r.dayOfWeek !== 0  // remove domingos
      );
    });

  const mot = filtrar(motoristas, 'motorista');
  const aju = filtrar(ajudantes,  'ajudante');

  // Média diária por empresa — motoristas
  const motMap = new Map<string, number[]>();
  for (const r of mot) {
    const key = `${r.empresa}|${r.dateKey}`;
    if (!motMap.has(key)) motMap.set(key, []);
    motMap.get(key)!.push(r.percentual);
  }

  // Média diária por empresa — ajudantes
  const ajuMap = new Map<string, number[]>();
  for (const r of aju) {
    const key = `${r.empresa}|${r.dateKey}`;
    if (!ajuMap.has(key)) ajuMap.set(key, []);
    ajuMap.get(key)!.push(r.percentual);
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Coleta todos os pares únicos empresa|data
  const allKeys = new Set([...motMap.keys(), ...ajuMap.keys()]);
  const result : AnaliseDiaria[] = [];

  for (const key of allKeys) {
    const [empresa, dateKey] = key.split('|');

    const percMot = motMap.has(key) ? avg(motMap.get(key)!) : 0;
    const percAju = ajuMap.has(key) ? avg(ajuMap.get(key)!) : 0;

    // Média das fontes disponíveis (skipna = usa apenas o que existe)
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
      Empresa                : empresa,
      Data                   : dateKey,
      PercAtingidoMotorista  : Math.round(percMot * 100) / 100,
      PercAtingidoAjudante   : Math.round(percAju * 100) / 100,
      PercDesempenho         : percDesemp,
      BonificacaoDiaTotal    : BONIFICACAO_ROTAS,
      ValorBonificacao       : valorBonif,
    });
  }

  return result.sort((a, b) =>
    a.Empresa.localeCompare(b.Empresa) || a.Data.localeCompare(b.Data)
  );
}

// ── Resumos ───────────────────────────────────────────────────────────────────

function gerarResumoMensal(dados: AnaliseDiaria[]): ResumoMensal[] {
  const acc = new Map<string, {
    dias   : number;
    percMot: number[];
    percAju: number[];
    percDes: number[];
    bonif  : number;
  }>();

  for (const d of dados) {
    const prev = acc.get(d.Empresa);
    if (!prev) {
      acc.set(d.Empresa, {
        dias   : 1,
        percMot: [d.PercAtingidoMotorista],
        percAju: [d.PercAtingidoAjudante],
        percDes: [d.PercDesempenho],
        bonif  : d.ValorBonificacao,
      });
    } else {
      prev.dias++;
      prev.percMot.push(d.PercAtingidoMotorista);
      prev.percAju.push(d.PercAtingidoAjudante);
      prev.percDes.push(d.PercDesempenho);
      prev.bonif += d.ValorBonificacao;
    }
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return Array.from(acc.entries())
    .map(([empresa, a]) => ({
      Empresa             : empresa,
      DiasAnalisados      : a.dias,
      PercMedioMotorista  : Math.round(avg(a.percMot) * 100) / 100,
      PercMedioAjudante   : Math.round(avg(a.percAju) * 100) / 100,
      PercMedioDesempenho : Math.round(avg(a.percDes) * 100) / 100,
      TotalBonifMes       : Math.round(a.bonif * 100) / 100,
    }))
    .sort((a, b) => b.PercMedioDesempenho - a.PercMedioDesempenho);
}

function gerarResumoSimples(dados: AnaliseDiaria[]): ResumoSimples[] {
  const acc = new Map<string, { total: number; atingida: number; mes: number }>();

  for (const d of dados) {
    const mes = parseInt(d.Data.split('-')[1]);
    const prev = acc.get(d.Empresa);
    if (!prev) {
      acc.set(d.Empresa, { total: d.BonificacaoDiaTotal, atingida: d.ValorBonificacao, mes });
    } else {
      prev.total    += d.BonificacaoDiaTotal;
      prev.atingida += d.ValorBonificacao;
    }
  }

  return Array.from(acc.entries()).map(([empresa, a]) => ({
    Empresa             : empresa,
    Mes                 : a.mes,
    BonificacaoTotal    : Math.round(a.total    * 100) / 100,
    BonificacaoAtingida : Math.round(a.atingida * 100) / 100,
  }));
}

// ── Pipeline principal exportado ─────────────────────────────────────────────

export async function executeCcoPipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);
    const targetYear   = parseInt(formData.get('year')  as string);
    const targetMonth  = parseInt(formData.get('month') as string);

    if (!targetYear || !targetMonth) {
      throw new Error('Parâmetros de ano/mês ausentes.');
    }

    if (pipelineType === 'cco') {
      const fileMotoristas = formData.get('fileMotoristas') as File | null;
      const fileAjudantes  = formData.get('fileAjudantes')  as File | null;

      if (!fileMotoristas || !fileAjudantes) {
        throw new Error('Arquivos Motoristas_Ajustado e Ajudantes_Ajustado são obrigatórios.');
      }

      // ── Carrega os dois arquivos _Ajustado.xlsx ───────────────────────────
      const bufMotoristas = Buffer.from(await fileMotoristas.arrayBuffer());
      const bufAjudantes  = Buffer.from(await fileAjudantes.arrayBuffer());

      const motoristas = carregarAjustado(bufMotoristas);
      const ajudantes  = carregarAjustado(bufAjudantes);

      if (motoristas.length === 0 && ajudantes.length === 0) {
        throw new Error('Nenhum dado válido encontrado nos arquivos carregados.');
      }

      // ── Cálculo de desempenho ─────────────────────────────────────────────
      const analiseDiaria = calcularDesempenho(motoristas, ajudantes, targetMonth, targetYear);

      if (analiseDiaria.length === 0) {
        throw new Error(`Nenhum dado encontrado para ${String(targetMonth).padStart(2,'0')}/${targetYear}.`);
      }

      // ── Resumos ───────────────────────────────────────────────────────────
      const resumoMensal  = gerarResumoMensal(analiseDiaria);
      const resumoSimples = gerarResumoSimples(analiseDiaria);

      // ── Métricas de saída ─────────────────────────────────────────────────
      const totalBonif    = analiseDiaria.reduce((s, d) => s + d.ValorBonificacao, 0);
      const percMedio     = analiseDiaria.reduce((s, d) => s + d.PercDesempenho, 0) / analiseDiaria.length;
      const empresas      = new Set(analiseDiaria.map(d => d.Empresa)).size;

      const summary =
        `${analiseDiaria.length} dias | ${empresas} empresas | ` +
        `desempenho médio ${percMedio.toFixed(2)}% | ` +
        `bonificação total R$ ${totalBonif.toFixed(2)}`;

      // ── Salva no Firebase ─────────────────────────────────────────────────
      const saved = await firebaseStore.saveResult('cco', {
        pipelineType : 'cco',
        timestamp    : Date.now(),
        year         : targetYear,
        month        : targetMonth,
        data         : analiseDiaria,
        resumoMensal,
        resumoSimples,
        summary,
        config       : { BONIFICACAO_ROTAS },
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error('Erro no Pipeline CCO:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}