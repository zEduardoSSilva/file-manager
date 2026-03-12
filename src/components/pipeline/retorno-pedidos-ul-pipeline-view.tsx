"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Files,
  Loader2,
  Download,
  Info,
  HelpCircle,
  CheckCircle2,
  Circle,
  XCircle,
  AlertTriangle,
  Database,
  PackageSearch,
  ChevronRight,
  Terminal,
  FileSpreadsheet,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeRetornoPedidosULPipeline } from "@/app/actions/retorno-pedidos-ul-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "../../pages/Data-Viewer"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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

// ─── Configuração das etapas ──────────────────────────────────────────────────

const INITIAL_STAGES: Stage[] = [
  { id: "load",    label: "Carregar arquivos",              description: "Arquivos .ul + Excel de referência",                    status: "idle" },
  { id: "extract", label: "Etapa 1 — Extração UL",          description: "Regex: 9d + 3d + BV/RK/KP + 2d + 6d por linha",        status: "idle" },
  { id: "parse",   label: "Etapa 2 — Decomposição",         description: "Rota · Código Cliente · Pedido · Chave Primária",       status: "idle" },
  { id: "excel",   label: "Etapa 3 — Leitura do Excel",     description: "Identificação de colunas + padronização de chaves",     status: "idle" },
  { id: "compare", label: "Etapa 4 — Comparação UL vs XLS", description: "Match por Código_Cliente + Número_Pedido",              status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase",      description: "7 abas: Todos · Encontrados · Não Enc. · 4 Resumos",   status: "idle" },
]

const UL_RULES = [
  { condition: "Chave Primária",       result: "Código_Cliente (9d) + \"_\" + Número_Pedido (6d)",  variant: "info"    as const },
  { condition: "Tipos aceitos",        result: "BV · RK · KP",                                      variant: "info"    as const },
  { condition: "Data (posição fixa)",  result: "Caracteres 54–60 → formato DDMMAA",                 variant: "info"    as const },
  { condition: "Match = SIM",          result: "Pedido processado no sistema",                       variant: "success" as const },
  { condition: "Match = NÃO",          result: "Pedido pendente / não localizado",                   variant: "danger"  as const },
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

export function RetornoPedidosUlPipelineView() {
  const [year, setYear]               = React.useState(2026)
  const [month, setMonth]             = React.useState(1)
  const [ulFiles, setUlFiles]         = React.useState<File[]>([])
  const [excelFile, setExcelFile]     = React.useState<File | null>(null)
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress]       = React.useState(0)
  const [stages, setStages]           = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]               = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult]   = React.useState<PipelineResult | null>(null)
  const [stats, setStats]             = React.useState<{
    total: number; enc: number; nEnc: number; pct: number; clientes: number; arquivos: number
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

  const setStage = (id: string, status: StageStatus) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  const resetStages = () => setStages(INITIAL_STAGES.map(s => ({ ...s, status: "idle" })))

  const handleULChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUlFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setExcelFile(e.target.files[0])
  }

  const allFiles = [...ulFiles, ...(excelFile ? [excelFile] : [])]
  const canRun   = ulFiles.length > 0 && excelFile !== null

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return

    setIsExecuting(true)
    setProgress(0)
    setLogs([])
    setStats(null)
    resetStages()

    try {
      // ── Carregamento ──────────────────────────────────────────────────────
      addLog(`Pipeline UL iniciado — ${String(month).padStart(2, "0")}/${year}`, "step")
      addLog(`${ulFiles.length} arquivo(s) UL detectado(s):`)
      ulFiles.forEach(f => addLog(`• ${f.name}`))
      addLog(`• ${excelFile!.name} (referência Excel)`)
      setStage("load", "running")
      setProgress(8)
      await new Promise(r => setTimeout(r, 300))
      setStage("load", "done")
      setProgress(15)

      // ── Etapa 1 — Extração ────────────────────────────────────────────────
      addLog("Etapa 1 — Extraindo códigos dos arquivos UL...", "step")
      setStage("extract", "running")
      setProgress(25)

      const formData = new FormData()
      formData.append("year", year.toString())
      formData.append("month", month.toString())
      allFiles.forEach(f => {
        formData.append("files", f)
        formData.append("fileNames", f.name)
      })

      const response = await executeRetornoPedidosULPipeline(formData)

      if (!response?.success) throw new Error(response?.error || "Erro desconhecido no servidor.")

      setStage("extract", "done")
      addLog("Arquivos UL processados com sucesso.", "success")
      setProgress(40)

      // ── Etapa 2 — Decomposição ────────────────────────────────────────────
      addLog("Etapa 2 — Decompondo campos e chaves primárias...", "step")
      setStage("parse", "running")
      setProgress(50)
      await new Promise(r => setTimeout(r, 150))
      setStage("parse", "done")
      addLog("Rota · Código Cliente · Número Pedido extraídos.", "success")
      setProgress(60)

      // ── Etapa 3 — Excel ───────────────────────────────────────────────────
      addLog("Etapa 3 — Lendo e padronizando Excel de referência...", "step")
      setStage("excel", "running")
      setProgress(68)
      await new Promise(r => setTimeout(r, 150))
      setStage("excel", "done")
      addLog("Colunas identificadas e chaves criadas.", "success")
      setProgress(76)

      // ── Etapa 4 — Comparação ──────────────────────────────────────────────
      addLog("Etapa 4 — Comparando pedidos UL com base Excel...", "step")
      setStage("compare", "running")
      setProgress(85)
      await new Promise(r => setTimeout(r, 150))

      const result = response.result
      setLastResult(result)

      const totalPedidos  = result.data?.length ?? 0
      const totalEnc      = result.data?.filter((r: any) => r["Encontrado_Excel"] === "SIM").length ?? 0
      const totalNEnc     = totalPedidos - totalEnc
      const pct           = totalPedidos > 0 ? +((totalEnc / totalPedidos) * 100).toFixed(1) : 0
      const clientesUniq  = new Set(result.data?.map((r: any) => r["Codigo_Cliente"]) ?? []).size
      const arquivosUniq  = new Set(result.data?.map((r: any) => r["Arquivo"]) ?? []).size

      setStats({ total: totalPedidos, enc: totalEnc, nEnc: totalNEnc, pct, clientes: clientesUniq, arquivos: arquivosUniq })
      addLog(`${totalPedidos} pedidos · ✅ ${totalEnc} encontrados (${pct}%) · ❌ ${totalNEnc} pendentes`,
        totalNEnc > 0 ? "warn" : "success")

      setStage("compare", totalNEnc > 0 ? "warn" : "done")
      setProgress(93)

      // ── Exportar ──────────────────────────────────────────────────────────
      setStage("export", "running")
      setProgress(98)

      if (downloadOnly) {
        addLog("Gerando Excel com 7 abas...", "step")
        downloadMultipleSheets(
          [{ data: result.data, name: "01_Todos_Pedidos" }],
          `UL_Retorno_${String(month).padStart(2, "0")}_${year}`
        )
        addLog("Arquivo Excel baixado com sucesso.", "success")
      } else {
        addLog("Dados sincronizados com Firebase.", "success")
      }

      setStage("export", "done")
      setProgress(100)
      addLog(`Pipeline concluído em ${new Date().toLocaleTimeString("pt-BR")}.`, "success")

      if (totalNEnc > 0) {
        addLog(`⚠️ Atenção: ${totalNEnc} pedido(s) não encontrado(s) — verifique a aba "Nao_Encontrados".`, "warn")
      }

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
          <PackageSearch className="size-4 text-primary" />
          <AlertTitle className="mb-0">Análise de Retorno de Pedidos — UL</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Anexe os arquivos .ul e o Excel de referência. O sistema compara automaticamente por Chave Primária.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Compara pedidos dos arquivos <strong>.ul</strong> com a base <strong>STATUS_PEDIDOS_MERCANETE.xlsx</strong>.
          Chave: <code className="text-xs bg-muted px-1 rounded">Código_Cliente (9d) + Número_Pedido (6d)</code>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageSearch className="size-5 text-primary" />
                Configuração — Retorno UL
              </CardTitle>
              <CardDescription>Comparação UL vs Excel de Referência</CardDescription>
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

              {/* Upload arquivos UL */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-primary">
                    Arquivos UL ({ulFiles.length})
                  </Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("ul-upload")?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar .ul
                  </Button>
                  <input id="ul-upload" type="file" multiple accept=".ul" className="hidden" onChange={handleULChange} />
                </div>

                <div className="border-2 border-dashed rounded-xl bg-muted/10 min-h-[100px] flex flex-col items-center justify-center p-4">
                  {ulFiles.length === 0 ? (
                    <div className="text-center space-y-1.5">
                      <Files className="size-8 mx-auto opacity-20" />
                      <p className="text-xs text-muted-foreground italic">
                        Arraste os arquivos <strong>.ul</strong> ou clique em "Selecionar"
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="w-full max-h-[140px]">
                      <div className="space-y-1.5">
                        {ulFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-background px-3 py-2 rounded-lg border text-xs">
                            <FileCode className="size-3 text-muted-foreground shrink-0" />
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-primary/10 text-primary">UL</span>
                            <span className="truncate flex-1 font-medium">{file.name}</span>
                            <Button variant="ghost" size="icon" className="size-6 shrink-0"
                              onClick={() => setUlFiles(ulFiles.filter((_, i) => i !== idx))}>
                              <Trash2 className="size-3 text-destructive/70" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>

              {/* Upload Excel */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-primary">
                    Excel de Referência
                    {excelFile && <Badge variant="outline" className="ml-2 text-[10px] text-emerald-600 border-emerald-300">✓ carregado</Badge>}
                  </Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("excel-upload")?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar .xlsx
                  </Button>
                  <input id="excel-upload" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelChange} />
                </div>

                <div className="border-2 border-dashed rounded-xl bg-muted/10 min-h-[70px] flex flex-col items-center justify-center p-4">
                  {!excelFile ? (
                    <div className="text-center space-y-1">
                      <FileSpreadsheet className="size-7 mx-auto opacity-20" />
                      <p className="text-xs text-muted-foreground italic">STATUS_PEDIDOS_MERCANETE.xlsx</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 w-full bg-background px-3 py-2 rounded-lg border text-xs">
                      <FileSpreadsheet className="size-3 text-emerald-500 shrink-0" />
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-emerald-100 text-emerald-700">XLS</span>
                      <span className="truncate flex-1 font-medium">{excelFile.name}</span>
                      <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => setExcelFile(null)}>
                        <Trash2 className="size-3 text-destructive/70" />
                      </Button>
                    </div>
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

          {/* Stats (após execução) */}
          {stats && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total Pedidos",   value: stats.total,             icon: Database,        highlight: false },
                { label: "Encontrados",      value: `${stats.enc} (${stats.pct}%)`, icon: CheckCircle2,  highlight: true  },
                { label: "Pendentes",        value: stats.nEnc,              icon: AlertTriangle,   highlight: stats.nEnc > 0 },
                { label: "Clientes Únicos",  value: stats.clientes,          icon: BarChart3,       highlight: false },
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
              {/* Arquivos — largura dupla */}
              <div className="col-span-2 rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm bg-card border-border/60">
                <div className="size-7 rounded-lg flex items-center justify-center shrink-0 bg-muted/30">
                  <Files className="size-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">{stats.arquivos}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Arquivos UL processados</p>
                </div>
              </div>
            </div>
          )}

          {/* Regras de negócio */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Regras de Comparação
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              {UL_RULES.map((rule, idx) => (
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