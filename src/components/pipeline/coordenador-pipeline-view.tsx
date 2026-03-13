"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  Building2,
  Download,
  Info,
  HelpCircle,
  CheckCircle2,
  Circle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Terminal,
  Users,
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  CalendarDays,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeCoordenadorPipeline } from "@/app/actions/import-coordenador-actions"
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

// ─── Constantes de negócio ────────────────────────────────────────────────────

const PERCENTUAL_MAXIMO_DEVOLUCAO = 15.0
const BONIFICACAO_MAXIMA_MOTORISTA = 16.0
const BONIFICACAO_MAXIMA_AJUDANTE  = 12.0

const REGRAS_NEGOCIO = [
  {
    condition: "% Devolvido ≥ 15% no dia",
    result: "R$ 0,00 — ZERA todas as bonificações do dia",
    variant: "danger" as const,
  },
  {
    condition: "Motorista (máx/dia)",
    result: "R$ 8,00 (Perf) + R$ 3,20 (Ponto) + R$ 4,80 (Condução) = R$ 16,00",
    variant: "info" as const,
  },
  {
    condition: "Ajudante (máx/dia)",
    result: "R$ 7,20 (Perf) + R$ 4,80 (Ponto) = R$ 12,00",
    variant: "success" as const,
  },
]

// ─── Etapas ───────────────────────────────────────────────────────────────────

const INITIAL_STAGES: Stage[] = [
  { id: "load",     label: "Carregar arquivos",            description: "Motoristas Ajustado + Ajudantes Ajustado", status: "idle" },
  { id: "merge",    label: "Etapa 1 — Merge das fontes",   description: "Performance + Ponto + Condução por colaborador/dia", status: "idle" },
  { id: "penalty",  label: "Etapa 2 — Regra de devolução", description: "≥ 15% devolvido → zera bonificação do dia", status: "idle" },
  { id: "totals",   label: "Etapa 3 — Cálculo de totais",  description: "Bonificação diária + acumulada + % atingido", status: "idle" },
  { id: "enrich",   label: "Etapa 4 — Enriquecimento",     description: "Empresa · Cargo · filtro por função",       status: "idle" },
  { id: "export",   label: "Exportar / Salvar Firebase",   description: "Motoristas Ajustado + Ajudantes Ajustado", status: "idle" },
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

function CoordenadorResultViewer({ result }: { result: PipelineResult }) {
  const [activeTab, setActiveTab] = React.useState<"motoristas" | "ajudantes">("motoristas")

  const motoristas: any[] = result.motoristas ?? []
  const ajudantes:  any[] = result.ajudantes  ?? []
  const erros:      any[] = result.erros       ?? []

  const statsMotoristas = React.useMemo(() => {
    if (!motoristas.length) return null
    const penalizados = motoristas.filter(r => r["PESO_Penalizado"]).length
    const bonTotal    = motoristas.reduce((a, r) => a + (r["Bonificacao_Diaria_Total"] ?? 0), 0)
    const unicos      = new Set(motoristas.map(r => r["Motorista"])).size
    return { penalizados, bonTotal, unicos, dias: motoristas.length }
  }, [motoristas])

  const statsAjudantes = React.useMemo(() => {
    if (!ajudantes.length) return null
    const penalizados = ajudantes.filter(r => r["PESO_Penalizado"]).length
    const bonTotal    = ajudantes.reduce((a, r) => a + (r["Bonificacao_Diaria_Total"] ?? 0), 0)
    const unicos      = new Set(ajudantes.map(r => r["Ajudante"])).size
    return { penalizados, bonTotal, unicos, dias: ajudantes.length }
  }, [ajudantes])

  const activeData  = activeTab === "motoristas" ? motoristas : ajudantes
  const activeStats = activeTab === "motoristas" ? statsMotoristas : statsAjudantes
  const colName     = activeTab === "motoristas" ? "Motorista" : "Ajudante"
  const maxBonus    = activeTab === "motoristas" ? BONIFICACAO_MAXIMA_MOTORISTA : BONIFICACAO_MAXIMA_AJUDANTE

  if (!motoristas.length && !ajudantes.length) return null

  // Colunas da tabela: fixas + dinâmicas
  const COLS_ALWAYS = [colName, "Dia", "Empresa", "Cargo"]
  const COLS_BONUS  = ["PERF_Bonificacao", "TOTAL_Ponto_Bonificacao", "COND_Bonificacao",
                       "Bonificacao_Diaria_Total", "Percentual_Atingido"]
  const COLS_PESO   = ["PESO_Percentual_Devolvido", "PESO_Penalizado"]
  const COLS_STATUS = ["PERF_Raio_100m", "PERF_SLA_Janela", "PERF_Tempo_Min", "PERF_Sequenciamento",
                       "PONTO_Todas_Batidas", "JORNADA_Intrajornada", "JORNADA_Interjornada", "JORNADA_DSR",
                       "COND_Curva_Brusca", "COND_Banguela", "COND_Ociosidade", "COND_Excesso_Velocidade"]

  const allKeys   = activeData.length > 0 ? Object.keys(activeData[0]) : []
  const dynCols   = [...COLS_PESO, ...COLS_STATUS, ...COLS_BONUS].filter(c => allKeys.includes(c))
  const tableCols = [...COLS_ALWAYS.filter(c => allKeys.includes(c)), ...dynCols]

  function cellClass(col: string, value: any) {
    if (col === "PESO_Penalizado") return value ? "text-red-600 font-bold" : "text-emerald-600"
    if (typeof value === "string") {
      if (value === "OK")    return "text-emerald-600 font-semibold"
      if (value === "FALHA") return "text-red-500 font-semibold"
    }
    return ""
  }

  function formatValue(col: string, value: any) {
    if (value == null || value === "") return <span className="text-muted-foreground/40">—</span>
    if (col === "PESO_Penalizado")  return value ? "⛔ SIM" : "✓ NÃO"
    if (typeof value === "number" && (col.includes("Bonif") || col.includes("Bonus") || col.includes("Total"))) {
      return `R$ ${value.toFixed(2)}`
    }
    if (col === "Dia" && value) return String(value)
    return String(value)
  }

  function labelCol(col: string) {
    const map: Record<string, string> = {
      PERF_Raio_100m: "Raio", PERF_SLA_Janela: "SLA", PERF_Tempo_Min: "Tempo Min",
      PERF_Sequenciamento: "Seq", PERF_Bonificacao: "Perf (R$)",
      PONTO_Todas_Batidas: "Batidas", JORNADA_Intrajornada: "Intrajorn",
      JORNADA_Interjornada: "Interjorn", JORNADA_DSR: "DSR",
      TOTAL_Ponto_Bonificacao: "Ponto (R$)",
      COND_Curva_Brusca: "Curva", COND_Banguela: "Banguela",
      COND_Ociosidade: "Ociosidade", COND_Excesso_Velocidade: "Velocidade",
      COND_Bonificacao: "Cond (R$)",
      PESO_Percentual_Devolvido: "% Dev", PESO_Penalizado: "Penalizado",
      Bonificacao_Diaria_Total: "Total (R$)", Percentual_Atingido: "% Atingido",
    }
    return map[col] ?? col
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {erros.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Erros de Processamento ({erros.length})</AlertTitle>
          <AlertDescription className="text-xs mt-1">
            {erros.slice(0, 3).map((e: any, i: number) => <div key={i}>{e.erro ?? String(e)}</div>)}
            {erros.length > 3 && <div>+{erros.length - 3} mais...</div>}
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(["motoristas", "ajudantes"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all",
              activeTab === tab
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card border-border/60 text-muted-foreground hover:bg-muted/30"
            )}
          >
            <Users className="size-3.5" />
            {tab === "motoristas" ? "Motoristas" : "Ajudantes"}
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              activeTab === tab ? "bg-white/20" : "bg-muted"
            )}>
              {tab === "motoristas" ? new Set(motoristas.map(r => r["Motorista"])).size : new Set(ajudantes.map(r => r["Ajudante"])).size}
            </span>
          </button>
        ))}
      </div>

      {/* Stats do grupo ativo */}
      {activeStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: `${colName}s únicos`,   value: activeStats.unicos,                            icon: Users,        highlight: true  },
            { label: "Dias analisados",       value: activeStats.dias,                              icon: CalendarDays, highlight: false },
            { label: "Total bonificação",     value: `R$ ${activeStats.bonTotal.toFixed(2)}`,       icon: DollarSign,   highlight: true  },
            { label: "Dias penalizados",      value: activeStats.penalizados,                       icon: AlertTriangle,highlight: false },
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

      {/* Tabela detalhada */}
      {activeData.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Relatório Diário — {activeTab === "motoristas" ? "Motoristas" : "Ajudantes"}
            </span>
            <span className="text-[10px] text-muted-foreground">{activeData.length} registros</span>
          </div>
          <ScrollArea className="h-[480px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow>
                    {tableCols.map(col => (
                      <TableHead key={col} className="text-[10px] font-bold uppercase whitespace-nowrap px-2 py-2">
                        {labelCol(col)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeData.map((row, i) => (
                    <TableRow key={i} className={cn(
                      "text-xs",
                      row["PESO_Penalizado"] && "bg-red-50/50"
                    )}>
                      {tableCols.map(col => (
                        <TableCell
                          key={col}
                          className={cn("px-2 py-1.5 whitespace-nowrap", cellClass(col, row[col]))}
                        >
                          {formatValue(col, row[col])}
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

export function CoordenadorPipelineView() {
  const [year, setYear]     = React.useState(new Date().getFullYear())
  const [month, setMonth]   = React.useState(new Date().getMonth() + 1)
  const [fileMotoristas, setFileMotoristas] = React.useState<File | null>(null)
  const [fileAjudantes,  setFileAjudantes]  = React.useState<File | null>(null)
  const [isExecuting, setIsExecuting]       = React.useState(false)
  const [progress, setProgress]             = React.useState(0)
  const [stages, setStages]                 = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]                     = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult]         = React.useState<PipelineResult | null>(null)
  const [stats, setStats]                   = React.useState<{
    motoristas: number; ajudantes: number; bonTotal: number
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
      addLog(`Pipeline Coordenadores iniciado — ${String(month).padStart(2, "0")}/${year}`, "step")
      addLog(`Motoristas: ${fileMotoristas!.name}`)
      addLog(`Ajudantes:  ${fileAjudantes!.name}`)

      // ── Etapa Load ────────────────────────────────────────────────────
      setStage("load", "running")
      setProgress(10)
      await new Promise(r => setTimeout(r, 200))
      setStage("load", "done")
      addLog("Arquivos carregados com sucesso.", "success")
      setProgress(20)

      // ── Etapa Merge ───────────────────────────────────────────────────
      addLog("Etapa 1 — Merge das fontes por Colaborador + Dia...", "step")
      setStage("merge", "running")
      setProgress(30)

      const formData = new FormData()
      formData.append("year",           year.toString())
      formData.append("month",          month.toString())
      formData.append("fileMotoristas", fileMotoristas!)
      formData.append("fileAjudantes",  fileAjudantes!)

      const response = await executeCoordenadorPipeline(formData)

      if (!response?.success) throw new Error(response?.error || "Erro desconhecido no servidor.")

      setStage("merge", "done")
      addLog("Fontes mescladas: Performance + Ponto + Condução.", "success")
      setProgress(50)

      // ── Etapa Penalização ─────────────────────────────────────────────
      addLog("Etapa 2 — Aplicando regra de devolução (≥ 15%)...", "step")
      setStage("penalty", "running")
      setProgress(62)
      await new Promise(r => setTimeout(r, 120))
      setStage("penalty", "done")
      setProgress(70)

      // ── Etapa Totais ──────────────────────────────────────────────────
      addLog("Etapa 3 — Calculando bonificação diária e acumulada...", "step")
      setStage("totals", "running")
      setProgress(78)
      await new Promise(r => setTimeout(r, 100))
      setStage("totals", "done")
      setProgress(84)

      // ── Etapa Enriquecimento ──────────────────────────────────────────
      addLog("Etapa 4 — Enriquecendo com Empresa e Cargo...", "step")
      setStage("enrich", "running")
      setProgress(90)
      await new Promise(r => setTimeout(r, 100))
      setStage("enrich", "done")
      setProgress(95)

      const result = response.result
      setLastResult(result)

      const motoristas: any[] = result.motoristas ?? []
      const ajudantes:  any[] = result.ajudantes  ?? []
      const bonMotor = motoristas.reduce((a: number, r: any) => a + (r["Bonificacao_Diaria_Total"] ?? 0), 0)
      const bonAjud  = ajudantes.reduce((a: number, r: any)  => a + (r["Bonificacao_Diaria_Total"] ?? 0), 0)

      setStats({
        motoristas: new Set(motoristas.map((r: any) => r["Motorista"])).size,
        ajudantes:  new Set(ajudantes.map((r: any)  => r["Ajudante"])).size,
        bonTotal:   bonMotor + bonAjud,
      })

      addLog(`${new Set(motoristas.map((r: any) => r["Motorista"])).size} motoristas · R$ ${bonMotor.toFixed(2)} em bonificações`, "success")
      addLog(`${new Set(ajudantes.map((r: any) => r["Ajudante"])).size} ajudantes · R$ ${bonAjud.toFixed(2)} em bonificações`, "success")

      // ── Exportar ──────────────────────────────────────────────────────
      setStage("export", "running")
      setProgress(98)

      if (downloadOnly) {
        addLog("Gerando Excel com múltiplas abas...", "step")
        downloadMultipleSheets(
          [
            { data: motoristas, name: "Motoristas_Ajustado" },
            { data: ajudantes,  name: "Ajudantes_Ajustado"  },
          ],
          `Coordenadores_Consolidado_${month}_${year}`
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
      toast({ variant: "destructive", title: "Erro no pipeline", description: msg })
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
          <AlertTitle className="mb-0">Consolidador Final — Motoristas & Ajudantes</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Processa os relatórios ajustados gerados pelos pipelines anteriores e gera a visão consolidada com Empresa, Cargo e bonificação total.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Consolida <strong>Performance + Ponto + Condução</strong> por colaborador/dia.
          Penaliza dias com devolução ≥ {PERCENTUAL_MAXIMO_DEVOLUCAO}%.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                Configuração do Consolidador
              </CardTitle>
              <CardDescription>Relatórios gerados pelos pipelines de Performance, Ponto e Condução</CardDescription>
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
                  id="file-motoristas"
                  label="Motoristas_Ajustado.xlsx (gerado pelo pipeline anterior)"
                  tag="Motoristas"
                  tagColor="bg-primary/10 text-primary"
                  file={fileMotoristas}
                  setFile={setFileMotoristas}
                />
                <FileInputRow
                  id="file-ajudantes"
                  label="Ajudantes_Ajustado.xlsx (gerado pelo pipeline anterior)"
                  tag="Ajudantes"
                  tagColor="bg-emerald-100 text-emerald-700"
                  file={fileAjudantes}
                  setFile={setFileAjudantes}
                />
              </div>

              {/* Barra de progresso */}
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
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
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

          {/* Stats (só aparecem após execução) */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Motoristas",        value: stats.motoristas, icon: Users,      highlight: true  },
                { label: "Ajudantes",          value: stats.ajudantes,  icon: Users,      highlight: false },
                { label: "Total bonificação",  value: `R$ ${stats.bonTotal.toFixed(2)}`, icon: TrendingUp, highlight: true  },
              ].map(stat => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className={cn(
                    "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm col-span-1",
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

          {/* Regras de negócio */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Regras de Bonificação
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              {REGRAS_NEGOCIO.map((rule, idx) => (
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Console
                </span>
              </div>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  limpar
                </button>
              )}
            </div>
            <ScrollArea className="h-[220px] bg-slate-950">
              <div className="p-3 font-mono text-[10px] leading-relaxed space-y-0.5">
                {logs.length === 0 ? (
                  <span className="text-slate-500 italic">Aguardando execução...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={cn("flex gap-1.5", logColor[log.type])}>
                      <span className="text-slate-600 shrink-0">{log.time}</span>
                      <span className="shrink-0">{logPrefix[log.type]}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>

        </div>
      </div>

      {lastResult && !isExecuting && <CoordenadorResultViewer result={lastResult} />}
    </div>
  )
}