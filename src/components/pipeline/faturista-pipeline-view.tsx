"use client"

import * as React from "react"
import {
  Play,
  Trash2,
  FileCode,
  Loader2,
  Download,
  Info,
  HelpCircle,
  CheckCircle2,
  Circle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Terminal,
  Package,
  Truck,
  Clock,
  DollarSign,
  FileSpreadsheet,
  CalendarDays,
  BadgePercent,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeFaturistaPipeline } from "@/app/actions/faturista-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StageStatus = "idle" | "running" | "done" | "error" | "warn"

interface Stage {
  id: string
  label: string
  description: string
  status: StageStatus
}

interface LogEntry {
  time: string
  message: string
  type: "info" | "success" | "error" | "warn" | "step"
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_META_CINTAS    = 200.0
const DEFAULT_META_LIBERACAO = 200.0
const EMPRESAS_PADRAO        = "RK01, BV01"

const INITIAL_STAGES: Stage[] = [
  { id: "load",    label: "Carregar arquivo",            description: "Tempos e Movimentos (aba Faturamento)",         status: "idle" },
  { id: "filter",  label: "Etapa 1 — Filtros",           description: "Período + Empresas + horários válidos",         status: "idle" },
  { id: "adjust",  label: "Etapa 2 — Ajuste de horários",description: "Correção de virada de dia (após meia-noite)",   status: "idle" },
  { id: "metas",   label: "Etapa 3 — Metas diárias",     description: "Dias úteis no mês → meta por dia",             status: "idle" },
  { id: "cintas",  label: "Etapa 4 — Cintas",            description: "≤22h=100% | 22–23h=85% | 23–00h=75% | >00h=0%",status: "idle" },
  { id: "lib",     label: "Etapa 5 — Liberação",         description: "≤20h30=100% | –21h=85% | –22h=75% | >22h=0%",  status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase",  description: "Cintas + Liberação separados por processo",     status: "idle" },
]

const REGRAS = [
  { label: "Cintas — 100%",     detail: "Término ≤ 22:00",             color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "Cintas — 85%",      detail: "22:00 < término ≤ 23:00",     color: "border-blue-200 bg-blue-50 text-blue-700" },
  { label: "Cintas — 75%",      detail: "23:00 < término ≤ 00:00",     color: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "Cintas — 0%",       detail: "Término após 00:00",           color: "border-red-200 bg-red-50 text-red-700" },
  { label: "Liberação — 100%",  detail: "Término ≤ 20:30",             color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "Liberação — 85%",   detail: "20:30 < término ≤ 21:00",     color: "border-blue-200 bg-blue-50 text-blue-700" },
  { label: "Liberação — 75%",   detail: "21:00 < término ≤ 22:00",     color: "border-amber-200 bg-amber-50 text-amber-700" },
  { label: "Liberação — 0%",    detail: "Término após 22:00",           color: "border-red-200 bg-red-50 text-red-700" },
]

// ─── Helpers visuais ──────────────────────────────────────────────────────────

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "running") return <Loader2 className="size-4 animate-spin text-primary shrink-0" />
  if (status === "done")    return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
  if (status === "error")   return <XCircle className="size-4 text-destructive shrink-0" />
  if (status === "warn")    return <AlertTriangle className="size-4 text-amber-500 shrink-0" />
  return <Circle className="size-4 text-muted-foreground/30 shrink-0" />
}

const stageBg: Record<StageStatus, string> = {
  idle:    "bg-muted/20 border-border/40",
  running: "bg-primary/5 border-primary/30",
  done:    "bg-emerald-50 border-emerald-200",
  error:   "bg-red-50 border-red-200",
  warn:    "bg-amber-50 border-amber-200",
}

const stageLabel: Record<StageStatus, string> = {
  idle:    "text-muted-foreground",
  running: "text-primary font-semibold",
  done:    "text-emerald-700 font-medium",
  error:   "text-red-700 font-semibold",
  warn:    "text-amber-700 font-medium",
}

const logColor: Record<LogEntry["type"], string> = {
  info:    "text-slate-400",
  success: "text-emerald-500",
  error:   "text-red-400 font-semibold",
  warn:    "text-amber-400",
  step:    "text-primary font-semibold",
}

const logPrefix: Record<LogEntry["type"], string> = {
  info:    "   ",
  success: "✅ ",
  error:   "❌ ",
  warn:    "⚠️  ",
  step:    "▶  ",
}

function pctBadge(pct: number) {
  if (pct >= 1)    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">100%</Badge>
  if (pct >= 0.85) return <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">85%</Badge>
  if (pct >= 0.75) return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">75%</Badge>
  return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">0%</Badge>
}

// ─── ResultViewer ─────────────────────────────────────────────────────────────

function FaturistaResultViewer({ result }: { result: PipelineResult }) {
  const [activeTab, setActiveTab] = React.useState<"cintas" | "liberacao">("cintas")

  const cintas:    any[] = result.dadosCintas    ?? []
  const liberacao: any[] = result.dadosLiberacao ?? []
  const resumo:    any[] = result.resumoMensal   ?? []

  if (!cintas.length && !liberacao.length) return null

  const totalCintas    = cintas.reduce((a: number, r: any) => a + (r["Valor_Cintas_Dia"] ?? 0), 0)
  const totalLiberacao = liberacao.reduce((a: number, r: any) => a + (r["Valor_Liberacao_Dia"] ?? 0), 0)

  // Distribuição de percentuais para o processo ativo
  const activeRows = activeTab === "cintas" ? cintas : liberacao
  const percCol    = activeTab === "cintas" ? "Perc_Meta_Cintas" : "Perc_Meta_Liberacao"
  const valorCol   = activeTab === "cintas" ? "Valor_Cintas_Dia" : "Valor_Liberacao_Dia"
  const metaOkCol  = activeTab === "cintas" ? "Meta_OK_Cintas"   : "Meta_OK_Liberacao"

  const dist = {
    p100: activeRows.filter(r => r[percCol] >= 1).length,
    p85:  activeRows.filter(r => r[percCol] >= 0.85 && r[percCol] < 1).length,
    p75:  activeRows.filter(r => r[percCol] >= 0.75 && r[percCol] < 0.85).length,
    p0:   activeRows.filter(r => r[percCol] < 0.75).length,
  }

  const TABS = [
    { id: "cintas",    label: "Cintas",    icon: Package, count: cintas.length    },
    { id: "liberacao", label: "Liberação", icon: Truck,   count: liberacao.length },
  ] as const

  const TABLE_COLS = ["DATA", "EMPRESA", "CIDADE", "INICIO", "TERMINO", "TERMINO_AJUSTADO", percCol, metaOkCol, valorCol]
    .filter(c => activeRows.length && c in activeRows[0])

  function fmtVal(col: string, val: any) {
    if (val == null || val === "") return <span className="text-muted-foreground/40">—</span>
    if (col === percCol)  return pctBadge(typeof val === "number" ? val : parseFloat(val))
    if (col === metaOkCol) return val
      ? <span className="text-emerald-600 font-semibold">✓ Sim</span>
      : <span className="text-red-500">✗ Não</span>
    if (col === valorCol && typeof val === "number") return `R$ ${val.toFixed(2)}`
    if (col === "TERMINO_AJUSTADO" && val) return String(val).slice(11, 16) || String(val)
    if (col === "DATA" && val) return String(val).slice(0, 10)
    return String(val)
  }

  const labelMap: Record<string, string> = {
    DATA: "Data", EMPRESA: "Empresa", CIDADE: "Cidade",
    INICIO: "Início", TERMINO: "Término", TERMINO_AJUSTADO: "Término Aj.",
    Perc_Meta_Cintas: "% Meta", Perc_Meta_Liberacao: "% Meta",
    Meta_OK_Cintas: "Meta OK", Meta_OK_Liberacao: "Meta OK",
    Valor_Cintas_Dia: "Valor (R$)", Valor_Liberacao_Dia: "Valor (R$)",
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* Totais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Cintas",    value: `R$ ${totalCintas.toFixed(2)}`,    icon: Package,  highlight: true  },
          { label: "Total Liberação", value: `R$ ${totalLiberacao.toFixed(2)}`, icon: Truck,    highlight: false },
          { label: "Total Geral",     value: `R$ ${(totalCintas + totalLiberacao).toFixed(2)}`, icon: DollarSign, highlight: true },
          { label: "Registros",       value: cintas.length + liberacao.length,  icon: CalendarDays, highlight: false },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className={cn(
              "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm",
              stat.highlight ? "bg-primary/5 border-primary/20" : "bg-card border-border/60"
            )}>
              <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0",
                stat.highlight ? "bg-primary/10" : "bg-muted/30")}>
                <Icon className={cn("size-3.5", stat.highlight ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-bold leading-tight truncate",
                  stat.highlight ? "text-primary" : "text-foreground")}>
                  {typeof stat.value === "number" ? stat.value.toLocaleString("pt-BR") : stat.value}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Resumo mensal por empresa */}
      {resumo.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/10">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resumo Mensal por Empresa</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] font-bold uppercase">Empresa</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-right">Cintas</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-right">Liberação</TableHead>
                <TableHead className="text-[10px] font-bold uppercase text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumo.map((r: any, i: number) => (
                <TableRow key={i} className="text-xs">
                  <TableCell className="font-semibold">{r.empresa}</TableCell>
                  <TableCell className="text-right font-mono">R$ {(r.bonificacaoCintas ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">R$ {(r.bonificacaoLiberacao ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-primary">R$ {(r.bonificacaoTotal ?? 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Distribuição de percentuais */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { pct: "100%", count: dist.p100, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
          { pct: "85%",  count: dist.p85,  color: "bg-blue-50 border-blue-200 text-blue-700" },
          { pct: "75%",  count: dist.p75,  color: "bg-amber-50 border-amber-200 text-amber-700" },
          { pct: "0%",   count: dist.p0,   color: "bg-red-50 border-red-200 text-red-700" },
        ].map(d => (
          <div key={d.pct} className={cn("rounded-xl border px-3 py-2.5 text-center shadow-sm", d.color)}>
            <p className="text-lg font-bold leading-tight">{d.count}</p>
            <p className="text-[10px] font-semibold leading-tight">{d.pct} da meta</p>
          </div>
        ))}
      </div>

      {/* Tabs + tabela */}
      <div className="flex gap-2">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border/60 text-muted-foreground hover:bg-muted/30"
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                activeTab === tab.id ? "bg-white/20" : "bg-muted"
              )}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {activeRows.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {activeTab === "cintas" ? "Entrega de Cintas para Separação" : "Liberação para Roteirização"}
            </span>
            <span className="text-[10px] text-muted-foreground">{activeRows.length} registros</span>
          </div>
          <ScrollArea className="h-[440px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow>
                    {TABLE_COLS.map(col => (
                      <TableHead key={col} className="text-[10px] font-bold uppercase whitespace-nowrap px-2 py-2">
                        {labelMap[col] ?? col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRows.map((row, i) => (
                    <TableRow key={i} className={cn(
                      "text-xs",
                      row[percCol] === 0 && "bg-red-50/40",
                      row[percCol] >= 1  && "bg-emerald-50/30",
                    )}>
                      {TABLE_COLS.map(col => (
                        <TableCell key={col} className="px-2 py-1.5 whitespace-nowrap">
                          {fmtVal(col, row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function FaturistaPipelineView() {
  const [year, setYear]       = React.useState(new Date().getFullYear())
  const [month, setMonth]     = React.useState(new Date().getMonth() + 1)
  const [fileTempos, setFileTempos] = React.useState<File | null>(null)
  const [metaCintas, setMetaCintas]       = React.useState(DEFAULT_META_CINTAS)
  const [metaLiberacao, setMetaLiberacao] = React.useState(DEFAULT_META_LIBERACAO)
  const [empresas, setEmpresas]           = React.useState(EMPRESAS_PADRAO)
  const [isExecuting, setIsExecuting]     = React.useState(false)
  const [progress, setProgress]           = React.useState(0)
  const [stages, setStages]               = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]                   = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult]       = React.useState<PipelineResult | null>(null)
  const [stats, setStats]                 = React.useState<{
    viradas: number; diasUteis: number; totalCintas: number; totalLib: number
  } | null>(null)
  const logEndRef = React.useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR")
    setLogs(prev => [...prev, { time, message, type }])
  }

  const setStage = (id: string, status: StageStatus) =>
    setStages(prev => prev.map(s => s.id === id ? { ...s, status } : s))

  const resetStages = () => setStages(INITIAL_STAGES.map(s => ({ ...s, status: "idle" })))

  const canRun = !!fileTempos

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(0)
    setLogs([])
    setStats(null)
    resetStages()

    try {
      addLog(`Pipeline Faturista iniciado — ${String(month).padStart(2, "0")}/${year}`, "step")
      addLog(`Arquivo: ${fileTempos!.name}`)
      addLog(`Metas: Cintas R$ ${metaCintas.toFixed(2)} · Liberação R$ ${metaLiberacao.toFixed(2)}`)
      addLog(`Empresas: ${empresas}`)

      // ── Load ──────────────────────────────────────────────────────────
      setStage("load", "running")
      setProgress(8)

      const formData = new FormData()
      formData.append("year",          year.toString())
      formData.append("month",         month.toString())
      formData.append("fileTempos",    fileTempos!)
      formData.append("metaCintas",    metaCintas.toString())
      formData.append("metaLiberacao", metaLiberacao.toString())
      formData.append("empresas",      empresas)

      const response = await executeFaturistaPipeline(formData)
      if (!response?.success) throw new Error(response?.error || "Erro desconhecido no servidor.")

      setStage("load", "done")
      addLog(`Dados carregados: ${response.result.totalRegistros ?? "?"} registros na aba Faturamento.`, "success")
      setProgress(20)

      // ── Filtros ───────────────────────────────────────────────────────
      addLog("Etapa 1 — Aplicando filtros de período, empresa e horário...", "step")
      setStage("filter", "running")
      setProgress(32)
      await new Promise(r => setTimeout(r, 120))
      setStage("filter", "done")
      addLog(`${response.result.registrosFiltrados ?? "?"} registros após filtros.`, "success")
      setProgress(45)

      // ── Ajuste horários ───────────────────────────────────────────────
      addLog("Etapa 2 — Ajustando viradas de dia (após meia-noite)...", "step")
      setStage("adjust", "running")
      setProgress(54)
      await new Promise(r => setTimeout(r, 100))
      const viradas: number = response.result.viradas ?? 0
      if (viradas > 0) {
        addLog(`${viradas} registros com virada de dia corrigidos.`, "warn")
        setStage("adjust", "warn")
      } else {
        setStage("adjust", "done")
        addLog("Nenhuma virada de dia detectada.", "success")
      }
      setProgress(63)

      // ── Metas diárias ─────────────────────────────────────────────────
      addLog("Etapa 3 — Calculando dias úteis e metas diárias...", "step")
      setStage("metas", "running")
      setProgress(70)
      await new Promise(r => setTimeout(r, 80))
      setStage("metas", "done")
      const diasUteis: number = response.result.diasUteis ?? 0
      addLog(`${diasUteis} dias úteis → Meta/dia: Cintas R$ ${(metaCintas / diasUteis).toFixed(2)} · Lib R$ ${(metaLiberacao / diasUteis).toFixed(2)}`, "success")
      setProgress(78)

      // ── Cintas ────────────────────────────────────────────────────────
      addLog("Etapa 4 — Processando Entrega de Cintas...", "step")
      setStage("cintas", "running")
      setProgress(84)
      await new Promise(r => setTimeout(r, 80))
      setStage("cintas", "done")
      const totalCintas: number = response.result.totalCintas ?? 0
      addLog(`Cintas: ${(response.result.dadosCintas ?? []).length} registros · R$ ${totalCintas.toFixed(2)}`, "success")
      setProgress(90)

      // ── Liberação ─────────────────────────────────────────────────────
      addLog("Etapa 5 — Processando Liberação para Roteirização...", "step")
      setStage("lib", "running")
      setProgress(95)
      await new Promise(r => setTimeout(r, 80))
      setStage("lib", "done")
      const totalLib: number = response.result.totalLiberacao ?? 0
      addLog(`Liberação: ${(response.result.dadosLiberacao ?? []).length} registros · R$ ${totalLib.toFixed(2)}`, "success")
      setProgress(97)

      setStats({ viradas, diasUteis, totalCintas, totalLib })
      setLastResult(response.result)

      // ── Export ────────────────────────────────────────────────────────
      setStage("export", "running")
      setProgress(99)

      if (downloadOnly) {
        addLog("Gerando Excel com arquivos separados por processo...", "step")
        downloadMultipleSheets(
          [
            { data: response.result.dadosCintas    ?? [], name: "Prazo_Cintas"    },
            { data: response.result.dadosLiberacao ?? [], name: "Prazo_Liberacao" },
            { data: response.result.resumoMensal   ?? [], name: "Resumo_Mensal"   },
          ],
          `Faturista_${month}_${year}`
        )
        addLog("Arquivo Excel baixado.", "success")
      } else {
        addLog("Dados sincronizados com Firebase.", "success")
      }

      setStage("export", "done")
      setProgress(100)
      addLog(`Pipeline concluído em ${new Date().toLocaleTimeString("pt-BR")}.`, "success")

      toast({
        title: downloadOnly ? "Excel pronto" : "Pipeline concluído",
        description: response.result.summary ?? "",
      })

    } catch (error: any) {
      const msg = error?.message || String(error)
      addLog(`FALHA: ${msg}`, "error")
      setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s))
      setProgress(0)
      toast({ variant: "destructive", title: "Erro no pipeline Faturista", description: msg })
    } finally {
      setIsExecuting(false)
    }
  }

  const doneCount = stages.filter(s => s.status === "done" || s.status === "warn").length
  const hasError  = stages.some(s => s.status === "error")

  return (
    <div className="space-y-6">

      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <AlertTitle className="mb-0">Análise de Faturamento — Cintas & Liberação</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Processa os tempos de Entrega de Cintas e Liberação para Roteirização, calculando bonificação por faixa de horário.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Bonificação por cumprimento de horários — <strong>100% / 85% / 75% / 0%</strong> conforme faixa de término.
          Viradas de dia ajustadas automaticamente.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgePercent className="size-5 text-primary" />
                Configuração do Pipeline Faturista
              </CardTitle>
              <CardDescription>Tempos e Movimentos (aba Faturamento)</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Período */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Mês</Label>
                  <Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} />
                </div>
              </div>

              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }} currentMonth={month} currentYear={year} />

              {/* Metas */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Package className="size-3.5 text-muted-foreground" /> Meta Cintas (R$/mês)
                  </Label>
                  <Input
                    type="number"
                    step="10"
                    value={metaCintas}
                    onChange={e => setMetaCintas(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Truck className="size-3.5 text-muted-foreground" /> Meta Liberação (R$/mês)
                  </Label>
                  <Input
                    type="number"
                    step="10"
                    value={metaLiberacao}
                    onChange={e => setMetaLiberacao(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Empresas */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground" /> Empresas (separadas por vírgula)
                </Label>
                <Input
                  value={empresas}
                  onChange={e => setEmpresas(e.target.value)}
                  placeholder="RK01, BV01"
                />
              </div>

              {/* Arquivo */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-primary">Arquivo de Tempos e Movimentos</Label>
                <div className="flex items-center gap-2 bg-background px-3 py-2.5 rounded-lg border text-xs">
                  <FileSpreadsheet className="size-3.5 text-muted-foreground shrink-0" />
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                    "bg-primary/10 text-primary"
                  )}>Faturamento</span>
                  <span className="truncate flex-1 font-medium text-muted-foreground">
                    {fileTempos ? fileTempos.name : <span className="italic">Tempos e Movimentos - PR, MS.xlsx</span>}
                  </span>
                  {fileTempos && (
                    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => setFileTempos(null)}>
                      <Trash2 className="size-3 text-destructive/70" />
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm" className="h-6 text-[10px] px-2 cursor-pointer shrink-0">
                    <Label htmlFor="faturista-upload">{fileTempos ? "Trocar" : "Selecionar"}</Label>
                  </Button>
                  <Input
                    id="faturista-upload"
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls"
                    onChange={e => {
                      if (e.target.files?.[0]) setFileTempos(e.target.files[0])
                      e.target.value = ""
                    }}
                  />
                </div>
              </div>

              {/* Progress */}
              {(isExecuting || progress > 0) && (
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {hasError ? "Erro na execução" : progress === 100 ? "Concluído" : "Processando..."}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress
                    value={progress}
                    className={cn("h-2 transition-all", hasError && "[&>div]:bg-destructive")}
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>{doneCount}/{stages.length} etapas</span>
                    <span>
                      {isExecuting
                        ? stages.find(s => s.status === "running")?.label ?? "..."
                        : progress === 100 ? "Pipeline finalizado" : ""}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4 pb-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs font-semibold border-slate-300 text-slate-600 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-400 transition-all"
                onClick={() => runPipeline(true)}
                disabled={isExecuting || !canRun}
              >
                <Download className="mr-1.5 size-3.5" /> Exportar Excel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs font-semibold bg-primary hover:bg-primary/90 shadow-sm transition-all"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || !canRun}
              >
                {isExecuting
                  ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Processando...</>
                  : <><Play className="mr-1.5 size-3.5 fill-current" /> Executar Pipeline</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* ── Coluna lateral ── */}
        <div className="space-y-4">

          {/* Etapas */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Etapas de Execução
              </span>
            </div>
            <div className="p-3 space-y-2">
              {stages.map((stage, idx) => (
                <div key={stage.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-0.5">
                    <StageIcon status={stage.status} />
                    {idx < stages.length - 1 && (
                      <div className={cn(
                        "w-px mt-1 min-h-[14px]",
                        stage.status === "done" ? "bg-emerald-300" : "bg-border/60"
                      )} />
                    )}
                  </div>
                  <div className={cn("flex-1 px-2.5 py-1.5 rounded-lg border text-xs transition-all", stageBg[stage.status])}>
                    <p className={cn("leading-tight", stageLabel[stage.status])}>{stage.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stage.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats pós-execução */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Dias úteis",         value: stats.diasUteis,                              icon: CalendarDays, highlight: false },
                { label: "Viradas de dia",      value: stats.viradas,                               icon: Clock,        highlight: false },
                { label: "Total Cintas",        value: `R$ ${stats.totalCintas.toFixed(2)}`,        icon: Package,      highlight: true  },
                { label: "Total Liberação",     value: `R$ ${stats.totalLib.toFixed(2)}`,           icon: Truck,        highlight: true  },
              ].map(stat => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className={cn(
                    "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm",
                    stat.highlight ? "bg-primary/5 border-primary/20" : "bg-card border-border/60"
                  )}>
                    <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0",
                      stat.highlight ? "bg-primary/10" : "bg-muted/30")}>
                      <Icon className={cn("size-3.5", stat.highlight ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-bold leading-tight truncate",
                        stat.highlight ? "text-primary" : "text-foreground")}>
                        {typeof stat.value === "number" ? stat.value.toLocaleString("pt-BR") : stat.value}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Regras de bonificação */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Regras de Bonificação
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              {REGRAS.map((rule, idx) => (
                <div key={idx} className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]",
                  rule.color
                )}>
                  <ChevronRight className="size-3 shrink-0 opacity-60" />
                  <span className="font-semibold shrink-0">{rule.label}</span>
                  <span className="opacity-50 shrink-0">→</span>
                  <span className="text-[10px]">{rule.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Console */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Console</span>
              </div>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                  limpar
                </button>
              )}
            </div>
            <ScrollArea className="h-[180px] bg-slate-950">
              <div className="p-3 font-mono text-[10px] leading-relaxed space-y-0.5">
                {logs.length === 0
                  ? <span className="text-slate-500 italic">Aguardando execução...</span>
                  : logs.map((log, i) => (
                    <div key={i} className={cn("flex gap-1.5", logColor[log.type])}>
                      <span className="text-slate-600 shrink-0">{log.time}</span>
                      <span className="shrink-0">{logPrefix[log.type]}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                }
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>

        </div>
      </div>

      {lastResult && !isExecuting && <FaturistaResultViewer result={lastResult} />}
    </div>
  )
}