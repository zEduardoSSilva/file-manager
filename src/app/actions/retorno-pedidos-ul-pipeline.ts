'use server';

import { firebaseStore } from '@/lib/firebase';
import * as XLSX from 'xlsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE Retorno de Pedidos — TypeScript (TXT vs Excel)
 *
 * Etapa 1 — Extração dos TXTs
 *   • Lê arquivos .txt e extrai códigos de pedido com regex
 *   • Padrão: 9 dígitos + 3 dígitos + BV|RK|KP + 2 dígitos + 6 dígitos
 *   • Exemplo: 402976780001BV01135931
 *   • Extrai data do padrão B1DDMMYY
 *   • Chave primária: Codigo_Cliente_NumeroPedido (ex: 402976780_135931)
 *
 * Etapa 2 — Verificação no Excel (STATUS_PEDIDOS_MERCANETE)
 *   • Detecta colunas automaticamente (Pedido, Código_Cliente, Data)
 *   • Padroniza: Pedido → 6 dígitos | Cliente → 9 dígitos
 *   • Compara por chave primária usando Set O(1)
 *
 * Etapa 3 — Relatório
 *   • Todos_Pedidos · Encontrados · Nao_Encontrados
 *   • Resumo_por_Arquivo · Resumo_por_Empresa · Resumo_Geral
 * ═══════════════════════════════════════════════════════════════════════════
 */

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

/** Extrai somente dígitos de uma string. */
const onlyDigits = (s: string) => s.replace(/[^0-9]/g, '');

/** Preenche com zeros à esquerda. */
const zfill = (s: string, n: number) => s.padStart(n, '0');

// ── Regex de extração ────────────────────────────────────────────────────────

// Padrão do código completo: 9d + 3d + (BV|RK|KP) + 2d + 6d
const RE_PEDIDO = /(\d{9})(\d{3})(BV|RK|KP)(\d{2})(\d{6})/;

// Padrão de data: B1DDMMYY (ex: B1300925 → 30/09/2025)
const RE_DATA = /B\d(\d{6})/;

// ── Estruturas ────────────────────────────────────────────────────────────────

export interface PedidoTxt {
  arquivo       : string;
  codigoCompleto: string;
  codigoCliente : string;
  sufixo        : string;
  numeroPedido  : string;
  tipoEmpresa   : string;
  chavePrimaria : string;
  dataTxt       : string | null;
  linhaOriginal : string;
}

export interface ResultadoPedido extends PedidoTxt {
  encontradoExcel: 'SIM' | 'NÃO';
}

export interface ResumoArquivo {
  arquivo       : string;
  encontrado    : number;
  naoEncontrado : number;
  total         : number;
  taxaSucesso   : number;
}

export interface ResumoEmpresa {
  tipoEmpresa   : string;
  encontrado    : number;
  naoEncontrado : number;
  total         : number;
  taxaSucesso   : number;
}

export interface ResumoGeral {
  totalPedidos       : number;
  encontrados        : number;
  naoEncontrados     : number;
  percEncontrados    : number;
  percNaoEncontrados : number;
  arquivosProcessados: number;
  clientesUnicos     : number;
  tiposEmpresa       : string[];
}

// ── Etapa 1: Extração dos TXTs ────────────────────────────────────────────────

function extrairPedidosTxt(
  files: { name: string; content: string }[]
): PedidoTxt[] {
  const pedidos: PedidoTxt[] = [];

  for (const file of files) {
    const linhas = file.content.split(/\r?\n/);

    for (const linha of linhas) {
      const matchPedido = RE_PEDIDO.exec(linha);
      if (!matchPedido) continue;

      // Data
      let dataTxt: string | null = null;
      const matchData = RE_DATA.exec(linha);
      if (matchData) {
        const ds  = matchData[1];
        const dia = parseInt(ds.slice(0, 2));
        const mes = parseInt(ds.slice(2, 4));
        const ano = parseInt(ds.slice(4, 6));
        const anoFull = ano <= 50 ? 2000 + ano : 1900 + ano;
        try {
          const d = new Date(anoFull, mes - 1, dia);
          if (!isNaN(d.getTime())) {
            dataTxt = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
          }
        } catch { /* ignora */ }
      }

      const codigoCliente = matchPedido[1];
      const sufixo        = matchPedido[2];
      const tipo          = matchPedido[3];
      const empresa       = matchPedido[4];
      const numeroPedido  = matchPedido[5];
      const tipoEmpresa   = `${tipo}${empresa}`;
      const chavePrimaria = `${codigoCliente}_${numeroPedido}`;

      pedidos.push({
        arquivo       : file.name,
        codigoCompleto: matchPedido[0],
        codigoCliente,
        sufixo,
        numeroPedido,
        tipoEmpresa,
        chavePrimaria,
        dataTxt,
        linhaOriginal : linha.trim(),
      });
    }
  }

  return pedidos;
}

// ── Etapa 2: Verificação no Excel ────────────────────────────────────────────

function verificarPedidosExcel(
  pedidosTxt : PedidoTxt[],
  excelBuffer: Buffer
): ResultadoPedido[] {

  const workbook = XLSX.read(excelBuffer, { type: 'buffer', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  if (rows.length < 2) throw new Error('Arquivo Excel vazio ou sem dados.');

  const headers = rows[0].map((h: any) => String(h || '').trim());

  // ── Detecção de colunas ──────────────────────────────────────────────────
  const iPedido = findCol(headers, [
    'pedido_original', 'pedido original', 'numero_pedido', 'numero pedido', 'pedido',
  ]);
  const iCliente = findCol(headers, [
    'codigo_cliente', 'código_cliente', 'codigo cliente', 'cliente',
  ]);
  const iData = findCol(headers, ['data_processamento', 'data processamento', 'data_emissao', 'data emissao', 'data']);

  if (iPedido < 0)  throw new Error('Coluna de pedido não encontrada no Excel (esperado: Pedido, Pedido_original).');
  if (iCliente < 0) throw new Error('Coluna de código do cliente não encontrada no Excel (esperado: Codigo_Cliente, Código_Cliente).');

  // ── Cria Set de chaves do Excel ──────────────────────────────────────────
  const chavesExcel = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Normaliza pedido → 6 dígitos
    const pedidoRaw = zfill(onlyDigits(String(row[iPedido] ?? '').split('.')[0].trim()).slice(-6), 6);

    // Normaliza cliente → 9 dígitos
    const clienteRaw = zfill(onlyDigits(String(row[iCliente] ?? '').replace('.0', '').trim()).slice(0, 9), 9);

    if (!pedidoRaw || !clienteRaw || pedidoRaw === '000000' || clienteRaw === '000000000') continue;

    chavesExcel.add(`${clienteRaw}_${pedidoRaw}`);
  }

  // ── Comparação ───────────────────────────────────────────────────────────
  return pedidosTxt.map(p => ({
    ...p,
    encontradoExcel: chavesExcel.has(p.chavePrimaria) ? 'SIM' : 'NÃO',
  }));
}

// ── Etapa 3: Geração dos resumos ──────────────────────────────────────────────

function gerarResumos(resultados: ResultadoPedido[]): {
  resumoArquivo: ResumoArquivo[];
  resumoEmpresa: ResumoEmpresa[];
  resumoGeral  : ResumoGeral;
} {
  // Por arquivo
  const arqMap = new Map<string, { enc: number; nao: number }>();
  for (const r of resultados) {
    if (!arqMap.has(r.arquivo)) arqMap.set(r.arquivo, { enc: 0, nao: 0 });
    const a = arqMap.get(r.arquivo)!;
    if (r.encontradoExcel === 'SIM') a.enc++; else a.nao++;
  }
  const resumoArquivo: ResumoArquivo[] = Array.from(arqMap.entries()).map(([arquivo, a]) => ({
    arquivo,
    encontrado   : a.enc,
    naoEncontrado: a.nao,
    total        : a.enc + a.nao,
    taxaSucesso  : Math.round(a.enc / (a.enc + a.nao) * 100 * 100) / 100,
  })).sort((a, b) => b.taxaSucesso - a.taxaSucesso);

  // Por empresa
  const empMap = new Map<string, { enc: number; nao: number }>();
  for (const r of resultados) {
    if (!empMap.has(r.tipoEmpresa)) empMap.set(r.tipoEmpresa, { enc: 0, nao: 0 });
    const a = empMap.get(r.tipoEmpresa)!;
    if (r.encontradoExcel === 'SIM') a.enc++; else a.nao++;
  }
  const resumoEmpresa: ResumoEmpresa[] = Array.from(empMap.entries()).map(([tipoEmpresa, a]) => ({
    tipoEmpresa,
    encontrado   : a.enc,
    naoEncontrado: a.nao,
    total        : a.enc + a.nao,
    taxaSucesso  : Math.round(a.enc / (a.enc + a.nao) * 100 * 100) / 100,
  })).sort((a, b) => a.tipoEmpresa.localeCompare(b.tipoEmpresa));

  const total          = resultados.length;
  const encontrados    = resultados.filter(r => r.encontradoExcel === 'SIM').length;
  const naoEncontrados = total - encontrados;

  const resumoGeral: ResumoGeral = {
    totalPedidos       : total,
    encontrados,
    naoEncontrados,
    percEncontrados    : total > 0 ? Math.round(encontrados    / total * 100 * 100) / 100 : 0,
    percNaoEncontrados : total > 0 ? Math.round(naoEncontrados / total * 100 * 100) / 100 : 0,
    arquivosProcessados: new Set(resultados.map(r => r.arquivo)).size,
    clientesUnicos     : new Set(resultados.map(r => r.codigoCliente)).size,
    tiposEmpresa       : [...new Set(resultados.map(r => r.tipoEmpresa))].sort(),
  };

  return { resumoArquivo, resumoEmpresa, resumoGeral };
}

// ── Pipeline principal exportado ─────────────────────────────────────────────

export async function executeRetornoPedidosULPipeline(formData: FormData, type?: string) {
  try {
    const pipelineType = type || (formData.get('pipelineType') as string);

    if (pipelineType === 'retorno-pedidos') {

      // ── Coleta arquivos TXT ───────────────────────────────────────────────
      const txtFiles = formData.getAll('filesTxt') as File[];
      const excelFile = formData.get('fileExcel') as File | null;

      if (txtFiles.length === 0) throw new Error('Nenhum arquivo TXT enviado.');
      if (!excelFile)            throw new Error('Arquivo Excel (STATUS_PEDIDOS_MERCANETE) é obrigatório.');

      // ── Etapa 1: Extração ─────────────────────────────────────────────────
      const txtContents: { name: string; content: string }[] = [];

      for (const file of txtFiles) {
        // Tenta múltiplos encodings (utf-8 → latin1 fallback via Buffer)
        const buf     = Buffer.from(await file.arrayBuffer());
        let content: string;
        try {
          content = buf.toString('utf-8');
          // Detecta lixo de encoding: se houver muitos caracteres fora do ASCII
          const nonAscii = (content.match(/[^\x00-\x7F]/g) || []).length;
          if (nonAscii / content.length > 0.05) throw new Error('likely latin1');
        } catch {
          content = buf.toString('latin1');
        }
        txtContents.push({ name: file.name, content });
      }

      const pedidosTxt = extrairPedidosTxt(txtContents);

      if (pedidosTxt.length === 0) {
        throw new Error(
          'Nenhum pedido encontrado nos arquivos TXT. ' +
          'Verifique se os arquivos contêm o padrão: 9 dígitos + 3 dígitos + BV/RK/KP + 2 dígitos + 6 dígitos.'
        );
      }

      // ── Etapa 2: Verificação no Excel ────────────────────────────────────
      const excelBuffer = Buffer.from(await excelFile.arrayBuffer());
      const resultados  = verificarPedidosExcel(pedidosTxt, excelBuffer);

      // ── Etapa 3: Resumos ──────────────────────────────────────────────────
      const { resumoArquivo, resumoEmpresa, resumoGeral } = gerarResumos(resultados);

      const encontrados    = resultados.filter(r => r.encontradoExcel === 'SIM');
      const naoEncontrados = resultados.filter(r => r.encontradoExcel === 'NÃO');

      const summary =
        `${resumoGeral.totalPedidos} pedidos | ` +
        `✅ ${resumoGeral.encontrados} encontrados (${resumoGeral.percEncontrados}%) | ` +
        `❌ ${resumoGeral.naoEncontrados} não encontrados (${resumoGeral.percNaoEncontrados}%) | ` +
        `${resumoGeral.arquivosProcessados} arquivo(s)`;

      // ── Firebase ──────────────────────────────────────────────────────────
      const saved = await firebaseStore.saveResult('retorno-pedidos', {
        pipelineType    : 'retorno-pedidos',
        timestamp       : Date.now(),
        data            : resultados,
        encontrados,
        naoEncontrados,
        resumoArquivo,
        resumoEmpresa,
        resumoGeral,
        summary,
      });

      return { success: true, result: JSON.parse(JSON.stringify(saved)) };
    }

    return { success: false, error: 'Pipeline não implementado para este tipo.' };

  } catch (error: any) {
    console.error('Erro no Pipeline Retorno Pedidos:', error);
    return { success: false, error: error.message || 'Erro no processamento.' };
  }
}