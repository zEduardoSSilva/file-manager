"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./actions-utils"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Regex fiel ao Python:
 *   (\d{9})(\d{3})(BV|RK|KP)(\d{2})(\d{6})
 * Grupos: CodigoCliente · Sufixo · Tipo · Empresa · NumeroPedido
 */
const PEDIDO_REGEX = /(\d{9})(\d{3})(BV|RK|KP)(\d{2})(\d{6})/g

/**
 * Data pattern: B1DDMMYY ou B2DDMMYY etc.
 * Python: r'B\d(\d{6})'
 */
const DATA_REGEX = /B\d(\d{6})/

/** Lê conteúdo de um File como texto, tentando múltiplos encodings via TextDecoder. */
async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const arr = new Uint8Array(buf)

  // Tenta os mesmos encodings do Python: utf-8, latin1 (=iso-8859-1), cp1252
  const encodings = ["utf-8", "iso-8859-1", "windows-1252"]
  for (const enc of encodings) {
    try {
      const text = new TextDecoder(enc, { fatal: true }).decode(arr)
      return text
    } catch {
      continue
    }
  }
  // Fallback sem modo estrito
  return new TextDecoder("utf-8", { fatal: false }).decode(arr)
}

/**
 * Converte string DDMMYY → DD/MM/YYYY.
 * Anos ≤ 50 → 2000+ano; > 50 → 1900+ano (igual ao Python).
 */
function parseDateDDMMYY(raw: string): string {
  try {
    const dia = parseInt(raw.slice(0, 2))
    const mes = parseInt(raw.slice(2, 4))
    const ano2 = parseInt(raw.slice(4, 6))
    const ano = ano2 <= 50 ? 2000 + ano2 : 1900 + ano2
    const d = new Date(ano, mes - 1, dia)
    if (isNaN(d.getTime())) return "Data Inválida"
    return `${String(dia).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`
  } catch {
    return "Data Inválida"
  }
}

// ─── Etapa 1: Extrair pedidos dos TXTs ───────────────────────────────────────

interface PedidoTxt {
  Arquivo:         string
  Codigo_Completo: string
  Codigo_Cliente:  string
  Sufixo:          string
  Numero_Pedido:   string
  Tipo_Empresa:    string
  Chave_Primaria:  string
  Data_TXT:        string | null
  Linha_Original:  string
}

async function extrairPedidosTxt(files: File[]): Promise<PedidoTxt[]> {
  const pedidos: PedidoTxt[] = []

  for (const file of files) {
    const nome     = file.name
    const conteudo = await readFileText(file)
    const linhas   = conteudo.split(/\r?\n/)
    let contLinha  = 0

    for (const linha of linhas) {
      // ── Data: padrão B1DDMMYY ─────────────────────────────────────────
      const matchData = DATA_REGEX.exec(linha)
      let dataFmt: string | null = null
      if (matchData) dataFmt = parseDateDDMMYY(matchData[1])

      // ── Pedido(s) na linha ────────────────────────────────────────────
      // Reset lastIndex para busca global
      PEDIDO_REGEX.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = PEDIDO_REGEX.exec(linha)) !== null) {
        const codigoCliente  = match[1]   // 9 dígitos
        const sufixo         = match[2]   // 3 dígitos
        const tipo           = match[3]   // BV | RK | KP
        const empresa        = match[4]   // 2 dígitos
        const numeroPedido   = match[5]   // 6 dígitos
        const codigoCompleto = match[0]   // match completo
        const tipoEmpresa    = tipo + empresa        // BV01, RK01, KP01
        const chavePrimaria  = `${codigoCliente}_${numeroPedido}`

        pedidos.push({
          Arquivo:         nome,
          Codigo_Completo: codigoCompleto,
          Codigo_Cliente:  codigoCliente,
          Sufixo:          sufixo,
          Numero_Pedido:   numeroPedido,
          Tipo_Empresa:    tipoEmpresa,
          Chave_Primaria:  chavePrimaria,
          Data_TXT:        dataFmt,
          Linha_Original:  linha.trim(),
        })
        contLinha++
      }
    }

    console.log(`[RetornoPedidos] ${nome}: ${contLinha} pedidos extraídos`)
  }

  return pedidos
}

// ─── Etapa 2+3: Carregar Excel e construir Set de chaves ─────────────────────

interface ExcelChavesResult {
  chaves:             Set<string>
  colunasDetectadas:  { pedido: string; cliente: string; data?: string }
  totalExcel:         number
  chavesPrimarias:    number
}

function normCol(s: any): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
}

/** Remove parte decimal (.0) e caracteres não-numéricos, fiel ao Python. */
function padronizarNumeroPedido(v: any): string {
  const s = String(v ?? "")
  const semDecimal = s.split(".")[0]                    // Remove .0
  const apenasDigitos = semDecimal.replace(/[^0-9]/g, "")
  return apenasDigitos.padStart(6, "0")                 // zfill(6)
}

function padronizarCodigoCliente(v: any): string {
  const s = String(v ?? "").replace(".0", "").trim()
  const apenasDigitos = s.replace(/[^0-9]/g, "")
  const primeiros9    = apenasDigitos.slice(0, 9)       // [:9]
  return primeiros9.padStart(9, "0")                    // zfill(9)
}

function construirChavesExcel(rows: any[]): ExcelChavesResult {
  if (!rows.length) return { chaves: new Set(), colunasDetectadas: { pedido: "", cliente: "" }, totalExcel: 0, chavesPrimarias: 0 }

  const first = rows[0]
  const cols  = Object.keys(first)

  // ── Detecta coluna de PEDIDO ──────────────────────────────────────────────
  let colPedido: string | null = null

  // Prioridade 1: "pedido" + "original"
  for (const col of cols) {
    const n = normCol(col)
    if (n.includes("pedido") && n.includes("original")) { colPedido = col; break }
  }
  // Prioridade 2: exatamente "pedido"
  if (!colPedido) {
    for (const col of cols) {
      if (normCol(col) === "pedido") { colPedido = col; break }
    }
  }

  if (!colPedido) throw new Error(`Coluna de pedido não encontrada no Excel. Colunas: ${cols.slice(0,10).join(", ")}`)

  // ── Detecta coluna de CÓDIGO DO CLIENTE ──────────────────────────────────
  let colCliente: string | null = null

  // Prioridade 1: exatamente "código_cliente" (com acento)
  for (const col of cols) {
    if (normCol(col) === "codigo_cliente") { colCliente = col; break }
  }
  // Prioridade 2: contém "codigo" e "cliente"
  if (!colCliente) {
    for (const col of cols) {
      const n = normCol(col)
      if (n.includes("codigo") && n.includes("cliente")) { colCliente = col; break }
    }
  }
  // Prioridade 3: coluna numérica com 9 ou 12 dígitos (igual ao Python)
  if (!colCliente) {
    for (const col of cols) {
      try {
        const sample = rows.find(r => r[col] != null)?.[col]
        if (!sample) continue
        const s = String(sample).replace(".0","").trim().replace(/[^0-9]/g,"")
        if ((s.length === 9 || s.length === 12) && /^\d+$/.test(s)) {
          colCliente = col
          break
        }
      } catch { continue }
    }
  }

  if (!colCliente) throw new Error(`Coluna de código do cliente não encontrada no Excel. Colunas: ${cols.slice(0,10).join(", ")}`)

  // ── Detecta coluna de DATA (opcional) ────────────────────────────────────
  let colData: string | undefined
  for (const col of cols) {
    const n = normCol(col)
    if (["data","processamento","emissao"].some(t => n.includes(t))) { colData = col; break }
  }

  // ── Padroniza e constrói Set ──────────────────────────────────────────────
  const chaves = new Set<string>()
  let validCount = 0

  for (const row of rows) {
    const pedido  = padronizarNumeroPedido(row[colPedido])
    const cliente = padronizarCodigoCliente(row[colCliente])

    if (!pedido || !cliente) continue
    const chave = `${cliente}_${pedido}`
    if (!chave.includes("_")) continue   // chave inválida

    chaves.add(chave)
    validCount++
  }

  console.log(`[RetornoPedidos] Excel: ${validCount} registros válidos · ${chaves.size} chaves únicas`)

  return {
    chaves,
    colunasDetectadas: { pedido: colPedido, cliente: colCliente, data: colData },
    totalExcel:        validCount,
    chavesPrimarias:   chaves.size,
  }
}

// ─── Etapa 4: Comparação ─────────────────────────────────────────────────────

interface ResultadoPedido extends PedidoTxt {
  Encontrado_Excel: "SIM" | "NÃO"
}

function compararPedidos(pedidos: PedidoTxt[], chaves: Set<string>): ResultadoPedido[] {
  return pedidos.map(p => ({
    ...p,
    Encontrado_Excel: chaves.has(p.Chave_Primaria) ? "SIM" : "NÃO",
  }))
}

// ─── Geração de resumos ───────────────────────────────────────────────────────

function gerarResumoPorArquivo(resultado: ResultadoPedido[]): any[] {
  const map = new Map<string, { SIM: number; NÃO: number }>()
  for (const r of resultado) {
    if (!map.has(r.Arquivo)) map.set(r.Arquivo, { SIM: 0, NÃO: 0 })
    const g = map.get(r.Arquivo)!
    g[r.Encontrado_Excel]++
  }
  const rows: any[] = []
  for (const [arquivo, g] of map) {
    rows.push({ Arquivo: arquivo, Encontrado_Excel: "SIM", Quantidade: g.SIM })
    rows.push({ Arquivo: arquivo, Encontrado_Excel: "NÃO", Quantidade: g.NÃO })
  }
  return rows.sort((a, b) => a.Arquivo.localeCompare(b.Arquivo))
}

function gerarResumoPorEmpresa(resultado: ResultadoPedido[]): any[] {
  const map = new Map<string, { SIM: number; NÃO: number }>()
  for (const r of resultado) {
    if (!map.has(r.Tipo_Empresa)) map.set(r.Tipo_Empresa, { SIM: 0, NÃO: 0 })
    const g = map.get(r.Tipo_Empresa)!
    g[r.Encontrado_Excel]++
  }
  const rows: any[] = []
  for (const [empresa, g] of map) {
    rows.push({ Tipo_Empresa: empresa, Encontrado_Excel: "SIM", Quantidade: g.SIM })
    rows.push({ Tipo_Empresa: empresa, Encontrado_Excel: "NÃO", Quantidade: g.NÃO })
  }
  return rows.sort((a, b) => a.Tipo_Empresa.localeCompare(b.Tipo_Empresa))
}

function gerarResumoGeral(resultado: ResultadoPedido[]): {
  sheet: any[]
  resumo: Record<string, any>
} {
  const total          = resultado.length
  const encontrados    = resultado.filter(r => r.Encontrado_Excel === "SIM").length
  const naoEncontrados = total - encontrados
  const percEnc        = total > 0 ? +((encontrados / total) * 100).toFixed(2) : 0
  const percNaoEnc     = total > 0 ? +((naoEncontrados / total) * 100).toFixed(2) : 0

  const sheet = [
    { Métrica: "Total de Pedidos",      Valor: total },
    { Métrica: "Encontrados",           Valor: encontrados },
    { Métrica: "Não Encontrados",       Valor: naoEncontrados },
    { Métrica: "% Encontrados",         Valor: `${percEnc}%` },
    { Métrica: "% Não Encontrados",     Valor: `${percNaoEnc}%` },
  ]

  const clientesUnicos = new Set(resultado.map(r => r.Codigo_Cliente)).size
  const arquivosUnicos = new Set(resultado.map(r => r.Arquivo)).size

  return {
    sheet,
    resumo: {
      totalPedidos:        total,
      encontrados,
      naoEncontrados,
      percEncontrados:     percEnc,
      percNaoEncontrados:  percNaoEnc,
      clientesUnicos,
      arquivosProcessados: arquivosUnicos,
    },
  }
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function retornoPedidosProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  // ── Lê arquivos TXT (múltiplos) ───────────────────────────────────────────
  const filesTxt: File[] = []
  try {
    // pipeline-utils expõe args.files.getFiles(key) para múltiplos arquivos
    // Fallback: tenta getFiles primeiro, depois readAll para o Excel
    const rawFiles = args.files.getFiles?.("filesTxt") ?? []
    filesTxt.push(...rawFiles)
  } catch { /* handled below */ }

  // Fallback via formData direto
  if (!filesTxt.length && args.formData) {
    const all = args.formData.getAll("filesTxt")
    for (const f of all) {
      if (f instanceof File) filesTxt.push(f)
    }
  }

  if (!filesTxt.length) throw new Error("Nenhum arquivo TXT recebido.")

  // ── Etapa 1: Extração TXT ─────────────────────────────────────────────────
  const pedidos = await extrairPedidosTxt(filesTxt)
  if (!pedidos.length) throw new Error("Nenhum pedido encontrado nos arquivos TXT. Verifique o padrão: 9d+3d+(BV|RK|KP)+2d+6d.")

  console.log(`[RetornoPedidos] Total extraído: ${pedidos.length} pedidos`)

  // ── Etapa 2+3: Excel → Set de chaves ─────────────────────────────────────
  let rowsExcel: any[] = []
  try {
    const all = await args.files.readAll("fileExcel")
    rowsExcel = all.flat()
  } catch (e: any) {
    throw new Error(`Não foi possível ler o Excel: ${e.message}`)
  }

  if (!rowsExcel.length) throw new Error("Excel vazio ou sem dados.")

  const { chaves, colunasDetectadas, totalExcel, chavesPrimarias } = construirChavesExcel(rowsExcel)

  // ── Etapa 4: Comparação ───────────────────────────────────────────────────
  const resultado = compararPedidos(pedidos, chaves)

  // ── Resumos ───────────────────────────────────────────────────────────────
  const encontrados    = resultado.filter(r => r.Encontrado_Excel === "SIM")
  const naoEncontrados = resultado.filter(r => r.Encontrado_Excel === "NÃO")
  const porArquivo     = gerarResumoPorArquivo(resultado)
  const porEmpresa     = gerarResumoPorEmpresa(resultado)
  const { sheet: resumoGeralSheet, resumo } = gerarResumoGeral(resultado)

  console.log(`[RetornoPedidos] Encontrados: ${encontrados.length} | Não encontrados: ${naoEncontrados.length}`)

  return {
    data:             resultado,          // compatibilidade DataViewer
    todosPedidos:     resultado,
    encontrados,
    naoEncontrados,
    resumoPorArquivo: porArquivo,
    resumoPorEmpresa: porEmpresa,
    resumoGeralSheet,
    resumoGeral: {
      ...resumo,
      totalExcel,
      chavesPrimarias,
    },
    colunasDetectadas,
    summary:
      `RetornoPedidos: ${resultado.length} pedidos · ` +
      `${encontrados.length} encontrados (${resumo.percEncontrados}%) · ` +
      `${naoEncontrados.length} não encontrados (${resumo.percNaoEncontrados}%) · ` +
      `${resumo.arquivosProcessados} arquivo(s) TXT`,
    extraSheets: [
      { name: "Todos_Pedidos",     data: resultado        },
      { name: "Encontrados",       data: encontrados      },
      { name: "Nao_Encontrados",   data: naoEncontrados   },
      { name: "Resumo_por_Arquivo",data: porArquivo       },
      { name: "Resumo_por_Empresa",data: porEmpresa       },
      { name: "Resumo_Geral",      data: resumoGeralSheet },
    ],
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function executeRetornoPedidosPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("retorno-pedidos", formData, retornoPedidosProcessor)
}