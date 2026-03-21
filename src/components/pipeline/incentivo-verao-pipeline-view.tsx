"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  Upload, Download, BarChart3, Loader2, FileCode, Trash2,
  ChevronRight, Users, TrendingUp, TrendingDown, Package,
  DollarSign, AlertTriangle, CheckCircle2, XCircle, Activity,
  Truck, Target, Star, Clock, Weight, X,  Search, Award,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn }     from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { BoletimPipelineView } from "./boletim-pipeline-view"

const h = React.createElement

// ─── Fontes necessárias ───────────────────────────────────────────────────────

const FONTES = [
  { tipo: "funcionarios", label: "Funcionários",   desc: "Cadastro base — filtra quem aparece no dashboard",  cls: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-950/20 dark:border-slate-800 dark:text-slate-400", obrigatorio: true },
  { tipo: "performaxxi",  label: "Performaxxi",    desc: "% desempenho e bonificação por critérios logísticos", cls: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400",   obrigatorio: false },
  { tipo: "vfleet",       label: "vFleet",         desc: "% desempenho e score de risco dos motoristas",       cls: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900 dark:text-orange-400", obrigatorio: false },
  { tipo: "faturamento",  label: "Fat. Devoluções",desc: "% venda devolvida e % notas devolvidas",             cls: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400", obrigatorio: false },
  { tipo: "ponto",        label: "Ponto",          desc: "Absenteísmo — presenças, faltas e justificativas",   cls: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/20 dark:border-violet-900 dark:text-violet-400", obrigatorio: false },
  { tipo: "entregas",     label: "Entregas",        desc: "Volume de entregas, peso e km por colaborador",     cls: "bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-950/20 dark:border-cyan-900 dark:text-cyan-400",     obrigatorio: false },
] as const

type TipoFonte = typeof FONTES[number]["tipo"]

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColabRow {
  nomeNorm:   string
  nome:       string
  cargo:      string
  empresa:    string
  regiao:     string
  isMotorista: boolean
  // Performaxxi
  perf_pct:   number; perf_bonif: number; perf_dias: number; perf_dias44: number
  perf_falhasRaio: number; perf_falhasSLA: number; perf_falhasTempo: number
  // vFleet
  vfl_pct:    number; vfl_bonif: number; vfl_dias: number; vfl_scoreRisco: number
  vfl_falhasVel: number; vfl_falhasCurva: number; vfl_semCinto: number; vfl_celular: number; vfl_fadiga: number
  // Faturamento/Devoluções
  fat_total:  number; fat_dev: number; pct_dev_fat: number; pct_dev_nfe: number
  fat_nfes:   number; fat_nfes_dev: number
  // Ponto
  dias_uteis: number; presencas: number; faltas: number; justificados: number; pct_abs: number
  // Entregas
  entregas:   number; peso_kg: number; km: number; viagens: number
}

type ActiveTab = "consolidado" | "detalhado"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normNome(s: any): string {
  let r = String(s ?? "").toUpperCase().trim()
  r = r.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  r = r.replace(/[^A-Z0-9\s]/g, "").replace(/\s+/g, " ").trim()
  return r
}

function toNum(v: any): number {
  try { return parseFloat(String(v ?? "").replace(",", ".").trim()) || 0 } catch { return 0 }
}

function fmtRS(n: number) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtPct(n: number, dec = 1) { return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%" }
function fmtNum(n: number) { return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) }

// ─── Processamento ────────────────────────────────────────────────────────────

function processar(arquivos: Map<TipoFonte, any[]>): ColabRow[] {
  const funcRaw = arquivos.get("funcionarios") ?? []
  const perfRaw = arquivos.get("performaxxi")  ?? []
  const vflRaw  = arquivos.get("vfleet")       ?? []
  const fatRaw  = arquivos.get("faturamento")  ?? []
  const pontoRaw = arquivos.get("ponto")       ?? []
  const entRaw  = arquivos.get("entregas")     ?? []

  // Mapa de funcionários (filtro base)
  const funcMap = new Map<string, any>()
  for (const r of funcRaw) {
    const n = normNome(r["NOME"] ?? r["Nome"] ?? "")
    if (n) funcMap.set(n, r)
  }
  if (!funcMap.size) throw new Error("Arquivo de Funcionários vazio ou sem coluna NOME.")

  // Performaxxi — coluna "Motorista" (usa tanto para mot quanto ajudante)
  const perfMap = new Map<string, any>()
  for (const r of perfRaw) {
    const n = normNome(r["Motorista"] ?? r["MOTORISTA"] ?? "")
    if (n && funcMap.has(n)) perfMap.set(n, r)
  }

  // vFleet — coluna "Motorista"
  const vflMap = new Map<string, any>()
  for (const r of vflRaw) {
    const n = normNome(r["Motorista"] ?? r["MOTORISTA"] ?? "")
    if (n && funcMap.has(n)) vflMap.set(n, r)
  }

  // Faturamento/Devoluções — coluna "Colaborador"
  const fatMap = new Map<string, any>()
  for (const r of fatRaw) {
    const n = normNome(r["Colaborador"] ?? r["COLABORADOR"] ?? "")
    if (n && funcMap.has(n)) fatMap.set(n, r)
  }

  // Ponto — coluna "Nome", agrega por colaborador
  const pontoMap = new Map<string, { total: number; presenca: number; falta: number; justificado: number }>()
  for (const r of pontoRaw) {
    const n = normNome(r["Nome"] ?? r["NOME"] ?? "")
    if (!n || !funcMap.has(n)) continue
    if (!pontoMap.has(n)) pontoMap.set(n, { total: 0, presenca: 0, falta: 0, justificado: 0 })
    const d = pontoMap.get(n)!
    d.total++
    const tipo = String(r["Tipo_Presenca"] ?? "").trim()
    if (tipo === "Presença Física") d.presenca++
    else if (tipo === "Falta") d.falta++
    else if (["Atestado","Férias","Auxílio Doença","Acidente Trabalho","ABONO"].includes(tipo)) d.justificado++
  }

  // Entregas — agrega por MOTORISTA, AJUDANTE, AJUDANTE 2
  const entMap = new Map<string, { entregas: number; peso: number; km: number; viagens: number; filial: string; regiao: string }>()
  for (const r of entRaw) {
    const mot = normNome(r["MOTORISTA"] ?? "")
    if (mot && mot.toLowerCase().startsWith("motorista padrao")) continue
    for (const col of ["MOTORISTA", "AJUDANTE", "AJUDANTE 2"]) {
      const n = normNome(r[col] ?? "")
      if (!n || !funcMap.has(n)) continue
      if (!entMap.has(n)) entMap.set(n, { entregas: 0, peso: 0, km: 0, viagens: 0, filial: "", regiao: "" })
      const d = entMap.get(n)!
      d.entregas += toNum(r["ENTREGAS"])
      d.peso     += toNum(r["PESO"])
      d.km       += toNum(r["KM"])
      d.viagens++
      if (!d.filial) { d.filial = String(r["FILIAL"] ?? ""); d.regiao = String(r["REGIÃO"] ?? r["REGIAO"] ?? "") }
    }
  }

  // Todos os nomes que aparecem em pelo menos uma fonte (além do cadastro)
  const todosCandidatos = new Set<string>()
  for (const n of perfMap.keys()) todosCandidatos.add(n)
  for (const n of vflMap.keys())  todosCandidatos.add(n)
  for (const n of fatMap.keys())  todosCandidatos.add(n)
  for (const n of pontoMap.keys()) todosCandidatos.add(n)
  for (const n of entMap.keys())  todosCandidatos.add(n)

  const rows: ColabRow[] = []
  for (const nomeNorm of todosCandidatos) {
    const f = funcMap.get(nomeNorm)
    if (!f) continue
    const cargo   = String(f["CARGO"] ?? "").toUpperCase()
    const empresa = String(f["EMPRESA"] ?? "")
    const nome    = String(f["NOME"] ?? nomeNorm)

    const p   = perfMap.get(nomeNorm)
    const v   = vflMap.get(nomeNorm)
    const ft  = fatMap.get(nomeNorm)
    const pt  = pontoMap.get(nomeNorm) ?? { total: 0, presenca: 0, falta: 0, justificado: 0 }
    const e   = entMap.get(nomeNorm)   ?? { entregas: 0, peso: 0, km: 0, viagens: 0, filial: "", regiao: "" }

    const isMotorista = !cargo.includes("AJUDANTE")
    const pct_abs = pt.total > 0 ? (pt.falta / pt.total) * 100 : 0

    rows.push({
      nomeNorm, nome, cargo, empresa,
      regiao: e.regiao || String(f["OPERACAO"] ?? ""),
      isMotorista,
      // Performaxxi
      perf_pct:   toNum(p?.["% Desempenho"]),
      perf_bonif: toNum(p?.["Total Bonificação (R$)"]),
      perf_dias:  toNum(p?.["Dias Ativos"]),
      perf_dias44: toNum(p?.["Dias 4/4"]),
      perf_falhasRaio:  toNum(p?.["Falhas Raio"]),
      perf_falhasSLA:   toNum(p?.["Falhas SLA"]),
      perf_falhasTempo: toNum(p?.["Falhas Tempo"]),
      // vFleet
      vfl_pct:    toNum(v?.["% Desempenho"]),
      vfl_bonif:  toNum(v?.["Total Bonificação (R$)"]),
      vfl_dias:   toNum(v?.["Dias Ativos"]),
      vfl_scoreRisco: toNum(v?.["Score Risco"]),
      vfl_falhasVel:  toNum(v?.["Falhas Velocidade"]),
      vfl_falhasCurva: toNum(v?.["Falhas Curva"]),
      vfl_semCinto: toNum(v?.["Total Sem Cinto"]),
      vfl_celular:  toNum(v?.["Total Celular"]),
      vfl_fadiga:   toNum(v?.["Total Fadiga"]),
      // Faturamento
      fat_total:   toNum(ft?.["Faturamento_Total (R$)"]),
      fat_dev:     toNum(ft?.["Faturamento_Devolvido (R$)"]),
      pct_dev_fat: toNum(ft?.["Percentual_Venda_Devolvida"]) * 100,
      pct_dev_nfe: toNum(ft?.["Percentual_Qtd_Notas_Devolvidas"]) * 100,
      fat_nfes:    toNum(ft?.["Total_NFes"]),
      fat_nfes_dev: toNum(ft?.["Total_NFes_Devolvidas"]),
      // Ponto
      dias_uteis:  pt.total,
      presencas:   pt.presenca,
      faltas:      pt.falta,
      justificados: pt.justificado,
      pct_abs,
      // Entregas
      entregas: e.entregas,
      peso_kg:  e.peso,
      km:       e.km,
      viagens:  e.viagens,
    })
  }

  return rows.sort((a, b) => a.nome.localeCompare(b.nome))
}

// ─── Excel export ─────────────────────────────────────────────────────────────

function gerarExcel(rows: ColabRow[], grupo: "motoristas" | "ajudantes") {
  const wb = XLSX.utils.book_new()
  const subset = grupo === "motoristas" ? rows.filter(r => r.isMotorista) : rows.filter(r => !r.isMotorista)

  // Aba consolidada
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subset.map(r => ({
    "Nome": r.nome, "Cargo": r.cargo, "Empresa": r.empresa,
    "Perf. % Desempenho": r.perf_pct, "Perf. Bonificação (R$)": r.perf_bonif,
    "vFleet % Desempenho": r.vfl_pct,  "vFleet Bonificação (R$)": r.vfl_bonif, "vFleet Score Risco": r.vfl_scoreRisco,
    "Fat. Total (R$)": r.fat_total, "Fat. Dev (R$)": r.fat_dev, "% Dev Faturamento": r.pct_dev_fat, "% Dev NFes": r.pct_dev_nfe,
    "Dias Úteis": r.dias_uteis, "Presenças": r.presencas, "Faltas": r.faltas, "% Absenteísmo": r.pct_abs,
    "Entregas": r.entregas, "Peso kg": r.peso_kg, "KM": r.km,
  }))), "Consolidado")

  // Aba detalhada
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subset.map(r => ({
    "Nome": r.nome, "Cargo": r.cargo, "Empresa": r.empresa, "Região": r.regiao,
    // Performaxxi
    "Perf. % Desempenho": r.perf_pct, "Perf. Bonificação (R$)": r.perf_bonif,
    "Perf. Dias Ativos": r.perf_dias, "Perf. Dias 4/4": r.perf_dias44,
    "Perf. Falhas Raio": r.perf_falhasRaio, "Perf. Falhas SLA": r.perf_falhasSLA, "Perf. Falhas Tempo": r.perf_falhasTempo,
    // vFleet
    "vFleet % Desempenho": r.vfl_pct, "vFleet Bonificação (R$)": r.vfl_bonif,
    "vFleet Dias Ativos": r.vfl_dias, "vFleet Score Risco": r.vfl_scoreRisco,
    "vFleet Falhas Vel.": r.vfl_falhasVel, "vFleet Falhas Curva": r.vfl_falhasCurva,
    "vFleet Sem Cinto": r.vfl_semCinto, "vFleet Celular": r.vfl_celular, "vFleet Fadiga": r.vfl_fadiga,
    // Faturamento
    "Fat. Total (R$)": r.fat_total, "Fat. Dev (R$)": r.fat_dev,
    "% Dev Faturamento": r.pct_dev_fat, "% Dev NFes": r.pct_dev_nfe,
    "NFes": r.fat_nfes, "NFes Dev.": r.fat_nfes_dev,
    // Ponto
    "Dias Úteis Ponto": r.dias_uteis, "Presenças": r.presencas,
    "Faltas": r.faltas, "Justificados": r.justificados, "% Absenteísmo": r.pct_abs,
    // Entregas
    "Entregas": r.entregas, "Peso kg": r.peso_kg, "KM": r.km, "Viagens": r.viagens,
  }))), "Detalhado")

  const now = new Date()
  XLSX.writeFile(wb, `Incentivos_${grupo}_${now.getDate().toString().padStart(2,"0")}${(now.getMonth()+1).toString().padStart(2,"0")}${now.getFullYear()}.xlsx`)
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

function PctBadge({ n, inverted = false, zero = "—" }: { n: number; inverted?: boolean; zero?: string }) {
  if (n === 0) return h("span", { className: "text-muted-foreground/30" }, zero)
  const cls = inverted
    ? n > 20 ? "bg-red-100 text-red-700" : n > 10 ? "bg-amber-100 text-amber-700" : n > 5 ? "bg-yellow-100 text-yellow-700" : "bg-emerald-100 text-emerald-700"
    : n >= 80 ? "bg-emerald-100 text-emerald-700" : n >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
  return h("span", { className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", cls) }, fmtPct(n))
}

function RiscoBadge({ score }: { score: number }) {
  if (!score) return dash()
  const cls = score >= 60 ? "bg-red-100 text-red-700" : score >= 30 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
  const label = score >= 60 ? "ALTO" : score >= 30 ? "MÉDIO" : "BAIXO"
  return h("span", { className: cn("text-[10px] font-bold px-2 py-0.5 rounded-full", cls) }, `${label} (${score})`)
}

function MiniBar({ n, max, color = "bg-blue-500" }: { n: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((n / max) * 100, 100) : 0
  return h("div", { className: "flex items-center gap-1.5 justify-center" },
    h("div", { className: "w-12 h-1.5 rounded-full bg-muted overflow-hidden" },
      h("div", { className: cn("h-full rounded-full", color), style: { width: `${pct}%` } })
    ),
    h("span", { className: "text-[10px] font-mono text-muted-foreground w-6 text-right" }, fmtPct(n, 0))
  )
}

// ─── Tabela Consolidada ───────────────────────────────────────────────────────

function TabelaConsolidada({ rows, tipo }: { rows: ColabRow[]; tipo: "motoristas" | "ajudantes" }) {
  const maxFat = Math.max(...rows.map(r => r.fat_total), 1)
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 400px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead([
          "Nome", "Empresa",
          "Perf. %", "Perf. R$",
          ...(tipo === "motoristas" ? ["vFleet %", "vFleet R$", "Risco"] : []),
          "Fat. Total", "Fat. Dev", "% Dev Fat.", "% Dev NFe",
          "Presenças", "Faltas", "% Abs.",
          "Entregas", "Peso kg",
        ]),
        h("tbody", {},
          ...rows.map((r, i) => {
            const hasAlert = r.pct_dev_fat > 15 || r.pct_abs > 10 || (r.isMotorista && r.vfl_scoreRisco >= 60)
            const rc = hasAlert
              ? "bg-red-50/40 hover:bg-red-50 dark:bg-red-950/10 dark:hover:bg-red-950/20"
              : r.perf_pct >= 80 || r.vfl_pct >= 80
              ? "bg-emerald-50/20 hover:bg-emerald-50/40"
              : "bg-background hover:bg-muted/10"
            return h("tr", { key: i, className: cn("border-b transition-colors", rc) },
              h("td", { className: "px-3 py-1.5 text-left font-medium min-w-[180px] whitespace-nowrap" }, r.nome),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground" }, r.empresa || dash()),
              // Performaxxi
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.perf_pct })),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.perf_bonif > 0 ? h("span", { className: "font-bold text-primary" }, `R$\u00A0${fmtRS(r.perf_bonif)}`) : dash()
              ),
              // vFleet (só motoristas)
              ...(tipo === "motoristas" ? [
                h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.vfl_pct })),
                h("td", { className: "px-2 py-1.5 text-center font-mono" },
                  r.vfl_bonif > 0 ? h("span", { className: "font-bold text-primary" }, `R$\u00A0${fmtRS(r.vfl_bonif)}`) : dash()
                ),
                h("td", { className: "px-2 py-1.5 text-center" }, h(RiscoBadge, { score: r.vfl_scoreRisco })),
              ] : []),
              // Faturamento
              h("td", { className: "px-2 py-1.5 text-center" },
                r.fat_total > 0
                  ? h("div", { className: "flex items-center gap-1.5 justify-center" },
                      h("div", { className: "w-12 h-1.5 rounded-full bg-muted overflow-hidden" },
                        h("div", { className: "h-full rounded-full bg-emerald-500", style: { width: `${Math.min(r.fat_total/maxFat*100, 100)}%` } })
                      ),
                      h("span", { className: "text-[10px] font-mono text-emerald-600 font-bold" }, `R$\u00A0${fmtRS(r.fat_total)}`)
                    )
                  : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.fat_dev > 0 ? h("span", { className: "text-red-500 font-bold" }, `R$\u00A0${fmtRS(r.fat_dev)}`) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.pct_dev_fat, inverted: true, zero: "—" })),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.pct_dev_nfe, inverted: true, zero: "—" })),
              // Ponto
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" },
                r.dias_uteis > 0 ? `${r.presencas}/${r.dias_uteis}` : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" },
                r.faltas > 0 ? h("span", { className: "font-bold text-red-500 font-mono" }, r.faltas) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.pct_abs, inverted: true, zero: "—" })),
              // Entregas
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" },
                r.entregas > 0 ? fmtNum(r.entregas) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" },
                r.peso_kg > 0 ? fmtNum(r.peso_kg) : dash()
              ),
            )
          })
        )
      )
    )
  )
}

// ─── Tabela Detalhada ─────────────────────────────────────────────────────────

function TabelaDetalhada({ rows, tipo }: { rows: ColabRow[]; tipo: "motoristas" | "ajudantes" }) {
  return h("div", { className: "rounded-xl border border-border/60 shadow-sm overflow-hidden" },
    h("div", { className: "overflow-auto", style: { maxHeight: "calc(100vh - 400px)" } },
      h("table", { className: "w-full text-[11px]" },
        THead([
          "Nome", "Cargo", "Empresa",
          "Perf.%", "Perf.R$", "Dias P.", "4/4", "F.Raio", "F.SLA", "F.Tempo",
          ...(tipo === "motoristas" ? ["vFl.%", "vFl.R$", "Risco", "F.Vel", "F.Curv", "Cinto", "Cel.", "Fad."] : []),
          "Fat.Total", "Fat.Dev", "%Dev.Fat", "%Dev.NFe", "NFes", "NFes Dev.",
          "Dias", "Pres.", "Falt.", "Just.", "%Abs",
          "Entg.", "Peso kg", "KM",
        ]),
        h("tbody", {},
          ...rows.map((r, i) =>
            h("tr", { key: i, className: "border-b bg-background hover:bg-muted/10 transition-colors" },
              h("td", { className: "px-2 py-1.5 text-left font-medium min-w-[160px] whitespace-nowrap" }, r.nome),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground whitespace-nowrap" }, r.cargo),
              h("td", { className: "px-2 py-1.5 text-center text-[10px] text-muted-foreground" }, r.empresa || dash()),
              // Performaxxi
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.perf_pct })),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.perf_bonif > 0 ? h("span", { className: "font-bold text-primary" }, `R$\u00A0${fmtRS(r.perf_bonif)}`) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.perf_dias || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-emerald-600" }, r.perf_dias44 || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, r.perf_falhasRaio > 0 ? h("span", { className: "text-red-500 font-bold" }, r.perf_falhasRaio) : dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, r.perf_falhasSLA > 0 ? h("span", { className: "text-red-500 font-bold" }, r.perf_falhasSLA) : dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, r.perf_falhasTempo > 0 ? h("span", { className: "text-red-500 font-bold" }, r.perf_falhasTempo) : dash()),
              // vFleet (só motoristas)
              ...(tipo === "motoristas" ? [
                h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.vfl_pct })),
                h("td", { className: "px-2 py-1.5 text-center font-mono" },
                  r.vfl_bonif > 0 ? h("span", { className: "font-bold text-primary" }, `R$\u00A0${fmtRS(r.vfl_bonif)}`) : dash()
                ),
                h("td", { className: "px-2 py-1.5 text-center" }, h(RiscoBadge, { score: r.vfl_scoreRisco })),
                h("td", { className: "px-2 py-1.5 text-center" }, r.vfl_falhasVel > 0 ? h("span", { className: "text-red-500 font-bold" }, r.vfl_falhasVel) : dash()),
                h("td", { className: "px-2 py-1.5 text-center" }, r.vfl_falhasCurva > 0 ? h("span", { className: "text-amber-600 font-bold" }, r.vfl_falhasCurva) : dash()),
                h("td", { className: "px-2 py-1.5 text-center" }, r.vfl_semCinto > 0 ? h("span", { className: "text-amber-600 font-bold" }, r.vfl_semCinto) : dash()),
                h("td", { className: "px-2 py-1.5 text-center" }, r.vfl_celular > 0 ? h("span", { className: "text-red-500 font-bold" }, r.vfl_celular) : dash()),
                h("td", { className: "px-2 py-1.5 text-center" }, r.vfl_fadiga > 0 ? h("span", { className: "text-red-500 font-bold" }, r.vfl_fadiga) : dash()),
              ] : []),
              // Faturamento
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.fat_total > 0 ? h("span", { className: "text-emerald-600 font-bold" }, `R$\u00A0${fmtRS(r.fat_total)}`) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.fat_dev > 0 ? h("span", { className: "text-red-500 font-bold" }, `R$\u00A0${fmtRS(r.fat_dev)}`) : dash()
              ),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.pct_dev_fat, inverted: true, zero: "—" })),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.pct_dev_nfe, inverted: true, zero: "—" })),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.fat_nfes || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono" },
                r.fat_nfes_dev > 0 ? h("span", { className: "text-red-500 font-bold" }, r.fat_nfes_dev) : dash()
              ),
              // Ponto
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.dias_uteis || dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.presencas || dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, r.faltas > 0 ? h("span", { className: "font-bold text-red-500" }, r.faltas) : dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, r.justificados > 0 ? h("span", { className: "font-bold text-emerald-600" }, r.justificados) : dash()),
              h("td", { className: "px-2 py-1.5 text-center" }, h(PctBadge, { n: r.pct_abs, inverted: true, zero: "—" })),
              // Entregas
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.entregas > 0 ? fmtNum(r.entregas) : dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.peso_kg > 0 ? fmtNum(r.peso_kg) : dash()),
              h("td", { className: "px-2 py-1.5 text-center font-mono text-muted-foreground" }, r.km > 0 ? fmtNum(r.km) : dash()),
            )
          )
        )
      )
    )
  )
}

// ─── KPI Grid ─────────────────────────────────────────────────────────────────

function KpiGrid({ rows, tipo }: { rows: ColabRow[]; tipo: "motoristas" | "ajudantes" }) {
  const total     = rows.length
  const totalFat  = rows.reduce((s, r) => s + r.fat_total, 0)
  const totalDev  = rows.reduce((s, r) => s + r.fat_dev, 0)
  const pctDev    = totalFat > 0 ? (totalDev / totalFat) * 100 : 0
  const perfBonus = rows.reduce((s, r) => s + r.perf_bonif, 0)
  const vflBonus  = rows.reduce((s, r) => s + r.vfl_bonif, 0)
  const totalFaltas = rows.reduce((s, r) => s + r.faltas, 0)
  const comFaltas = rows.filter(r => r.faltas > 0).length
  const riscaAlto = rows.filter(r => r.vfl_scoreRisco >= 60).length
  const perfBons  = rows.filter(r => r.perf_pct >= 80).length
  const semPerf   = rows.filter(r => r.perf_dias === 0).length

  const kpis = [
    { label: tipo === "motoristas" ? "Motoristas" : "Ajudantes", value: `${total}`,              color: "text-primary",     icon: Users },
    { label: "Faturamento Total",   value: `R$\u00A0${fmtRS(totalFat)}`,                          color: "text-emerald-600", icon: DollarSign },
    { label: `Fat. Dev (${fmtPct(pctDev)})`, value: `R$\u00A0${fmtRS(totalDev)}`,               color: pctDev > 10 ? "text-red-500" : "text-amber-600", icon: TrendingDown },
    { label: "Bônus Performaxxi",   value: `R$\u00A0${fmtRS(perfBonus)}`,                         color: "text-blue-600",    icon: Target },
    ...(tipo === "motoristas" ? [
      { label: "Bônus vFleet",      value: `R$\u00A0${fmtRS(vflBonus)}`,                          color: "text-orange-600",  icon: Truck },
      { label: "Risco Alto vFleet", value: `${riscaAlto}`,                                        color: riscaAlto > 0 ? "text-red-500" : "text-emerald-600", icon: AlertTriangle },
    ] : []),
    { label: "Perf. ≥ 80%",        value: `${perfBons} / ${total}`,                              color: "text-emerald-600", icon: Star },
    { label: "Sem Dados Performaxxi", value: `${semPerf}`,                                        color: semPerf > 0 ? "text-amber-600" : "text-muted-foreground", icon: Activity },
    { label: "Com Faltas",          value: `${comFaltas} (${totalFaltas} dias)`,                  color: totalFaltas > 0 ? "text-red-500" : "text-emerald-600", icon: Clock },
  ]

  return h("div", { className: "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2 mb-4" },
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

// ─── Painel principal com abas Mot/Aju ───────────────────────────────────────

function Dashboard({ rows }: { rows: ColabRow[] }) {
  const [grupo, setGrupo]     = React.useState<"motoristas" | "ajudantes">("motoristas")
  const [tabela, setTabela]   = React.useState<ActiveTab>("consolidado")
  const [search, setSearch]   = React.useState("")
  const [empresaFiltro, setEmpresaFiltro] = React.useState("")

  const motoristas = React.useMemo(() => rows.filter(r => r.isMotorista), [rows])
  const ajudantes  = React.useMemo(() => rows.filter(r => !r.isMotorista), [rows])
  const subRows    = grupo === "motoristas" ? motoristas : ajudantes

  const empresas = React.useMemo(() => Array.from(new Set(subRows.map(r => r.empresa).filter(Boolean))).sort(), [subRows])

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return subRows.filter(r =>
      (!q || r.nome.toLowerCase().includes(q)) &&
      (!empresaFiltro || r.empresa === empresaFiltro)
    )
  }, [subRows, search, empresaFiltro])

  return h("div", { className: "space-y-4" },

    // Seletor Motoristas / Ajudantes
    h("div", { className: "flex items-center gap-3 flex-wrap" },
      h("div", { className: "flex border border-border/60 rounded-xl overflow-hidden bg-muted/10 p-0.5 gap-0.5" },
        ...(["motoristas", "ajudantes"] as const).map(g =>
          h("button", {
            key: g,
            onClick: () => { setGrupo(g); setSearch(""); setEmpresaFiltro("") },
            className: cn(
              "flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-all",
              grupo === g
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )
          },
            h(g === "motoristas" ? Truck : Users, { className: "size-4" }),
            g === "motoristas"
              ? `Motoristas (${motoristas.length})`
              : `Ajudantes (${ajudantes.length})`
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
        className: "flex-1 min-w-[180px] max-w-xs h-8 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-primary",
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

    // KPIs do grupo atual
    h(KpiGrid, { rows: subRows, tipo: grupo }),

    // Tabela
    tabela === "consolidado"
      ? h(TabelaConsolidada, { rows: filtered, tipo: grupo })
      : h(TabelaDetalhada,   { rows: filtered, tipo: grupo })
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function IncentivoVeraoPipelineView() {
  const [files, setFiles]       = React.useState<{ data: any[]; nome: string; tipo: TipoFonte }[]>([])
  const [loading, setLoading]   = React.useState(false)
  const [rows, setRows]         = React.useState<ColabRow[] | null>(null)
  const { toast }               = useToast()
  const [boletimAberto, setBoletimAberto] = React.useState(false)

  async function lerArquivo(file: File): Promise<any[]> {
    const nome = file.name.toLowerCase()
    if (nome.endsWith(".json")) {
      const raw = JSON.parse(await file.text())
      if (Array.isArray(raw)) return raw
      const vals = Object.entries(raw as Record<string, any>)
        .filter(([k]) => !["acumulado"].includes(k.toLowerCase()))
        .map(([, v]) => v)
      return (vals.flat() as any[])
    }
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: "array", cellDates: false })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[]
  }

  function detectarTipo(nome: string): TipoFonte {
    const n = nome.toLowerCase()
    if (/funcionari/i.test(n))                         return "funcionarios"
    if (/performaxxi|performaxi/i.test(n))             return "performaxxi"
    if (/desempenho|vfleet|motorist/i.test(n))         return "vfleet"
    if (/faturamento.*dev|fatdev|fat.*dev/i.test(n))   return "faturamento"
    if (/ponto|apuracao|apuração/i.test(n))            return "ponto"
    if (/entrega|controle/i.test(n))                   return "entregas"
    return "entregas"
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    for (const file of Array.from(e.target.files || [])) {
      try {
        const data = await lerArquivo(file)
        const tipo = detectarTipo(file.name)
        setFiles(prev => {
          // Substitui se já existe o mesmo tipo
          const filtered = prev.filter(f => f.tipo !== tipo)
          return [...filtered, { data, nome: file.name, tipo }]
        })
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro ao ler arquivo", description: `${file.name}: ${err.message}` })
      }
    }
    e.target.value = ""
  }

  function analisar() {
    const funcFile = files.find(f => f.tipo === "funcionarios")
    if (!funcFile) {
      toast({ variant: "destructive", title: "Arquivo obrigatório", description: "Selecione o arquivo de Funcionários." })
      return
    }
    setLoading(true)
    setTimeout(() => {
      try {
        const arquivos = new Map<TipoFonte, any[]>()
        for (const f of files) arquivos.set(f.tipo, f.data)
        const result = processar(arquivos)
        setRows(result)
        const mot = result.filter(r => r.isMotorista).length
        const aju = result.filter(r => !r.isMotorista).length
        toast({ title: "Análise concluída", description: `${mot} motoristas · ${aju} ajudantes processados` })
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro na análise", description: err.message })
      } finally { setLoading(false) }
    }, 60)
  }

  const tipoTag: Record<TipoFonte, string> = {
    funcionarios: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    performaxxi:  "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    vfleet:       "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
    faturamento:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    ponto:        "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400",
    entregas:     "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  }
  const tipoNome: Record<TipoFonte, string> = {
    funcionarios: "Funcionários", performaxxi: "Performaxxi", vfleet: "vFleet",
    faturamento: "Fat. Dev", ponto: "Ponto", entregas: "Entregas",
  }

  // Se já tem resultado, mostra o dashboard diretamente
  if (rows) {
    if (boletimAberto) {
      return h("div", { className: "space-y-4" },
        h(Button, {
          variant: "outline",
          size: "sm",
          className: "h-8 text-xs gap-1.5",
          onClick: () => setBoletimAberto(false)
        }, "Voltar ao Dashboard de Incentivos"),
        h(BoletimPipelineView, { initialFiles: files as any })
      )
    }

    return h("div", { className: "space-y-6" },
      h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3" },
        h("div", { className: "flex items-start gap-3" },
          h(Target, { className: "size-4 text-primary shrink-0 mt-0.5" }),
          h("div", { className: "text-sm text-muted-foreground" },
            h("span", { className: "font-semibold text-foreground" }, "Dashboard de Incentivos "),
            "— Consolidação de ",
            h("strong", {}, "Performaxxi · vFleet · Faturamento · Ponto · Entregas"),
            " por colaborador. Apenas funcionários do cadastro."
          )
        ),
        h("div", { className: "flex items-center gap-2 shrink-0" },
          h(Button, {
            variant: "outline" as const, size: "sm" as const,
            className: "h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10",
            onClick: () => setBoletimAberto(true)
          }, h(Users, { className: "size-3.5" }), `Boletins (${rows.length})`),
          h(Button, {
            variant: "outline" as const, size: "sm" as const, className: "h-8 text-xs gap-1.5",
            onClick: () => setRows(null)
          }, h(Upload, { className: "size-3.5" }), "Trocar arquivos")
        )
      ),
      h(Dashboard, { rows })
    )
  }

  // Tela de upload
  return h("div", { className: "space-y-6" },

    // Banner
    h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-start gap-3" },
      h(Target, { className: "size-4 text-primary shrink-0 mt-0.5" }),
      h("div", { className: "text-sm text-muted-foreground" },
        h("span", { className: "font-semibold text-foreground" }, "Dashboard de Incentivos "),
        "— Consolida ",
        h("strong", {}, "Performaxxi · vFleet · Faturamento & Devoluções · Ponto · Entregas"),
        " em uma visão unificada por ",
        h("strong", {}, "Motorista e Ajudante"),
        ". Apenas colaboradores presentes no cadastro de funcionários serão exibidos."
      )
    ),

    // Upload card
    h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
      h("div", { className: "px-4 py-3 border-b border-border/60 bg-muted/10 flex items-center gap-2" },
        h(Package, { className: "size-4 text-primary" }),
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Arquivos de Entrada")
      ),
      h("div", { className: "p-4 space-y-4" },

        // Drop zone
        h("div", {
          className: cn(
            "border-2 border-dashed rounded-xl bg-muted/10 min-h-[110px] flex flex-col items-center justify-center p-4 cursor-pointer transition-colors",
            "hover:border-primary/40 hover:bg-muted/20"
          ),
          onClick: () => document.getElementById("incentivo-input")?.click()
        },
          h("input", { id: "incentivo-input", type: "file", multiple: true, className: "hidden", onChange: handleFileChange }),
          files.length === 0
            ? h("div", { className: "text-center space-y-1.5" },
                h(FileCode, { className: "size-8 mx-auto opacity-20" }),
                h("p", { className: "text-xs text-muted-foreground italic" }, "Funcionario · Performaxxi · Desempenho_Motoristas · FaturamentoDev · Ponto · Entregas"),
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

        // Fontes guide
        h("div", { className: "grid grid-cols-3 md:grid-cols-6 gap-1.5" },
          ...FONTES.map((fonte, i) => {
            const carregado = files.some(f => f.tipo === fonte.tipo)
            return h("div", { key: i, className: cn(
              "flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] transition-all",
              carregado ? fonte.cls + " ring-1 ring-current ring-opacity-30" : "bg-muted/20 border-border/40 text-muted-foreground"
            )},
              h("div", { className: cn("size-1.5 rounded-full mt-1 shrink-0", carregado ? "bg-current" : "bg-muted-foreground/30") }),
              h("div", {},
                h("div", { className: cn("font-bold leading-tight flex items-center gap-1") },
                  fonte.label,
                  fonte.obrigatorio && h("span", { className: "text-[8px] font-bold opacity-60" }, "★"),
                  carregado && h(CheckCircle2, { className: "size-2.5 ml-0.5" })
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
              ? h(React.Fragment, {}, h(Loader2, { className: "mr-1.5 size-3.5 animate-spin" }), "Processando...")
              : h(React.Fragment, {}, h(BarChart3, { className: "mr-1.5 size-3.5" }), "Analisar Incentivos")
          )
        ),

        !files.some(f => f.tipo === "funcionarios") && files.length > 0 &&
          h("div", { className: "flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-900" },
            h(AlertTriangle, { className: "size-3.5 shrink-0" }),
            "O arquivo de Funcionários é obrigatório — ele define quem aparece no dashboard."
          )
      )
    )
  )
}
