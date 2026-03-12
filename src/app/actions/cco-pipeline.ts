"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// ─── Constantes ───────────────────────────────────────────────────────────────

const BONIFICACAO_ROTAS = 16.0

// Nomes de aba para os arquivos _Ajustado (gerados pelo pipeline Coordenadores)
const ABAS_AJUSTADO = ["Relatório Diário", "Relatorio Diario", "01_Analise_Diaria"]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanCol(col: any): string {
  return String(col)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s.\-/]+/g, "_")
}

function findCol(row: Record<string, any>, opcoes: string[]): string | null {
  const normMap = new Map(Object.keys(row).map(k => [cleanCol(k), k]))

  // Exato
  for (const op of opcoes) {
    const n = cleanCol(op)
    if (normMap.has(n)) return normMap.get(n)!
  }
  // Prefixo
  for (const op of opcoes) {
    const n = cleanCol(op)
    for (const [k, orig] of normMap) {
      if (k.startsWith(n)) return orig
    }
  }
  // Contém
  for (const op of opcoes) {
    const n = cleanCol(op)
    for (const [k, orig] of normMap) {
      if (k.includes(n)) return orig
    }
  }
  return null
}

function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  const str = String(value).trim()

  // BR: DD/MM/YYYY
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(+br[3], +br[2] - 1, +br[1])

  // ISO: YYYY-MM-DD
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])

  // Excel serial
  const num = parseFloat(str)
  if (!isNaN(num) && num > 40000) {
    return new Date(Math.round((num - 25569) * 86400 * 1000))
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function formatDateISO(d: Date | null): string {
  if (!d) return ""
  return d.toISOString().slice(0, 10)
}

function formatDateBR(d: Date | null): string {
  if (!d) return ""
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

function toNum(v: any): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v
  const s = String(v ?? "")
    .replace("%", "")
    .replace(",", ".")
    .trim()
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function isSunday(d: Date | null): boolean {
  return d != null && d.getDay() === 0
}

function norm(s: any): string {
  if (s == null) return ""
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function pickSheet(
  sheetsMap: Map<string, any[]>,
  candidates: string[]
): any[] | null {
  for (const candidate of candidates) {
    for (const [sheetName, data] of sheetsMap) {
      if (norm(sheetName) === norm(candidate) || norm(sheetName).includes(norm(candidate))) {
        return data
      }
    }
  }
  return null
}

// ─── Carregamento do arquivo _Ajustado ────────────────────────────────────────

interface AjustadoRow {
  empresa: string
  cargo: string
  dia: Date | null
  percentualAtingido: number
}

function carregarAjustado(rows: any[]): AjustadoRow[] {
  if (!rows.length) return []

  const firstRow = rows[0]
  const colEmpresa = findCol(firstRow, ["Empresa", "empresa", "filial"])
  const colCargo   = findCol(firstRow, ["Cargo", "cargo", "funcao"])
  const colDia     = findCol(firstRow, ["Dia", "dia", "Data", "data"])
  const colPerc    = findCol(firstRow, ["Percentual_Atingido", "percentual_atingido", "% atingido", "Percentual Atingido"])

  const missing = (["Empresa", "Cargo", "Dia", "Percentual_Atingido"] as const)
    .filter((_, i) => [colEmpresa, colCargo, colDia, colPerc][i] == null)

  if (missing.length) {
    throw new Error(`Colunas não encontradas: ${missing.join(", ")}`)
  }

  return rows.flatMap(row => {
    const empresa = String(row[colEmpresa!] ?? "").trim()
    const cargo   = String(row[colCargo!]   ?? "").trim()
    const dia     = parseDate(row[colDia!])
    let pct       = toNum(row[colPerc!])

    if (!empresa || !dia) return []

    // Normaliza 0–1 → 0–100
    if (pct >= 0 && pct <= 1) pct *= 100

    return [{ empresa, cargo, dia, percentualAtingido: pct }]
  })
}

// ─── Cálculo de desempenho ────────────────────────────────────────────────────

interface DailyKey { empresa: string; diaISO: string }

interface DailyAgg {
  empresa: string
  dia: Date
  diaISO: string
  sumMot: number; countMot: number
  sumAju: number; countAju: number
}

function calcularDesempenho(
  dfMot: AjustadoRow[],
  dfAju: AjustadoRow[]
): { analiseDiaria: any[]; analiseDiariaFormatada: any[]; domingoRemovidos: number } {

  // Agrupa por Empresa + Dia (outer join manual)
  const aggMap = new Map<string, DailyAgg>()

  const upsert = (empresa: string, dia: Date, pct: number, tipo: "mot" | "aju") => {
    const key = `${empresa}||${formatDateISO(dia)}`
    if (!aggMap.has(key)) {
      aggMap.set(key, {
        empresa, dia, diaISO: formatDateISO(dia),
        sumMot: 0, countMot: 0,
        sumAju: 0, countAju: 0,
      })
    }
    const agg = aggMap.get(key)!
    if (tipo === "mot") { agg.sumMot += pct; agg.countMot++ }
    else                { agg.sumAju += pct; agg.countAju++ }
  }

  // Filtra somente motoristas/ajudantes
  for (const r of dfMot) {
    if (/motorista/i.test(r.cargo) && r.dia) upsert(r.empresa, r.dia, r.percentualAtingido, "mot")
  }
  for (const r of dfAju) {
    if (/ajudante/i.test(r.cargo) && r.dia)  upsert(r.empresa, r.dia, r.percentualAtingido, "aju")
  }

  let domingoRemovidos = 0
  const rows: any[] = []

  for (const [, agg] of aggMap) {
    // Remove domingos
    if (isSunday(agg.dia)) { domingoRemovidos++; continue }

    const mediaMot = agg.countMot > 0 ? agg.sumMot / agg.countMot : null
    const mediaAju = agg.countAju > 0 ? agg.sumAju / agg.countAju : null

    // Média ignorando nulls (skipna=True)
    const valores = [mediaMot, mediaAju].filter(v => v != null) as number[]
    const percDesempenho = valores.length > 0
      ? +(valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2)
      : 0

    const valorBonificacao = +(percDesempenho / 100 * BONIFICACAO_ROTAS).toFixed(2)

    rows.push({
      Empresa:                         agg.empresa,
      Data:                            agg.diaISO,
      Percentual_Atingido_Motorista:   mediaMot != null ? +mediaMot.toFixed(2) : 0,
      Percentual_Atingido_Ajudante:    mediaAju != null ? +mediaAju.toFixed(2) : 0,
      Percentual_Desempenho:           percDesempenho,
      Bonificacao_Dia_Total:           BONIFICACAO_ROTAS,
      Valor_Bonificacao:               valorBonificacao,
    })
  }

  // Ordena por Empresa, Data
  rows.sort((a, b) => {
    const cmp = a.Empresa.localeCompare(b.Empresa)
    if (cmp !== 0) return cmp
    return a.Data.localeCompare(b.Data)
  })

  // Versão formatada para exibição (aba 02)
  const formatada = rows.map(r => ({
    ...r,
    Data:                            formatDateBR(parseDate(r.Data)),
    Percentual_Atingido_Motorista:   `${r.Percentual_Atingido_Motorista.toFixed(2)}%`,
    Percentual_Atingido_Ajudante:    `${r.Percentual_Atingido_Ajudante.toFixed(2)}%`,
    Percentual_Desempenho:           `${r.Percentual_Desempenho.toFixed(2)}%`,
    Bonificacao_Dia_Total:           `R$ ${r.Bonificacao_Dia_Total.toFixed(2)}`,
    Valor_Bonificacao:               `R$ ${r.Valor_Bonificacao.toFixed(2)}`,
  }))

  console.log(`[CCO] ${rows.length} dias consolidados | ${domingoRemovidos} domingos removidos`)
  return { analiseDiaria: rows, analiseDiariaFormatada: formatada, domingoRemovidos }
}

// ─── Resumo Mensal (aba 03) ───────────────────────────────────────────────────

function gerarResumoMensal(analiseDiaria: any[]): any[] {
  const empresaMap = new Map<string, {
    dias: number
    sumMot: number; sumAju: number; sumDesemp: number; sumBonif: number
  }>()

  for (const row of analiseDiaria) {
    const e = row.Empresa
    if (!empresaMap.has(e)) {
      empresaMap.set(e, { dias: 0, sumMot: 0, sumAju: 0, sumDesemp: 0, sumBonif: 0 })
    }
    const agg = empresaMap.get(e)!
    agg.dias++
    agg.sumMot    += row.Percentual_Atingido_Motorista
    agg.sumAju    += row.Percentual_Atingido_Ajudante
    agg.sumDesemp += row.Percentual_Desempenho
    agg.sumBonif  += row.Valor_Bonificacao
  }

  return Array.from(empresaMap.entries()).map(([empresa, agg]) => ({
    Empresa:                  empresa,
    Dias_Analisados:          agg.dias,
    Perc_Medio_Motorista:     +(agg.sumMot    / agg.dias).toFixed(2),
    Perc_Medio_Ajudante:      +(agg.sumAju    / agg.dias).toFixed(2),
    Perc_Medio_Desempenho:    +(agg.sumDesemp / agg.dias).toFixed(2),
    Total_Bonif_Mes:          +agg.sumBonif.toFixed(2),
  })).sort((a, b) => a.Empresa.localeCompare(b.Empresa))
}

// ─── Resumo Simples (aba 04) ──────────────────────────────────────────────────

function gerarResumoSimples(analiseDiaria: any[], month: number): any[] {
  const empresaMap = new Map<string, { bonifTotal: number; bonifAtingida: number }>()

  for (const row of analiseDiaria) {
    const e = row.Empresa
    if (!empresaMap.has(e)) empresaMap.set(e, { bonifTotal: 0, bonifAtingida: 0 })
    const agg = empresaMap.get(e)!
    agg.bonifTotal    += row.Bonificacao_Dia_Total
    agg.bonifAtingida += row.Valor_Bonificacao
  }

  return Array.from(empresaMap.entries()).map(([empresa, agg]) => ({
    Empresa:              empresa,
    MES:                  month,
    Bonificacao_Total:    +agg.bonifTotal.toFixed(2),
    Bonificacao_Atingida: +agg.bonifAtingida.toFixed(2),
  })).sort((a, b) => a.Empresa.localeCompare(b.Empresa))
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function ccoProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  // Lê as abas dos arquivos ajustados
  let rowsMot: any[] = []
  let rowsAju: any[] = []

  try {
    const sheetsMot = await args.files.readSheets("fileMotoristas")
    rowsMot = pickSheet(sheetsMot, ABAS_AJUSTADO) ?? []
    if (!rowsMot.length) {
      const all = await args.files.readAll("fileMotoristas")
      rowsMot = all.flat()
    }
  } catch (e: any) {
    throw new Error(`Não foi possível ler o arquivo de Motoristas: ${e.message}`)
  }

  try {
    const sheetsAju = await args.files.readSheets("fileAjudantes")
    rowsAju = pickSheet(sheetsAju, ABAS_AJUSTADO) ?? []
    if (!rowsAju.length) {
      const all = await args.files.readAll("fileAjudantes")
      rowsAju = all.flat()
    }
  } catch (e: any) {
    throw new Error(`Não foi possível ler o arquivo de Ajudantes: ${e.message}`)
  }


  if (!rowsMot.length) throw new Error("Arquivo de Motoristas está vazio ou sem dados reconhecíveis.")
  if (!rowsAju.length) throw new Error("Arquivo de Ajudantes está vazio ou sem dados reconhecíveis.")

  console.log(`[CCO] Motoristas: ${rowsMot.length} registros | Ajudantes: ${rowsAju.length} registros`)

  // ── Carregar e normalizar ─────────────────────────────────────────────────
  const dfMot = carregarAjustado(rowsMot)
  const dfAju = carregarAjustado(rowsAju)

  console.log(`[CCO] Após normalização → Mot: ${dfMot.length} | Aju: ${dfAju.length}`)

  // ── Etapas de cálculo ─────────────────────────────────────────────────────
  const { analiseDiaria, analiseDiariaFormatada, domingoRemovidos } =
    calcularDesempenho(dfMot, dfAju)

  const resumoMensal  = gerarResumoMensal(analiseDiaria)
  const resumoSimples = gerarResumoSimples(analiseDiaria, args.month)

  // ── Totais para summary ───────────────────────────────────────────────────
  const totalEmpresas    = resumoMensal.length
  const totalBonificacao = resumoMensal.reduce((a, r) => a + r.Total_Bonif_Mes, 0)
  const percMedio        = resumoMensal.length > 0
    ? resumoMensal.reduce((a, r) => a + r.Perc_Medio_Desempenho, 0) / resumoMensal.length
    : 0

  console.log(`[CCO] ${totalEmpresas} empresas | R$ ${totalBonificacao.toFixed(2)} | ${percMedio.toFixed(2)}% médio`)

  return {
    data:                    analiseDiaria,   // compatibilidade DataViewer
    analiseDiaria,
    analiseDiariaFormatada,
    resumoMensal,
    resumoSimples,
    domingoRemovidos,
    summary:
      `CCO ${String(args.month).padStart(2, "0")}/${args.year}: ` +
      `${totalEmpresas} empresas · ` +
      `${analiseDiaria.length} dias · ` +
      `R$ ${totalBonificacao.toFixed(2)} em bonificações · ` +
      `desempenho médio ${percMedio.toFixed(2)}%`,
    extraSheets: [
      { name: "01_Analise_Diaria",           data: analiseDiaria          },
      { name: "02_Analise_Diaria_Formatada", data: analiseDiariaFormatada },
      { name: "03_Resumo_Mensal",            data: resumoMensal           },
      { name: "04_Resumo_Simples",           data: resumoSimples          },
    ],
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function executeCcoPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("cco", formData, ccoProcessor)
}
