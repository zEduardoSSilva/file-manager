"use client"

import * as React from "react"
import {
  Play, Trash2, FileCode, Loader2, HelpCircle,
  Download, CheckCircle2, Circle, XCircle, AlertTriangle,
  ChevronRight, Terminal, Info, Database,
  PackageX, FileSpreadsheet, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { executeDevolucoesPipeline } from "@/app/actions/import-devolucoes-actions"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StageStatus = "idle" | "running" | "done" | "error" | "warn"
interface Stage { id: string; label: string; description: string; status: StageStatus }
interface LogEntry { time: string; message: string; type: "info" | "success" | "error" | "warn" | "step" }

// ─── Arquivos necessários ─────────────────────────────────────────────────────
const FILE_SLOTS = [
  { id: "controle",    label: "Controle Logístico",      hint: "Consolidado_Entregas_V2_Geral.xlsx",  required: true  },
  { id: "faturamento", label: "Faturamento",              hint: "Fat_Fechamento.xlsx",                 required: true  },
  { id: "funcionarios",label: "Cadastro de Funcionários", hint: "Funcionario.xlsx",                    required: false },
  { id: "motivos",     label: "Motivos do Sistema",       hint: "Motivos Sistema.xlsx",                required: false },
]

// ─── Etapas ───────────────────────────────────────────────────────────────────
const INITIAL_STAGES: Stage[] = [
  { id: "load",    label: "Carregar arquivos",          description: "Controle logístico · faturamento · funcionários",     status: "idle" },
  { id: "filter",  label: "Filtrar por ano/mês",        description: "Stream — somente registros do período",               status: "idle" },
  { id: "names",   label: "Normalizar nomes",           description: "Fuzzy match contra cadastro de funcionários",         status: "idle" },
  { id: "explode", label: "Explodir viagens",           description: "Colaborador × viagem (VIAGEM pode ter múltiplos IDs)", status: "idle" },
  { id: "fat",     label: "Agregar faturamento",        description: "Por viagem · excluindo motivos do sistema",           status: "idle" },
  { id: "merge",   label: "Merge + Percentuais",        description: "Colaborador × faturamento · % devolvido",             status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase", description: "Resumo por colaborador + Detalhamento",               status: "idle" },
]

const REGRAS = [
  { condition: "FATURAMENTO_DEV > 0",   result: "Identificada como devolução",          variant: "warn"    as const },
  { condition: "Motivo do sistema",      result: "Excluída — não culpa do motorista",    variant: "info"    as const },
  { condition: "Sem Motivos Sistema.xlsx", result: "Todas dev. desconsideradas (padrão)", variant: "info"  as const },
  { condition: "Zeros à esquerda VIAGEM", result: "Normalizados antes do merge",         variant: "info"   as const },
  { condition: "Colaborador com fat. 0", result: "Incluído no detalhamento",             variant: "warn"   as const },
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

// ─── Componente principal ─────────────────────────────────────────────────────
export function DevolucoesPipelineView() {
  const [year, setYear]   = React.useState(new Date().getFullYear())
  const [month, setMonth] = React.useState(new Date().getMonth() + 1)
  const [files, setFiles] = React.useState<Record<string, File | null>>({})
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress]       = React.useState(0)
  const [stages, setStages]           = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]               = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult]   = React.useState<PipelineResult | null>(null)
  const [stats, setStats]             = React.useState<{
    colaboradores: number; viagens: number; fatTotal: number; fatDev: number
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

  const handleFile = (id: string, file: File | null) =>
    setFiles(prev => ({ ...prev, [id]: file }))

  const canRun = !!(files["controle"] && files["faturamento"])

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return
    setIsExecuting(true); setLogs([]); resetAll()

    try {
      addLog(`Devoluções — ${String(month).padStart(2,"0")}/${year}`, "step")

      // Etapa 1
      setStage("load", "running"); setProgress(8)
      FILE_SLOTS.forEach(slot => {
        const f = files[slot.id]
        if (f) addLog(`• [${slot.label}] ${f.name}`)
        else if (!slot.required) addLog(`• [${slot.label}] não informado — usando padrão`, "warn")
      })
      setStage("load", "done"); setProgress(15)

      // FormData
      const formData = new FormData()
      formData.append("year", String(year))
      formData.append("month", String(month))
      // Ordem de detecção: controle primeiro, depois os demais
      const ordem = ["controle", "faturamento", "funcionarios", "motivos"] as const
      for (const id of ordem) {
        const f = files[id]
        if (f) {
          formData.append("files", f)
          formData.append("fileNames", f.name)
        }
      }

      // Etapa 2
      addLog(`Filtrando controle para ${month}/${year}...`, "step")
      setStage("filter", "running"); setProgress(25)
      const response = await executeDevolucoesPipeline(formData)
      if (!response.success) throw new Error(response.error)
      setStage("filter", "done"); setProgress(38)
      addLog("Registros do período extraídos.", "success")

      // Etapa 3
      addLog("Normalizando nomes via fuzzy match...", "step")
      setStage("names", "running"); setProgress(48)
      await new Promise(r => setTimeout(r, 100))
      setStage("names", "done"); setProgress(56)
      addLog("Nomes normalizados.", "success")

      // Etapa 4
      addLog("Explodindo viagens por colaborador...", "step")
      setStage("explode", "running"); setProgress(63)
      await new Promise(r => setTimeout(r, 100))
      setStage("explode", "done"); setProgress(70)

      // Etapa 5
      addLog("Agregando faturamento por viagem (excluindo motivos sistema)...", "step")
      setStage("fat", "running"); setProgress(78)
      await new Promise(r => setTimeout(r, 100))
      setStage("fat", "done"); setProgress(85)

      // Etapa 6
      addLog("Calculando percentuais de devolução...", "step")
      setStage("merge", "running"); setProgress(92)
      await new Promise(r => setTimeout(r, 100))
      setStage("merge", "done")

      // Etapa 7
      setStage("export", "running"); setProgress(97)
      const result = response.result
      setLastResult(result)

      // Extrai stats do summary
      const m = (result.summary ?? "").match(/(\d+) colaboradores · (\d+) viagens · R\$ ([\d,.]+) fat\. · R\$ ([\d,.]+) devolvido/)
      if (m) {
        setStats({
          colaboradores: parseInt(m[1]),
          viagens:       parseInt(m[2]),
          fatTotal:      parseFloat(m[3].replace(",",".")),
          fatDev:        parseFloat(m[4].replace(",",".")),
        })
      }

      if (downloadOnly && result.extraSheets) {
        downloadMultipleSheets(
          result.extraSheets.map((s: any) => ({ data: s.data, name: s.name })),
          `Devolucoes_${String(month).padStart(2,"0")}_${year}`
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
          <PackageX className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidador de Controle Logístico + Devoluções</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Cruza o controle de entregas com o faturamento, filtra devoluções por motivo do sistema, e gera percentuais de devolução por colaborador.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Gera <strong>2 abas</strong>: Resumo por Colaborador · Detalhamento (colaborador × viagem × faturamento).
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageX className="size-5 text-primary" />
                Configuração da Análise
              </CardTitle>
              <CardDescription>Período e arquivos de controle, faturamento e cadastros.</CardDescription>
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

              {/* Arquivos */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-primary">
                  Arquivos de Entrada ({Object.values(files).filter(Boolean).length}/{FILE_SLOTS.length})
                </Label>
                <div className="space-y-1.5 rounded-xl border border-border/60 p-2 bg-muted/5">
                  {FILE_SLOTS.map(slot => {
                    const hasFile = !!files[slot.id]
                    return (
                      <div key={slot.id} className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                        hasFile
                          ? "bg-emerald-50 border-emerald-200"
                          : slot.required
                            ? "bg-background border-border/40 hover:bg-muted/10"
                            : "bg-muted/5 border-dashed border-border/30 hover:bg-muted/10"
                      )}>
                        <FileSpreadsheet className={cn(
                          "size-4 shrink-0",
                          hasFile ? "text-emerald-600" : slot.required ? "text-primary/50" : "text-muted-foreground/40"
                        )} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold">{slot.label}</span>
                            {!slot.required && (
                              <span className="text-[9px] text-muted-foreground border border-border/40 rounded px-1 py-0 leading-tight">opcional</span>
                            )}
                          </div>
                          {hasFile
                            ? <span className="text-[11px] text-emerald-600 font-medium truncate block mt-0.5">{files[slot.id]?.name}</span>
                            : <span className="text-[11px] text-muted-foreground italic mt-0.5 block">{slot.hint}</span>}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {hasFile && (
                            <Button variant="ghost" size="icon" className="size-6"
                              onClick={() => handleFile(slot.id, null)}>
                              <Trash2 className="size-3 text-destructive/70" />
                            </Button>
                          )}
                          <Button
                            variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => document.getElementById(`devolucoes-file-${slot.id}`)?.click()}
                          >
                            {hasFile ? "Trocar" : "Selecionar"}
                          </Button>
                        </div>
                        <input
                          id={`devolucoes-file-${slot.id}`} type="file" className="hidden"
                          accept=".xlsx,.xls"
                          onChange={e => handleFile(slot.id, e.target.files?.[0] ?? null)}
                        />
                      </div>
                    )
                  })}
                </div>
                {!canRun && (
                  <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                    <AlertTriangle className="size-3" /> Controle Logístico e Faturamento são obrigatórios.
                  </p>
                )}
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
                disabled={isExecuting || !canRun}
              >
                <Download className="mr-1.5 size-3.5" /> Exportar Excel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs font-semibold shadow-sm transition-all"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || !canRun}
              >
                {isExecuting
                  ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Processando...</>
                  : <><Play className="mr-1.5 size-3.5 fill-current" /> Iniciar Análise</>}
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
                { label: "Colaboradores",  value: stats.colaboradores,                    icon: Users,     highlight: false },
                { label: "Viagens",        value: stats.viagens.toLocaleString("pt-BR"),  icon: Database,  highlight: false },
                { label: "Faturamento",    value: `R$ ${stats.fatTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: Database, highlight: true },
                { label: "Devolvido",      value: `R$ ${stats.fatDev.toLocaleString("pt-BR",  { minimumFractionDigits: 2 })}`, icon: PackageX, highlight: true },
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
                      <p className={cn("text-sm font-bold leading-tight truncate", stat.highlight ? "text-primary" : "text-foreground")}>
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Regras de Processamento</span>
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
                  ? <span className="text-slate-500 italic">Aguardando arquivos...</span>
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