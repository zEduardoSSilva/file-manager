"use client"

import * as React from "react"
import {
  Play, Trash2, FileCode, Loader2, HelpCircle,
  Download, CheckCircle2, Circle, XCircle, AlertTriangle,
  ChevronRight, Terminal, Info, Database,
  Clock, Calendar as CalendarIcon, X, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { executePontoPipeline } from "@/app/actions/import-ponto-actions"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StageStatus = "idle" | "running" | "done" | "error" | "warn"
interface Stage { id: string; label: string; description: string; status: StageStatus }
interface LogEntry { time: string; message: string; type: "info" | "success" | "error" | "warn" | "step" }

// ─── Etapas ───────────────────────────────────────────────────────────────────
const INITIAL_STAGES: Stage[] = [
  { id: "load",   label: "Carregar CSVs de ponto",     description: "Lê os arquivos de Motoristas e Ajudantes",              status: "idle" },
  { id: "parse",  label: "Parsear marcações",           description: "Extrai Entrada · Saída · Almoço · Retorno por dia",      status: "idle" },
  { id: "dedup",  label: "Remover duplicatas",          description: "Prioriza o registro mais completo por ID+Data",          status: "idle" },
  { id: "mot",    label: "Conformidade Motoristas",     description: "Marcações + 5 critérios → R$ 3,20/dia",                 status: "idle" },
  { id: "aju",    label: "Conformidade Ajudantes",      description: "Marcações + 5 critérios → R$ 4,80/dia",                 status: "idle" },
  { id: "abs",    label: "Análise de Absenteísmo",      description: "Presença física + Atestados/Férias → incentivo",        status: "idle" },
  { id: "export", label: "Exportar / Salvar Firebase",  description: "11 abas: ponto bruto · detalhe · consolidado · abs",   status: "idle" },
]

const REGRAS = [
  { condition: "Motorista — Marcações (4/4)", result: "R$ 1,60 GARANTIDO",         variant: "success" as const },
  { condition: "Motorista — 5 Critérios OK",  result: "R$ 1,60 TUDO OU NADA",      variant: "danger"  as const },
  { condition: "Ajudante — Marcações (4/4)",  result: "R$ 2,40 GARANTIDO",         variant: "success" as const },
  { condition: "Ajudante — 5 Critérios OK",   result: "R$ 2,40 TUDO OU NADA",      variant: "danger"  as const },
  { condition: "Presença 100%",               result: "Incentivo R$ 50,00",         variant: "success" as const },
  { condition: "Presença ≥ 90%",              result: "Incentivo R$ 40,00",         variant: "success" as const },
  { condition: "Presença ≥ 75%",              result: "Incentivo R$ 25,00",         variant: "warn"    as const },
  { condition: "Presença < 75%",              result: "Incentivo R$ 0,00",          variant: "danger"  as const },
  { condition: "Atestados / Férias",          result: "Contam como presença",       variant: "info"    as const },
]

const CRITERIOS = [
  "Jornada — não exceder carga padrão + 2h",
  "Hora Extra — máximo 2h de HE",
  "Almoço — mínimo 1h de intervalo",
  "Intrajornada — nenhum período > 6h seguidas",
  "Interjornada — mínimo 11h de descanso",
]

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function StageIcon({ status }: { status: StageStatus }) {
  if (status === "running") return <Loader2 className="size-4 animate-spin text-primary shrink-0" />
  if (status === "done")    return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
  if (status === "error")   return <XCircle className="size-4 text-destructive shrink-0" />
  if (status === "warn")    return <AlertTriangle className="size-4 text-amber-500 shrink-0" />
  return <Circle className="size-4 text-muted-foreground/30 shrink-0" />
}
const stageBg: Record<StageStatus, string> = {
  idle: "bg-muted/20 border-border/40", running: "bg-primary/5 border-primary/30",
  done: "bg-emerald-50 border-emerald-200", error: "bg-red-50 border-red-200", warn: "bg-amber-50 border-amber-200",
}
const stageLbl: Record<StageStatus, string> = {
  idle: "text-muted-foreground", running: "text-primary font-semibold",
  done: "text-emerald-700 font-medium", error: "text-red-700 font-semibold", warn: "text-amber-700 font-medium",
}
const ruleColor = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger:  "border-red-200 bg-red-50 text-red-700",
  warn:    "border-amber-200 bg-amber-50 text-amber-700",
  info:    "border-blue-200 bg-blue-50 text-blue-700",
}
const logColor: Record<LogEntry["type"], string> = {
  info: "text-slate-400", success: "text-emerald-400",
  error: "text-red-400 font-semibold", warn: "text-amber-400", step: "text-primary font-semibold",
}
const logPrefix: Record<LogEntry["type"], string> = {
  info: "   ", success: "✅ ", error: "❌ ", warn: "⚠️  ", step: "▶  ",
}

function fileBadge(name: string) {
  const n = name.toLowerCase()
  if (/ajudante/i.test(n))    return { label: "Ajudante",    cls: "bg-violet-100 text-violet-700 border-violet-200" }
  if (/motorista/i.test(n))   return { label: "Motorista",   cls: "bg-sky-100 text-sky-700 border-sky-200" }
  return                               { label: "Ponto",      cls: "bg-slate-100 text-slate-600 border-slate-200" }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function PontoPipelineView() {
  const [year, setYear]           = React.useState(new Date().getFullYear())
  const [month, setMonth]         = React.useState(new Date().getMonth() + 1)
  const [files, setFiles]         = React.useState<File[]>([])
  const [excludedDates, setExcludedDates] = React.useState<Date[]>([])
  const [includeSundays, setIncludeSundays] = React.useState(false)
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress]   = React.useState(0)
  const [stages, setStages]       = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]           = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null)
  const [stats, setStats]         = React.useState<{
    motoristas: number; ajudantes: number; bonifPonto: number; bonifAbs: number
  } | null>(null)
  const logEndRef = React.useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") =>
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString("pt-BR"), message, type }])

  const setStage = (id: string, status: StageStatus) =>
    setStages(prev => prev.map(s => s.id === id ? { ...s, status } : s))

  const resetAll = () => {
    setStages(INITIAL_STAGES.map(s => ({ ...s, status: "idle" })))
    setProgress(0); setStats(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }
  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))
  const removeDate = (d: Date) => setExcludedDates(prev => prev.filter(x => x.getTime() !== d.getTime()))

  const runPipeline = async (downloadOnly = false) => {
    if (!files.length) return
    setIsExecuting(true); setLogs([]); resetAll()

    try {
      addLog(`Ponto — ${String(month).padStart(2,"0")}/${year}`, "step")
      addLog(`${files.length} arquivo(s) · ${excludedDates.length} feriado(s) excluído(s)`)
      addLog(`Domingos: ${includeSundays ? "Considerados" : "Ignorados"}`)

      // Etapa 1
      setStage("load", "running"); setProgress(8)
      files.forEach(f => {
        const b = fileBadge(f.name)
        addLog(`• [${b.label}] ${f.name}`)
      })
      setStage("load", "done"); setProgress(15)

      // Monta FormData
      const formData = new FormData()
      formData.append("year", String(year))
      formData.append("month", String(month))
      formData.append("includeSundays", String(includeSundays))
      formData.append("excludedDates", JSON.stringify(excludedDates.map(d => format(d, "dd/MM/yyyy"))))
      files.forEach(f => {
        formData.append("files", f)
        formData.append("fileNames", f.name)
      })

      // Etapa 2
      addLog("Parseando marcações por colaborador/dia...", "step")
      setStage("parse", "running"); setProgress(25)
      const response = await executePontoPipeline(formData)
      if (!response.success) throw new Error(response.error)
      setStage("parse", "done"); setProgress(35)
      addLog("Marcações extraídas.", "success")

      // Etapa 3
      addLog("Removendo duplicatas (prioriza registro mais completo)...", "step")
      setStage("dedup", "running"); setProgress(45)
      await new Promise(r => setTimeout(r, 100))
      setStage("dedup", "done"); setProgress(52)
      addLog("Deduplicação concluída.", "success")

      // Etapas 4 e 5
      addLog("Analisando conformidade de ponto — Motoristas...", "step")
      setStage("mot", "running"); setProgress(62)
      await new Promise(r => setTimeout(r, 100))
      setStage("mot", "done")

      addLog("Analisando conformidade de ponto — Ajudantes...", "step")
      setStage("aju", "running"); setProgress(72)
      await new Promise(r => setTimeout(r, 100))
      setStage("aju", "done")
      addLog("5 critérios avaliados.", "success")

      // Etapa 6
      addLog("Calculando absenteísmo (presença física + justificadas)...", "step")
      setStage("abs", "running"); setProgress(84)
      await new Promise(r => setTimeout(r, 100))
      setStage("abs", "done"); setProgress(93)
      addLog("Incentivo de presença calculado.", "success")

      // Etapa 7
      setStage("export", "running"); setProgress(97)
      const result = response.result
      setLastResult(result)

      // Extrai stats do summary
      const m = (result.summary ?? "").match(/(\d+) motoristas · (\d+) ajudantes · R\$ ([\d,.]+) ponto · R\$ ([\d,.]+) absenteísmo/)
      if (m) {
        setStats({
          motoristas: parseInt(m[1]),
          ajudantes:  parseInt(m[2]),
          bonifPonto: parseFloat(m[3].replace(",",".")),
          bonifAbs:   parseFloat(m[4].replace(",",".")),
        })
      }

      if (downloadOnly && result.extraSheets) {
        downloadMultipleSheets(
          result.extraSheets.map((s: any) => ({ data: s.data, name: s.name })),
          `Ponto_${String(month).padStart(2,"0")}_${year}`
        )
        addLog("Excel com 11 abas baixado.", "success")
      } else {
        addLog("Dados sincronizados com Firebase.", "success")
      }

      setStage("export", "done"); setProgress(100)
      addLog(result.summary ?? "Pipeline concluído.", "success")
      toast({ title: downloadOnly ? "Excel pronto" : "Pipeline concluído", description: result.summary })

    } catch (err: any) {
      addLog(`FALHA: ${err.message}`, "error")
      setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s))
      setProgress(0)
      toast({ variant: "destructive", title: "Erro no pipeline", description: err.message })
    } finally {
      setIsExecuting(false)
    }
  }

  const doneCount = stages.filter(s => s.status === "done" || s.status === "warn").length
  const hasError  = stages.some(s => s.status === "error")

  return (
    <div className="space-y-6">

      {/* Alert */}
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-primary" />
          <AlertTitle className="mb-0">Ponto + Absenteísmo</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Analisa os CSVs de ponto de Motoristas e Ajudantes. Avalia 5 critérios de conformidade e calcula incentivo de absenteísmo por faixa de presença.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Gera <strong>11 abas</strong>: ponto bruto · sem marcação · detalhe diário · consolidado · absenteísmo (Motoristas e Ajudantes).
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-5 text-primary" />
                Configuração de Ponto
              </CardTitle>
              <CardDescription>Período · arquivos CSV · feriados e configurações de jornada.</CardDescription>
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

              {/* Domingos */}
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/5">
                <Checkbox
                  id="include-sundays"
                  checked={includeSundays}
                  onCheckedChange={c => setIncludeSundays(!!c)}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor="include-sundays" className="text-sm font-medium cursor-pointer">
                    Considerar domingos como dia útil
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Por padrão, domingos são excluídos da base de cálculo de presença.
                  </p>
                </div>
              </div>

              {/* Feriados */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <CalendarIcon className="size-4 text-primary" /> Feriados / Datas Excluídas
                </Label>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {excludedDates.length === 0
                    ? <span className="text-xs text-muted-foreground italic">Nenhum feriado selecionado.</span>
                    : excludedDates.sort((a, b) => a.getTime() - b.getTime()).map((d, i) => (
                      <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1 text-xs">
                        {format(d, "dd/MM/yyyy")}
                        <button onClick={() => removeDate(d)} className="size-3.5 rounded-full hover:bg-destructive hover:text-white flex items-center justify-center transition-colors">
                          <X className="size-2" />
                        </button>
                      </Badge>
                    ))
                  }
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      <CalendarIcon className="mr-1.5 size-3" /> Selecionar datas
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="multiple" selected={excludedDates}
                      onSelect={dates => setExcludedDates(dates ?? [])}
                      locale={ptBR} initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Arquivos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-primary">
                    Arquivos CSV de Ponto ({files.length})
                  </Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => document.getElementById("ponto-file-input")?.click()}>
                    Adicionar arquivos
                  </Button>
                  <input
                    id="ponto-file-input" type="file" multiple className="hidden"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                  />
                </div>

                <div className={cn(
                  "rounded-xl border border-border/60 overflow-hidden",
                  files.length === 0 && "border-dashed"
                )}>
                  {files.length === 0
                    ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Clock className="size-8 mb-2 opacity-20" />
                        <p className="text-xs italic">Nenhum arquivo selecionado</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">Arquivos: Ponto_Original_*-*.csv</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[180px]">
                        <div className="p-2 space-y-1.5">
                          {files.map((file, idx) => {
                            const b = fileBadge(file.name)
                            return (
                              <div key={idx} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-background hover:bg-muted/10 transition-colors">
                                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0", b.cls)}>
                                  {b.label}
                                </span>
                                <span className="text-xs truncate flex-1 font-medium">{file.name}</span>
                                <Button variant="ghost" size="icon" className="size-6 shrink-0"
                                  onClick={() => removeFile(idx)}>
                                  <Trash2 className="size-3 text-destructive/70" />
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </ScrollArea>
                    )
                  }
                </div>
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
                  <Progress value={progress} className={cn("h-2", hasError && "[&>div]:bg-destructive")} />
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>{doneCount}/{stages.length} etapas</span>
                    <span>{isExecuting ? (stages.find(s => s.status === "running")?.label ?? "...") : (progress === 100 ? "Pipeline finalizado" : "")}</span>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4 pb-4 flex gap-2">
              <Button
                variant="outline" size="sm"
                className="flex-1 h-9 text-xs font-semibold border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-all"
                onClick={() => runPipeline(true)}
                disabled={isExecuting || !files.length}
              >
                <Download className="mr-1.5 size-3.5" /> Exportar Excel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs font-semibold shadow-sm transition-all"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || !files.length}
              >
                {isExecuting
                  ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Processando...</>
                  : <><Play className="mr-1.5 size-3.5 fill-current" /> Iniciar Pipeline</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* ── Coluna lateral ── */}
        <div className="space-y-4">

          {/* Etapas */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Etapas de Execução</span>
            </div>
            <div className="p-3 space-y-2">
              {stages.map((stage, idx) => (
                <div key={stage.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-0.5">
                    <StageIcon status={stage.status} />
                    {idx < stages.length - 1 && (
                      <div className={cn("w-px mt-1 min-h-[12px]", stage.status === "done" ? "bg-emerald-300" : "bg-border/60")} />
                    )}
                  </div>
                  <div className={cn("flex-1 px-2.5 py-1.5 rounded-lg border text-xs transition-all", stageBg[stage.status])}>
                    <p className={cn("leading-tight", stageLbl[stage.status])}>{stage.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{stage.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Motoristas",      value: stats.motoristas,                    icon: Users,    highlight: false },
                { label: "Ajudantes",       value: stats.ajudantes,                     icon: Users,    highlight: false },
                { label: "Bônus Ponto",     value: `R$ ${stats.bonifPonto.toFixed(2)}`, icon: Database, highlight: true  },
                { label: "Incentivo Abs.",  value: `R$ ${stats.bonifAbs.toFixed(2)}`,   icon: Database, highlight: true  },
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
                      <p className={cn("text-sm font-bold leading-tight", stat.highlight ? "text-primary" : "text-foreground")}>
                        {stat.value}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 5 Critérios */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">5 Critérios de Conformidade</span>
            </div>
            <div className="p-3 space-y-1">
              {CRITERIOS.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <span className="font-mono text-primary/60 shrink-0">{i + 1}.</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Regras */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Regras de Bonificação</span>
            </div>
            <div className="p-3 space-y-1.5">
              {REGRAS.map((rule, idx) => (
                <div key={idx} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]", ruleColor[rule.variant])}>
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
            <ScrollArea className="h-[220px] bg-slate-950">
              <div className="p-3 font-mono text-[10px] leading-relaxed space-y-0.5">
                {logs.length === 0
                  ? <span className="text-slate-500 italic">Aguardando arquivos de ponto...</span>
                  : logs.map((log, i) => (
                    <div key={i} className={cn("flex gap-1.5", logColor[log.type])}>
                      <span className="text-slate-600 shrink-0">{log.time}</span>
                      <span className="shrink-0">{logPrefix[log.type]}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>

        </div>
      </div>
    </div>
  )
}