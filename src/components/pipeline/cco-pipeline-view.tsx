"use client"

import * as React from "react"
import {
  Play,
  Trash2,
  FileCode,
  Loader2,
  BarChart3,
  Download,
  Info,
  HelpCircle,
  CheckCircle2,
  Circle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Terminal,
  Building2,
  TrendingUp,
  CalendarDays,
  DollarSign,
  FileSpreadsheet,
  BarChart2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeCcoPipeline } from "@/app/actions/cco-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

const BONIFICACAO_ROTAS = 16.0

const INITIAL_STAGES: Stage[] = [
  { id: "load",    label: "Carregar arquivos",              description: "Motoristas Ajustado + Ajudantes Ajustado",       status: "idle" },
  { id: "media",   label: "Etapa 1 — Médias diárias",       description: "Percentual por empresa/dia (Mot + Ajud)",        status: "idle" },
  { id: "dom",     label: "Etapa 2 — Remover domingos",     description: "Exclui registros de domingo da análise",         status: "idle" },
  { id: "bonus",   label: "Etapa 3 — Calcular bonificação", description: `R$ ${BONIFICACAO_ROTAS.toFixed(2)}/dia × % desempenho`,    status: "idle" },
  { id: "resumo",  label: "Etapa 4 — Resumos",              description: "Mensal por empresa + consolidado simples",        status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase",     description: "4 abas: Diária · Formatada · Mensal · Simples",  status: "idle" },
]

const REGRAS_CCO = [
  {
    condition: "Bonificação base por dia",
    result: `R$ ${BONIFICACAO_ROTAS.toFixed(2)} × % desempenho médio`,
    variant: "info" as const,
  },
  {
    condition: "Desempenho = média Motoristas + Ajudantes",
    result: "Outer join por Empresa + Dia, skipna=true",
    variant: "success" as const,
  },
  {
    condition: "Domingos",
    result: "Removidos automaticamente da análise",
    variant: "warn" as const,
  },
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

const ruleColor = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger:  "border-red-200 bg-red-50 text-red-700",
  warn:    "border-amber-200 bg-amber-50 text-amber-700",
  info:    "border-blue-200 bg-blue-50 text-blue-700",
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

// ─── FileInputRow ─────────────────────────────────────────────────────────────

interface FileInputRowProps {
  id: string
  label: string
  tag: string
  tagColor: string
  file: File | null
  setFile: (f: File | null) => void
}

function FileInputRow({ id, label, tag, tagColor, file, setFile }: FileInputRowProps) {
  return (
    <div className="flex items-center gap-2 bg-background px-3 py-2.5 rounded-lg border text-xs">
      <FileSpreadsheet className="size-3.5 text-muted-foreground shrink-0" />
      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0", tagColor)}>{tag}</span>
      <span className="truncate flex-1 font-medium text-muted-foreground">
        {file ? file.name : <span className="italic">{label}</span>}
      </span>
      {file && (
        <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => setFile(null)}>
          <Trash2 className="size-3 text-destructive/70" />
        </Button>
      )}
      <Button asChild variant="outline" size="sm" className="h-6 text-[10px] px-2 cursor-pointer shrink-0">
        <Label htmlFor={id}>{file ? "Trocar" : "Selecionar"}</Label>
      </Button>
      <Input
        id={id}
        type="file"
        className="hidden"
        accept=".xlsx,.xls"
        onChange={e => {
          if (e.target.files?.[0]) setFile(e.target.files[0])
          e.target.value = ""
        }}
      />
    </div>
  )
}

// ─── ResultViewer ─────────────────────────────────────────────────────────────

function CcoResultViewer({ result }: { result: PipelineResult }) {
  const [activeTab, setActiveTab] = React.useState<"mensal" | "simples" | "diaria">("mensal")

  const analiseDiaria:  any[] = result.analiseDiaria  ?? []
  const resumoMensal:   any[] = result.resumoMensal   ?? []
  const resumoSimples:  any[] = result.resumoSimples  ?? []

  if (!analiseDiaria.length && !resumoMensal.length) return null

  const totalBonificacao = resumoMensal.reduce((a: number, r: any) => a + (r["Total_Bonif_Mes"] ?? 0), 0)
  const totalEmpresas    = resumoMensal.length
  const totalDias        = resumoMensal.reduce((a: number, r: any) => a + (r["Dias_Analisados"] ?? 0), 0)
  const percMedio        = resumoMensal.length > 0
    ? resumoMensal.reduce((a: number, r: any) => a + (r["Perc_Medio_Desempenho"] ?? 0), 0) / resumoMensal.length
    : 0

  const TABS = [
    { id: "mensal",  label: "Resumo Mensal",  count: resumoMensal.length  },
    { id: "simples", label: "Resumo Simples", count: resumoSimples.length },
    { id: "diaria",  label: "Análise Diária", count: analiseDiaria.length },
  ] as const

  // Colunas para cada aba
  const colsMensal  = ["Empresa", "Dias_Analisados", "Perc_Medio_Motorista", "Perc_Medio_Ajudante", "Perc_Medio_Desempenho", "Total_Bonif_Mes"]
  const colsSimples = ["Empresa", "MES", "Bonificacao_Total", "Bonificacao_Atingida"]
  const colsDiaria  = ["Empresa", "Data", "Percentual_Atingido_Motorista", "Percentual_Atingido_Ajudante", "Percentual_Desempenho", "Valor_Bonificacao"]

  const LABEL_MAP: Record<string, string> = {
    Dias_Analisados:               "Dias",
    Perc_Medio_Motorista:          "% Mot",
    Perc_Medio_Ajudante:           "% Ajud",
    Perc_Medio_Desempenho:         "% Desemp",
    Total_Bonif_Mes:               "Bonif Total",
    Bonificacao_Total:             "Bonif Max",
    Bonificacao_Atingida:          "Bonif Atingida",
    Percentual_Atingido_Motorista: "% Mot",
    Percentual_Atingido_Ajudante:  "% Ajud",
    Percentual_Desempenho:         "% Desemp",
    Valor_Bonificacao:             "Bonif (R$)",
    MES:                           "Mês",
  }

  function label(col: string) { return LABEL_MAP[col] ?? col }

  function fmtVal(col: string, val: any) {
    if (val == null || val === "") return <span className="text-muted-foreground/40">—</span>
    if (typeof val === "number") {
      if (col.includes("Perc") || col.includes("perc")) return `${val.toFixed(2)}%`
      if (col.includes("Bonif") || col.includes("Valor")) return `R$ ${val.toFixed(2)}`
      return val.toLocaleString("pt-BR")
    }
    return String(val)
  }

  function rowClass(col: string, val: any): string {
    if (col.includes("Perc") || col.includes("perc")) {
      const n = typeof val === "number" ? val : 0
      if (n >= 90) return "text-emerald-600 font-semibold"
      if (n >= 70) return "text-amber-600"
      if (n < 70 && n > 0) return "text-red-500"
    }
    return ""
  }

  const activeData = activeTab === "mensal"
    ? { rows: resumoMensal, cols: colsMensal.filter(c => resumoMensal[0] && c in resumoMensal[0]) }
    : activeTab === "simples"
    ? { rows: resumoSimples, cols: colsSimples.filter(c => resumoSimples[0] && c in resumoSimples[0]) }
    : { rows: analiseDiaria, cols: colsDiaria.filter(c => analiseDiaria[0] && c in analiseDiaria[0]) }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Stats rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Empresas",          value: totalEmpresas,                       icon: Building2,   highlight: true  },
          { label: "Dias analisados",   value: totalDias,                            icon: CalendarDays,highlight: false },
          { label: "Desempenho médio",  value: `${percMedio.toFixed(2)}%`,           icon: TrendingUp,  highlight: false },
          { label: "Total bonificação", value: `R$ ${totalBonificacao.toFixed(2)}`,  icon: DollarSign,  highlight: true  },
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

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
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
            <BarChart2 className="size-3.5" />
            {tab.label}
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              activeTab === tab.id ? "bg-white/20" : "bg-muted"
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tabela */}
      {activeData.rows.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {TABS.find(t => t.id === activeTab)?.label}
            </span>
            <span className="text-[10px] text-muted-foreground">{activeData.rows.length} registros</span>
          </div>
          <ScrollArea className="h-[460px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow>
                    {activeData.cols.map(col => (
                      <TableHead key={col} className="text-[10px] font-bold uppercase whitespace-nowrap px-2 py-2">
                        {label(col)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeData.rows.map((row, i) => (
                    <TableRow key={i} className="text-xs">
                      {activeData.cols.map(col => (
                        <TableCell
                          key={col}
                          className={cn("px-2 py-1.5 whitespace-nowrap", rowClass(col, row[col]))}
                        >
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

export function CcoPipelineView() {
  const [year, setYear]   = React.useState(new Date().getFullYear())
  const [month, setMonth] = React.useState(new Date().getMonth() + 1)
  const [fileMotoristas, setFileMotoristas] = React.useState<File | null>(null)
  const [fileAjudantes,  setFileAjudantes]  = React.useState<File | null>(null)
  const [isExecuting, setIsExecuting]       = React.useState(false)
  const [progress, setProgress]             = React.useState(0)
  const [stages, setStages]                 = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]                     = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult]         = React.useState<PipelineResult | null>(null)
  const [stats, setStats]                   = React.useState<{
    empresas: number; dias: number; bonificacao: number; domingoRemovidos: number
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

  const canRun = !!(fileMotoristas && fileAjudantes)

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(0)
    setLogs([])
    setStats(null)
    resetStages()

    try {
      addLog(`Consolidador CCO iniciado — ${String(month).padStart(2, "0")}/${year}`, "step")
      addLog(`Motoristas: ${fileMotoristas!.name}`)
      addLog(`Ajudantes:  ${fileAjudantes!.name}`)

      // ── Load ──────────────────────────────────────────────────────────
      setStage("load", "running")
      setProgress(10)
      await new Promise(r => setTimeout(r, 200))

      const formData = new FormData()
      formData.append("year",           year.toString())
      formData.append("month",          month.toString())
      formData.append("fileMotoristas", fileMotoristas!)
      formData.append("fileAjudantes",  fileAjudantes!)

      const response = await executeCcoPipeline(formData)
      if (!response?.success) throw new Error(response?.error || "Erro desconhecido no servidor.")

      setStage("load", "done")
      addLog("Arquivos carregados e abas identificadas.", "success")
      setProgress(25)

      // ── Médias diárias ────────────────────────────────────────────────
      addLog("Etapa 1 — Calculando médias diárias por Empresa...", "step")
      setStage("media", "running")
      setProgress(42)
      await new Promise(r => setTimeout(r, 120))
      setStage("media", "done")
      addLog("Médias de Motoristas + Ajudantes calculadas.", "success")
      setProgress(55)

      // ── Domingos ──────────────────────────────────────────────────────
      addLog("Etapa 2 — Removendo domingos da análise...", "step")
      setStage("dom", "running")
      setProgress(63)
      await new Promise(r => setTimeout(r, 100))

      const domingoRemovidos: number = response.result.domingoRemovidos ?? 0
      if (domingoRemovidos > 0) {
        addLog(`${domingoRemovidos} registros de domingo removidos.`, "warn")
        setStage("dom", "warn")
      } else {
        setStage("dom", "done")
        addLog("Nenhum domingo encontrado no período.", "success")
      }
      setProgress(72)

      // ── Bonificação ───────────────────────────────────────────────────
      addLog(`Etapa 3 — Calculando bonificação (R$ ${BONIFICACAO_ROTAS.toFixed(2)}/dia × %)...`, "step")
      setStage("bonus", "running")
      setProgress(80)
      await new Promise(r => setTimeout(r, 100))
      setStage("bonus", "done")
      setProgress(87)

      // ── Resumos ───────────────────────────────────────────────────────
      addLog("Etapa 4 — Gerando resumo mensal e consolidado simples...", "step")
      setStage("resumo", "running")
      setProgress(93)
      await new Promise(r => setTimeout(r, 100))
      setStage("resumo", "done")
      setProgress(96)

      const result = response.result
      setLastResult(result)

      const resumoMensal: any[] = result.resumoMensal ?? []
      const analiseDiaria: any[] = result.analiseDiaria ?? []

      const empresas    = resumoMensal.length
      const diasTotal   = resumoMensal.reduce((a: number, r: any) => a + (r["Dias_Analisados"] ?? 0), 0)
      const bonificacao = resumoMensal.reduce((a: number, r: any) => a + (r["Total_Bonif_Mes"] ?? 0), 0)

      setStats({ empresas, dias: diasTotal, bonificacao, domingoRemovidos })

      addLog(`${empresas} empresas · ${diasTotal} dias · R$ ${bonificacao.toFixed(2)} em bonificações`, "success")

      // ── Export ────────────────────────────────────────────────────────
      setStage("export", "running")
      setProgress(98)

      if (downloadOnly) {
        addLog("Gerando Excel com 4 abas...", "step")
        downloadMultipleSheets(
          [
            { data: analiseDiaria,                       name: "01_Analise_Diaria"            },
            { data: result.analiseDiariaFormatada ?? [], name: "02_Analise_Diaria_Formatada"   },
            { data: resumoMensal,                        name: "03_Resumo_Mensal"              },
            { data: result.resumoSimples ?? [],          name: "04_Resumo_Simples"             },
          ],
          `CCO_Consolidado_${month}_${year}`
        )
        addLog("Arquivo Excel baixado com sucesso.", "success")
      } else {
        addLog("Dados sincronizados com Firebase.", "success")
      }

      setStage("export", "done")
      setProgress(100)
      addLog(`Pipeline concluído em ${new Date().toLocaleTimeString("pt-BR")}.`, "success")

      toast({
        title: downloadOnly ? "Excel pronto" : "Pipeline concluído",
        description: result.summary ?? "",
      })

    } catch (error: any) {
      const msg = error?.message || String(error)
      addLog(`FALHA: ${msg}`, "error")
      setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s))
      setProgress(0)
      toast({ variant: "destructive", title: "Erro no pipeline CCO", description: msg })
    } finally {
      setIsExecuting(false)
    }
  }

  const doneCount = stages.filter(s => s.status === "done" || s.status === "warn").length
  const hasError  = stages.some(s => s.status === "error")

  return (
    <div className="space-y-6">

      {/* ── Alert informativo ── */}
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidador CCO — Análise por Empresa</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Processa os relatórios ajustados (Motoristas + Ajudantes) e gera a visão de desempenho e bonificação por empresa/dia, removendo domingos.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Média de <strong>Motoristas + Ajudantes</strong> por empresa/dia.
          Bonificação de <strong>R$ {BONIFICACAO_ROTAS.toFixed(2)}/dia</strong> × % desempenho. Domingos removidos.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5 text-primary" />
                Configuração do Consolidador CCO
              </CardTitle>
              <CardDescription>Relatórios ajustados gerados pelo pipeline Coordenadores</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
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

              {/* Arquivos */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-primary">Arquivos de Entrada</Label>
                <FileInputRow
                  id="cco-motoristas"
                  label="relatorio_consolidado_Motoristas_Ajustado.xlsx"
                  tag="Motoristas"
                  tagColor="bg-primary/10 text-primary"
                  file={fileMotoristas}
                  setFile={setFileMotoristas}
                />
                <FileInputRow
                  id="cco-ajudantes"
                  label="relatorio_consolidado_Ajudantes_Ajustado.xlsx"
                  tag="Ajudantes"
                  tagColor="bg-emerald-100 text-emerald-700"
                  file={fileAjudantes}
                  setFile={setFileAjudantes}
                />
              </div>

              {/* Progresso */}
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
                { label: "Empresas",          value: stats.empresas,                           icon: Building2,    highlight: true  },
                { label: "Dias analisados",   value: stats.dias,                               icon: CalendarDays, highlight: false },
                { label: "Domingos removidos",value: stats.domingoRemovidos,                   icon: AlertTriangle,highlight: false },
                { label: "Total bonificação", value: `R$ ${stats.bonificacao.toFixed(2)}`,     icon: TrendingUp,   highlight: true  },
              ].map(stat => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className={cn(
                    "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm",
                    stat.label === "Total bonificação" && "col-span-2",
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

          {/* Regras */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Regras de Cálculo
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              {REGRAS_CCO.map((rule, idx) => (
                <div key={idx} className={cn(
                  "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                  ruleColor[rule.variant]
                )}>
                  <ChevronRight className="size-3 mt-0.5 shrink-0 opacity-60" />
                  <div>
                    <span className="font-semibold">{rule.condition}</span>
                    <span className="mx-1 opacity-50">→</span>
                    <span>{rule.result}</span>
                  </div>
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
            <ScrollArea className="h-[200px] bg-slate-950">
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

      {lastResult && !isExecuting && <CcoResultViewer result={lastResult} />}
    </div>
  )
}