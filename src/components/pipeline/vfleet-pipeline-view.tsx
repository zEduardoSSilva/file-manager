"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Files,
  Loader2,
  Truck,
  Download,
  Info,
  HelpCircle,
  CheckCircle2,
  Circle,
  XCircle,
  AlertTriangle,
  Database,
  Users,
  ChevronRight,
  Terminal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeVFleetPipeline } from "@/app/actions/import-vfleet-actions"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "../../pages/Data-Viewer"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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

// ─── Configuração das etapas ──────────────────────────────────────────────────

const INITIAL_STAGES: Stage[] = [
  { id: "load",    label: "Carregar arquivos",          description: "Boletim do Veículo + Controle de Rota + Alertas", status: "idle" },
  { id: "update",  label: "Etapa 1 — Atualizar motoristas", description: "Match por PLACA + DATA",                      status: "idle" },
  { id: "convert", label: "Etapa 2 — Boletim do Motorista", description: "Extrai nome e CPF do campo MOTORISTAS",       status: "idle" },
  { id: "alerts",  label: "Etapa 3 — Consolidar alertas",   description: "Unifica alertas e corrige 'Sem Identificação'", status: "idle" },
  { id: "analyze", label: "Etapa 4 — Análise de condução",  description: "Curva · Banguela · Ociosidade · Velocidade",  status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase",      description: "5 abas: Boletim, Motorista, Alertas, Detalhe, Consolidado", status: "idle" },
]

const VFLEET_RULES = [
  { condition: "0 falhas (4/4 critérios OK)", result: "R$ 4,80 bonificação no dia",   variant: "success" as const },
  { condition: "1+ falhas (≤3/4 critérios)", result: "R$ 0,00 — ZERA TUDO",           variant: "danger"  as const },
  { condition: "Critérios avaliados",         result: "Curva · Banguela · Ociosidade · Velocidade", variant: "info" as const },
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

// ─── Componente principal ─────────────────────────────────────────────────────

export function VFleetPipelineView() {
  const [year, setYear]           = React.useState(2026)
  const [month, setMonth]         = React.useState(1)
  const [files, setFiles]         = React.useState<File[]>([])
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress]   = React.useState(0)
  const [stages, setStages]       = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]           = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null)
  const [stats, setStats]         = React.useState<{ motoristas: number; registros: number; bonificacao: number } | null>(null)
  const logEndRef = React.useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Auto-scroll no console
  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR")
    setLogs(prev => [...prev, { time, message, type }])
  }

  const setStage = (id: string, status: StageStatus) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  const resetStages = () => setStages(INITIAL_STAGES.map(s => ({ ...s, status: "idle" })))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const runPipeline = async (downloadOnly = false) => {
    if (files.length === 0) return

    setIsExecuting(true)
    setProgress(0)
    setLogs([])
    setStats(null)
    resetStages()

    try {
      // ── Carregamento ──────────────────────────────────────────────────────
      addLog(`Pipeline vFleet iniciado — ${String(month).padStart(2,"0")}/${year}`, "step")
      addLog(`${files.length} arquivo(s) detectado(s):`)
      files.forEach(f => addLog(`• ${f.name}`))
      setStage("load", "running")
      setProgress(8)
      await new Promise(r => setTimeout(r, 300))

      const boletins = files.filter(f => /boletim/i.test(f.name))
      const controle = files.filter(f => /controle|consolidado/i.test(f.name))
      const alertas  = files.filter(f => /alerta/i.test(f.name))

      addLog(`Boletins: ${boletins.length} · Controle: ${controle.length} · Alertas: ${alertas.length}`)
      setStage("load", "done")
      setProgress(15)

      // ── Etapa 1 ───────────────────────────────────────────────────────────
      addLog("Etapa 1 — Atualizando motoristas via PLACA + DATA...", "step")
      setStage("update", "running")
      setProgress(25)

      const formData = new FormData()
      formData.append("year", year.toString())
      formData.append("month", month.toString())
      files.forEach(f => {
        formData.append("files", f)
        formData.append("fileNames", f.name)
      })

      const response = await executeVFleetPipeline(formData)

      if (!response?.success) throw new Error(response?.error || "Erro desconhecido no servidor.")

      setStage("update", "done")
      addLog("Motoristas atualizados com sucesso.", "success")
      setProgress(45)

      // ── Etapa 2 ───────────────────────────────────────────────────────────
      addLog("Etapa 2 — Convertendo Boletim do Veículo → Motorista...", "step")
      setStage("convert", "running")
      setProgress(55)
      await new Promise(r => setTimeout(r, 150))
      setStage("convert", "done")
      addLog("Boletim do Motorista gerado.", "success")
      setProgress(65)

      // ── Etapa 3 ───────────────────────────────────────────────────────────
      addLog("Etapa 3 — Consolidando alertas e corrigindo 'Sem Identificação'...", "step")
      setStage("alerts", "running")
      setProgress(72)
      await new Promise(r => setTimeout(r, 150))
      if (alertas.length === 0) {
        addLog("Nenhum arquivo de alertas encontrado — etapa ignorada.", "warn")
        setStage("alerts", "warn")
      } else {
        setStage("alerts", "done")
        addLog(`${alertas.length} arquivo(s) de alertas processado(s).`, "success")
      }
      setProgress(80)

      // ── Etapa 4 ───────────────────────────────────────────────────────────
      addLog("Etapa 4 — Analisando critérios de condução...", "step")
      setStage("analyze", "running")
      setProgress(88)
      await new Promise(r => setTimeout(r, 150))
      setStage("analyze", "done")
      setProgress(95)

      const result = response.result
      setLastResult(result)

      // Stats para o painel lateral
      const totalMotoristas = result.data?.length ?? 0
      const totalBonificacao = result.data?.reduce(
        (acc: number, m: any) => acc + (m["Total Bonificação (R$)"] ?? 0), 0
      ) ?? 0
      const totalRegistros = result.data?.reduce(
        (acc: number, m: any) => acc + (m["Dias com Atividade"] ?? 0), 0
      ) ?? 0
      setStats({ motoristas: totalMotoristas, registros: totalRegistros, bonificacao: totalBonificacao })

      addLog(`${totalMotoristas} motoristas · ${totalRegistros} dias · R$ ${totalBonificacao.toFixed(2)} em bonificações`, "success")

      // ── Exportar ──────────────────────────────────────────────────────────
      setStage("export", "running")
      setProgress(98)

      if (downloadOnly) {
        addLog("Gerando Excel com múltiplas abas...", "step")
        downloadMultipleSheets(
          [{ data: result.data, name: "05_Consolidado_Motorista" }],
          `vFleet_Analitico_${month}_${year}`
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
      // Marca a etapa que estava running como error
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
          <AlertTitle className="mb-0">Análise vFleet</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Anexe os arquivos. O sistema analisará os critérios de condução automaticamente.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Processa <strong>Curva, Banguela, Ociosidade e Velocidade</strong>.
          Bônus de R$ 4,80 por dia sem nenhuma violação.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-5 text-primary" />
                Configuração vFleet
              </CardTitle>
              <CardDescription>Análise de Telemetria e Condução</CardDescription>
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

              {/* Upload */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-primary">
                    Arquivos ({files.length})
                  </Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("file-upload")?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar
                  </Button>
                  <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border-2 border-dashed rounded-xl bg-muted/10 min-h-[120px] flex flex-col items-center justify-center p-4">
                  {files.length === 0 ? (
                    <div className="text-center space-y-1.5">
                      <Files className="size-9 mx-auto opacity-20" />
                      <p className="text-xs text-muted-foreground italic">
                        Boletim_do_Veiculo · Controle_Logistico · Historico_Alertas
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="w-full max-h-[160px]">
                      <div className="space-y-1.5">
                        {files.map((file, idx) => {
                          const isBoletim  = /boletim/i.test(file.name)
                          const isControle = /controle|consolidado/i.test(file.name)
                          const isAlerta   = /alerta/i.test(file.name)
                          const tag = isBoletim ? "Boletim" : isControle ? "Controle" : isAlerta ? "Alerta" : "Arquivo"
                          const tagColor = isBoletim
                            ? "bg-primary/10 text-primary"
                            : isControle
                            ? "bg-emerald-100 text-emerald-700"
                            : isAlerta
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"

                          return (
                            <div key={idx} className="flex items-center gap-2 bg-background px-3 py-2 rounded-lg border text-xs">
                              <FileCode className="size-3 text-muted-foreground shrink-0" />
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0", tagColor)}>{tag}</span>
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
                disabled={isExecuting || files.length === 0}
              >
                <Download className="mr-1.5 size-3.5" /> Exportar Excel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs font-semibold bg-primary hover:bg-primary/90 shadow-sm transition-all"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || files.length === 0}
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
                { label: "Motoristas", value: stats.motoristas, icon: Users, highlight: true },
                { label: "Dias analisados", value: stats.registros, icon: Database, highlight: false },
                { label: "Total bonificação", value: `R$ ${stats.bonificacao.toFixed(2)}`, icon: CheckCircle2, highlight: true },
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
                      <p className={cn("text-sm font-bold leading-tight", stat.highlight ? "text-primary" : "text-foreground")}>
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
              {VFLEET_RULES.map((rule, idx) => (
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

      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}