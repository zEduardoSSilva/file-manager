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
  FileText,
  FileSpreadsheet,
  Plus,
  Search,
  Users,
  Hash,
  BarChart2,
  Building2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeRetornoPedidosPipeline } from "@/app/actions/retorno-pedidos-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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

const INITIAL_STAGES: Stage[] = [
  { id: "txt",     label: "Etapa 1 — Extração TXT",        description: "Regex \\d{9}\\d{3}(BV|RK|KP)\\d{2}\\d{6} · Data B1DDMMYY",    status: "idle" },
  { id: "excel",   label: "Etapa 2 — Carregar Excel",       description: "STATUS_PEDIDOS_MERCANETE · auto-detecção de colunas",           status: "idle" },
  { id: "norm",    label: "Etapa 3 — Padronização",         description: "Pedido → zfill(6) · Cliente → zfill(9) · remove não-numéricos", status: "idle" },
  { id: "compare", label: "Etapa 4 — Comparação",           description: "Chave: Codigo_Cliente_NumeroPedido · busca O(1) via Set",       status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase",     description: "6 abas: Todos · Encontrados · Não Encontrados · Resumos",       status: "idle" },
]

const REGRAS = [
  { label: "Padrão extraído",  detail: "9d + 3d + BV/RK/KP + 2d + 6d",    color: "border-blue-200 bg-blue-50 text-blue-700" },
  { label: "Data TXT",        detail: "B1DDMMYY → DD/MM/YYYY",             color: "border-slate-200 bg-slate-50 text-slate-700" },
  { label: "Chave primária",  detail: "Codigo_Cliente + _ + Numero_Pedido", color: "border-primary/20 bg-primary/5 text-primary" },
  { label: "Pedido Excel",    detail: "Apenas dígitos → zfill(6)",          color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { label: "Cliente Excel",   detail: "Apenas dígitos → [:9] → zfill(9)",  color: "border-amber-200 bg-amber-50 text-amber-700" },
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

// ─── ResultViewer ─────────────────────────────────────────────────────────────

type TabId = "todos" | "encontrados" | "nao_encontrados" | "por_arquivo" | "por_empresa"

function RetornoPedidosResultViewer({ result }: { result: PipelineResult }) {
  const [activeTab, setActiveTab] = React.useState<TabId>("todos")

  const todos:         any[] = result.todosPedidos     ?? []
  const encontrados:   any[] = result.encontrados      ?? []
  const naoEncontrados:any[] = result.naoEncontrados   ?? []
  const porArquivo:    any[] = result.resumoPorArquivo ?? []
  const porEmpresa:    any[] = result.resumoPorEmpresa ?? []
  const resumoGeral:   any   = result.resumoGeral      ?? {}

  if (!todos.length) return null

  const TABS = [
    { id: "todos"         as TabId, label: "Todos",          count: todos.length,           icon: Hash     },
    { id: "encontrados"   as TabId, label: "Encontrados",    count: encontrados.length,     icon: CheckCircle2 },
    { id: "nao_encontrados" as TabId, label: "Não encontrados", count: naoEncontrados.length, icon: XCircle },
    { id: "por_arquivo"   as TabId, label: "Por arquivo",    count: porArquivo.length,      icon: FileText },
    { id: "por_empresa"   as TabId, label: "Por empresa",    count: porEmpresa.length,      icon: Building2 },
  ]

  const activeData: any[] = {
    todos, encontrados, nao_encontrados: naoEncontrados,
    por_arquivo: porArquivo, por_empresa: porEmpresa,
  }[activeTab]

  const LABELS: Record<string, string> = {
    Arquivo: "Arquivo", Codigo_Cliente: "Cód. Cliente", Numero_Pedido: "Nº Pedido",
    Tipo_Empresa: "Empresa", Chave_Primaria: "Chave Primária", Data_TXT: "Data TXT",
    Codigo_Completo: "Código Completo", Encontrado_Excel: "Encontrado?",
    Linha_Original: "Linha Original", Quantidade: "Qtde", Encontrado: "Encontrado?",
  }

  const COLS_MAP: Record<TabId, string[]> = {
    todos:           ["Arquivo","Codigo_Cliente","Numero_Pedido","Tipo_Empresa","Chave_Primaria","Data_TXT","Encontrado_Excel","Codigo_Completo"],
    encontrados:     ["Arquivo","Codigo_Cliente","Numero_Pedido","Tipo_Empresa","Chave_Primaria","Data_TXT","Codigo_Completo"],
    nao_encontrados: ["Arquivo","Codigo_Cliente","Numero_Pedido","Tipo_Empresa","Chave_Primaria","Data_TXT","Codigo_Completo"],
    por_arquivo:     ["Arquivo","Encontrado_Excel","Quantidade"],
    por_empresa:     ["Tipo_Empresa","Encontrado_Excel","Quantidade"],
  }

  const activeCols = COLS_MAP[activeTab].filter(c => activeData.length && c in activeData[0])

  function fmtCell(col: string, val: any) {
    if (val == null || val === "") return <span className="text-muted-foreground/40">—</span>
    if (col === "Encontrado_Excel") return val === "SIM"
      ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-[10px]">SIM</Badge>
      : <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-[10px]">NÃO</Badge>
    if (col === "Linha_Original") return (
      <span className="font-mono text-[9px] text-muted-foreground truncate max-w-[200px] block">{String(val)}</span>
    )
    if (col === "Chave_Primaria") return (
      <span className="font-mono text-[11px] font-semibold text-primary">{String(val)}</span>
    )
    return <span className="text-xs">{String(val)}</span>
  }

  const taxaSucesso = resumoGeral.totalPedidos
    ? +((resumoGeral.encontrados / resumoGeral.totalPedidos) * 100).toFixed(1)
    : 0

  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total extraído",    value: resumoGeral.totalPedidos  ?? 0,    icon: Hash,     highlight: false },
          { label: "Encontrados",       value: `${resumoGeral.encontrados ?? 0} (${resumoGeral.percEncontrados ?? 0}%)`,   icon: CheckCircle2, highlight: true  },
          { label: "Não encontrados",   value: `${resumoGeral.naoEncontrados ?? 0} (${resumoGeral.percNaoEncontrados ?? 0}%)`, icon: XCircle, highlight: false },
          { label: "Clientes únicos",   value: resumoGeral.clientesUnicos ?? 0,   icon: Users,    highlight: false },
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

      {/* Barra de taxa de sucesso */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm px-4 py-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-foreground">Taxa de localização no Excel</span>
          <span className={cn("text-sm font-bold", taxaSucesso >= 80 ? "text-emerald-600" : taxaSucesso >= 50 ? "text-amber-600" : "text-red-500")}>
            {taxaSucesso}%
          </span>
        </div>
        <Progress value={taxaSucesso} className={cn("h-2", taxaSucesso >= 80 ? "[&>div]:bg-emerald-500" : taxaSucesso >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500")} />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>{resumoGeral.encontrados} de {resumoGeral.totalPedidos} pedidos</span>
          <span>100%</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all",
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

      {/* Tabela */}
      {activeData.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {TABS.find(t => t.id === activeTab)?.label}
            </span>
            <span className="text-[10px] text-muted-foreground">{activeData.length} registros</span>
          </div>
          <ScrollArea className="h-[440px]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow>
                    {activeCols.map(col => (
                      <TableHead key={col} className="text-[10px] font-bold uppercase whitespace-nowrap px-2 py-2">
                        {LABELS[col] ?? col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeData.map((row, i) => (
                    <TableRow key={i} className={cn(
                      "text-xs",
                      row["Encontrado_Excel"] === "NÃO" && "bg-red-50/40",
                      row["Encontrado_Excel"] === "SIM" && "bg-emerald-50/20",
                    )}>
                      {activeCols.map(col => (
                        <TableCell key={col} className="px-2 py-1.5 whitespace-nowrap max-w-[250px]">
                          {fmtCell(col, row[col])}
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

export function RetornoPedidosPipelineView() {
  const [filesTxt,    setFilesTxt]    = React.useState<File[]>([])
  const [fileExcel,   setFileExcel]   = React.useState<File | null>(null)
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress,    setProgress]    = React.useState(0)
  const [stages,      setStages]      = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs,        setLogs]        = React.useState<LogEntry[]>([])
  const [lastResult,  setLastResult]  = React.useState<PipelineResult | null>(null)
  const [stats,       setStats]       = React.useState<{
    total: number; encontrados: number; naoEncontrados: number; arquivos: number
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

  // Upload múltiplo de TXTs
  const handleTxtChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (!selected.length) return
    setFilesTxt(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...selected.filter(f => !existing.has(f.name))]
    })
    e.target.value = ""
  }

  const removeTxt = (name: string) => setFilesTxt(prev => prev.filter(f => f.name !== name))

  const canRun = filesTxt.length > 0 && !!fileExcel

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(0)
    setLogs([])
    setStats(null)
    resetStages()

    try {
      addLog(`Análise iniciada — ${filesTxt.length} arquivo(s) TXT + Excel`, "step")
      filesTxt.forEach(f => addLog(`TXT: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`))
      addLog(`Excel: ${fileExcel!.name}`)

      // ── Etapa 1: Extração TXT ──────────────────────────────────────────
      setStage("txt", "running")
      setProgress(10)
      addLog("Etapa 1 — Extraindo pedidos dos arquivos TXT...", "step")
      addLog("Regex: (\\d{9})(\\d{3})(BV|RK|KP)(\\d{2})(\\d{6})")
      addLog("Data: padrão B1DDMMYY")

      const formData = new FormData()
      filesTxt.forEach(f => formData.append("filesTxt", f))
      formData.append("fileExcel", fileExcel!)

      const response = await executeRetornoPedidosPipeline(formData)
      if (!response?.success) throw new Error(response?.error || "Erro desconhecido no servidor.")

      setStage("txt", "done")
      addLog(`${response.result.resumoGeral?.totalPedidos ?? "?"} pedidos extraídos dos TXTs.`, "success")
      setProgress(28)

      // ── Etapa 2: Excel ─────────────────────────────────────────────────
      setStage("excel", "running")
      setProgress(38)
      addLog("Etapa 2 — Carregando Excel e auto-detectando colunas...", "step")
      addLog(`Detectado: ${response.result.colunasDetectadas?.pedido ?? "?"} · ${response.result.colunasDetectadas?.cliente ?? "?"}`)
      await new Promise(r => setTimeout(r, 100))
      setStage("excel", "done")
      addLog(`${response.result.resumoGeral?.totalExcel ?? "?"} registros válidos no Excel.`, "success")
      setProgress(52)

      // ── Etapa 3: Padronização ──────────────────────────────────────────
      setStage("norm", "running")
      setProgress(60)
      addLog("Etapa 3 — Padronizando: Pedido → zfill(6) · Cliente → zfill(9)...", "step")
      await new Promise(r => setTimeout(r, 80))
      setStage("norm", "done")
      addLog(`${response.result.resumoGeral?.chavesPrimarias ?? "?"} chaves primárias únicas no Excel.`, "success")
      setProgress(72)

      // ── Etapa 4: Comparação ────────────────────────────────────────────
      setStage("compare", "running")
      setProgress(82)
      addLog("Etapa 4 — Comparando chaves via Set O(1)...", "step")
      await new Promise(r => setTimeout(r, 80))
      setStage("compare", "done")

      const rg = response.result.resumoGeral ?? {}
      addLog(`Encontrados: ${rg.encontrados ?? 0} (${rg.percEncontrados ?? 0}%)`, "success")
      if ((rg.naoEncontrados ?? 0) > 0) {
        addLog(`Não encontrados: ${rg.naoEncontrados} (${rg.percNaoEncontrados}%)`, "warn")
      } else {
        addLog("Todos os pedidos foram localizados no Excel!", "success")
      }
      setProgress(90)

      setStats({
        total:          rg.totalPedidos  ?? 0,
        encontrados:    rg.encontrados   ?? 0,
        naoEncontrados: rg.naoEncontrados ?? 0,
        arquivos:       rg.arquivosProcessados ?? filesTxt.length,
      })
      setLastResult(response.result)

      // ── Etapa 5: Export ────────────────────────────────────────────────
      setStage("export", "running")
      setProgress(96)

      if (downloadOnly) {
        addLog("Gerando Excel com 6 abas...", "step")
        downloadMultipleSheets(
          [
            { data: response.result.todosPedidos     ?? [], name: "Todos_Pedidos"     },
            { data: response.result.encontrados      ?? [], name: "Encontrados"        },
            { data: response.result.naoEncontrados   ?? [], name: "Nao_Encontrados"    },
            { data: response.result.resumoPorArquivo ?? [], name: "Resumo_por_Arquivo" },
            { data: response.result.resumoPorEmpresa ?? [], name: "Resumo_por_Empresa" },
            { data: response.result.resumoGeralSheet ?? [], name: "Resumo_Geral"       },
          ],
          `Resultado_Analise_TXT`
        )
        addLog("Arquivo Excel baixado.", "success")
      } else {
        addLog("Dados sincronizados com Firebase.", "success")
      }

      setStage("export", "done")
      setProgress(100)
      addLog(`Análise concluída em ${new Date().toLocaleTimeString("pt-BR")}.`, "success")

      toast({
        title: downloadOnly ? "Excel pronto" : "Análise concluída",
        description: response.result.summary ?? "",
      })

    } catch (error: any) {
      const msg = error?.message || String(error)
      addLog(`FALHA: ${msg}`, "error")
      setStages(prev => prev.map(s => s.status === "running" ? { ...s, status: "error" } : s))
      setProgress(0)
      toast({ variant: "destructive", title: "Erro na Análise de Pedidos", description: msg })
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
          <Search className="size-4 text-primary" />
          <AlertTitle className="mb-0">Análise de Retorno de Pedidos — TXT vs Excel</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Extrai pedidos dos arquivos .txt via regex e compara com STATUS_PEDIDOS_MERCANETE.xlsx pela chave primária Codigo_Cliente_NumeroPedido.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Padrão: <code className="bg-muted px-1 rounded text-[10px]">9d+3d+(BV|RK|KP)+2d+6d</code>
          {" · "}Chave: <code className="bg-muted px-1 rounded text-[10px]">Codigo_Cliente_NumeroPedido</code>
          {" · "}Múltiplos encodings (UTF-8, Latin-1, CP1252, ISO-8859-1)
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="size-5 text-primary" />
                Configuração da Análise
              </CardTitle>
              <CardDescription>Arquivos TXT de relatório + BASE Excel de referência</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">

              {/* Arquivos TXT */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="size-3.5 text-slate-500" />
                  Arquivos TXT (relatórios)
                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 ml-auto">obrigatório</Badge>
                </Label>

                {/* Botão adicionar */}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed bg-background hover:bg-muted/20 transition-colors text-left"
                  onClick={() => document.getElementById("rp-txt-upload")?.click()}
                >
                  <Plus className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground italic flex-1">
                    {filesTxt.length === 0
                      ? "Adicionar arquivo(s) .txt..."
                      : `Adicionar mais arquivos (${filesTxt.length} selecionado${filesTxt.length > 1 ? "s" : ""})`}
                  </span>
                  <input id="rp-txt-upload" type="file" className="hidden" accept=".txt" multiple onChange={handleTxtChange} />
                </button>

                {/* Lista de TXTs */}
                {filesTxt.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                    {filesTxt.map(f => (
                      <div key={f.name} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20 border text-xs">
                        <FileText className="size-3 text-slate-400 shrink-0" />
                        <span className="flex-1 truncate font-medium text-slate-700">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
                        <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={() => removeTxt(f.name)}>
                          <Trash2 className="size-2.5 text-destructive/70" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Excel */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="size-3.5 text-emerald-600" />
                  Base de Referência Excel
                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 ml-auto">obrigatório</Badge>
                </Label>
                <div className="flex items-center gap-2 bg-background px-3 py-2.5 rounded-lg border text-xs">
                  <FileSpreadsheet className="size-3.5 text-emerald-500 shrink-0" />
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                    "bg-emerald-100 text-emerald-700")}>Mercanete</span>
                  <span className="truncate flex-1 font-medium text-muted-foreground">
                    {fileExcel ? fileExcel.name : <span className="italic">STATUS_PEDIDOS_MERCANETE.xlsx</span>}
                  </span>
                  {fileExcel && (
                    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => setFileExcel(null)}>
                      <Trash2 className="size-3 text-destructive/70" />
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm" className="h-6 text-[10px] px-2 cursor-pointer shrink-0">
                    <Label htmlFor="rp-excel-upload">{fileExcel ? "Trocar" : "Selecionar"}</Label>
                  </Button>
                  <Input
                    id="rp-excel-upload" type="file" className="hidden" accept=".xlsx,.xls"
                    onChange={e => { if (e.target.files?.[0]) setFileExcel(e.target.files[0]); e.target.value = "" }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground pl-1">
                  Colunas detectadas automaticamente: Pedido (original/pedido) · Cliente (código_cliente / numérico 9d)
                </p>
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
                        : progress === 100 ? "Análise finalizada" : ""}
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
                { label: "Arquivos TXT",    value: stats.arquivos,       icon: FileText,    highlight: false },
                { label: "Total pedidos",   value: stats.total,          icon: Hash,        highlight: false },
                { label: "Encontrados",     value: stats.encontrados,    icon: CheckCircle2,highlight: true  },
                { label: "Não encontrados", value: stats.naoEncontrados, icon: XCircle,     highlight: stats.naoEncontrados > 0 },
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
                        {stat.value.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Regras de extração */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center gap-2">
              <Info className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Lógica de Extração
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
                  <span className="text-[10px] font-mono">{rule.detail}</span>
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

      {lastResult && !isExecuting && <RetornoPedidosResultViewer result={lastResult} />}
    </div>
  )
}