"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  Upload, Download, BarChart3, Loader2, FileCode, Trash2,
  ChevronRight, Users, Package, AlertTriangle,
  CheckCircle2, Truck, Target, Clock, TrendingDown, Award,
} from "lucide-react"
import { Button }    from "@/components/ui/button"
import { cn }        from "@/lib/utils"
import { useToast }  from "@/hooks/use-toast"

const h = React.createElement

// ─── Regras de incentivo ──────────────────────────────────────────────────────
// Absenteísmo / Performance: chegam como INTEIRO (100 = 100%)
// Devoluções: chegam como DECIMAL (0.05 = 5%)

// Regras padrão (RK01, RK03, KP01, PADRAO…)
const REGRAS_MOT = {
  absenteismo: [[100, 50.00], [90, 40.00], [75, 25.00]] as [number,number][],
  performance: [[100, 50.00], [90, 40.00], [75, 25.00]] as [number,number][],
  dev_valor:   [[0.0200, 50.00], [0.0220, 40.00], [0.0250, 25.00]] as [number,number][],
  dev_nf:      [[0.0500, 50.00], [0.0550, 40.00], [0.0625, 25.00]] as [number,number][],
  maximo: 200,
}
const REGRAS_AJU = {
  absenteismo: [[100, 37.50], [90, 30.00], [75, 18.75]] as [number,number][],
  performance: [[100, 37.50], [90, 30.00], [75, 18.75]] as [number,number][],
  dev_valor:   [[0.0200, 37.50], [0.0220, 30.00], [0.0250, 18.75]] as [number,number][],
  dev_nf:      [[0.0500, 37.50], [0.0550, 30.00], [0.0625, 18.75]] as [number,number][],
  maximo: 150,
}

// Regras BV01 / BV02 — vFleet com valores dobrados (máx. R$ 100)
const REGRAS_MOT_BV = {
  absenteismo: [[100, 50.00], [90, 40.00], [75, 25.00]] as [number,number][],
  performance: [[100, 100.00], [90, 80.00], [75, 50.00]] as [number,number][],
  dev_valor:   [[0.0200, 50.00], [0.0220, 40.00], [0.0250, 25.00]] as [number,number][],
  dev_nf:      [[0.0500, 50.00], [0.0550, 40.00], [0.0625, 25.00]] as [number,number][],
  maximo: 250,
}
const REGRAS_AJU_BV = {
  absenteismo: [[100, 37.50], [90, 30.00], [75, 18.75]] as [number,number][],
  performance: [[100, 37.50], [90, 30.00], [75, 18.75]] as [number,number][],
  dev_valor:   [[0.0200, 37.50], [0.0220, 30.00], [0.0250, 18.75]] as [number,number][],
  dev_nf:      [[0.0500, 37.50], [0.0550, 30.00], [0.0625, 18.75]] as [number,number][],
  maximo: 150,
}

const EMPRESAS_BV = new Set(["BV01", "BV02"])

function getRegras(isMotorista: boolean, empresa: string) {
  const isBV = EMPRESAS_BV.has(empresa.toUpperCase().trim())
  if (isMotorista) return isBV ? REGRAS_MOT_BV : REGRAS_MOT
  return isBV ? REGRAS_AJU_BV : REGRAS_AJU
}

// Atingimento: quanto MAIOR melhor
function calcAting(pct: number, faixas: [number,number][]): number {
  if (isNaN(pct)) return 0
  for (const [limiar, val] of [...faixas].sort((a,b) => b[0]-a[0]))
    if (pct >= limiar) return val
  return 0
}
// Devolução: quanto MENOR melhor
function calcDev(pct: number, faixas: [number,number][]): number {
  if (isNaN(pct)) return 0
  for (const [limiar, val] of [...faixas].sort((a,b) => a[0]-b[0]))
    if (pct <= limiar) return val
  return 0
}

// ─── Fontes ───────────────────────────────────────────────────────────────────

const FONTES = [
  { tipo: "funcionarios", label: "Funcionários",    obrigatorio: true,
    desc: "Cadastro base — define cargo (MOTORISTA / AJUDANTE)",
    cls: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-950/20 dark:border-slate-800 dark:text-slate-400" },
  { tipo: "ponto",        label: "Ponto",           obrigatorio: false,
    desc: "% presença → bônus absenteísmo",
    cls: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/20 dark:border-violet-900 dark:text-violet-400" },
  { tipo: "vfleet",       label: "vFleet",          obrigatorio: false,
    desc: "% condução → bônus motoristas",
    cls: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900 dark:text-orange-400" },
  { tipo: "performaxxi",  label: "Performaxxi",     obrigatorio: false,
    desc: "% entregas → bônus ajudantes",
    cls: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400" },
  { tipo: "faturamento",  label: "Fat. Devoluções", obrigatorio: false,
    desc: "% dev. valor + % dev. NFe → bônus todos",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400" },
] as const

type TipoFonte = typeof FONTES[number]["tipo"]

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColabRow {
  nomeNorm: string; nome: string; cargo: string; empresa: string; isMotorista: boolean
  // Percentuais brutos
  pct_abs:     number   // % presença (0-100)
  pct_perf:    number   // % desempenho vFleet ou Performaxxi (0-100)
  pct_dev_val: number   // % devolução valor decimal (0.05 = 5%)
  pct_dev_nfe: number   // % devolução NFe decimal
  // Valores calculados
  val_abs: number; val_perf: number; val_dev_val: number; val_dev_nfe: number
  total: number; maximo: number; pct_total: number
  // Detalhe
  dias_uteis: number; presencas: number; faltas: number
  perf_dias: number; perf_dias_ok: number
  fat_total: number; fat_dev: number; fat_nfes: number; fat_nfes_dev: number
}

type ActiveTab = "consolidado" | "detalhado"
type GrupoTab  = "motoristas" | "ajudantes"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normNome(s: any): string {
  let r = String(s ?? "").toUpperCase().trim()
  r = r.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return r.replace(/[^A-Z0-9\s]/g, "").replace(/\s+/g, " ").trim()
}
function toNum(v: any): number {
  const n = parseFloat(String(v ?? "").replace(",", ".").trim())
  return isNaN(n) ? 0 : n
}
function fmtRS(n: number)  { return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtPct(n: number, dec = 1) { return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%" }

// ─── Processamento ────────────────────────────────────────────────────────────

function processar(arqs: Map<TipoFonte, any[]>): ColabRow[] {
  const funcRaw   = arqs.get("funcionarios") ?? []
  const pontoRaw  = arqs.get("ponto")        ?? []
  const vflRaw    = arqs.get("vfleet")       ?? []
  const perfRaw   = arqs.get("performaxxi")  ?? []
  const fatRaw    = arqs.get("faturamento")  ?? []

  if (!funcRaw.length) throw new Error("Arquivo de Funcionários vazio ou sem coluna NOME.")

  const funcMap = new Map<string, any>()
  for (const r of funcRaw) {
    const n = normNome(r["NOME"] ?? r["Nome"] ?? "")
    if (n) funcMap.set(n, r)
  }

  const vflMap = new Map<string, any>()
  for (const r of vflRaw) {
    const n = normNome(r["Motorista"] ?? r["MOTORISTA"] ?? "")
    if (n && funcMap.has(n)) vflMap.set(n, r)
  }

  const perfMap = new Map<string, any>()
  for (const r of perfRaw) {
    const n = normNome(r["Motorista"] ?? r["MOTORISTA"] ?? "")
    if (n && funcMap.has(n)) perfMap.set(n, r)
  }

  const fatMap = new Map<string, any>()
  for (const r of fatRaw) {
    const n = normNome(r["Colaborador"] ?? r["COLABORADOR"] ?? "")
    if (n && funcMap.has(n)) fatMap.set(n, r)
  }

  const pontoMap = new Map<string, { total: number; presenca: number; falta: number }>()
  for (const r of pontoRaw) {
    const n = normNome(r["Nome"] ?? r["NOME"] ?? "")
    if (!n || !funcMap.has(n)) continue
    if (!pontoMap.has(n)) pontoMap.set(n, { total: 0, presenca: 0, falta: 0 })
    const d = pontoMap.get(n)!
    d.total++
    const tipo = String(r["Tipo_Presenca"] ?? "").trim()
    if (tipo === "Presença Física") d.presenca++
    else if (tipo === "Falta") d.falta++
  }

  const candidatos = new Set<string>()
  for (const n of vflMap.keys())   candidatos.add(n)
  for (const n of perfMap.keys())  candidatos.add(n)
  for (const n of fatMap.keys())   candidatos.add(n)
  for (const n of pontoMap.keys()) candidatos.add(n)

  const rows: ColabRow[] = []
  for (const nk of candidatos) {
    const f = funcMap.get(nk)
    if (!f) continue
    const cargo       = String(f["CARGO"] ?? "").toUpperCase()
    const empresa     = String(f["EMPRESA"] ?? "")
    const nome        = String(f["NOME"] ?? nk)
    const isMotorista = !cargo.includes("AJUDANTE")
    const regras      = getRegras(isMotorista, empresa)

    // Absenteísmo
    const pt = pontoMap.get(nk)
    const pct_abs = pt && pt.total > 0 ? (pt.presenca / pt.total) * 100 : NaN
    const val_abs = calcAting(isNaN(pct_abs) ? NaN : pct_abs, regras.absenteismo)

    // Performance (vFleet para mot, Performaxxi para aju)
    let pct_perf = NaN, perf_dias = 0, perf_dias_ok = 0
    if (isMotorista) {
      const v = vflMap.get(nk)
      if (v) { pct_perf = toNum(v["% Desempenho"]); perf_dias = toNum(v["Dias Ativos"]); perf_dias_ok = toNum(v["Dias Bonificados"]) }
    } else {
      const p = perfMap.get(nk)
      if (p) { pct_perf = toNum(p["% Desempenho"]); perf_dias = toNum(p["Dias Ativos"]); perf_dias_ok = toNum(p["Dias 4/4"]) }
    }
    const val_perf = calcAting(pct_perf, regras.performance)

    // Devoluções
    const ft = fatMap.get(nk)
    const pct_dev_val = ft ? toNum(ft["Percentual_Venda_Devolvida"])      : NaN
    const pct_dev_nfe = ft ? toNum(ft["Percentual_Qtd_Notas_Devolvidas"]) : NaN
    const val_dev_val = calcDev(pct_dev_val, regras.dev_valor)
    const val_dev_nfe = calcDev(pct_dev_nfe, regras.dev_nf)

    const total     = val_abs + val_perf + val_dev_val + val_dev_nfe
    const maximo    = regras.maximo
    const pct_total = maximo > 0 ? (total / maximo) * 100 : 0

    rows.push({
      nomeNorm: nk, nome, cargo, empresa, isMotorista,
      pct_abs, pct_perf, pct_dev_val, pct_dev_nfe,
      val_abs, val_perf, val_dev_val, val_dev_nfe,
      total, maximo, pct_total,
      dias_uteis: pt?.total ?? 0, presencas: pt?.presenca ?? 0, faltas: pt?.falta ?? 0,
      perf_dias, perf_dias_ok,
      fat_total:    ft ? toNum(ft["Faturamento_Total (R$)"])     : 0,
      fat_dev:      ft ? toNum(ft["Faturamento_Devolvido (R$)"]) : 0,
      fat_nfes:     ft ? toNum(ft["Total_NFes"])                 : 0,
      fat_nfes_dev: ft ? toNum(ft["Total_NFes_Devolvidas"])      : 0,
    })
  }
  return rows.sort((a, b) => b.total - a.total)
}

// ─── Excel export ─────────────────────────────────────────────────────────────

function gerarExcel(rows: ColabRow[], grupo: GrupoTab) {
  const wb  = XLSX.utils.book_new()
  const sub = rows.filter(r => grupo === "motoristas" ? r.isMotorista : !r.isMotorista)
  const label = grupo === "motoristas" ? "Motoristas" : "Ajudantes"

  const toSheet = (det: boolean) => sub.map(r => ({
    "Nome": r.nome, "Cargo": r.cargo, "Empresa": r.empresa,
    "% Absenteísmo": isNaN(r.pct_abs) ? "" : fmtPct(r.pct_abs),
    "Valor Absenteísmo": r.val_abs,
    [`% ${r.isMotorista ? "vFleet" : "Performaxxi"}`]: isNaN(r.pct_perf) ? "" : fmtPct(r.pct_perf),
    [`Valor ${r.isMotorista ? "vFleet" : "Performaxxi"}`]: r.val_perf,
    "% Dev. Valor": isNaN(r.pct_dev_val) ? "" : fmtPct(r.pct_dev_val * 100),
    "Valor Dev. Valor": r.val_dev_val,
    "% Dev. NFe": isNaN(r.pct_dev_nfe) ? "" : fmtPct(r.pct_dev_nfe * 100),
    "Valor Dev. NFe": r.val_dev_nfe,
    "Total (R$)": r.total, "Máximo (R$)": r.maximo,
    "% do Máximo": fmtPct(r.pct_total, 0),
    ...(det ? {
      "Dias Úteis": r.dias_uteis, "Presenças": r.presencas, "Faltas": r.faltas,
      "Dias Perf.": r.perf_dias, "Dias OK": r.perf_dias_ok,
      "Fat. Total": r.fat_total, "Fat. Dev.": r.fat_dev,
      "NFes": r.fat_nfes, "NFes Dev.": r.fat_nfes_dev,
    } : {}),
  }))

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheet(false)), `Consolidado`)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toSheet(true)),  `Detalhado`)
  const now = new Date()
  XLSX.writeFile(wb, `Incentivo_${label}_${now.getDate().toString().padStart(2,"0")}${(now.getMonth()+1).toString().padStart(2,"0")}${now.getFullYear()}.xlsx`)
}

// ─── Helpers render ───────────────────────────────────────────────────────────

function dash() { return h("span", { className: "text-muted-foreground/30" }, "—") }

function THead(headers: string[]) {
  return h("thead", { className: "sticky top-0 z-10" },
    h("tr", { style: { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.9)" } },
      ...headers.map((hd, i) =>
        h("th", { key: i, className: "px-2 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap text-[10px]" }, hd)
      )
    )
  )
}

// Badge atingimento (verde = bom)
function AbsBadge({ pct }: { pct: number }) {
  if (isNaN(pct)) return h("span", { className: "text-[10px] text-muted-foreground/40 italic" }, "—")
  const cls = pct >= 100 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
    : pct >= 90 ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
    : pct >= 75 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
  return h("span", { className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", cls) }, fmtPct(pct))
}

// Badge devolução (verde = pouco = bom)
function DevBadge({ pct }: { pct: number }) {
  if (isNaN(pct)) return h("span", { className: "text-[10px] text-muted-foreground/40 italic" }, "—")
  const p = pct * 100
  const cls = p <= 2 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
    : p <= 2.5 ? "bg-blue-100 text-blue-700"
    : p <= 5   ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
  return h("span", { className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", cls) }, fmtPct(p))
}

// Valor do incentivo — bold colorido
function ValCell({ val, maxVal }: { val: number; maxVal: number }) {
  if (val === 0) return h("span", { className: "text-muted-foreground/40 text-[10px]" }, "R$ 0")
  const full = val >= maxVal
  return h("span", { className: cn("font-bold font-mono text-[11px]", full ? "text-emerald-600" : "text-primary") },
    `R$\u00A0${fmtRS(val)}`
  )
}

// Barra de total
function TotalBar({ total, maximo }: { total: number; maximo: number }) {
  const pct = maximo > 0 ? Math.min((total / maximo) * 100, 100) : 0
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 75 ? "bg-blue-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400"
  return h("div", { className: "flex items-center gap-2 min-w-[130px]" },
    h("div", { className: "w-12 h-2 rounded-full bg-muted overflow-hidden" },
      h("div", { className: cn("h-full rounded-full transition-all", color), style: { width: `${pct}%` } })
    ),
    h("span", { className: cn("font-bold font-mono text-[11px]", pct >= 100 ? "text-emerald-600" : "text-primary") },
      `R$\u00A0${fmtRS(total)}`
    ),
    h("span", { className: cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto",
      pct >= 100 ? "bg-emerald-100 text-emerald-700"
      : pct >= 75 ? "bg-blue-100 text-blue-700"
      : pct >= 50 ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700") },
      fmtPct(pct, 0)
    )
  )
}

// ─── Régua de faixas ─────────────────────────────────────────────────────────

function ReguaFaixas({ tipo }: { tipo: GrupoTab }) {
  const r      = tipo === "motoristas" ? REGRAS_MOT    : REGRAS_AJU
  const rBV    = tipo === "motoristas" ? REGRAS_MOT_BV : REGRAS_AJU_BV
  const pLabel = tipo === "motoristas" ? "vFleet" : "Performaxxi"
  const isMot  = tipo === "motoristas"
  // Faixas com valor BV opcional (quando diferente do padrão)
  const faixas: { label: string; val: number; valBV?: number; cls: string }[] = [
    { label: "Absent. 100%",      val: r.absenteismo[0][1], cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: "Absent. ≥ 90%",    val: r.absenteismo[1][1], cls: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "Absent. ≥ 75%",    val: r.absenteismo[2][1], cls: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: `${pLabel} 100%`,    val: r.performance[0][1], valBV: rBV.performance[0][1], cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: `${pLabel} ≥ 90%`,  val: r.performance[1][1], valBV: rBV.performance[1][1], cls: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: `${pLabel} ≥ 75%`,  val: r.performance[2][1], valBV: rBV.performance[2][1], cls: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Dev. Val. ≤ 2%",   val: r.dev_valor[0][1],   cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: "Dev. Val. ≤ 2,2%", val: r.dev_valor[1][1],   cls: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "Dev. Val. ≤ 2,5%", val: r.dev_valor[2][1],   cls: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Dev. NFe ≤ 5%",    val: r.dev_nf[0][1],      cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    { label: "Dev. NFe ≤ 5,5%",  val: r.dev_nf[1][1],      cls: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "Dev. NFe ≤ 6,25%", val: r.dev_nf[2][1],      cls: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Máx. Padrão",       val: r.maximo,             cls: "bg-slate-100 border-slate-300 text-slate-700" },
    ...(isMot ? [{ label: "Máx. BV01/02", val: rBV.maximo, cls: "bg-indigo-50 border-indigo-300 text-indigo-700" }] : []),
  ]
  return h("div", { className: "grid grid-cols-8 md:grid-cols-15 gap-1" },
    ...faixas.map((f, i) =>
      h("div", { key: i, className: cn("rounded-lg border px-2 py-1.5 text-center", f.cls) },
        h("div", { className: "text-[9px] leading-tight opacity-75 whitespace-nowrap" }, f.label),
        h("div", { className: "text-[11px] font-bold mt-0.5" }, `R$\u00A0${fmtRS(f.val)}`),
        f.valBV !== undefined && f.valBV !== f.val
          ? h("div", { className: "text-[9px] font-bold text-indigo-600 mt-0.5" }, `BV: R$\u00A0${fmtRS(f.valBV)}`)
          : null
      )
    )
  )
}

// ─── Tabela Consolidada ───────────────────────────────────────────────────────

function TabelaConsolidada({ rows, tipo }: { rows: ColabRow[]; tipo: GrupoTab }) {
  const pLabel = tipo === "motoristas" ? "vFleet" : "Performaxxi"
  // maxCrit calculado por row pois BV01/BV02 têm valores diferentes
  function getMaxCrit(r: ColabRow) { return r.maximo / 4 }

  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 460px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead([
          "Nome", "Empresa",
          "% Absent.", "Val. Abs.",
          `% ${pLabel}`, `Val. ${pLabel}`,
          "% Dev. Valor", "Val. Dev. Val.",
          "% Dev. NFe", "Val. Dev. NFe",
          "Total / % do Máx.",
        ]),
        h("tbody", {},
          ...rows.map((r, i) => {
            const full = r.total >= r.maximo
            const zero = r.total === 0
            const rc = full ? "bg-emerald-50/30 hover:bg-emerald-50/60 dark:bg-emerald-950/10"
              : zero ? "bg-red-50/30 hover:bg-red-50/60 dark:bg-red-950/10"
              : "bg-background hover:bg-muted/10"
            return h("tr", { key: i, className: cn("border-b transition-colors", rc) },
              // Nome
              h("td", { className: "px-3 py-2 text-left font-medium min-w-[170px] whitespace-nowrap" },
                full && h(Award, { className: "size-3 text-emerald-500 inline mr-1" }),
                r.nome
              ),
              h("td", { className: "px-2 py-2 text-center text-[10px] text-muted-foreground" }, r.empresa || dash()),
              // Absenteísmo
              h("td", { className: "px-2 py-2 text-center" }, h(AbsBadge, { pct: r.pct_abs })),
              h("td", { className: "px-2 py-2 text-center" }, h(ValCell, { val: r.val_abs, maxVal: getMaxCrit(r) })),
              // Performance
              h("td", { className: "px-2 py-2 text-center" }, h(AbsBadge, { pct: r.pct_perf })),
              h("td", { className: "px-2 py-2 text-center" }, h(ValCell, { val: r.val_perf, maxVal: getMaxCrit(r) })),
              // Dev. Valor
              h("td", { className: "px-2 py-2 text-center" }, h(DevBadge, { pct: r.pct_dev_val })),
              h("td", { className: "px-2 py-2 text-center" }, h(ValCell, { val: r.val_dev_val, maxVal: getMaxCrit(r) })),
              // Dev. NFe
              h("td", { className: "px-2 py-2 text-center" }, h(DevBadge, { pct: r.pct_dev_nfe })),
              h("td", { className: "px-2 py-2 text-center" }, h(ValCell, { val: r.val_dev_nfe, maxVal: getMaxCrit(r) })),
              // Total + barra + badge em uma célula
              h("td", { className: "px-2 py-2" }, h(TotalBar, { total: r.total, maximo: r.maximo }))
            )
          })
        )
      )
    )
  )
}

// ─── Tabela Detalhada ─────────────────────────────────────────────────────────

function TabelaDetalhada({ rows, tipo }: { rows: ColabRow[]; tipo: GrupoTab }) {
  const pLabel  = tipo === "motoristas" ? "vFleet" : "Performaxxi"
  function getMaxCritD(r: ColabRow) { return r.maximo / 4 }

  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 460px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead([
          "Nome", "Cargo", "Empresa",
          "Dias", "Pres.", "Falt.", "% Abs.", "Val. Abs.",
          `D. ${pLabel}`, "D. OK", `% ${pLabel}`, `Val. ${pLabel}`,
          "Fat. Total", "Fat. Dev.", "% Dev. Val.", "Val. Dev. Val.",
          "NFes", "NFes Dev.", "% Dev. NFe", "Val. Dev. NFe",
          "Total / % do Máx.", "Máx. Ref.",
        ]),
        h("tbody", {},
          ...rows.map((r, i) =>
            h("tr", { key: i, className: "border-b bg-background hover:bg-muted/10 transition-colors" },
              h("td", { className: "px-2 py-1.5 text-left font-medium min-w-[160px] whitespace-nowrap" }, r.nome),
              h("td", { className: "px-2 py-1.5 text-center text-[9px] text-muted-foreground whitespace-nowrap" }, r.cargo),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground" }, r.empresa || dash()),
              // Ponto
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.dias_uteis || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.presencas || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, r.faltas > 0 ? h("span", { className: "font-bold text-red-500" }, r.faltas) : dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, h(AbsBadge, { pct: r.pct_abs })),
              h("td", { className: "px-2 py-1.5 text-center" }, h(ValCell, { val: r.val_abs, maxVal: getMaxCritD(r) })),
              // Performance
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.perf_dias || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-bold text-emerald-600" }, r.perf_dias_ok || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, h(AbsBadge, { pct: r.pct_perf })),
              h("td", { className: "px-2 py-1.5 text-center" }, h(ValCell, { val: r.val_perf, maxVal: getMaxCritD(r) })),
              // Faturamento
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.fat_total > 0 ? h("span", { className: "text-emerald-600 font-bold" }, `R$\u00A0${fmtRS(r.fat_total)}`) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.fat_dev > 0 ? h("span", { className: "text-red-500 font-bold" }, `R$\u00A0${fmtRS(r.fat_dev)}`) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, h(DevBadge, { pct: r.pct_dev_val })),
              h("td", { className: "px-2 py-1.5 text-center" }, h(ValCell, { val: r.val_dev_val, maxVal: getMaxCritD(r) })),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.fat_nfes || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, r.fat_nfes_dev > 0 ? h("span", { className: "text-red-500 font-bold" }, r.fat_nfes_dev) : dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, h(DevBadge, { pct: r.pct_dev_nfe })),
              h("td", { className: "px-2 py-1.5 text-center" }, h(ValCell, { val: r.val_dev_nfe, maxVal: getMaxCritD(r) })),
              // Total
              h("td", { className: "px-2 py-1.5" }, h(TotalBar, { total: r.total, maximo: r.maximo })),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground text-[10px]" }, `R$\u00A0${fmtRS(r.maximo)}`),
            )
          )
        )
      )
    )
  )
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function KpiGrid({ rows, tipo }: { rows: ColabRow[]; tipo: GrupoTab }) {
  const total          = rows.length
  const totalIncentivo = rows.reduce((s,r) => s+r.total, 0)
  const maxPossivel    = rows.reduce((s,r) => s+r.maximo, 0)
  const pctAproveit    = maxPossivel > 0 ? (totalIncentivo / maxPossivel) * 100 : 0
  const maximos        = rows.filter(r => r.pct_total >= 100).length
  const zeros          = rows.filter(r => r.total === 0).length
  const pLabel         = tipo === "motoristas" ? "vFleet" : "Performaxxi"

  const kpis = [
    { label: tipo === "motoristas" ? "Motoristas" : "Ajudantes", value: `${total}`,                     color: "text-primary",     icon: tipo === "motoristas" ? Truck : Users },
    { label: "Total Incentivos",      value: `R$\u00A0${fmtRS(totalIncentivo)}`,                         color: "text-emerald-600", icon: Award },
    { label: "% Aproveitado",         value: fmtPct(pctAproveit, 0),                                     color: pctAproveit >= 75 ? "text-emerald-600" : "text-amber-600", icon: Target },
    { label: "100% do Máximo",        value: `${maximos} / ${total}`,                                    color: maximos > 0 ? "text-emerald-600" : "text-muted-foreground", icon: CheckCircle2 },
    { label: "R$ 0 (sem incentivo)",  value: `${zeros}`,                                                 color: zeros > 0 ? "text-red-500" : "text-emerald-600", icon: AlertTriangle },
    { label: "Bônus Absenteísmo",     value: `R$\u00A0${fmtRS(rows.reduce((s,r)=>s+r.val_abs,0))}`,     color: "text-violet-600",  icon: Clock },
    { label: `Bônus ${pLabel}`,       value: `R$\u00A0${fmtRS(rows.reduce((s,r)=>s+r.val_perf,0))}`,    color: "text-orange-600",  icon: BarChart3 },
    { label: "Bônus Dev. Valor",      value: `R$\u00A0${fmtRS(rows.reduce((s,r)=>s+r.val_dev_val,0))}`, color: "text-cyan-600",    icon: TrendingDown },
    { label: "Bônus Dev. NFe",        value: `R$\u00A0${fmtRS(rows.reduce((s,r)=>s+r.val_dev_nfe,0))}`, color: "text-cyan-600",    icon: TrendingDown },
  ]

  return h("div", { className: "grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2 mb-3" },
    ...kpis.map((k, i) =>
      h("div", { key: i, className: "rounded-xl border border-border/60 bg-card px-3 py-2.5" },
        h("div", { className: "flex items-center gap-1.5 mb-1" },
          h(k.icon, { className: cn("size-3 shrink-0", k.color) })
        ),
        h("p", { className: cn("text-sm font-bold font-mono leading-tight truncate", k.color) }, k.value),
        h("p", { className: "text-[10px] text-muted-foreground mt-0.5 leading-tight" }, k.label)
      )
    )
  )
}

// ─── Dashboard (após upload) ──────────────────────────────────────────────────

function Dashboard({ rows }: { rows: ColabRow[] }) {
  const [grupo, setGrupo]   = React.useState<GrupoTab>("motoristas")
  const [tabela, setTabela] = React.useState<ActiveTab>("consolidado")
  const [search, setSearch] = React.useState("")
  const [empresaFiltro, setEmpresaFiltro] = React.useState("")

  const motoristas = React.useMemo(() => rows.filter(r => r.isMotorista),  [rows])
  const ajudantes  = React.useMemo(() => rows.filter(r => !r.isMotorista), [rows])
  const subRows    = grupo === "motoristas" ? motoristas : ajudantes

  const empresas = React.useMemo(() =>
    Array.from(new Set(subRows.map(r => r.empresa).filter(Boolean))).sort(),
  [subRows])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return subRows.filter(r =>
      (!q || r.nome.toLowerCase().includes(q)) &&
      (!empresaFiltro || r.empresa === empresaFiltro)
    )
  }, [subRows, search, empresaFiltro])

  return h("div", { className: "space-y-3" },

    // Seletor + abas + controles
    h("div", { className: "flex items-center gap-3 flex-wrap" },
      h("div", { className: "flex border border-border/60 rounded-xl overflow-hidden bg-muted/10 p-0.5 gap-0.5" },
        ...(["motoristas", "ajudantes"] as const).map(g =>
          h("button", {
            key: g,
            onClick: () => { setGrupo(g); setSearch(""); setEmpresaFiltro("") },
            className: cn(
              "flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-all",
              grupo === g ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )
          },
            h(g === "motoristas" ? Truck : Users, { className: "size-4" }),
            g === "motoristas" ? `Motoristas (${motoristas.length})` : `Ajudantes (${ajudantes.length})`
          )
        )
      ),
      h("div", { className: "flex border-b border-border" },
        ...(["consolidado", "detalhado"] as const).map(t =>
          h("button", {
            key: t,
            onClick: () => setTabela(t),
            className: cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tabela === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )
          }, t === "consolidado" ? "Consolidado" : "Detalhado")
        )
      ),
      h("input", {
        className: "flex-1 min-w-[160px] max-w-xs h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary",
        placeholder: "Buscar nome...",
        value: search,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)
      }),
      empresas.length > 1 && h("select", {
        className: "h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary text-muted-foreground",
        value: empresaFiltro,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setEmpresaFiltro(e.target.value)
      },
        h("option", { value: "" }, "Todas empresas"),
        ...empresas.map(emp => h("option", { key: emp, value: emp }, emp))
      ),
      h("div", { className: "flex items-center gap-2 ml-auto" },
        h("span", { className: "text-[10px] text-muted-foreground font-mono" }, `${filtered.length} / ${subRows.length}`),
        h(Button, {
          variant: "outline" as const, size: "sm" as const, className: "h-8 text-xs gap-1.5",
          onClick: () => gerarExcel(rows, grupo)
        }, h(Download, { className: "size-3.5" }), "Excel")
      )
    ),

    // KPIs
    h(KpiGrid, { rows: subRows, tipo: grupo }),

    // Régua compacta
    h("div", { className: "rounded-xl border border-border/60 bg-muted/5 px-3 py-2" },
      h("p", { className: "text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5" },
        `Faixas — ${grupo === "motoristas" ? "Motorista (máx. R$ 200,00 · BV: R$ 250,00)" : "Ajudante (máx. R$ 150,00)"}`
      ),
      h(ReguaFaixas, { tipo: grupo })
    ),

    // Tabela
    tabela === "consolidado"
      ? h(TabelaConsolidada, { rows: filtered, tipo: grupo })
      : h(TabelaDetalhada,   { rows: filtered, tipo: grupo })
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function IncentivoMensalPipelineView() {
  const [files, setFiles]     = React.useState<{ data: any[]; nome: string; tipo: TipoFonte }[]>([])
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows]       = React.useState<ColabRow[] | null>(null)
  const { toast }             = useToast()

  async function lerArquivo(file: File): Promise<any[]> {
    const nome = file.name.toLowerCase()
    if (nome.endsWith(".json")) {
      const raw = JSON.parse(await file.text())
      if (Array.isArray(raw)) return raw
      const vals = Object.entries(raw as Record<string, any>)
        .filter(([k]) => k.toLowerCase() !== "acumulado")
        .map(([, v]) => v)
      return (vals.flat() as any[])
    }
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: "array", cellDates: false })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[]
  }

  function detectarTipo(nome: string): TipoFonte {
    const n = nome.toLowerCase()
    if (/funcionari/i.test(n))                       return "funcionarios"
    if (/performaxxi|performaxi/i.test(n))           return "performaxxi"
    if (/desempenho|vfleet|motorist/i.test(n))       return "vfleet"
    if (/faturamento.*dev|fatdev|fat.*dev/i.test(n)) return "faturamento"
    if (/ponto|apuracao|apuração/i.test(n))          return "ponto"
    return "funcionarios"
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    for (const file of Array.from(e.target.files || [])) {
      try {
        const data = await lerArquivo(file)
        const tipo = detectarTipo(file.name)
        setFiles(prev => [...prev.filter(f => f.tipo !== tipo), { data, nome: file.name, tipo }])
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro ao ler arquivo", description: `${file.name}: ${err.message}` })
      }
    }
    e.target.value = ""
  }

  function analisar() {
    if (!files.some(f => f.tipo === "funcionarios")) {
      toast({ variant: "destructive", title: "Arquivo obrigatório", description: "Selecione o arquivo de Funcionários." })
      return
    }
    setLoading(true)
    setTimeout(() => {
      try {
        const arqs = new Map<TipoFonte, any[]>()
        for (const f of files) arqs.set(f.tipo, f.data)
        const result = processar(arqs)
        setRows(result)
        const mot = result.filter(r => r.isMotorista).length
        const aju = result.filter(r => !r.isMotorista).length
        const totalR = result.reduce((s,r) => s+r.total, 0)
        toast({ title: "Incentivos calculados", description: `${mot} motoristas · ${aju} ajudantes · R$\u00A0${fmtRS(totalR)} total` })
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro no cálculo", description: err.message })
      } finally { setLoading(false) }
    }, 60)
  }

  const tipoTag: Record<TipoFonte, string> = {
    funcionarios: "bg-slate-100 text-slate-700",
    performaxxi:  "bg-blue-100 text-blue-700",
    vfleet:       "bg-orange-100 text-orange-700",
    faturamento:  "bg-emerald-100 text-emerald-700",
    ponto:        "bg-violet-100 text-violet-700",
  }
  const tipoNome: Record<TipoFonte, string> = {
    funcionarios: "Funcionários", performaxxi: "Performaxxi",
    vfleet: "vFleet", faturamento: "Fat. Dev", ponto: "Ponto",
  }

  // Dashboard após análise
  if (rows) {
    return h("div", { className: "space-y-6" },
      h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3" },
        h("div", { className: "flex items-start gap-3" },
          h(Target, { className: "size-4 text-primary shrink-0 mt-0.5" }),
          h("div", { className: "text-sm text-muted-foreground" },
            h("span", { className: "font-semibold text-foreground" }, "Incentivo Mensal "),
            "— 4 critérios: ",
            h("strong", {}, "Absenteísmo · vFleet (Mot.) / Performaxxi (Aju.) · Dev. Valor · Dev. NFe"),
            ". Motorista máx. ",
            h("strong", {}, "PR: R$ 200,00 · MS: R$ 250,00"),
            " · Ajudante máx. ",
            h("strong", {}, "PR: R$ 150,00 · MS: R$ 250,00"),
            "."
          )
        ),
        h(Button, {
          variant: "outline" as const, size: "sm" as const, className: "h-8 text-xs gap-1.5 shrink-0",
          onClick: () => setRows(null)
        }, h(Upload, { className: "size-3.5" }), "Trocar arquivos")
      ),
      h(Dashboard, { rows })
    )
  }

  // Tela de upload
  return h("div", { className: "space-y-6" },
    h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-start gap-3" },
      h(Target, { className: "size-4 text-primary shrink-0 mt-0.5" }),
      h("div", { className: "text-sm text-muted-foreground" },
        h("span", { className: "font-semibold text-foreground" }, "Incentivo Mensal "),
        "— 4 critérios: ",
        h("strong", {}, "Absenteísmo · vFleet (Motoristas) / Performaxxi (Ajudantes) · Dev. por Valor · Dev. por NFe"),
        ". Máximo ",
        h("strong", {}, "R$ 200,00 / motorista"),
        " e ",
        h("strong", {}, "R$ 150,00 / ajudante"),
        " por mês."
      )
    ),

    h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-3 border-b border-border/60 bg-muted/10 flex items-center gap-2" },
        h(Package, { className: "size-4 text-primary" }),
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Arquivos de Entrada")
      ),
      h("div", { className: "p-4 space-y-4" },

        // Drop zone
        h("div", {
          className: cn(
            "border-2 border-dashed rounded-xl bg-muted/10 min-h-[100px] flex flex-col items-center justify-center p-4 cursor-pointer transition-colors",
            "hover:border-primary/40 hover:bg-muted/20"
          ),
          onClick: () => document.getElementById("incentivo-input")?.click()
        },
          h("input", { id: "incentivo-input", type: "file", multiple: true, className: "hidden", onChange: handleFileChange }),
          files.length === 0
            ? h("div", { className: "text-center space-y-1.5" },
                h(FileCode, { className: "size-8 mx-auto opacity-20" }),
                h("p", { className: "text-xs text-muted-foreground italic" },
                  "Funcionario · Ponto · Desempenho_Motoristas (vFleet) · Performaxxi · FaturamentoDev"
                ),
                h("p", { className: "text-[10px] text-muted-foreground/60" }, "XLSX, XLS ou JSON · detecção automática pelo nome do arquivo")
              )
            : h("div", { className: "w-full space-y-1.5" },
                ...files.map((f, idx) =>
                  h("div", { key: idx, className: "flex items-center gap-2 bg-background px-3 py-2 rounded-lg border text-xs" },
                    h(FileCode, { className: "size-3 text-muted-foreground shrink-0" }),
                    h("span", { className: cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0", tipoTag[f.tipo]) }, tipoNome[f.tipo]),
                    h("span", { className: "truncate flex-1 font-medium" }, f.nome),
                    h("span", { className: "text-[10px] text-muted-foreground font-mono" }, `${f.data.length} linhas`),
                    h(Button, {
                      variant: "ghost" as const, size: "icon" as const, className: "size-6 shrink-0",
                      onClick: (e: React.MouseEvent) => { e.stopPropagation(); setFiles(files.filter((_, i) => i !== idx)) }
                    }, h(Trash2, { className: "size-3 text-destructive/70" }))
                  )
                ),
                h("div", { className: "flex items-center gap-2 pt-1 text-[10px] text-muted-foreground" },
                  h(Upload, { className: "size-3" }), "Clique para adicionar mais arquivos"
                )
              )
        ),

        // Guia fontes
        h("div", { className: "grid grid-cols-5 gap-1.5" },
          ...FONTES.map((fonte, i) => {
            const carregado = files.some(f => f.tipo === fonte.tipo)
            return h("div", { key: i, className: cn(
              "flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] transition-all",
              carregado ? fonte.cls + " ring-1 ring-current ring-opacity-20" : "bg-muted/20 border-border/40 text-muted-foreground"
            )},
              h(ChevronRight, { className: "size-3 shrink-0 opacity-60 mt-0.5" }),
              h("div", {},
                h("div", { className: "font-bold leading-tight flex items-center gap-1" },
                  fonte.label,
                  fonte.obrigatorio && h("span", { className: "text-[8px] font-bold opacity-60" }, "★"),
                  carregado && h(CheckCircle2, { className: "size-2.5 ml-0.5 text-current" })
                ),
                h("div", { className: "opacity-70 leading-tight mt-0.5 text-[9px]" }, fonte.desc)
              )
            )
          })
        ),

        // Botão
        h("div", { className: "flex gap-2" },
          h(Button, {
            className: "flex-1 h-9 text-xs font-semibold shadow-sm",
            onClick: analisar,
            disabled: loading || !files.some(f => f.tipo === "funcionarios")
          },
            loading
              ? h(React.Fragment, {}, h(Loader2, { className: "mr-1.5 size-3.5 animate-spin" }), "Calculando...")
              : h(React.Fragment, {}, h(BarChart3, { className: "mr-1.5 size-3.5" }), "Calcular Incentivos")
          )
        ),

        !files.some(f => f.tipo === "funcionarios") && files.length > 0 &&
          h("div", { className: "flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-900" },
            h(AlertTriangle, { className: "size-3.5 shrink-0" }),
            "O arquivo de Funcionários é obrigatório — define quem é motorista e quem é ajudante."
          )
      )
    )
  )
}