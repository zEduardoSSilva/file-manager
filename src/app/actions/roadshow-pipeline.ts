"use server"

import { PipelineArgs, PipelineResponse, ProcessorOutput, processAndSave } from "./pipeline-utils"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/** Encontra coluna cujo nome normalizado contém todas as keywords. */
function findCol(row: Record<string, any>, ...keywords: string[]): string | null {
  const keys = keywords.map(norm)
  const cols  = Object.keys(row)

  // Passagem 1: todas as keywords presentes
  for (const col of cols) {
    const n = norm(col)
    if (keys.every(k => n.includes(k))) return col
  }
  return null
}

/** Busca coluna por nome exato (case-insensitive, sem acentos). */
function findColExact(row: Record<string, any>, name: string): string | null {
  const target = norm(name)
  for (const col of Object.keys(row)) {
    if (norm(col) === target) return col
  }
  return null
}

function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value

  const str = String(value).trim()
  const br  = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(+br[3], +br[2] - 1, +br[1])
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])

  const num = parseFloat(str)
  if (!isNaN(num) && num > 40000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function formatDateBR(d: Date | null): string {
  if (!d) return ""
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`
}

function formatDateISO(d: Date | null): string {
  if (!d) return ""
  return d.toISOString().slice(0, 10)
}

/**
 * Converte "HH:MM", "HH:MM:SS" ou fração decimal do Excel para segundos.
 * Retorna null se não conseguir.
 */
function parseToSeconds(value: any): number | null {
  if (value == null) return null

  if (typeof value === "number") {
    // Fração de dia (Excel serial): 0.5 = 12h
    if (value >= 0 && value < 1) return Math.round(value * 86400)
    // Já em segundos
    if (value >= 1) return Math.round(value)
    return null
  }

  const str = String(value).trim()
  if (!str || str === "-" || str === "nan") return null

  const m = str.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (m[3] ? parseInt(m[3]) : 0)
  }
  return null
}

function secondsToHMS(sec: number): string {
  if (sec < 0) return "00:00:00"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
}

function toNum(v: any): number {
  if (typeof v === "number") return isNaN(v) ? 0 : v
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return isNaN(n) ? 0 : n
}

// ─── Módulo 2 — Preparar consolidado ─────────────────────────────────────────

interface ConsRow {
  DATA_ENTREGA:   Date
  DATA_ISO:       string
  PLACA:          string
  REGIAO:         string
  FILIAL:         string
  OPERACAO:       string
  MOTORISTA:      string
  PESO:           number
  CAPACIDADE:     number
  KM:             number
  TEMPO_JORNADA_S: number | null   // segundos
  TIPO_CARGA:     string
  STATUS:         string
  PERFORMAXXI:    string
}

function prepararConsolidado(rows: any[], year: number, month: number): ConsRow[] {
  if (!rows.length) return []
  const first = rows[0]

  // Identifica colunas
  const COL_DATA    = findCol(first, "data", "entrega") ?? findCol(first, "data")
  const COL_PLACA   = findColExact(first, "PLACA")   ?? findCol(first, "placa")
  const COL_REGIAO  = findColExact(first, "REGIÃO")  ?? findColExact(first, "REGIAO") ?? findCol(first, "regiao")
  const COL_FILIAL  = findColExact(first, "FILIAL")  ?? findCol(first, "filial")
  const COL_OP      = findColExact(first, "OPERACAO") ?? findColExact(first, "OPERAÇÃO") ?? findCol(first, "operacao")
  const COL_MOTOR   = findColExact(first, "MOTORISTA") ?? findCol(first, "motorista")
  const COL_PESO    = findColExact(first, "PESO")    ?? findCol(first, "peso")
  const COL_CAP     = findColExact(first, "CAPACIDADE") ?? findCol(first, "capacidade")
  const COL_KM      = findColExact(first, "KM")      ?? findCol(first, "km")
  const COL_TEMPO   = findColExact(first, "TEMPO")   ?? findCol(first, "tempo")
  const COL_TIPO    = findCol(first, "tipo", "carga")
  const COL_STATUS  = findColExact(first, "STATUS")  ?? findCol(first, "status")
  const COL_PERF    = findCol(first, "performaxxi")  ?? findCol(first, "perf")

  if (!COL_DATA) throw new Error("Coluna de data não encontrada no Consolidado.")

  const result: ConsRow[] = []

  for (const row of rows) {
    const data = parseDate(row[COL_DATA])
    if (!data) continue
    if (data.getFullYear() !== year || data.getMonth() + 1 !== month) continue

    result.push({
      DATA_ENTREGA:    data,
      DATA_ISO:        formatDateISO(data),
      PLACA:           COL_PLACA  ? String(row[COL_PLACA]  ?? "").trim().toUpperCase() : "",
      REGIAO:          COL_REGIAO ? String(row[COL_REGIAO] ?? "").trim().toUpperCase() : "N/A",
      FILIAL:          COL_FILIAL ? String(row[COL_FILIAL] ?? "").trim().toUpperCase() : "N/A",
      OPERACAO:        COL_OP     ? String(row[COL_OP]     ?? "").trim().toUpperCase() : "N/A",
      MOTORISTA:       COL_MOTOR  ? String(row[COL_MOTOR]  ?? "").trim()              : "",
      PESO:            COL_PESO   ? toNum(row[COL_PESO])   : 0,
      CAPACIDADE:      COL_CAP    ? toNum(row[COL_CAP])    : 0,
      KM:              COL_KM     ? toNum(row[COL_KM])     : 0,
      TEMPO_JORNADA_S: COL_TEMPO  ? parseToSeconds(row[COL_TEMPO]) : null,
      TIPO_CARGA:      COL_TIPO   ? String(row[COL_TIPO]   ?? "") : "",
      STATUS:          COL_STATUS ? String(row[COL_STATUS] ?? "") : "",
      PERFORMAXXI:     COL_PERF   ? String(row[COL_PERF]   ?? "") : "",
    })
  }

  console.log(`[Roadshow] Consolidado: ${result.length} registros no período`)
  return result
}

// ─── Módulo 3 — Tempo produtivo (Performaxxi) ─────────────────────────────────

interface TempoProdKey { dataISO: string; placa: string }
interface TempoProd { tempoProdS: number | null; inicioRota: string; fimRota: string }

function calcularTempoProdutivo(rows: any[], year: number, month: number): Map<string, TempoProd> {
  const map = new Map<string, TempoProd>()
  if (!rows.length) return map

  const first = rows[0]
  const COL_DATA  = findCol(first, "data", "rota")
  const COL_PLACA = findColExact(first, "Placa") ?? findCol(first, "placa")
  const COL_INI   = findCol(first, "inicio", "rota") ?? findCol(first, "saida")
  const COL_FIM   = findCol(first, "fim",    "rota") ?? findCol(first, "retorno")

  if (!COL_DATA || !COL_PLACA) {
    console.warn("[Roadshow] Performaxxi: colunas data/placa não encontradas")
    return map
  }

  // Agrupa por DATA+PLACA: max(Fim−Início)
  const groups = new Map<string, { tempos: number[]; inits: number[]; fims: number[] }>()

  for (const row of rows) {
    const data = parseDate(row[COL_DATA])
    if (!data) continue
    if (data.getFullYear() !== year || data.getMonth() + 1 !== month) continue

    const placa  = String(row[COL_PLACA] ?? "").trim().toUpperCase()
    const key    = `${formatDateISO(data)}||${placa}`

    const iniDate = COL_INI ? parseDate(row[COL_INI]) : null
    const fimDate = COL_FIM ? parseDate(row[COL_FIM]) : null
    const tempo   = iniDate && fimDate ? (fimDate.getTime() - iniDate.getTime()) / 1000 : null

    if (!groups.has(key)) groups.set(key, { tempos: [], inits: [], fims: [] })
    const g = groups.get(key)!
    if (tempo != null && tempo >= 0) g.tempos.push(tempo)
    if (iniDate) g.inits.push(iniDate.getTime())
    if (fimDate)  g.fims.push(fimDate.getTime())
  }

  for (const [key, g] of groups) {
    const tempoProdS = g.tempos.length ? Math.max(...g.tempos) : null
    const inicioTs   = g.inits.length ? Math.min(...g.inits) : null
    const fimTs      = g.fims.length  ? Math.max(...g.fims)  : null

    map.set(key, {
      tempoProdS,
      inicioRota: inicioTs ? new Date(inicioTs).toTimeString().slice(0, 8) : "",
      fimRota:    fimTs    ? new Date(fimTs).toTimeString().slice(0, 8)    : "",
    })
  }

  console.log(`[Roadshow] Performaxxi: ${map.size} agrupamentos DATA+PLACA`)
  return map
}

// ─── Módulo 4 — Ocupações ─────────────────────────────────────────────────────

interface EnrichedRow extends ConsRow {
  Tempo_Produtivo_S:   number | null
  Inicio_Rota:         string
  Fim_Rota:            string
  Ocup_Jornada_pct:    number | null
  Ocup_Veiculo_pct:    number | null
  Tempo_Produtivo_Fmt: string
  Tempo_Jornada_Fmt:   string
}

function calcularOcupacoes(
  cons: ConsRow[],
  tempoProd: Map<string, TempoProd>,
  veicCapMap: Map<string, number>
): EnrichedRow[] {

  return cons.map(row => {
    const key  = `${row.DATA_ISO}||${row.PLACA}`
    const tp   = tempoProd.get(key)

    // Capacidade: do consolidado primeiro, fallback veículos
    let cap = row.CAPACIDADE
    if ((!cap || cap === 0) && veicCapMap.has(row.PLACA)) {
      cap = veicCapMap.get(row.PLACA)!
    }

    const tempoProdS = tp?.tempoProdS ?? null
    const jornS      = row.TEMPO_JORNADA_S

    const ocupJornada = (jornS && jornS > 0 && tempoProdS != null)
      ? +((tempoProdS / jornS) * 100).toFixed(2)
      : null

    const ocupVeiculo = (cap > 0 && row.PESO != null)
      ? +((row.PESO / cap) * 100).toFixed(2)
      : null

    return {
      ...row,
      CAPACIDADE:          cap,
      Tempo_Produtivo_S:   tempoProdS,
      Inicio_Rota:         tp?.inicioRota ?? "",
      Fim_Rota:            tp?.fimRota    ?? "",
      Ocup_Jornada_pct:    ocupJornada,
      Ocup_Veiculo_pct:    ocupVeiculo,
      Tempo_Produtivo_Fmt: tempoProdS != null ? secondsToHMS(tempoProdS) : "00:00:00",
      Tempo_Jornada_Fmt:   jornS       != null ? secondsToHMS(jornS)      : "00:00:00",
    }
  })
}

// ─── Módulo 5 — Incentivo por região ─────────────────────────────────────────

function calcularIncentivo(
  enriched:       EnrichedRow[],
  metaJornadaMax: number,
  metaVeiculoMin: number,
  valorDia:       number
): { ocupacaoDiaria: any[]; incentivoDiario: any[] } {

  // Agrega por DATA+REGIÃO
  const groupMap = new Map<string, {
    dataISO: string; regiao: string
    sumJorn: number; cntJorn: number
    sumVeic: number; cntVeic: number
    qtdeRotas: number; pesoTotal: number; kmTotal: number
  }>()

  for (const row of enriched) {
    const key = `${row.DATA_ISO}||${row.REGIAO}`
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        dataISO: row.DATA_ISO, regiao: row.REGIAO,
        sumJorn: 0, cntJorn: 0, sumVeic: 0, cntVeic: 0,
        qtdeRotas: 0, pesoTotal: 0, kmTotal: 0,
      })
    }
    const g = groupMap.get(key)!
    g.qtdeRotas++
    g.pesoTotal += row.PESO
    g.kmTotal   += row.KM
    if (row.Ocup_Jornada_pct != null) { g.sumJorn += row.Ocup_Jornada_pct; g.cntJorn++ }
    if (row.Ocup_Veiculo_pct != null) { g.sumVeic += row.Ocup_Veiculo_pct; g.cntVeic++ }
  }

  const ocupacaoDiaria: any[] = []
  const incentivoDiario: any[] = []

  for (const [, g] of groupMap) {
    const mediaJorn = g.cntJorn > 0 ? +(g.sumJorn / g.cntJorn).toFixed(2) : null
    const mediaVeic = g.cntVeic > 0 ? +(g.sumVeic / g.cntVeic).toFixed(2) : null

    ocupacaoDiaria.push({
      DATA_ENTREGA:        g.dataISO,
      REGIAO:              g.regiao,
      Ocup_Jornada_Media:  mediaJorn ?? 0,
      Ocup_Veiculo_Media:  mediaVeic ?? 0,
      Qtde_Rotas:          g.qtdeRotas,
      Peso_Total:          +g.pesoTotal.toFixed(2),
      KM_Total:            +g.kmTotal.toFixed(2),
    })

    // Regra de incentivo
    const usaJornada  = mediaJorn == null || mediaJorn <= metaJornadaMax
    const percVeicCap = Math.min(mediaVeic ?? 0, 100)

    const indicador     = usaJornada ? "Jornada" : "Veículo"
    const percentualDia = usaJornada ? 100.0 : percVeicCap
    const incentivo     = +(percentualDia / 100 * valorDia).toFixed(2)

    incentivoDiario.push({
      DATA_ENTREGA:          g.dataISO,
      REGIAO:                g.regiao,
      Ocup_Jornada_Media:    mediaJorn ?? 0,
      Ocup_Veiculo_Media:    mediaVeic ?? 0,
      Indicador_Usado:       indicador,
      "Percentual_Dia_%":    percentualDia,
      "Incentivo_Diario_R$": incentivo,
      "Meta_Veiculo_Min_%":  metaVeiculoMin,
      Atingiu_Meta_Veiculo:  (mediaVeic ?? 0) >= metaVeiculoMin,
    })
  }

  // Ordena por REGIAO + DATA
  const sortFn = (a: any, b: any) => {
    const r = (a.REGIAO ?? "").localeCompare(b.REGIAO ?? "")
    return r !== 0 ? r : (a.DATA_ENTREGA ?? "").localeCompare(b.DATA_ENTREGA ?? "")
  }
  ocupacaoDiaria.sort(sortFn)
  incentivoDiario.sort(sortFn)

  console.log(`[Roadshow] Incentivo: ${incentivoDiario.filter(r => r["Incentivo_Diario_R$"] > 0).length} dias com valor > 0`)
  return { ocupacaoDiaria, incentivoDiario }
}

// ─── Módulo 6 — Resumos ───────────────────────────────────────────────────────

function gerarResumos(
  incentivoDiario: any[],
  enriched:        EnrichedRow[],
  valorMensal:     number
): { resumoMensal: any[]; resumoArit: any[] } {

  // Resumo mensal (aba 05)
  const regiaoMap = new Map<string, {
    dias: number; diasInc: number
    sumJorn: number; sumVeic: number; sumInc: number
  }>()

  for (const row of incentivoDiario) {
    const r = row.REGIAO
    if (!regiaoMap.has(r)) regiaoMap.set(r, { dias: 0, diasInc: 0, sumJorn: 0, sumVeic: 0, sumInc: 0 })
    const agg = regiaoMap.get(r)!
    agg.dias++
    if (row["Incentivo_Diario_R$"] > 0) agg.diasInc++
    agg.sumJorn += row.Ocup_Jornada_Media
    agg.sumVeic += row.Ocup_Veiculo_Media
    agg.sumInc  += row["Incentivo_Diario_R$"]
  }

  const resumoMensal = Array.from(regiaoMap.entries()).map(([regiao, agg]) => ({
    REGIAO:             regiao,
    Dias_Analisados:    agg.dias,
    Dias_Com_Incentivo: agg.diasInc,
    Ocup_Jornada_Media: +(agg.sumJorn / agg.dias).toFixed(2),
    Ocup_Veiculo_Media: +(agg.sumVeic / agg.dias).toFixed(2),
    Incentivo_Total:    +agg.sumInc.toFixed(2),
    "Meta_Mensal_R$":  valorMensal,
    "Perc_Atingido_%": +(agg.sumInc / valorMensal * 100).toFixed(2),
  })).sort((a, b) => a.REGIAO.localeCompare(b.REGIAO))

  // Resumo aritmético (aba 06): soma peso ÷ soma capacidade por dia por região
  const aritDayMap = new Map<string, { regiao: string; pesoDia: number; capDia: number }>()
  for (const row of enriched) {
    const key = `${row.DATA_ISO}||${row.REGIAO}`
    if (!aritDayMap.has(key)) aritDayMap.set(key, { regiao: row.REGIAO, pesoDia: 0, capDia: 0 })
    const a = aritDayMap.get(key)!
    a.pesoDia += row.PESO
    a.capDia  += row.CAPACIDADE
  }

  const aritRegMap = new Map<string, {
    dias: number; pesoTotal: number; capTotal: number; sumOcupDia: number; cntOcupDia: number
  }>()
  for (const [, d] of aritDayMap) {
    if (!aritRegMap.has(d.regiao)) aritRegMap.set(d.regiao, { dias: 0, pesoTotal: 0, capTotal: 0, sumOcupDia: 0, cntOcupDia: 0 })
    const a = aritRegMap.get(d.regiao)!
    a.dias++
    a.pesoTotal += d.pesoDia
    a.capTotal  += d.capDia
    if (d.capDia > 0) { a.sumOcupDia += d.pesoDia / d.capDia * 100; a.cntOcupDia++ }
  }

  const resumoArit = Array.from(aritRegMap.entries()).map(([regiao, a]) => ({
    REGIAO:                    regiao,
    Dias_Analisados:           a.dias,
    Peso_Total_Mes:            +a.pesoTotal.toFixed(2),
    Capacidade_Total_Mes:      +a.capTotal.toFixed(2),
    "Ocup_Media_Diaria_%":     a.cntOcupDia ? +(a.sumOcupDia / a.cntOcupDia).toFixed(2) : 0,
    "Ocup_Mes_Aritimetica_%":  a.capTotal > 0 ? +(a.pesoTotal / a.capTotal * 100).toFixed(2) : 0,
  })).sort((a, b) => a.REGIAO.localeCompare(b.REGIAO))

  return { resumoMensal, resumoArit }
}

// ─── Processor principal ──────────────────────────────────────────────────────

async function roadshowProcessor(args: PipelineArgs): Promise<ProcessorOutput> {
  const metaJornada = parseFloat(args.formData?.get("metaJornada") as string ?? "100") || 100
  const metaVeiculo = parseFloat(args.formData?.get("metaVeiculo") as string ?? "85")  || 85
  const valorMensal = parseFloat(args.formData?.get("valorMensal") as string ?? "400") || 400
  const diasMeta    = parseInt(args.formData?.get("diasMeta")    as string ?? "25")  || 25
  const valorDia    = valorMensal / diasMeta

  // ── Módulo 1: Leitura ─────────────────────────────────────────────────────
  let rowsConsolidado: any[] = []
  try {
    const all = await args.files.readAll("fileConsolidado")
    rowsConsolidado = all.flat()
  } catch (e: any) {
    throw new Error(`Não foi possível ler o Consolidado: ${e.message}`)
  }
  if (!rowsConsolidado.length) throw new Error("Consolidado_Entregas está vazio.")

  let rowsPedidos: any[] = []
  try {
    const all = await args.files.readAll("filePedidos")
    rowsPedidos = all.flat()
  } catch { /* opcional */ }

  let rowsVeiculos: any[] = []
  try {
    const all = await args.files.readAll("fileVeiculos")
    rowsVeiculos = all.flat()
  } catch { /* opcional */ }

  console.log(`[Roadshow] Lidos: Consolidado=${rowsConsolidado.length} | Pedidos=${rowsPedidos.length} | Veículos=${rowsVeiculos.length}`)

  // ── Módulo 2: Preparação ──────────────────────────────────────────────────
  const cons = prepararConsolidado(rowsConsolidado, args.year, args.month)
  if (!cons.length) throw new Error(`Nenhum registro encontrado para ${String(args.month).padStart(2,"0")}/${args.year}.`)

  // ── Mapa de capacidade dos veículos (fallback) ────────────────────────────
  const veicCapMap = new Map<string, number>()
  if (rowsVeiculos.length) {
    const fv = rowsVeiculos[0]
    const COL_V_PLACA = findColExact(fv, "veiculo") ?? findCol(fv, "veiculo") ?? findCol(fv, "placa")
    const COL_V_CAP   = findCol(fv, "capacidade")
    if (COL_V_PLACA && COL_V_CAP) {
      for (const row of rowsVeiculos) {
        const p = String(row[COL_V_PLACA] ?? "").trim().toUpperCase()
        const c = toNum(row[COL_V_CAP])
        if (p && c > 0) veicCapMap.set(p, c)
      }
    }
    console.log(`[Roadshow] Veículos: ${veicCapMap.size} capacidades mapeadas`)
  }

  // ── Módulo 3: Tempo produtivo ─────────────────────────────────────────────
  const tempoProd = rowsPedidos.length
    ? calcularTempoProdutivo(rowsPedidos, args.year, args.month)
    : new Map<string, TempoProd>()

  // ── Módulo 4: Ocupações ───────────────────────────────────────────────────
  const enriched = calcularOcupacoes(cons, tempoProd, veicCapMap)

  const ocupJornadaValidos = enriched.filter(r => r.Ocup_Jornada_pct != null).length
  const ocupVeiculoValidos = enriched.filter(r => r.Ocup_Veiculo_pct != null).length
  console.log(`[Roadshow] Jornada: ${ocupJornadaValidos}válidos | Veículo: ${ocupVeiculoValidos}válidos`)

  // ── Módulo 5: Incentivo ───────────────────────────────────────────────────
  const { ocupacaoDiaria, incentivoDiario } = calcularIncentivo(enriched, metaJornada, metaVeiculo, valorDia)

  // ── Módulo 6: Resumos ─────────────────────────────────────────────────────
  const { resumoMensal, resumoArit } = gerarResumos(incentivoDiario, enriched, valorMensal)

  // ── Consolidado para export (aba 01) ──────────────────────────────────────
  const consolidado = enriched.map(r => ({
    DATA_ENTREGA:        formatDateBR(r.DATA_ENTREGA),
    FILIAL:              r.FILIAL,
    REGIAO:              r.REGIAO,
    OPERACAO:            r.OPERACAO,
    MOTORISTA:           r.MOTORISTA,
    PLACA:               r.PLACA,
    PESO:                r.PESO,
    CAPACIDADE:          r.CAPACIDADE,
    "Ocup_Veiculo_%":    r.Ocup_Veiculo_pct ?? "",
    Tempo_Produtivo_Fmt: r.Tempo_Produtivo_Fmt,
    Tempo_Jornada_Fmt:   r.Tempo_Jornada_Fmt,
    "Ocup_Jornada_%":    r.Ocup_Jornada_pct ?? "",
    KM:                  r.KM,
    TIPO_CARGA:          r.TIPO_CARGA,
    STATUS:              r.STATUS,
    PERFORMAXXI:         r.PERFORMAXXI,
  }))

  // Totais para summary
  const totalIncentivo = resumoMensal.reduce((a, r) => a + r.Incentivo_Total, 0)
  const mediaJornada   = ocupacaoDiaria.length
    ? +(ocupacaoDiaria.reduce((a, r) => a + r.Ocup_Jornada_Media, 0) / ocupacaoDiaria.length).toFixed(1)
    : 0
  const mediaVeiculo   = ocupacaoDiaria.length
    ? +(ocupacaoDiaria.reduce((a, r) => a + r.Ocup_Veiculo_Media, 0) / ocupacaoDiaria.length).toFixed(1)
    : 0

  return {
    data:                 consolidado,    // compatibilidade DataViewer
    consolidado,
    ocupacaoDiaria,
    incentivoDiario,
    detalhamento:         rowsPedidos,    // aba 04 bruta
    resumoMensal,
    resumoArit,
    totalRegistros:       rowsConsolidado.length,
    registrosFiltrados:   cons.length,
    agrupamentosPerformaxxi: tempoProd.size,
    ocupJornadaValidos,
    ocupVeiculoValidos,
    summary:
      `Roadshow ${String(args.month).padStart(2,"0")}/${args.year}: ` +
      `${resumoMensal.length} regiões · ` +
      `Jornada ${mediaJornada}% · Veículo ${mediaVeiculo}% · ` +
      `R$ ${totalIncentivo.toFixed(2)} em incentivos`,
    extraSheets: [
      { name: "01_Consolidado",               data: consolidado     },
      { name: "02_Ocupacao_Diaria",           data: ocupacaoDiaria  },
      { name: "03_Incentivo_Roteirizador",    data: incentivoDiario },
      { name: "04_Detalhamento",              data: rowsPedidos     },
      { name: "05_Resumo_Mensal",             data: resumoMensal    },
      { name: "06_Resumo_Mensal_Aritimetica", data: resumoArit      },
    ],
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function executeRoadshowPipeline(formData: FormData): Promise<PipelineResponse> {
  return processAndSave("roadshow", formData, roadshowProcessor)
}