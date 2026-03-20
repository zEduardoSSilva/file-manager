"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./actions-utils"

// ─── Regex de extração ────────────────────────────────────────────────────────

const REGEX_CODIGO = /(\d{9})(\d{3})(BV|RK|KP)(\d{2})(\d{6})/

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateUL(raw: string): string | null {
  // Posição fixa 54–60 do arquivo UL: formato DDMMYY
  if (!raw || !/^\d{6}$/.test(raw.trim())) return null
  const s   = raw.trim()
  const d   = s.slice(0, 2)
  const m   = s.slice(2, 4)
  const y2  = parseInt(s.slice(4, 6), 10)
  const yr  = y2 <= 50 ? 2000 + y2 : 1900 + y2
  try {
    const dt = new Date(`${yr}-${m}-${d}`)
    if (isNaN(dt.getTime())) return null
    return `${d}/${m}/${yr}`
  } catch {
    return null
  }
}

function normalizeNum(val: any, len: number): string {
  return String(val ?? "")
    .split(".")[0]
    .replace(/[^0-9]/g, "")
    .padStart(len, "0")
    .slice(-len)
}

// ─── Etapa 1: Extrair pedidos dos arquivos UL ─────────────────────────────────

interface PedidoUL {
  arquivo:        string
  rota:           string
  codigoCliente:  string
  sufixo:         string
  tipo:           string
  empresa:        string
  tipoEmpresa:    string
  numeroPedido:   string
  codigoCompleto: string
  chavePrimaria:  string
  dataUL:         string | null
  linhaOriginal:  string
}

function extrairPedidosUL(sheets: any[][], fileNames: string[]): PedidoUL[] {
  const pedidos: PedidoUL[] = []

  sheets.forEach((sheetRows, idx) => {
    const filename = fileNames[idx] ?? `arquivo_${idx + 1}.ul`
    let linhasExtraidas = 0

    for (const row of sheetRows) {
      // Suporta linha como string, { linha } ou primeiro valor do objeto
      const linha: string =
        typeof row === "string"
          ? row
          : (row["linha"] ?? row["LINHA"] ?? String(Object.values(row)[0] ?? ""))

      if (!linha) continue

      const upper = linha.toUpperCase()

      // Rota: primeira palavra
      const rotaMatch = upper.match(/^(\S+)\s+/)
      const rota      = rotaMatch ? rotaMatch[1] : ""

      // Código do pedido
      const m = REGEX_CODIGO.exec(upper)
      if (!m) continue

      const [, codigoCliente, sufixo, tipo, empresa, numeroPedido] = m
      const codigoCompleto = m[0]
      const tipoEmpresa    = tipo + empresa
      const chavePrimaria  = `${codigoCliente}_${numeroPedido}`

      // Data posição fixa 54–60
      let dataUL: string | null = null
      if (linha.length > 60) {
        dataUL = parseDateUL(linha.slice(54, 60))
      }

      pedidos.push({
        arquivo: filename,
        rota,
        codigoCliente,
        sufixo,
        tipo,
        empresa,
        tipoEmpresa,
        numeroPedido,
        codigoCompleto,
        chavePrimaria,
        dataUL,
        linhaOriginal: linha.trim(),
      })
      linhasExtraidas++
    }

    console.log(`[UL] ${filename}: ${linhasExtraidas} pedidos extraídos`)
  })

  console.log(`[UL] Etapa 1 — Total: ${pedidos.length} pedidos de ${sheets.length} arquivo(s)`)
  return pedidos
}

// ─── Etapa 2: Construir chaves do Excel de referência ─────────────────────────

interface ExcelInfo {
  chaves:          Set<string>
  colPedido:       string
  colCliente:      string
  totalRegistros:  number
}

function construirChavesExcel(rows: any[]): ExcelInfo {
  if (rows.length === 0) throw new Error("Arquivo Excel de referência está vazio.")

  const cols = Object.keys(rows[0])

  // Identifica coluna de PEDIDO
  const colPedido =
    cols.find(c => /pedido.*(original|_orig)/i.test(c)) ??
    cols.find(c => /^pedido$/i.test(c)) ??
    cols.find(c => /pedido/i.test(c))

  // Identifica coluna de CÓDIGO DO CLIENTE
  const colCliente =
    cols.find(c => /c[oó]digo.*cliente/i.test(c)) ??
    cols.find(c => /cod.*cli/i.test(c)) ??
    cols.find(c => {
      const sample = String(rows[0]?.[c] ?? "").replace(/\.0$/, "").replace(/\D/g, "")
      return sample.length >= 9 && sample.length <= 12
    })

  if (!colPedido)
    throw new Error(`Coluna de pedido não encontrada no Excel. Disponíveis: ${cols.join(", ")}`)
  if (!colCliente)
    throw new Error(`Coluna de código do cliente não encontrada no Excel. Disponíveis: ${cols.join(", ")}`)

  // Constrói Set de chaves — busca O(1)
  const chaves = new Set<string>()
  for (const row of rows) {
    const ped = normalizeNum(row[colPedido],  6)
    const cli = normalizeNum(row[colCliente], 9)
    if (ped && cli) chaves.add(`${cli}_${ped}`)
  }

  console.log(
    `[UL] Etapa 2 — Excel: ${rows.length} registros · ${chaves.size} chaves · ` +
    `Pedido="${colPedido}" · Cliente="${colCliente}"`
  )
  return { chaves, colPedido, colCliente, totalRegistros: rows.length }
}

// ─── Etapa 3: Comparar UL vs Excel ────────────────────────────────────────────

interface Resultado {
  Arquivo:          string
  Rota:             string
  Codigo_Cliente:   string
  Numero_Pedido:    string
  Tipo_Empresa:     string
  Chave_Primaria:   string
  Data_UL:          string
  Codigo_Completo:  string
  Encontrado_Excel: "SIM" | "NÃO"
  Linha_Original:   string
}

function compararULvsExcel(pedidos: PedidoUL[], chaves: Set<string>): Resultado[] {
  const resultados: Resultado[] = pedidos.map(p => ({
    Arquivo:          p.arquivo,
    Rota:             p.rota,
    Codigo_Cliente:   p.codigoCliente,
    Numero_Pedido:    p.numeroPedido,
    Tipo_Empresa:     p.tipoEmpresa,
    Chave_Primaria:   p.chavePrimaria,
    Data_UL:          p.dataUL ?? "-",
    Codigo_Completo:  p.codigoCompleto,
    Encontrado_Excel: chaves.has(p.chavePrimaria) ? "SIM" : "NÃO",
    Linha_Original:   p.linhaOriginal,
  }))

  const enc  = resultados.filter(r => r.Encontrado_Excel === "SIM").length
  const nEnc = resultados.filter(r => r.Encontrado_Excel === "NÃO").length
  const pct  = resultados.length > 0 ? ((enc / resultados.length) * 100).toFixed(1) : "0"

  console.log(`[UL] Etapa 3 — ✅ ${enc} (${pct}%) · ❌ ${nEnc}`)
  return resultados
}

// ─── Etapa 4: Montar resumos ──────────────────────────────────────────────────

function montarResumos(resultados: Resultado[]) {
  const total = resultados.length
  const enc   = resultados.filter(r => r.Encontrado_Excel === "SIM").length
  const nEnc  = total - enc

  // Resumo por arquivo
  const byArq = new Map<string, { Arquivo: string; Encontrados: number; Nao_Encontrados: number; Total: number }>()
  for (const r of resultados) {
    if (!byArq.has(r.Arquivo))
      byArq.set(r.Arquivo, { Arquivo: r.Arquivo, Encontrados: 0, Nao_Encontrados: 0, Total: 0 })
    const ag = byArq.get(r.Arquivo)!
    ag.Total++
    if (r.Encontrado_Excel === "SIM") ag.Encontrados++
    else ag.Nao_Encontrados++
  }

  // Resumo por rota
  const byRota = new Map<string, { Rota: string; Encontrados: number; Nao_Encontrados: number; Total: number }>()
  for (const r of resultados) {
    const key = r.Rota || "(sem rota)"
    if (!byRota.has(key))
      byRota.set(key, { Rota: key, Encontrados: 0, Nao_Encontrados: 0, Total: 0 })
    const ag = byRota.get(key)!
    ag.Total++
    if (r.Encontrado_Excel === "SIM") ag.Encontrados++
    else ag.Nao_Encontrados++
  }

  // Resumo por tipo de empresa
  const byEmp = new Map<string, { Tipo_Empresa: string; Encontrados: number; Nao_Encontrados: number; Total: number }>()
  for (const r of resultados) {
    if (!byEmp.has(r.Tipo_Empresa))
      byEmp.set(r.Tipo_Empresa, { Tipo_Empresa: r.Tipo_Empresa, Encontrados: 0, Nao_Encontrados: 0, Total: 0 })
    const ag = byEmp.get(r.Tipo_Empresa)!
    ag.Total++
    if (r.Encontrado_Excel === "SIM") ag.Encontrados++
    else ag.Nao_Encontrados++
  }

  // Resumo geral (usado pelos stats cards da interface)
  const resumoGeral = {
    totalPedidos:       total,
    encontrados:        enc,
    naoEncontrados:     nEnc,
    percEncontrados:    total > 0 ? +((enc  / total) * 100).toFixed(1) : 0,
    percNaoEncontrados: total > 0 ? +((nEnc / total) * 100).toFixed(1) : 0,
    rotasUnicas:        byRota.size,
    clientesUnicos:     new Set(resultados.map(r => r.Codigo_Cliente)).size,
    arquivosProcessados: byArq.size,
  }

  return {
    resumoArquivo: Array.from(byArq.values()),
    resumoRota:    Array.from(byRota.values()),
    resumoEmpresa: Array.from(byEmp.values()),
    resumoGeral,
    // Versão tabular para aba Excel
    resumoGeralSheet: [
      { Métrica: "Total de Pedidos",      Valor: total },
      { Métrica: "Encontrados",            Valor: enc   },
      { Métrica: "Não Encontrados",        Valor: nEnc  },
      { Métrica: "% Encontrados",          Valor: `${resumoGeral.percEncontrados}%`    },
      { Métrica: "% Não Encontrados",      Valor: `${resumoGeral.percNaoEncontrados}%` },
      { Métrica: "Rotas Únicas",           Valor: resumoGeral.rotasUnicas              },
      { Métrica: "Clientes Únicos",        Valor: resumoGeral.clientesUnicos           },
      { Métrica: "Arquivos Processados",   Valor: resumoGeral.arquivosProcessados      },
    ],
  }
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function retornoPedidosUlProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  // Lê todos os arquivos enviados
  const sheetsData = await args.files.readAll("files")
  const fileNames: string[] = (args.formData?.getAll("fileNames") as string[]) ?? []

  // Separa ULs do Excel de referência pelo nome
  const ulSheets:    any[][] = []
  const ulNames:     string[] = []
  const excelSheets: any[][] = []

  sheetsData.forEach((sheet, idx) => {
    const nome = (fileNames[idx] ?? "").toLowerCase()
    if (nome.endsWith(".xlsx") || nome.endsWith(".xls") ||
        nome.includes("status") || nome.includes("mercanete")) {
      excelSheets.push(sheet)
    } else {
      ulSheets.push(sheet)
      ulNames.push(fileNames[idx] ?? `arquivo_${idx + 1}.ul`)
    }
  })

  // Alternativa: FormData pode vir com chaves separadas (filesUl / fileExcel)
  // Tenta carregar pela chave específica se as chaves acima ficaram vazias
  if (ulSheets.length === 0) {
    const ulData    = await args.files.readAll("filesUl")
    const ulFNames: string[] = (args.formData?.getAll("filesUlNames") as string[]) ?? []
    ulData.forEach((s, i) => { ulSheets.push(s); ulNames.push(ulFNames[i] ?? `arquivo_${i + 1}.ul`) })
  }
  if (excelSheets.length === 0) {
    const exData = await args.files.readAll("fileExcel")
    exData.forEach(s => excelSheets.push(s))
  }

  if (ulSheets.length === 0)
    throw new Error("Nenhum arquivo UL encontrado. Anexe ao menos um arquivo .ul")
  if (excelSheets.length === 0)
    throw new Error("Arquivo Excel de referência não encontrado. Anexe o STATUS_PEDIDOS_MERCANETE.xlsx")

  // ── Etapa 1: Extração ────────────────────────────────────────────────────
  const pedidos = extrairPedidosUL(ulSheets, ulNames)
  if (pedidos.length === 0)
    throw new Error("Nenhum pedido encontrado nos arquivos UL. Verifique o formato das linhas.")

  // ── Etapa 2: Chaves Excel ────────────────────────────────────────────────
  const excelRows = excelSheets.flat()
  const { chaves } = construirChavesExcel(excelRows)

  // ── Etapa 3: Comparação ──────────────────────────────────────────────────
  const resultados = compararULvsExcel(pedidos, chaves)

  // ── Etapa 4: Resumos ─────────────────────────────────────────────────────
  const { resumoArquivo, resumoRota, resumoEmpresa, resumoGeralSheet, resumoGeral } =
    montarResumos(resultados)

  const enc  = resumoGeral.encontrados
  const nEnc = resumoGeral.naoEncontrados
  const pct  = resumoGeral.percEncontrados

  return {
    data: resultados,
    // resumoGeral fica disponível em result.resumoGeral para os stats cards da UI
    resumoGeral,
    summary: `UL ${args.month}/${args.year}: ${pedidos.length} pedidos · ${enc} encontrados (${pct}%) · ${nEnc} pendentes`,
    extraSheets: [
      { name: "01_Todos_Pedidos",       data: resultados                                          },
      { name: "02_Encontrados",         data: resultados.filter(r => r.Encontrado_Excel === "SIM") },
      { name: "03_Nao_Encontrados",     data: resultados.filter(r => r.Encontrado_Excel === "NÃO") },
      { name: "04_Resumo_por_Arquivo",  data: resumoArquivo                                       },
      { name: "05_Resumo_por_Rota",     data: resumoRota                                          },
      { name: "06_Resumo_por_Empresa",  data: resumoEmpresa                                       },
      { name: "07_Resumo_Geral",        data: resumoGeralSheet                                    },
    ],
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function executeRetornoPedidosULPipeline(
  formData: FormData,
  _tag?: string
): Promise<PipelineResponse> {
  return processAndSave("retorno-pedidos-ul", formData, retornoPedidosUlProcessor)
}