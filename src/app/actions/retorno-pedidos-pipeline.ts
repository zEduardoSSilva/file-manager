'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Retorno de Pedidos UL — TypeScript (UL vs Excel)
 *
 * Etapa 1 — Extração dos ULs
 *   • Lê arquivos .ul e extrai códigos de pedido com regex
 *   • Padrão: 9 dígitos + 3 dígitos + BV|RK|KP + 2 dígitos + 6 dígitos
 *   • Extrai ROTA: primeira palavra da linha
 *   • Extrai DATA: posição fixa caracteres 54–60 (formato DDMMYY)
 *   • Chave primária: Codigo_Cliente_NumeroPedido
 *
 * Etapa 2 — Verificação no Excel (STATUS_PEDIDOS_MERCANETE)
 *   • Idêntica ao pipeline TXT — mesma lógica de detecção e padronização
 *   • Compara por chave primária via Set O(1)
 *
 * Etapa 3 — Relatório
 *   • Todos_Pedidos · Encontrados · Nao_Encontrados
 *   • Resumo_por_Arquivo · Resumo_por_Rota · Resumo_por_Empresa · Resumo_Geral
 *
 * Diferença vs. pipeline TXT:
 *   • Extensão: .ul (não .txt)
 *   • Campo adicional: Rota (primeira palavra da linha)
 *   • Data via posição fixa [54:60] em vez de regex B1DDMMYY
 *   • Resumo_por_Rota (aba extra)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Helpers (idênticos ao pipeline TXT) ──────────────────────────────────────

const normalizeKey = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

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

const onlyDigits = (s: string) => s.replace(/[^0-9]/g, '');
const zfill      = (s: string, n: number) => s.padStart(n, '0');

// ── Regex de extração ─────────────────────────────────────────────────────────

const RE_PEDIDO = /(\d{9})(\d{3})(BV|RK|KP)(\d{2})(\d{6})/;
const RE_ROTA   = /^(\S+)\s+/;

// ── Estruturas ────────────────────────────────────────────────────────────────

export interface PedidoUl {
  arquivo       : string;
  rota          : string;   // primeira palavra da linha
  codigoCompleto: string;
  codigoCliente : string;
  sufixo        : string;
  tipo          : string;
  empresa       : string;
  tipoEmpresa   : string;
  numeroPedido  : string;
  chavePrimaria : string;
  dataUl        : string | null;
  linhaOriginal : string;
}

export interface ResultadoPedidoUl extends PedidoUl {
  encontradoExcel: 'SIM' | 'NÃO';
}

export interface ResumoArquivoUl {
  arquivo       : string;
  encontrado    : number;
  naoEncontrado : number;
  total         : number;
  taxaSucesso   : number;
}

export interface ResumoRotaUl {
  rota          : string;
  encontrado    : number;
  naoEncontrado : number;
  total         : number;
  taxaSucesso   : number;
}

export interface ResumoEmpresaUl {
  tipoEmpresa   : string;
  encontrado    : number;
  naoEncontrado : number;
  total         : number;
  taxaSucesso   : number;
}

export interface ResumoGeralUl {
  totalPedidos       : number;
  encontrados        : number;
  naoEncontrados     : number;
  percEncontrados    : number;
  percNaoEncontrados : number;
  arquivosProcessados: number;
  clientesUnicos     : number;
  rotasUnicas        : number;
  tiposEmpresa       : string[];
}

// ── Etapa 1: Extração dos ULs ─────────────────────────────────────────────────

function extrairPedidosUl(
  files: { name: string; content: string }[]
): PedidoUl[] {
  const pedidos: PedidoUl[] = [];

  for (const file of files) {
    const linhas = file.content.split(/\r?\n/);

    for (const linha of linhas) {
      const linhaStripped = linha.trim().toUpperCase();
      if (!linhaStripped) continue;

      // Rota: primeira palavra da linha
      const rotaMatch = RE_ROTA.exec(linhaStripped);
      const rota      = rotaMatch ? rotaMatch[1] : '';

      // Código do pedido
      const matchPedido = RE_PEDIDO.exec(linhaStripped);

      // Data: posição fixa [54:60] na linha ORIGINAL (antes do uppercase)
      let dataUl: string | null = null;
      try {
        if (linha.length > 60) {
          const ds = linha.slice(54, 60).trim();
          if (/^\d{6}$/.test(ds)) {
            const dia = parseInt(ds.slice(0, 2));
            const mes = parseInt(ds.slice(2, 4));
            const ano = parseInt(ds.slice(4, 6));
            const anoFull = ano <= 50 ? 2000 + ano : 1900 + ano;
            const d = new Date(anoFull, mes - 1, dia);
            if (!isNaN(d.getTime())) {
              dataUl = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
            }
          }
        }
      } catch { /* ignora */ }

      if (!matchPedido) continue;

      const codigoCliente = matchPedido[1];
      const sufixo        = matchPedido[2];
      const tipo          = matchPedido[3];
      const empresa       = matchPedido[4];
      const tipoEmpresa   = `${tipo}${empresa}`;
      const numeroPedido  = matchPedido[5];
      const chavePrimaria = `${codigoCliente}_${numeroPedido}`;

      pedidos.push({
        arquivo       : file.name,
        rota,
        codigoCompleto: matchPedido[0],
        codigoCliente,
        sufixo,
        tipo,
        empresa,
        tipoEmpresa,
        numeroPedido,
        chavePrimaria,
        dataUl,
        linhaOriginal : linha.trim(),
      });
    }
  }

  return pedidos;
}

// ── Etapa 2: Verificação no Excel (idêntica ao pipeline TXT) ─────────────────

function verificarPedidosExcel(
  pedidosUl  : PedidoUl[],
  excelBuffer: Buffer
): ResultadoPedidoUl[] {

  const workbook = XLSX.read(excelBuffer, { type: 'buffer', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  if (rows.length < 2) throw new Error('Arquivo Excel vazio ou sem dados.');

  const headers = rows[0].map((h: any) => String(h || '').trim());

  const iPedido  = findCol(headers, [
    'pedido_original', 'pedido original', 'numero_pedido', 'numero pedido', 'pedido',
  ]);
  const iCliente = findCol(headers, [
    'codigo_cliente', 'código_cliente', 'codigo cliente', 'cliente',
  ]);

  if (iPedido < 0)  throw new Error('Coluna de pedido não encontrada no Excel.');
  if (iCliente < 0) throw new Error('Coluna de código do cliente não encontrada no Excel.');

  const chavesExcel = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const pedidoRaw  = zfill(onlyDigits(String(row[iPedido]  ?? '').split('.')[0].trim()).slice(-6), 6);
    const clienteRaw = zfill(onlyDigits(String(row[iCliente] ?? '').replace('.0', '').trim()).slice(0, 9), 9);
    if (!pedidoRaw || !clienteRaw || pedidoRaw === '000000' || clienteRaw === '000000000') continue;
    chavesExcel.add(`${clienteRaw}_${pedidoRaw}`);
  }

  return pedidosUl.map(p => ({
    ...p,
    encontradoExcel: chavesExcel.has(p.chavePrimaria) ? 'SIM' : 'NÃO',
  }));
}

// ── Etapa 3: Geração dos resumos ──────────────────────────────────────────────

function gerarResumos(resultados: ResultadoPedidoUl[]): {
  resumoArquivo: ResumoArquivoUl[];
  resumoRota   : ResumoRotaUl[];
  resumoEmpresa: ResumoEmpresaUl[];
  resumoGeral  : ResumoGeralUl;
} {
  const mkAcc = () => new Map<string, { enc: number; nao: number }>();
  const update = (m: Map<string, { enc: number; nao: number }>, key: string, found: boolean) => {
    if (!m.has(key)) m.set(key, { enc: 0, nao: 0 });
    const a = m.get(key)!;
    if (found) a.enc++; else a.nao++;
  };
  const toList = <T>(
    m     : Map<string, { enc: number; nao: number }>,
    keyFn : (k: string) => Partial<T>
  ): T[] =>
    Array.from(m.entries()).map(([k, a]) => ({
      ...keyFn(k),
      encontrado   : a.enc,
      naoEncontrado: a.nao,
      total        : a.enc + a.nao,
      taxaSucesso  : Math.round(a.enc / (a.enc + a.nao) * 100 * 100) / 100,
    } as unknown as T));

  const arqMap = mkAcc();
  const rotMap = mkAcc();
  const empMap = mkAcc();

  for (const r of resultados) {
    const found = r.encontradoExcel === 'SIM';
    update(arqMap, r.arquivo,     found);
    update(rotMap, r.rota,        found);
    update(empMap, r.tipoEmpresa, found);
  }

  const resumoArquivo = (toList<ResumoArquivoUl>(arqMap, k => ({ arquivo: k })))
    .sort((a, b) => b.taxaSucesso - a.taxaSucesso);
  const resumoRota    = (toList<ResumoRotaUl>(rotMap, k => ({ rota: k })))
    .sort((a, b) => a.rota.localeCompare(b.rota));
  const resumoEmpresa = (toList<ResumoEmpresaUl>(empMap, k => ({ tipoEmpresa: k })))
    .sort((a, b) => a.tipoEmpresa.localeCompare(b.tipoEmpresa));

  const total       = resultados.length;
  const encontrados = resultados.filter(r => r.encontradoExcel === 'SIM').length;

  const resumoGeral: ResumoGeralUl = {
    totalPedidos       : total,
    encontrados,
    naoEncontrados     : total - encontrados,
    percEncontrados    : total > 0 ? Math.round(encontrados        / total * 100 * 100) / 100 : 0,
    percNaoEncontrados : total > 0 ? Math.round((total-encontrados)/ total * 100 * 100) / 100 : 0,
    arquivosProcessados: new Set(resultados.map(r => r.arquivo)).size,
    clientesUnicos     : new Set(resultados.map(r => r.codigoCliente)).size,
    rotasUnicas        : new Set(resultados.map(r => r.rota)).size,
    tiposEmpresa       : [...new Set(resultados.map(r => r.tipoEmpresa))].sort(),
  };

  return { resumoArquivo, resumoRota, resumoEmpresa, resumoGeral };
}

// ── Pipeline principal exportado ──────────────────────────────────────────────

export async function executeRetornoPedidosPipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);

    if (pipelineType === 'retorno-pedidos-ul') {
      const ulFiles    = formData.getAll('filesUl')   as File[];
      const excelFile  = formData.get('fileExcel')    as File | null;

      if (ulFiles.length === 0) throw new Error('Nenhum arquivo .ul enviado.');
      if (!excelFile)           throw new Error('Arquivo Excel (STATUS_PEDIDOS_MERCANETE) é obrigatório.');

      // ── Etapa 1: Extração ─────────────────────────────────────────────────
      const ulContents: { name: string; content: string }[] = [];

      for (const file of ulFiles) {
        const buf = Buffer.from(await file.arrayBuffer());
        let content: string;
        try {
          content = buf.toString('utf-8');
          const nonAscii = (content.match(/[^\x00-\x7F]/g) || []).length;
          if (nonAscii / content.length > 0.05) throw new Error('likely latin1');
        } catch {
          content = buf.toString('latin1');
        }
        ulContents.push({ name: file.name, content });
      }

      const pedidosUl = extrairPedidosUl(ulContents);

      if (pedidosUl.length === 0) {
        throw new Error(
          'Nenhum pedido encontrado nos arquivos UL. ' +
          'Verifique se os arquivos contêm o padrão: 9 dígitos + 3 dígitos + BV/RK/KP + 2 dígitos + 6 dígitos.'
        );
      }

      // ── Etapa 2: Verificação no Excel ────────────────────────────────────
      const excelBuffer = Buffer.from(await excelFile.arrayBuffer());
      const resultados  = verificarPedidosExcel(pedidosUl, excelBuffer);

      // ── Etapa 3: Resumos ──────────────────────────────────────────────────
      const { resumoArquivo, resumoRota, resumoEmpresa, resumoGeral } = gerarResumos(resultados);

      const encontrados    = resultados.filter(r => r.encontradoExcel === 'SIM');
      const naoEncontrados = resultados.filter(r => r.encontradoExcel === 'NÃO');

      const summary =
        `${resumoGeral.totalPedidos} pedidos | ` +
        `✅ ${resumoGeral.encontrados} encontrados (${resumoGeral.percEncontrados}%) | ` +
        `❌ ${resumoGeral.naoEncontrados} não encontrados | ` +
        `${resumoGeral.rotasUnicas} rota(s) | ${resumoGeral.arquivosProcessados} arquivo(s)`;

      const saved = await firebaseStore.saveResult('retorno-pedidos-ul', {
        pipelineType    : 'retorno-pedidos-ul',
        timestamp       : Date.now(),
        data            : resultados,
        encontrados,
        naoEncontrados,
        resumoArquivo,
        resumoRota,
        resumoEmpresa,
        resumoGeral,
        summary,
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error('Erro no Pipeline Retorno Pedidos UL:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}