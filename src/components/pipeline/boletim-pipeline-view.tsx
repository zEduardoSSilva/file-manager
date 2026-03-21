"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  Upload, FileCode, Trash2, ChevronRight, Users, Package,
  AlertTriangle, CheckCircle2, Truck, Target, Clock, Loader2, BarChart3,
  TrendingDown, Award, Search, X, ChevronDown, ChevronUp,
  Printer, Calendar, Star, Zap, Shield, Activity, AlertCircle,
  ArrowRight, Circle, CheckCircle, XCircle, Minus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn }    from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

const h = React.createElement

// ─── Regras (idênticas ao incentivo-dashboard) ────────────────────────────────

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
const REGRAS_MOT_BV = {
  absenteismo: [[100, 50.00], [90, 40.00], [75, 25.00]] as [number,number][],
  performance: [[100, 100.00], [90, 80.00], [75, 50.00]] as [number,number][],
  dev_valor:   [[0.0200, 50.00], [0.0220, 40.00], [0.0250, 25.00]] as [number,number][],
  dev_nf:      [[0.0500, 50.00], [0.0550, 40.00], [0.0625, 25.00]] as [number,number][],
  maximo: 250,
}
const EMPRESAS_BV = new Set(["BV01", "BV02"])
function getRegras(isMotorista: boolean, empresa: string) {
  const isBV = EMPRESAS_BV.has(empresa.toUpperCase().trim())
  return isMotorista ? (isBV ? REGRAS_MOT_BV : REGRAS_MOT) : REGRAS_AJU
}
function calcAting(pct: number, faixas: [number,number][]): number {
  if (isNaN(pct)) return 0
  for (const [l, v] of [...faixas].sort((a,b) => b[0]-a[0])) if (pct >= l) return v
  return 0
}
function calcDev(pct: number, faixas: [number,number][]): number {
  if (isNaN(pct)) return 0
  for (const [l, v] of [...faixas].sort((a,b) => a[0]-b[0])) if (pct <= l) return v
  return 0
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoFonte = "funcionarios" | "ponto" | "vfleet" | "performaxxi" | "faturamento"

interface DiaDetalhe {
  data: string
  diaSemana: string
  tipo: string      // "Presença Física" | "Falta" | "Atestado" | etc
  entrada?: string
  saida?: string
  horaExtra?: string
  intervalo?: string
  marcacoes: number
}

interface ColabBoletim {
  nomeNorm:    string
  nome:        string
  cargo:       string
  empresa:     string
  isMotorista: boolean

  // Absenteísmo
  dias_uteis:  number
  presencas:   number
  faltas:      number
  justificados: number
  pct_abs:     number
  val_abs:     number
  diasDetalhe: DiaDetalhe[]

  // Performance (vFleet ou Performaxxi)
  pct_perf:      number
  val_perf:      number
  perf_dias:     number
  perf_dias_ok:  number
  // vFleet extra
  vfl_distancia: number
  vfl_falhasVel: number
  vfl_falhasCurva: number
  vfl_banguela:  number
  vfl_ocioso:    number
  vfl_semCinto:  number
  vfl_celular:   number
  vfl_fadiga:    number
  vfl_score:     number
  // Performaxxi extra
  perf_pedidos:  number
  perf_pesoTotal: number
  perf_pesoDev:  number
  perf_falhasRaio: number
  perf_falhasSLA:  number
  perf_falhasTempo: number

  // Faturamento / Devolução
  fat_total:    number
  fat_dev:      number
  fat_nfes:     number
  fat_nfes_dev: number
  pct_dev_val:  number
  pct_dev_nfe:  number
  val_dev_val:  number
  val_dev_nfe:  number

  // Incentivo
  total:    number
  maximo:   number
  pct_total: number

  // Período
  periodoLabel: string
}

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
function fmtRS(n: number) { return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtPct(n: number, dec = 1) { return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%" }
function fmtNum(n: number) { return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) }

function initials(nome: string): string {
  const parts = nome.trim().split(" ").filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function statusFaixa(pct: number, tipo: "ating" | "dev"): "otimo" | "bom" | "regular" | "ruim" | "sem" {
  if (isNaN(pct) || pct === 0 && tipo === "ating") return "sem"
  if (tipo === "ating") {
    if (pct >= 100) return "otimo"
    if (pct >= 90)  return "bom"
    if (pct >= 75)  return "regular"
    return "ruim"
  } else {
    const p = pct * 100
    if (p <= 2)   return "otimo"
    if (p <= 2.5) return "bom"
    if (p <= 5)   return "regular"
    return "ruim"
  }
}

const STATUS_CONFIG = {
  otimo:   { label: "Ótimo",   cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: CheckCircle },
  bom:     { label: "Bom",     cls: "bg-blue-100 text-blue-700 border-blue-200",           dot: "bg-blue-500",   icon: CheckCircle2 },
  regular: { label: "Regular", cls: "bg-amber-100 text-amber-700 border-amber-200",        dot: "bg-amber-500",  icon: Minus },
  ruim:    { label: "Abaixo",  cls: "bg-red-100 text-red-700 border-red-200",               dot: "bg-red-500",    icon: XCircle },
  sem:     { label: "Sem dado",cls: "bg-muted/30 text-muted-foreground border-border",      dot: "bg-muted",      icon: Circle },
}

// ─── Processamento ────────────────────────────────────────────────────────────

function processar(arqs: Map<TipoFonte, any[]>): ColabBoletim[] {
  const funcRaw  = arqs.get("funcionarios") ?? []
  const pontoRaw = arqs.get("ponto")        ?? []
  const vflRaw   = arqs.get("vfleet")       ?? []
  const perfRaw  = arqs.get("performaxxi")  ?? []
  const fatRaw   = arqs.get("faturamento")  ?? []

  if (!funcRaw.length) throw new Error("Arquivo de Funcionários vazio.")

  const funcMap = new Map<string, any>()
  for (const r of funcRaw) {
    const n = normNome(r["NOME"] ?? r["Nome"] ?? "")
    if (n) funcMap.set(n, r)
  }

  const vflMap  = new Map<string, any>()
  for (const r of vflRaw) {
    const n = normNome(r["Motorista"] ?? r["MOTORISTA"] ?? "")
    if (n && funcMap.has(n)) vflMap.set(n, r)
  }

  const perfMap = new Map<string, any>()
  for (const r of perfRaw) {
    const n = normNome(r["Motorista"] ?? r["MOTORISTA"] ?? "")
    if (n && funcMap.has(n)) perfMap.set(n, r)
  }

  const fatMap  = new Map<string, any>()
  for (const r of fatRaw) {
    const n = normNome(r["Colaborador"] ?? r["COLABORADOR"] ?? "")
    if (n && funcMap.has(n)) fatMap.set(n, r)
  }

  // Ponto — agrega dias com detalhe completo
  const pontoMap = new Map<string, { dias: DiaDetalhe[]; total: number; presenca: number; falta: number; justificado: number }>()
  for (const r of pontoRaw) {
    const n = normNome(r["Nome"] ?? r["NOME"] ?? "")
    if (!n || !funcMap.has(n)) continue
    if (!pontoMap.has(n)) pontoMap.set(n, { dias: [], total: 0, presenca: 0, falta: 0, justificado: 0 })
    const d = pontoMap.get(n)!
    d.total++
    const tipo = String(r["Tipo_Presenca"] ?? "").trim()
    if (tipo === "Presença Física") d.presenca++
    else if (tipo === "Falta") d.falta++
    else if (["Atestado","Férias","Auxílio Doença","Acidente Trabalho","ABONO"].includes(tipo)) d.justificado++

    d.dias.push({
      data:      String(r["Data"] ?? ""),
      diaSemana: String(r["Dia_Semana"] ?? ""),
      tipo,
      entrada:   String(r["Entrada"] ?? "") || undefined,
      saida:     String(r["Saida"] ?? "") || undefined,
      horaExtra: String(r["Hora_Extra"] ?? "") || undefined,
      intervalo: String(r["Intervalo_Almoco"] ?? "") || undefined,
      marcacoes: toNum(r["Qtd_Marcacoes"]),
    })
  }

  // Detecta período do ponto
  const todasDatas = pontoRaw.map(r => String(r["Data"] ?? "")).filter(Boolean)
  const periodoLabel = todasDatas.length > 0
    ? `${todasDatas[0]} a ${todasDatas[todasDatas.length - 1]}`
    : "Período atual"

  // Todos candidatos
  const candidatos = new Set<string>()
  for (const n of vflMap.keys())   candidatos.add(n)
  for (const n of perfMap.keys())  candidatos.add(n)
  for (const n of fatMap.keys())   candidatos.add(n)
  for (const n of pontoMap.keys()) candidatos.add(n)

  const rows: ColabBoletim[] = []
  for (const nk of candidatos) {
    const f = funcMap.get(nk)
    if (!f) continue

    const cargo       = String(f["CARGO"] ?? "").toUpperCase()
    const empresa     = String(f["EMPRESA"] ?? "")
    const nome        = String(f["NOME"] ?? nk)
    const isMotorista = !cargo.includes("AJUDANTE")
    const regras      = getRegras(isMotorista, empresa)

    const pt = pontoMap.get(nk)
    const pct_abs = pt && pt.total > 0 ? (pt.presenca / pt.total) * 100 : NaN
    const val_abs = calcAting(isNaN(pct_abs) ? NaN : pct_abs, regras.absenteismo)

    let pct_perf = NaN, perf_dias = 0, perf_dias_ok = 0
    let vfl_distancia = 0, vfl_falhasVel = 0, vfl_falhasCurva = 0, vfl_banguela = 0
    let vfl_ocioso = 0, vfl_semCinto = 0, vfl_celular = 0, vfl_fadiga = 0, vfl_score = 0
    let perf_pedidos = 0, perf_pesoTotal = 0, perf_pesoDev = 0
    let perf_falhasRaio = 0, perf_falhasSLA = 0, perf_falhasTempo = 0

    if (isMotorista) {
      const v = vflMap.get(nk)
      if (v) {
        pct_perf        = toNum(v["% Desempenho"])
        perf_dias       = toNum(v["Dias Ativos"])
        perf_dias_ok    = toNum(v["Dias Bonificados"])
        vfl_distancia   = toNum(v["Distância Total (km)"] ?? v["Distancia Total (km)"])
        vfl_falhasVel   = toNum(v["Falhas Velocidade"])
        vfl_falhasCurva = toNum(v["Falhas Curva"])
        vfl_banguela    = toNum(v["Falhas Banguela"])
        vfl_ocioso      = toNum(v["Falhas Ociosidade"])
        vfl_semCinto    = toNum(v["Total Sem Cinto"])
        vfl_celular     = toNum(v["Total Celular"])
        vfl_fadiga      = toNum(v["Total Fadiga"])
        vfl_score       = toNum(v["Score Risco"])
      }
    } else {
      const p = perfMap.get(nk)
      if (p) {
        pct_perf          = toNum(p["% Desempenho"])
        perf_dias         = toNum(p["Dias Ativos"])
        perf_dias_ok      = toNum(p["Dias 4/4"])
        perf_pedidos      = toNum(p["Total Pedidos"])
        perf_pesoTotal    = toNum(p["Peso Total (kg)"])
        perf_pesoDev      = toNum(p["Peso Devolvido (kg)"])
        perf_falhasRaio   = toNum(p["Falhas Raio"])
        perf_falhasSLA    = toNum(p["Falhas SLA"])
        perf_falhasTempo  = toNum(p["Falhas Tempo"])
      }
    }

    const val_perf = calcAting(pct_perf, regras.performance)

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
      dias_uteis: pt?.total ?? 0,
      presencas:  pt?.presenca ?? 0,
      faltas:     pt?.falta ?? 0,
      justificados: pt?.justificado ?? 0,
      pct_abs, val_abs,
      diasDetalhe: pt?.dias ?? [],
      pct_perf, val_perf, perf_dias, perf_dias_ok,
      vfl_distancia, vfl_falhasVel, vfl_falhasCurva, vfl_banguela,
      vfl_ocioso, vfl_semCinto, vfl_celular, vfl_fadiga, vfl_score,
      perf_pedidos, perf_pesoTotal, perf_pesoDev,
      perf_falhasRaio, perf_falhasSLA, perf_falhasTempo,
      fat_total:    ft ? toNum(ft["Faturamento_Total (R$)"])     : 0,
      fat_dev:      ft ? toNum(ft["Faturamento_Devolvido (R$)"]) : 0,
      fat_nfes:     ft ? toNum(ft["Total_NFes"])                 : 0,
      fat_nfes_dev: ft ? toNum(ft["Total_NFes_Devolvidas"])      : 0,
      pct_dev_val, pct_dev_nfe, val_dev_val, val_dev_nfe,
      total, maximo, pct_total, periodoLabel,
    })
  }

  return rows.sort((a, b) => a.nome.localeCompare(b.nome))
}

// ─── Componente de boletim individual ────────────────────────────────────────

function BoletimIndividual({ colab, onFechar }: { colab: ColabBoletim; onFechar: () => void }) {
  const [abaAtiva, setAbaAtiva] = React.useState<"resumo" | "ponto" | "performance" | "devolucao">("resumo")

  const perfLabel = colab.isMotorista ? "vFleet" : "Performaxxi"
  const devLabel  = (pct: number) => {
    if (isNaN(pct)) return "Sem dado"
    const p = pct * 100
    return p <= 2 ? "Excelente" : p <= 2.5 ? "Bom" : p <= 5 ? "Atenção" : "Crítico"
  }

  // Gauge circular simples
  function Gauge({ pct, size = 80, cor }: { pct: number; size?: number; cor: string }) {
    const r = size / 2 - 8
    const circ = 2 * Math.PI * r
    const stroke = isNaN(pct) ? 0 : Math.min(pct / 100, 1) * circ
    return h("svg", { width: size, height: size, style: { transform: "rotate(-90deg)" } },
      h("circle", { cx: size/2, cy: size/2, r, fill: "none", stroke: "hsl(var(--muted))", strokeWidth: 6 }),
      h("circle", { cx: size/2, cy: size/2, r, fill: "none", stroke: cor, strokeWidth: 6,
        strokeDasharray: circ, strokeDashoffset: circ - stroke,
        strokeLinecap: "round", style: { transition: "stroke-dashoffset 0.8s ease" }
      })
    )
  }

  function CriterioCard({
    label, pct, valor, maxValor, tipo = "ating", detalhes
  }: {
    label: string; pct: number; valor: number; maxValor: number
    tipo?: "ating" | "dev"; detalhes?: string
  }) {
    const st = statusFaixa(pct, tipo)
    const cfg = STATUS_CONFIG[st]
    const IconSt = cfg.icon
    const pctNum = tipo === "dev" && !isNaN(pct) ? pct * 100 : pct
    const corGauge = st === "otimo" ? "#10b981" : st === "bom" ? "#3b82f6" : st === "regular" ? "#f59e0b" : st === "ruim" ? "#ef4444" : "#94a3b8"

    return h("div", { className: "rounded-xl border border-border/60 bg-card overflow-hidden" },
      // Header
      h("div", { className: cn("px-4 py-2.5 border-b border-border/40 flex items-center justify-between", cfg.cls) },
        h("span", { className: "text-[10px] font-bold uppercase tracking-widest" }, label),
        h("div", { className: "flex items-center gap-1" },
          h(IconSt, { className: "size-3.5" }),
          h("span", { className: "text-[10px] font-bold" }, cfg.label)
        )
      ),
      // Corpo
      h("div", { className: "px-4 py-4 flex items-center gap-4" },
        // Gauge
        h("div", { className: "relative shrink-0", style: { width: 72, height: 72 } },
          h(Gauge, { pct: pctNum, size: 72, cor: corGauge }),
          h("div", { className: "absolute inset-0 flex flex-col items-center justify-center" },
            h("span", { className: "text-[11px] font-bold font-mono leading-tight", style: { color: corGauge } },
              isNaN(pct) ? "—" : fmtPct(pctNum, 0)
            )
          )
        ),
        // Info
        h("div", { className: "flex-1 min-w-0" },
          h("div", { className: "text-xs text-muted-foreground mb-1" },
            isNaN(pct) ? "Sem dados neste período" : detalhes
          ),
          // Barra de incentivo
          h("div", { className: "mt-2" },
            h("div", { className: "flex items-center justify-between mb-1" },
              h("span", { className: "text-[10px] text-muted-foreground" }, "Bônus conquistado"),
              h("span", { className: cn("text-[11px] font-bold font-mono", valor > 0 ? "text-primary" : "text-muted-foreground/40") },
                `R$\u00A0${fmtRS(valor)}`
              )
            ),
            h("div", { className: "h-1.5 rounded-full bg-muted overflow-hidden" },
              h("div", {
                className: cn("h-full rounded-full transition-all", valor >= maxValor ? "bg-emerald-500" : "bg-primary"),
                style: { width: `${maxValor > 0 ? (valor / maxValor) * 100 : 0}%` }
              })
            ),
            h("div", { className: "flex justify-between mt-0.5" },
              h("span", { className: "text-[9px] text-muted-foreground" }, "R$ 0"),
              h("span", { className: "text-[9px] text-muted-foreground" }, `R$\u00A0${fmtRS(maxValor)}`)
            )
          )
        )
      )
    )
  }

  function TagDia({ dia }: { dia: DiaDetalhe }) {
    const isPres  = dia.tipo === "Presença Física"
    const isFalta = dia.tipo === "Falta"
    const isJust  = !isPres && !isFalta
    return h("div", {
      className: cn(
        "rounded-lg border px-2.5 py-2 text-[10px] min-w-[90px]",
        isPres  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
        : isFalta ? "bg-red-50 border-red-200 text-red-700"
        : "bg-amber-50 border-amber-200 text-amber-700"
      )
    },
      h("div", { className: "font-bold" }, dia.data),
      h("div", { className: "opacity-75 truncate" }, dia.diaSemana),
      h("div", { className: "mt-1 font-semibold truncate" },
        isPres ? (dia.entrada && dia.saida ? `${dia.entrada} – ${dia.saida}` : "Presente") : dia.tipo
      ),
      isPres && dia.horaExtra && dia.horaExtra !== "00:00" && dia.horaExtra !== "0:00" &&
        h("div", { className: "text-[9px] opacity-75 mt-0.5" }, `HE: ${dia.horaExtra}`)
    )
  }

  const maxCrit = colab.maximo / 4

  return h("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center p-4",
    style: { backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }
  },
    h("div", {
      className: "bg-background rounded-2xl shadow-2xl border border-border/60 w-full overflow-hidden flex flex-col",
      style: { maxWidth: 860, maxHeight: "92vh" }
    },

      // ── Cabeçalho do boletim ──────────────────────────────────────────
      h("div", { className: "relative overflow-hidden" },
        // Fundo com gradiente suave por cargo
        h("div", { className: cn(
          "absolute inset-0",
          colab.isMotorista ? "bg-gradient-to-r from-blue-600 to-indigo-700" : "bg-gradient-to-r from-violet-600 to-purple-700"
        )}),
        // Padrão decorativo
        h("div", { className: "absolute inset-0 opacity-10",
          style: { backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }
        }),
        h("div", { className: "relative px-6 py-5 flex items-start gap-4" },
          // Avatar
          h("div", { className: "size-14 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0 backdrop-blur-sm" },
            h("span", { className: "text-xl font-black text-white tracking-tight" }, initials(colab.nome))
          ),
          // Info
          h("div", { className: "flex-1 min-w-0" },
            h("h2", { className: "text-lg font-black text-white truncate tracking-tight" }, colab.nome),
            h("div", { className: "flex items-center gap-2 mt-0.5 flex-wrap" },
              h("span", { className: "text-xs text-white/80 font-medium" }, colab.cargo),
              h("span", { className: "text-white/40" }, "·"),
              h("span", { className: "text-xs text-white/80 font-medium" }, colab.empresa),
              h("span", { className: "text-white/40" }, "·"),
              h("div", { className: "flex items-center gap-1 text-white/70 text-[10px]" },
                h(Calendar, { className: "size-3" }), colab.periodoLabel
              )
            )
          ),
          // Grupo da direita: Incentivo + Botão fechar
          h("div", { className: "ml-auto flex items-start gap-4 shrink-0" },
            // Total incentivo destaque
            h("div", { className: "text-right" },
              h("div", { className: "text-[10px] text-white/70 uppercase tracking-widest mb-0.5" }, "Incentivo"),
              h("div", { className: "text-2xl font-black text-white font-mono" }, `R$\u00A0${fmtRS(colab.total)}`),
              h("div", { className: cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block",
                colab.pct_total >= 100 ? "bg-emerald-400/30 text-emerald-100"
                : colab.pct_total >= 75 ? "bg-blue-400/30 text-blue-100"
                : colab.pct_total >= 50 ? "bg-amber-400/30 text-amber-100"
                : "bg-red-400/30 text-red-100"
              )}, `${fmtPct(colab.pct_total, 0)} de R$\u00A0${fmtRS(colab.maximo)}`)
            ),
            // Botão Fechar
            h(Button, {
              variant: "ghost" as const,
              className: "size-9 p-0 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-white/80 hover:text-white transition-colors",
              onClick: onFechar
            }, h(X, { className: "size-5" }))
          )
        )
      ),

      // ── Abas ─────────────────────────────────────────────────────────
      h("div", { className: "flex border-b border-border/60 bg-muted/5 px-4 shrink-0" },
        ...([
          { id: "resumo",      label: "Resumo",       icon: Star },
          { id: "ponto",       label: "Ponto",         icon: Clock },
          { id: "performance", label: perfLabel,       icon: colab.isMotorista ? Truck : Target },
          { id: "devolucao",   label: "Devoluções",    icon: TrendingDown },
        ] as { id: typeof abaAtiva; label: string; icon: any }[]).map(tab =>
          h("button", {
            key: tab.id,
            onClick: () => setAbaAtiva(tab.id),
            className: cn(
              "flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px",
              abaAtiva === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )
          }, h(tab.icon, { className: "size-3.5" }), tab.label)
        )
      ),

      // ── Conteúdo scrollable ───────────────────────────────────────────
      h("div", { className: "flex-1 overflow-y-auto p-5 space-y-4" },

        // ── ABA RESUMO ──────────────────────────────────────────────────
        abaAtiva === "resumo" && h("div", { className: "space-y-4" },

          // Barra de progresso geral
          h("div", { className: "rounded-xl border border-border/60 bg-card px-5 py-4" },
            h("div", { className: "flex items-center justify-between mb-3" },
              h("span", { className: "text-xs font-bold text-muted-foreground uppercase tracking-widest" }, "Progresso do Incentivo"),
              h("span", { className: "text-xs font-bold font-mono text-primary" },
                `R$\u00A0${fmtRS(colab.total)} / R$\u00A0${fmtRS(colab.maximo)}`
              )
            ),
            h("div", { className: "h-3 rounded-full bg-muted overflow-hidden" },
              h("div", {
                className: cn(
                  "h-full rounded-full transition-all",
                  colab.pct_total >= 100 ? "bg-emerald-500" : colab.pct_total >= 75 ? "bg-blue-500" : colab.pct_total >= 50 ? "bg-amber-500" : "bg-red-400"
                ),
                style: { width: `${Math.min(colab.pct_total, 100)}%` }
              })
            ),
            // Marcadores das faixas
            h("div", { className: "relative mt-1 h-4" },
              ...[75, 90, 100].map(mark =>
                h("div", { key: mark, className: "absolute flex flex-col items-center", style: { left: `${mark}%`, transform: "translateX(-50%)" } },
                  h("div", { className: "w-px h-1.5 bg-border" }),
                  h("span", { className: "text-[9px] text-muted-foreground" }, `${mark}%`)
                )
              )
            )
          ),

          // 4 critérios
          h("div", { className: "grid grid-cols-2 gap-3" },
            h(CriterioCard, {
              label: "Absenteísmo",
              pct: colab.pct_abs,
              valor: colab.val_abs,
              maxValor: maxCrit,
              tipo: "ating" as const,
              detalhes: !isNaN(colab.pct_abs)
                ? `${colab.presencas} presenças de ${colab.dias_uteis} dias · ${colab.faltas} falta${colab.faltas !== 1 ? "s" : ""}`
                : "Sem registro de ponto"
            }),
            h(CriterioCard, {
              label: perfLabel,
              pct: colab.pct_perf,
              valor: colab.val_perf,
              maxValor: colab.isMotorista ? (EMPRESAS_BV.has(colab.empresa) ? 100 : 50) : maxCrit,
              tipo: "ating" as const,
              detalhes: !isNaN(colab.pct_perf)
                ? colab.isMotorista
                  ? `${colab.perf_dias_ok} de ${colab.perf_dias} dias bonificados · Score risco: ${colab.vfl_score}`
                  : `${colab.perf_dias_ok} de ${colab.perf_dias} dias 4/4 · ${fmtNum(colab.perf_pedidos)} pedidos`
                : "Sem dados de performance"
            }),
            h(CriterioCard, {
              label: "Dev. por Valor",
              pct: colab.pct_dev_val,
              valor: colab.val_dev_val,
              maxValor: maxCrit,
              tipo: "dev" as const,
              detalhes: !isNaN(colab.pct_dev_val)
                ? `R$\u00A0${fmtRS(colab.fat_dev)} devolvido de R$\u00A0${fmtRS(colab.fat_total)}`
                : "Sem dados de faturamento"
            }),
            h(CriterioCard, {
              label: "Dev. por NFe",
              pct: colab.pct_dev_nfe,
              valor: colab.val_dev_nfe,
              maxValor: maxCrit,
              tipo: "dev" as const,
              detalhes: !isNaN(colab.pct_dev_nfe)
                ? `${colab.fat_nfes_dev} NFe${colab.fat_nfes_dev !== 1 ? "s" : ""} devolvida${colab.fat_nfes_dev !== 1 ? "s" : ""} de ${colab.fat_nfes}`
                : "Sem dados de faturamento"
            })
          ),

          // Mensagem motivacional
          h("div", { className: cn(
            "rounded-xl border px-4 py-3 flex items-start gap-3",
            colab.pct_total >= 100 ? "bg-emerald-50 border-emerald-200"
            : colab.pct_total >= 75 ? "bg-blue-50 border-blue-200"
            : colab.pct_total >= 50 ? "bg-amber-50 border-amber-200"
            : "bg-red-50 border-red-200"
          )},
            h(colab.pct_total >= 100 ? Award : colab.pct_total >= 75 ? Star : colab.pct_total >= 50 ? Activity : AlertCircle, {
              className: cn("size-4 shrink-0 mt-0.5",
                colab.pct_total >= 100 ? "text-emerald-600"
                : colab.pct_total >= 75 ? "text-blue-600"
                : colab.pct_total >= 50 ? "text-amber-600"
                : "text-red-600"
              )
            }),
            h("div", { className: "text-xs" },
              h("strong", {}, colab.pct_total >= 100 ? "Incentivo máximo atingido! 🏆"
                : colab.pct_total >= 75 ? "Ótimo desempenho, continue assim!"
                : colab.pct_total >= 50 ? "Bom caminho, há espaço para melhorar."
                : "Atenção: desempenho abaixo do esperado."
              ),
              colab.pct_total < 100 && h("span", { className: "text-muted-foreground ml-1" },
                `Faltam R$\u00A0${fmtRS(colab.maximo - colab.total)} para o máximo.`
              )
            )
          )
        ),

        // ── ABA PONTO ───────────────────────────────────────────────────
        abaAtiva === "ponto" && h("div", { className: "space-y-4" },
          // Resumo
          h("div", { className: "grid grid-cols-4 gap-2" },
            ...[
              { label: "Dias Úteis",  value: `${colab.dias_uteis}`,   cls: "text-muted-foreground" },
              { label: "Presenças",   value: `${colab.presencas}`,    cls: "text-emerald-600" },
              { label: "Faltas",      value: `${colab.faltas}`,       cls: colab.faltas > 0 ? "text-red-500" : "text-emerald-600" },
              { label: "Justificados",value: `${colab.justificados}`, cls: "text-amber-600" },
            ].map((k, i) =>
              h("div", { key: i, className: "rounded-xl border border-border/60 bg-card px-3 py-2.5 text-center" },
                h("div", { className: cn("text-xl font-black font-mono", k.cls) }, k.value),
                h("div", { className: "text-[10px] text-muted-foreground mt-0.5" }, k.label)
              )
            )
          ),
          // Detalhe por dia
          colab.diasDetalhe.length > 0
            ? h("div", { className: "space-y-2" },
                h("p", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Registro por dia"),
                h("div", { className: "flex flex-wrap gap-1.5" },
                  ...colab.diasDetalhe.map((dia, i) => h(TagDia, { key: i, dia }))
                )
              )
            : h("div", { className: "text-center py-8 text-muted-foreground text-sm" }, "Sem dados de ponto")
        ),

        // ── ABA PERFORMANCE ─────────────────────────────────────────────
        abaAtiva === "performance" && h("div", { className: "space-y-4" },
          isNaN(colab.pct_perf)
            ? h("div", { className: "text-center py-8 text-muted-foreground text-sm" }, `Sem dados de ${perfLabel}`)
            : h("div", { className: "space-y-4" },
                // Resumo geral
                h("div", { className: "grid grid-cols-3 gap-2" },
                  ...[
                    { label: "Dias Ativos",   value: `${colab.perf_dias}`,     cls: "text-muted-foreground" },
                    { label: colab.isMotorista ? "Dias Bonif." : "Dias 4/4",
                      value: `${colab.perf_dias_ok}`,                           cls: "text-emerald-600" },
                    { label: "% Desempenho",  value: fmtPct(colab.pct_perf),   cls: colab.pct_perf >= 75 ? "text-emerald-600" : "text-amber-600" },
                  ].map((k, i) =>
                    h("div", { key: i, className: "rounded-xl border border-border/60 bg-card px-3 py-2.5 text-center" },
                      h("div", { className: cn("text-xl font-black font-mono", k.cls) }, k.value),
                      h("div", { className: "text-[10px] text-muted-foreground mt-0.5" }, k.label)
                    )
                  )
                ),

                // vFleet: indicadores de risco
                colab.isMotorista && h("div", { className: "space-y-2" },
                  h("p", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" },
                    `Indicadores de Risco · Score ${colab.vfl_score}`
                  ),
                  h("div", { className: "grid grid-cols-2 gap-2" },
                    ...[
                      { label: "Falhas Velocidade", value: colab.vfl_falhasVel,   alert: colab.vfl_falhasVel > 5 },
                      { label: "Curva Brusca",       value: colab.vfl_falhasCurva, alert: colab.vfl_falhasCurva > 3 },
                      { label: "Banguela",           value: colab.vfl_banguela,   alert: colab.vfl_banguela > 5 },
                      { label: "Motor Ocioso",       value: colab.vfl_ocioso,     alert: colab.vfl_ocioso > 5 },
                      { label: "Sem Cinto",          value: colab.vfl_semCinto,   alert: colab.vfl_semCinto > 0 },
                      { label: "Uso de Celular",     value: colab.vfl_celular,    alert: colab.vfl_celular > 0 },
                      { label: "Fadiga",             value: colab.vfl_fadiga,     alert: colab.vfl_fadiga > 0 },
                      { label: "Distância (km)",     value: fmtNum(colab.vfl_distancia), alert: false, isStr: true },
                    ].map((k, i) =>
                      h("div", { key: i, className: cn(
                        "rounded-lg border px-3 py-2.5 flex items-center justify-between",
                        k.alert ? "bg-red-50 border-red-200" : "bg-card border-border/60"
                      )},
                        h("span", { className: "text-xs text-muted-foreground" }, k.label),
                        h("span", { className: cn("text-sm font-bold font-mono", k.alert ? "text-red-600" : "text-foreground") },
                          (k as any).isStr ? k.value : String(k.value)
                        )
                      )
                    )
                  )
                ),

                // Performaxxi: indicadores de entrega
                !colab.isMotorista && h("div", { className: "space-y-2" },
                  h("p", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Indicadores de Entrega"),
                  h("div", { className: "grid grid-cols-2 gap-2" },
                    ...[
                      { label: "Total Pedidos",    value: fmtNum(colab.perf_pedidos), alert: false },
                      { label: "Peso Total (kg)",  value: fmtNum(colab.perf_pesoTotal), alert: false },
                      { label: "Peso Dev. (kg)",   value: fmtNum(colab.perf_pesoDev),   alert: colab.perf_pesoDev > 0 },
                      { label: "% Peso Dev.",      value: colab.perf_pesoTotal > 0 ? fmtPct(colab.perf_pesoDev/colab.perf_pesoTotal*100) : "—", alert: colab.perf_pesoDev > 0 },
                      { label: "Falhas Raio",      value: String(colab.perf_falhasRaio),  alert: colab.perf_falhasRaio > 0 },
                      { label: "Falhas SLA",       value: String(colab.perf_falhasSLA),   alert: colab.perf_falhasSLA > 0 },
                      { label: "Falhas Tempo",     value: String(colab.perf_falhasTempo), alert: colab.perf_falhasTempo > 0 },
                    ].map((k, i) =>
                      h("div", { key: i, className: cn(
                        "rounded-lg border px-3 py-2.5 flex items-center justify-between",
                        k.alert ? "bg-amber-50 border-amber-200" : "bg-card border-border/60"
                      )},
                        h("span", { className: "text-xs text-muted-foreground" }, k.label),
                        h("span", { className: cn("text-sm font-bold font-mono", k.alert ? "text-amber-600" : "text-foreground") }, k.value)
                      )
                    )
                  )
                )
              )
        ),

        // ── ABA DEVOLUÇÕES ──────────────────────────────────────────────
        abaAtiva === "devolucao" && h("div", { className: "space-y-4" },
          colab.fat_total === 0 && isNaN(colab.pct_dev_val)
            ? h("div", { className: "text-center py-8 text-muted-foreground text-sm" }, "Sem dados de faturamento/devolução")
            : h("div", { className: "space-y-4" },
                // KPIs faturamento
                h("div", { className: "grid grid-cols-2 gap-2" },
                  ...[
                    { label: "Faturamento Total", value: `R$\u00A0${fmtRS(colab.fat_total)}`, cls: "text-emerald-600" },
                    { label: "Fat. Devolvido",     value: `R$\u00A0${fmtRS(colab.fat_dev)}`,   cls: colab.fat_dev > 0 ? "text-red-500" : "text-muted-foreground" },
                    { label: "Total NFes",         value: `${colab.fat_nfes}`,                 cls: "text-muted-foreground" },
                    { label: "NFes Devolvidas",    value: `${colab.fat_nfes_dev}`,             cls: colab.fat_nfes_dev > 0 ? "text-red-500" : "text-muted-foreground" },
                  ].map((k, i) =>
                    h("div", { key: i, className: "rounded-xl border border-border/60 bg-card px-4 py-3" },
                      h("div", { className: cn("text-base font-black font-mono", k.cls) }, k.value),
                      h("div", { className: "text-[10px] text-muted-foreground mt-0.5" }, k.label)
                    )
                  )
                ),
                // Critérios devolução
                h("div", { className: "grid grid-cols-2 gap-3" },
                  ...[
                    { label: "% Dev. por Valor", pct: colab.pct_dev_val, val: colab.val_dev_val,
                      detalhe: !isNaN(colab.pct_dev_val) ? devLabel(colab.pct_dev_val) + ` · ${fmtPct(colab.pct_dev_val*100)}` : "—" },
                    { label: "% Dev. por NFe",   pct: colab.pct_dev_nfe, val: colab.val_dev_nfe,
                      detalhe: !isNaN(colab.pct_dev_nfe) ? devLabel(colab.pct_dev_nfe) + ` · ${fmtPct(colab.pct_dev_nfe*100)}` : "—" },
                  ].map((k, i) => {
                    const st = statusFaixa(k.pct, "dev")
                    const cfg = STATUS_CONFIG[st]
                    return h("div", { key: i, className: cn("rounded-xl border overflow-hidden", cfg.cls) },
                      h("div", { className: "px-4 py-2 border-b border-current/20 flex justify-between" },
                        h("span", { className: "text-[10px] font-bold uppercase tracking-widest" }, k.label),
                        h("span", { className: "text-[10px] font-bold" }, cfg.label)
                      ),
                      h("div", { className: "px-4 py-3" },
                        h("div", { className: "text-lg font-black font-mono" },
                          isNaN(k.pct) ? "—" : fmtPct(k.pct * 100)
                        ),
                        h("div", { className: "text-[11px] opacity-75 mt-0.5" }, k.detalhe),
                        h("div", { className: "mt-2 text-[11px]" },
                          "Bônus: ",
                          h("strong", {}, `R$\u00A0${fmtRS(k.val)}`)
                        )
                      )
                    )
                  })
                )
              )
        )
      )
    )
  )
}

// ─── Lista de colaboradores ───────────────────────────────────────────────────

function ListaColaboradores({
  rows, onSelecionar
}: {
  rows: ColabBoletim[]
  onSelecionar: (c: ColabBoletim) => void
}) {
  const [search, setSearch]     = React.useState("")
  const [grupo, setGrupo]       = React.useState<"todos" | "motoristas" | "ajudantes">("todos")
  const [ordenar, setOrdenar]   = React.useState<"nome" | "incentivo" | "status">("incentivo")

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return rows
      .filter(r => {
        if (grupo === "motoristas" && !r.isMotorista) return false
        if (grupo === "ajudantes"  &&  r.isMotorista) return false
        if (q && !r.nome.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (ordenar === "incentivo") return b.total - a.total
        if (ordenar === "status")    return b.pct_total - a.pct_total
        return a.nome.localeCompare(b.nome)
      })
  }, [rows, search, grupo, ordenar])

  const motoristas = rows.filter(r => r.isMotorista).length
  const ajudantes  = rows.filter(r => !r.isMotorista).length

  return h("div", { className: "space-y-3" },

    // Controles
    h("div", { className: "flex items-center gap-2 flex-wrap" },
      // Filtro grupo
      h("div", { className: "flex border border-border/60 rounded-lg overflow-hidden bg-muted/10 p-0.5 gap-0.5 text-[11px]" },
        ...([
          { id: "todos",      label: `Todos (${rows.length})` },
          { id: "motoristas", label: `Motoristas (${motoristas})` },
          { id: "ajudantes",  label: `Ajudantes (${ajudantes})` },
        ] as { id: typeof grupo; label: string }[]).map(g =>
          h("button", {
            key: g.id,
            onClick: () => setGrupo(g.id),
            className: cn(
              "px-3 py-1.5 font-semibold rounded transition-all",
              grupo === g.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )
          }, g.label)
        )
      ),
      // Busca
      h("div", { className: "relative flex-1 min-w-[160px] max-w-xs" },
        h(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" }),
        h("input", {
          className: "w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-xs outline-none focus:border-primary",
          placeholder: "Buscar colaborador...",
          value: search,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)
        })
      ),
      // Ordenar
      h("select", {
        className: "h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary text-muted-foreground",
        value: ordenar,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setOrdenar(e.target.value as typeof ordenar)
      },
        h("option", { value: "incentivo" }, "Maior incentivo"),
        h("option", { value: "status" },    "Maior %"),
        h("option", { value: "nome" },      "Alfabético")
      ),
      h("span", { className: "text-[10px] text-muted-foreground font-mono ml-auto" },
        `${filtered.length} / ${rows.length}`
      )
    ),

    // Grid de cards
    h("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2" },
      ...filtered.map((r, i) => {
        const st     = r.pct_total >= 100 ? "otimo" : r.pct_total >= 75 ? "bom" : r.pct_total >= 50 ? "regular" : "ruim"
        const cfg    = STATUS_CONFIG[st]
        const pctBar = Math.min(r.pct_total, 100)
        const barCls = st === "otimo" ? "bg-emerald-500" : st === "bom" ? "bg-blue-500" : st === "regular" ? "bg-amber-500" : "bg-red-400"

        return h("button", {
          key: i,
          onClick: () => onSelecionar(r),
          className: cn(
            "text-left rounded-xl border border-border/60 bg-card px-4 py-3 hover:shadow-md hover:border-primary/40 transition-all group"
          )
        },
          h("div", { className: "flex items-start gap-3" },
            // Avatar
            h("div", { className: cn(
              "size-9 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-black",
              r.isMotorista ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
            )}, initials(r.nome)),
            // Info
            h("div", { className: "flex-1 min-w-0" },
              h("div", { className: "font-semibold text-xs leading-tight truncate group-hover:text-primary transition-colors" }, r.nome),
              h("div", { className: "text-[10px] text-muted-foreground mt-0.5 truncate" },
                `${r.cargo} · ${r.empresa}`
              ),
              // Barra de incentivo
              h("div", { className: "mt-2" },
                h("div", { className: "flex items-center justify-between mb-1" },
                  h("span", { className: cn("text-[10px] font-bold", cfg.cls.split(" ").filter(c => c.startsWith("text-")).join(" ")) },
                    fmtPct(r.pct_total, 0)
                  ),
                  h("span", { className: "text-[10px] font-bold font-mono text-primary" },
                    `R$\u00A0${fmtRS(r.total)}`
                  )
                ),
                h("div", { className: "h-1.5 rounded-full bg-muted overflow-hidden" },
                  h("div", { className: cn("h-full rounded-full transition-all", barCls), style: { width: `${pctBar}%` } })
                )
              )
            ),
            // Seta
            h(ArrowRight, { className: "size-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-1" })
          )
        )
      })
    )
  )
}

// ─── Fontes ───────────────────────────────────────────────────────────────────

const FONTES = [
  { tipo: "funcionarios" as TipoFonte, label: "Funcionários",    obrigatorio: true,
    desc: "Cadastro base — define cargo e empresa",
    cls: "bg-slate-50 border-slate-200 text-slate-700" },
  { tipo: "ponto" as TipoFonte,        label: "Ponto",           obrigatorio: false,
    desc: "Apuração de presença e marcações",
    cls: "bg-violet-50 border-violet-200 text-violet-700" },
  { tipo: "vfleet" as TipoFonte,       label: "vFleet",          obrigatorio: false,
    desc: "Desempenho de condução — motoristas",
    cls: "bg-orange-50 border-orange-200 text-orange-700" },
  { tipo: "performaxxi" as TipoFonte,  label: "Performaxxi",     obrigatorio: false,
    desc: "Performance de entregas — ajudantes",
    cls: "bg-blue-50 border-blue-200 text-blue-700" },
  { tipo: "faturamento" as TipoFonte,  label: "Fat. Devoluções", obrigatorio: false,
    desc: "% devolução por valor e por NFe",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
] as const

// ─── Componente principal ─────────────────────────────────────────────────────

interface BoletimProps {
  initialFiles?: { data: any[]; nome: string; tipo: TipoFonte }[]
}

export function BoletimPipelineView({ initialFiles }: BoletimProps) {
  const [files, setFiles]         = React.useState<{ data: any[]; nome: string; tipo: TipoFonte }[]>(initialFiles || [])
  const [loading, setLoading]     = React.useState(!!initialFiles)
  const [rows, setRows]           = React.useState<ColabBoletim[] | null>(null)
  const [selecionado, setSelecionado] = React.useState<ColabBoletim | null>(null)
  const { toast }                 = useToast()

  React.useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      analisar(initialFiles)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles])

  async function lerArquivo(file: File): Promise<any[]> {
    const nome = file.name.toLowerCase()
    if (nome.endsWith(".json")) {
      const raw = JSON.parse(await file.text())
      if (Array.isArray(raw)) return raw
      return Object.entries(raw as Record<string, any>)
        .filter(([k]) => k.toLowerCase() !== "acumulado")
        .flatMap(([, v]) => (Array.isArray(v) ? v : []))
    }
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: "array" })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[]
  }

  function detectarTipo(nome: string): TipoFonte {
    const n = nome.toLowerCase()
    if (/funcionari/i.test(n))                       return "funcionarios"
    if (/performaxxi|performaxi/i.test(n))           return "performaxxi"
    if (/desempenho|vfleet|motorist/i.test(n))       return "vfleet"
    if (/faturamento.*dev|fatdev|fat.*dev/i.test(n)) return "faturamento"
    if (/ponto|apuracao/i.test(n))                   return "ponto"
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

  function analisar(filesToProcess: { data: any[]; nome: string; tipo: TipoFonte }[] = files) {
    if (!filesToProcess.some(f => f.tipo === "funcionarios")) {
      toast({ variant: "destructive", title: "Arquivo obrigatório", description: "Selecione o arquivo de Funcionários." })
      return
    }
    setLoading(true)
    setTimeout(() => {
      try {
        const arqs = new Map<TipoFonte, any[]>()
        for (const f of filesToProcess) arqs.set(f.tipo, f.data)
        const result = processar(arqs)
        setRows(result)
        toast({ title: "Boletins gerados", description: `${result.length} colaboradores processados.` })
      } catch (err: any) {
        toast({ variant: "destructive", title: "Erro", description: err.message })
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

  // ── Boletim aberto ────────────────────────────────────────────────────────
  return h("div", { className: "space-y-6" },

    // Banner
    h("div", { className: "rounded-xl border border-border/60 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3" },
      h("div", { className: "flex items-start gap-3" },
        h(Users, { className: "size-4 text-primary shrink-0 mt-0.5" }),
        h("div", { className: "text-sm text-muted-foreground" },
          h("span", { className: "font-semibold text-foreground" }, "Boletins de Desempenho "),
          "— Visão individual de cada colaborador com ",
          h("strong", {}, "absenteísmo, performance, devoluções e incentivo"),
          ". Clique em qualquer colaborador para ver o boletim completo."
        )
      ),
      rows && h(Button, {
        variant: "outline" as const, size: "sm" as const, className: "h-8 text-xs gap-1.5 shrink-0",
        onClick: () => { setRows(null); setFiles([]) }
      }, h(Upload, { className: "size-3.5" }), "Trocar arquivos")
    ),

    // Modal do boletim individual
    selecionado && h(BoletimIndividual, {
      colab: selecionado,
      onFechar: () => setSelecionado(null)
    }),

    // Tela de upload ou loading
    !rows && (
      loading ?
        h("div", { className: "flex flex-col items-center justify-center gap-4 text-center text-muted-foreground p-12" },
          h(Loader2, { className: "size-8 animate-spin text-primary" }),
          h("p", { className: "font-bold" }, "Gerando boletins..."),
          h("p", { className: "text-xs" }, "Aguarde um instante, os dados estão sendo processados.")
        ) :
        h("div", { className: "rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden" },
          h("div", { className: "px-4 py-3 border-b border-border/60 bg-muted/10 flex items-center gap-2" },
            h(Package, { className: "size-4 text-primary" }),
            h("span", { className: "text-[10px] font-bold uppercase tracking-widest text-muted-foreground" }, "Arquivos de Entrada")
          ),
          h("div", { className: "p-4 space-y-4" },
            h("div", {
              className: cn(
                "border-2 border-dashed rounded-xl bg-muted/10 min-h-[100px] flex flex-col items-center justify-center p-4 cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/20"
              ),
              onClick: () => document.getElementById("boletim-input")?.click()
            },
              h("input", { id: "boletim-input", type: "file", multiple: true, className: "hidden", onChange: handleFileChange }),
              files.length === 0
                ? h("div", { className: "text-center space-y-1.5" },
                    h(FileCode, { className: "size-8 mx-auto opacity-20" }),
                    h("p", { className: "text-xs text-muted-foreground italic" },
                      "Funcionario · Ponto · Desempenho_Motoristas · Performaxxi · FaturamentoDev"
                    ),
                    h("p", { className: "text-[10px] text-muted-foreground/60" }, "XLSX, XLS ou JSON · detecção automática")
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
                      h(Upload, { className: "size-3" }), "Clique para adicionar mais"
                    )
                  )
            ),
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
            h("div", { className: "flex gap-2" },
              h(Button, {
                className: "flex-1 h-9 text-xs font-semibold shadow-sm",
                onClick: () => analisar(),
                disabled: loading || !files.some(f => f.tipo === "funcionarios")
              },
                loading
                  ? h(React.Fragment, {}, h(Loader2 as any, { className: "mr-1.5 size-3.5 animate-spin" }), "Gerando boletins...")
                  : h(React.Fragment, {}, h(BarChart3, { className: "mr-1.5 size-3.5" }), "Gerar Boletins")
              )
            )
          )
        )
    ),

    // Lista de colaboradores
    rows && h(ListaColaboradores, { rows, onSelecionar: setSelecionado })
  )
}
