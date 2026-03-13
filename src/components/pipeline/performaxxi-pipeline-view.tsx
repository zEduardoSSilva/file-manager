"use client"

import * as React from "react"
import {
  Upload, Play, Trash2, FileCode, Loader2, Zap,
  HelpCircle, Download, Info, CheckCircle2, Circle,
  XCircle, AlertTriangle, ChevronRight, Terminal, Users, Database,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executePerformaxxiPipeline } from "@/app/actions/import-performaxxi-actions"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "../../pages/Data-Viewer"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StageStatus = "idle" | "running" | "done" | "error" | "warn"
interface Stage { id: string; label: string; description: string; status: StageStatus }
interface LogEntry { time: string; message: string; type: "info" | "success" | "error" | "warn" | "step" }

// ─── Etapas ───────────────────────────────────────────────────────────────────
const INITIAL_STAGES: Stage[] = [
  { id: "load",    label: "Carregar arquivos",             description: "RelatorioAnaliticoRotaPedidos + Funcionario.xlsx", status: "idle" },
  { id: "routes",  label: "Etapa 1 — Processar rotas",    description: "Filtra StandBy · calcula pesos · gera resumo",     status: "idle" },
  { id: "drivers", label: "Etapa 2 — Performance Motoristas", description: "Raio · SLA · Tempo · Sequência (R$ 8,00)",     status: "idle" },
  { id: "helpers", label: "Etapa 3 — Performance Ajudantes",  description: "Raio · SLA · Tempo · Sequência (R$ 7,20)",     status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase",    description: "7 abas: Base, Resumo, Detalhe e Consolidados",    status: "idle" },
]

const RULES = [
  { condition: "4/4 critérios OK",  result: "Motorista R$ 8,00 · Ajudante R$ 7,20",   variant: "success" as const },
  { condition: "3/4 critérios OK",  result: "Motorista R$ 6,00 · Ajudante R$ 5,40",   variant: "warn"    as const },
  { condition: "2/4 critérios OK",  result: "Motorista R$ 4,00 · Ajudante R$ 3,60",   variant: "warn"    as const },
  { condition: "1/4 critério OK",   result: "Motorista R$ 2,00 · Ajudante R$ 1,80",   variant: "warn"    as const },
  { condition: "0/4 critérios OK",  result: "R$ 0,00",                                 variant: "danger"  as const },
  { condition: "Mínimos exigidos",  result: "Raio ≥70% · SLA ≥80% · Tempo ≥100% · Seq ≥0%", variant: "info" as const },
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
  success: "text-emerald-400",
  error:   "text-red-400 font-semibold",
  warn:    "text-amber-400",
  step:    "text-primary font-semibold",
}
const logPrefix: Record<LogEntry["type"], string> = {
  info: "   ", success: "✅ ", error: "❌ ", warn: "⚠️  ", step: "▶  ",
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function PerformaxxiPipelineView() {
  const [year, setYear]           = React.useState(2026)
  const [month, setMonth]         = React.useState(1)
  const [files, setFiles]         = React.useState<File[]>([])
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress]   = React.useState(0)
  const [stages, setStages]       = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]           = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null)
  const [stats, setStats]         = React.useState<{
    motoristas: number; ajudantes: number; rotas: number
    bonifMot: number; bonifAjud: number
  } | null>(null)
  const logEndRef = React.useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString("pt-BR"), message, type }])
  }
  const setStage = (id: string, status: StageStatus) =>
    setStages(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  const resetAll = () => {
    setStages(INITIAL_STAGES.map(s => ({ ...s, status: "idle" })))
    setProgress(0); setStats(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }

  const runPipeline = async (downloadOnly = false) => {
    if (!files.length) return
    setIsExecuting(true); setLogs([]); resetAll()

    try {
      addLog(`Performaxxi iniciado — ${String(month).padStart(2,"0")}/${year}`, "step")
      addLog(`${files.length} arquivo(s): ${files.map(f => f.name).join(", ")}`)
      setStage("load", "running"); setProgress(8)
      await new Promise(r => setTimeout(r, 250))

      const relatorio = files.filter(f => !/funcionari/i.test(f.name))
      const funcFile  = files.filter(f => /funcionari/i.test(f.name))
      addLog(`Relatório: ${relatorio.length} · Funcionários: ${funcFile.length}`)
      setStage("load", "done"); setProgress(15)

      // Etapa 1
      addLog("Etapa 1 — Processando rotas e filtrando StandBy...", "step")
      setStage("routes", "running"); setProgress(25)

      const formData = new FormData()
      formData.append("year", year.toString())
      formData.append("month", month.toString())
      files.forEach(f => { formData.append("files", f); formData.append("fileNames", f.name) })

      const response = await executePerformaxxiPipeline(formData)
      if (!response?.success) throw new Error(response?.error || "Erro desconhecido.")

      setStage("routes", "done"); setProgress(45)
      addLog("Rotas processadas · StandBy removido.", "success")

      // Etapa 2
      addLog("Etapa 2 — Analisando performance dos Motoristas...", "step")
      setStage("drivers", "running"); setProgress(60)
      await new Promise(r => setTimeout(r, 150))
      setStage("drivers", "done"); setProgress(72)
      addLog("Performance de motoristas calculada.", "success")

      // Etapa 3
      addLog("Etapa 3 — Analisando performance dos Ajudantes...", "step")
      setStage("helpers", "running"); setProgress(82)
      await new Promise(r => setTimeout(r, 150))
      setStage("helpers", "done"); setProgress(92)
      addLog("Performance de ajudantes calculada.", "success")

      // Export
      setStage("export", "running"); setProgress(97)
      const result = response.result
      setLastResult(result)

      // Stats
      const mot  = result.data ?? []
      const ajud = result.extraSheets?.find((s: any) => s.name === "07_Consolidado_Ajudante")?.data ?? []
      const rotas = result.extraSheets?.find((s: any) => s.name === "02_Base_Dados")?.data?.length ?? 0
      const bonifMot  = mot.reduce((s: number, m: any)  => s + (m["Total Bonificação (R$)"] ?? 0), 0)
      const bonifAjud = ajud.reduce((s: number, m: any) => s + (m["Total Bonificação (R$)"] ?? 0), 0)
      setStats({ motoristas: mot.length, ajudantes: ajud.length, rotas, bonifMot, bonifAjud })

      if (downloadOnly) {
        downloadMultipleSheets(
          [{ data: mot, name: "05_Consolidado_Motorista" }, { data: ajud, name: "07_Consolidado_Ajudante" }],
          `Performaxxi_${month}_${year}`
        )
        addLog("Excel com 2 abas baixado.", "success")
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
          <Zap className="size-4 text-primary" />
          <AlertTitle className="mb-0">Performaxxi</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Processa 20k+ linhas. Ignora StandBy. Analisa Motoristas e Ajudantes com bonificação proporcional por critério.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Bonificação <strong>proporcional</strong> por 4 critérios: Raio, SLA, Tempo e Sequência.
          Motorista R$ 8,00 · Ajudante R$ 7,20.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-5 text-primary" />
                Configuração Performaxxi
              </CardTitle>
              <CardDescription>Análise de Performance de Rotas</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
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

              {/* Upload */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-primary">Arquivos ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("perf-upload")?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar
                  </Button>
                  <input id="perf-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border-2 border-dashed rounded-xl bg-muted/10 min-h-[120px] flex flex-col items-center justify-center p-4">
                  {files.length === 0 ? (
                    <div className="text-center space-y-1.5">
                      <FileCode className="size-9 mx-auto opacity-20" />
                      <p className="text-xs text-muted-foreground italic">
                        RelatorioAnaliticoRotaPedidos.xlsx · Funcionario.xlsx (opcional)
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="w-full max-h-[160px]">
                      <div className="space-y-1.5">
                        {files.map((file, idx) => {
                          const isFunc = /funcionari/i.test(file.name)
                          return (
                            <div key={idx} className="flex items-center gap-2 bg-background px-3 py-2 rounded-lg border text-xs">
                              <FileCode className="size-3 text-muted-foreground shrink-0" />
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                                isFunc ? "bg-violet-100 text-violet-700" : "bg-primary/10 text-primary"
                              )}>
                                {isFunc ? "Funcionários" : "Relatório"}
                              </span>
                              <span className="truncate flex-1 font-medium">{file.name}</span>
                              <Button variant="ghost" size="icon" className="size-6 shrink-0"
                                onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
                                <Trash2 className="size-3 text-destructive/70" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  )}
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Etapas de Execução</span>
            </div>
            <div className="p-3 space-y-2">
              {stages.map((stage, idx) => (
                <div key={stage.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-0.5">
                    <StageIcon status={stage.status} />
                    {idx < stages.length - 1 && (
                      <div className={cn("w-px mt-1 min-h-[14px]", stage.status === "done" ? "bg-emerald-300" : "bg-border/60")} />
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

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Motoristas", value: stats.motoristas, icon: Users, highlight: true },
                { label: "Ajudantes",  value: stats.ajudantes,  icon: Users, highlight: false },
                { label: "Linhas processadas", value: stats.rotas.toLocaleString("pt-BR"), icon: Database, highlight: false },
                { label: "Bonif. Total", value: `R$ ${(stats.bonifMot + stats.bonifAjud).toFixed(2)}`, icon: CheckCircle2, highlight: true },
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

          {/* Regras */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Regras de Bonificação</span>
            </div>
            <div className="p-3 space-y-1.5">
              {RULES.map((rule, idx) => (
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
                  ? <span className="text-slate-500 italic">Aguardando execução...</span>
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

      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}