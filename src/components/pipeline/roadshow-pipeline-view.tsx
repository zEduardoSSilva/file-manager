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
  Truck,
  FileSpreadsheet,
  DollarSign,
  CalendarDays,
  TrendingUp,
  MapPin,
  Weight,
  Clock,
  BarChart2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeRoadshowPipeline } from "@/app/actions/roadshow-pipeline"
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

const DEFAULT_META_JORNADA_MAX = 100
const DEFAULT_META_VEICULO_MIN = 85
const DEFAULT_VALOR_MENSAL     = 400.0
const DEFAULT_DIAS_META        = 25

const INITIAL_STAGES: Stage[] = [
  { id: "load",    label: "Módulo 1 — Carregar arquivos",    description: "Consolidado + Performaxxi + Veículos (opcional)",  status: "idle" },
  { id: "prep",    label: "Módulo 2 — Preparar consolidado", description: "Filtro mês/ano · Tipagem · TEMPO → timedelta",     status: "idle" },
  { id: "prod",    label: "Módulo 3 — Tempo produtivo",      description: "Fim − Início por DATA + PLACA (Performaxxi)",       status: "idle" },
  { id: "ocup",    label: "Módulo 4 — Ocupações",            description: "Jornada (%) = Produtivo ÷ Jornada · Veículo (%) = Peso ÷ Cap", status: "idle" },
  { id: "inc",     label: "Módulo 5 — Incentivo por região", description: "Jornada ≤ 100% → Jornada | > 100% → Veículo",     status: "idle" },
  { id: "resumo",  label: "Módulo 6 — Resumo mensal",        description: "Totais por região + cálculo aritmético",           status: "idle" },
  { id: "export",  label: "Exportar / Salvar Firebase",      description: "6 abas: Consolidado · Diário · Incentivo · Detalhe · Resumo · Arit.", status: "idle" },
]

const REGRAS_INCENTIVO = [
  { condition: "Jornada ≤ 100%",   result: "Indicador = Jornada (100% do dia)",      variant: "success" as const },
  { condition: "Jornada > 100%",   result: "Indicador = % Ocupação Veículo",          variant: "warn"    as const },
  { condition: "Incentivo / dia",  result: "Indicador % × (R$ meta / dias_meta)",     variant: "info"    as const },
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
  optional?: boolean
}

function FileInputRow({ id, label, tag, tagColor, file, setFile, optional }: FileInputRowProps) {
  return (
    <div className={cn(
      "flex items-center gap-2 bg-background px-3 py-2.5 rounded-lg border text-xs",
      optional && !file && "border-dashed opacity-70"
    )}>
      <FileSpreadsheet className="size-3.5 text-muted-foreground shrink-0" />
      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0", tagColor)}>{tag}</span>
      {optional && <span className="text-[9px] text-muted-foreground/60 shrink-0">(opcional)</span>}
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

type TabId = "resumo" | "incentivo" | "diario" | "consolidado"

function RoadshowResultViewer({ result }: { result: PipelineResult }) {
  const [activeTab, setActiveTab] = React.useState<TabId>("resumo")

  const resumoMensal:   any[] = result.resumoMensal   ?? []
  const resumoArit:     any[] = result.resumoArit     ?? []
  const incentivo:      any[] = result.incentivoDiario ?? []
  const ocupacaoDiaria: any[] = result.ocupacaoDiaria  ?? []
  const consolidado:    any[] = result.consolidado     ?? []

  if (!resumoMensal.length && !consolidado.length) return null

  const totalIncentivo = resumoMensal.reduce((a: number, r: any) => a + (r["Incentivo_Total"] ?? 0), 0)
  const totalRegioes   = resumoMensal.length
  const mediaJornada   = resumoMensal.length
    ? resumoMensal.reduce((a: number, r: any) => a + (r["Ocup_Jornada_Media"] ?? 0), 0) / resumoMensal.length
    : 0
  const mediaVeiculo   = resumoMensal.length
    ? resumoMensal.reduce((a: number, r: any) => a + (r["Ocup_Veiculo_Media"] ?? 0), 0) / resumoMensal.length
    : 0

  const TABS = [
    { id: "resumo"      as TabId, label: "Resumo Mensal",    count: resumoMensal.length    },
    { id: "incentivo"   as TabId, label: "Incentivo Diário", count: incentivo.length       },
    { id: "diario"      as TabId, label: "Ocupação Diária",  count: ocupacaoDiaria.length  },
    { id: "consolidado" as TabId, label: "Consolidado",       count: consolidado.length     },
  ]

  // Colunas por aba
  const COLS: Record<TabId, string[]> = {
    resumo:      ["REGIAO","Dias_Analisados","Dias_Com_Incentivo","Ocup_Jornada_Media","Ocup_Veiculo_Media","Incentivo_Total","Meta_Mensal_R$","Perc_Atingido_%"],
    incentivo:   ["DATA_ENTREGA","REGIAO","Ocup_Jornada_Media","Ocup_Veiculo_Media","Indicador_Usado","Percentual_Dia_%","Incentivo_Diario_R$","Atingiu_Meta_Veiculo"],
    diario:      ["DATA_ENTREGA","REGIAO","Ocup_Jornada_Media","Ocup_Veiculo_Media","Qtde_Rotas","Peso_Total","KM_Total"],
    consolidado: ["DATA_ENTREGA","REGIAO","OPERACAO","MOTORISTA","PLACA","PESO","CAPACIDADE","Ocup_Veiculo_%","Tempo_Produtivo_Fmt","Tempo_Jornada_Fmt","Ocup_Jornada_%","KM"],
  }

  const LABELS: Record<string, string> = {
    REGIAO: "Região", DATA_ENTREGA: "Data", OPERACAO: "Operação", MOTORISTA: "Motorista",
    PLACA: "Placa", PESO: "Peso (kg)", CAPACIDADE: "Cap. (kg)", KM: "KM",
    "Ocup_Veiculo_%": "% Veículo", "Ocup_Jornada_%": "% Jornada",
    Tempo_Produtivo_Fmt: "T. Produtivo", Tempo_Jornada_Fmt: "T. Jornada",
    Dias_Analisados: "Dias", Dias_Com_Incentivo: "Dias c/ Incentivo",
    Ocup_Jornada_Media: "% Jornada Méd", Ocup_Veiculo_Media: "% Veículo Méd",
    Incentivo_Total: "Incentivo Total", "Meta_Mensal_R$": "Meta (R$)", "Perc_Atingido_%": "% Atingido",
    Qtde_Rotas: "Rotas", Peso_Total: "Peso Total", KM_Total: "KM Total",
    Indicador_Usado: "Indicador", "Percentual_Dia_%": "% Dia",
    "Incentivo_Diario_R$": "Incentivo/Dia", Atingiu_Meta_Veiculo: "Meta Veículo",
  }

  const activeData = { resumo: resumoMensal, incentivo, diario: ocupacaoDiaria, consolidado }[activeTab]
  const activeDataKeys = activeData.length > 0 ? Object.keys(activeData[0]) : []
  const activeCols = COLS[activeTab].filter(c => activeDataKeys.includes(c))

  function fmtCell(col: string, val: any): React.ReactNode {
    if (val == null || val === "") return <span className="text-muted-foreground/40">—</span>

    if (col === "Atingiu_Meta_Veiculo") return val
      ? <span className="text-emerald-600 font-semibold">✓ Sim</span>
      : <span className="text-red-500">✗ Não</span>

    if (col === "Indicador_Usado") return (
      <Badge className={cn("text-[10px]", val === "Jornada"
        ? "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100"
        : "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100")}>
        {String(val)}
      </Badge>
    )

    if (typeof val === "boolean") return val
      ? <span className="text-emerald-600">✓</span>
      : <span className="text-red-500">✗</span>

    if (typeof val === "number") {
      if (col.includes("R$") || col.includes("Incentivo") || col.includes("Meta")) return `R$ ${val.toFixed(2)}`
      if (col.includes("%") || col.includes("Perc") || col.includes("Media")) return `${val.toFixed(2)}%`
      return val.toLocaleString("pt-BR")
    }
    return String(val)
  }

  function cellClass(col: string, val: any): string {
    if (typeof val === "number") {
      if (col.includes("Ocup") || col.includes("%")) {
        if (val >= 90) return "text-emerald-600 font-semibold"
        if (val >= 70) return "text-amber-600"
        if (val < 70 && val > 0) return "text-red-500"
      }
    }
    return ""
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Regiões",          value: totalRegioes,                          icon: MapPin,   highlight: true  },
          { label: "% Jornada médio",  value: `${mediaJornada.toFixed(1)}%`,         icon: Clock,    highlight: false },
          { label: "% Veículo médio",  value: `${mediaVeiculo.toFixed(1)}%`,         icon: Weight,   highlight: false },
          { label: "Total incentivo",  value: `R$ ${totalIncentivo.toFixed(2)}`,     icon: DollarSign,highlight: true },
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
      {activeData.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {TABS.find(t => t.id === activeTab)?.label}
            </span>
            <span className="text-[10px] text-muted-foreground">{activeData.length} registros</span>
          </div>
          <ScrollArea className="h-[480px]">
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
                    <TableRow key={i} className="text-xs">
                      {activeCols.map(col => (
                        <TableCell
                          key={col}
                          className={cn("px-2 py-1.5 whitespace-nowrap", cellClass(col, row[col]))}
                        >
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

export function RoadshowPipelineView() {
  const [year, setYear]   = React.useState(new Date().getFullYear())
  const [month, setMonth] = React.useState(new Date().getMonth() + 1)

  // Arquivos (consolidado obrigatório; os outros opcionais)
  const [fileConsolidado, setFileConsolidado] = React.useState<File | null>(null)
  const [filePedidos,     setFilePedidos]     = React.useState<File | null>(null)
  const [fileVeiculos,    setFileVeiculos]    = React.useState<File | null>(null)

  // Parâmetros de incentivo
  const [metaJornada, setMetaJornada]     = React.useState(DEFAULT_META_JORNADA_MAX)
  const [metaVeiculo, setMetaVeiculo]     = React.useState(DEFAULT_META_VEICULO_MIN)
  const [valorMensal, setValorMensal]     = React.useState(DEFAULT_VALOR_MENSAL)
  const [diasMeta,    setDiasMeta]        = React.useState(DEFAULT_DIAS_META)

  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress]       = React.useState(0)
  const [stages, setStages]           = React.useState<Stage[]>(INITIAL_STAGES)
  const [logs, setLogs]               = React.useState<LogEntry[]>([])
  const [lastResult, setLastResult]   = React.useState<PipelineResult | null>(null)
  const [stats, setStats]             = React.useState<{
    regioes: number; diasIncentivo: number; totalIncentivo: number; rotas: number
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

  const canRun = !!fileConsolidado

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(0)
    setLogs([])
    setStats(null)
    resetStages()

    try {
      addLog(`Pipeline Roadshow iniciado — ${String(month).padStart(2, "0")}/${year}`, "step")
      addLog(`Consolidado: ${fileConsolidado!.name}`)
      if (filePedidos)  addLog(`Performaxxi: ${filePedidos.name}`)
      else              addLog("Performaxxi não informado — Ocupação de Jornada = N/A", "warn")
      if (fileVeiculos) addLog(`Veículos: ${fileVeiculos.name}`)
      else              addLog("Veículos não informado — usando CAPACIDADE do consolidado", "warn")
      addLog(`Meta: Jornada ≤${metaJornada}% | Veículo ≥${metaVeiculo}% | R$ ${valorMensal.toFixed(2)}/${diasMeta}d`)

      // ── Módulo 1 — Load ───────────────────────────────────────────────
      setStage("load", "running")
      setProgress(8)

      const formData = new FormData()
      formData.append("year",         year.toString())
      formData.append("month",        month.toString())
      formData.append("fileConsolidado", fileConsolidado!)
      if (filePedidos)  formData.append("filePedidos",  filePedidos)
      if (fileVeiculos) formData.append("fileVeiculos", fileVeiculos)
      formData.append("metaJornada", metaJornada.toString())
      formData.append("metaVeiculo", metaVeiculo.toString())
      formData.append("valorMensal", valorMensal.toString())
      formData.append("diasMeta",    diasMeta.toString())

      const response = await executeRoadshowPipeline(formData)
      if (!response?.success) throw new Error(response?.error || "Erro desconhecido no servidor.")

      setStage("load", "done")
      addLog(`Dados carregados: ${response.result.totalRegistros ?? "?"} registros.`, "success")
      setProgress(18)

      // ── Módulo 2 — Preparação ─────────────────────────────────────────
      addLog("Módulo 2 — Preparando consolidado (filtro · tipagem · TEMPO)...", "step")
      setStage("prep", "running")
      setProgress(28)
      await new Promise(r => setTimeout(r, 120))
      setStage("prep", "done")
      addLog(`${response.result.registrosFiltrados ?? "?"} registros após filtro ${String(month).padStart(2,"0")}/${year}.`, "success")
      setProgress(38)

      // ── Módulo 3 — Tempo produtivo ────────────────────────────────────
      addLog("Módulo 3 — Calculando tempo produtivo (Performaxxi)...", "step")
      setStage("prod", "running")
      setProgress(48)
      await new Promise(r => setTimeout(r, 100))
      if (!filePedidos) {
        addLog("Sem Performaxxi — tempo produtivo não calculado.", "warn")
        setStage("prod", "warn")
      } else {
        setStage("prod", "done")
        addLog(`${response.result.agrupamentosPerformaxxi ?? "?"} agrupamentos DATA+PLACA.`, "success")
      }
      setProgress(58)

      // ── Módulo 4 — Ocupações ──────────────────────────────────────────
      addLog("Módulo 4 — Calculando ocupações de Jornada e Veículo...", "step")
      setStage("ocup", "running")
      setProgress(67)
      await new Promise(r => setTimeout(r, 100))
      setStage("ocup", "done")
      addLog(`Jornada: ${response.result.ocupJornadaValidos ?? "?"}válidos | Veículo: ${response.result.ocupVeiculoValidos ?? "?"}válidos.`, "success")
      setProgress(76)

      // ── Módulo 5 — Incentivo ──────────────────────────────────────────
      addLog("Módulo 5 — Aplicando regra de incentivo por região...", "step")
      setStage("inc", "running")
      setProgress(83)
      await new Promise(r => setTimeout(r, 80))
      setStage("inc", "done")
      setProgress(89)

      // ── Módulo 6 — Resumo ─────────────────────────────────────────────
      addLog("Módulo 6 — Gerando resumo mensal por região...", "step")
      setStage("resumo", "running")
      setProgress(93)
      await new Promise(r => setTimeout(r, 80))
      setStage("resumo", "done")
      setProgress(96)

      const result = response.result
      setLastResult(result)

      const resumo: any[] = result.resumoMensal ?? []
      const totalIncentivo = resumo.reduce((a: number, r: any) => a + (r["Incentivo_Total"] ?? 0), 0)
      const diasIncentivo  = (result.incentivoDiario ?? []).filter((r: any) => r["Incentivo_Diario_R$"] > 0).length

      setStats({
        regioes:        resumo.length,
        diasIncentivo,
        totalIncentivo,
        rotas:          (result.consolidado ?? []).length,
      })

      addLog(`${resumo.length} regiões · R$ ${totalIncentivo.toFixed(2)} em incentivos`, "success")

      // ── Export ────────────────────────────────────────────────────────
      setStage("export", "running")
      setProgress(98)

      if (downloadOnly) {
        addLog("Gerando Excel com 6 abas...", "step")
        downloadMultipleSheets(
          [
            { data: result.consolidado     ?? [], name: "01_Consolidado"               },
            { data: result.ocupacaoDiaria  ?? [], name: "02_Ocupacao_Diaria"           },
            { data: result.incentivoDiario ?? [], name: "03_Incentivo_Roteirizador"    },
            { data: result.detalhamento    ?? [], name: "04_Detalhamento"              },
            { data: result.resumoMensal    ?? [], name: "05_Resumo_Mensal"             },
            { data: result.resumoArit      ?? [], name: "06_Resumo_Mensal_Aritimetica" },
          ],
          `Roadshow_${month}_${year}`
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
      toast({ variant: "destructive", title: "Erro no pipeline Roadshow", description: msg })
    } finally {
      setIsExecuting(false)
    }
  }

  const doneCount = stages.filter(s => s.status === "done" || s.status === "warn").length
  const hasError  = stages.some(s => s.status === "error")
  const valorDia  = valorMensal / diasMeta

  return (
    <div className="space-y-6">

      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <AlertTitle className="mb-0">Pipeline Roadshow — Ocupação de Jornada e Veículo</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Calcula ocupação de jornada (Performaxxi) e de veículo (Peso ÷ Capacidade) por rota/dia, e aplica regra de incentivo por região.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          <strong>Jornada ≤ {metaJornada}%</strong> → indicador 100% |{" "}
          <strong>Jornada &gt; {metaJornada}%</strong> → indicador = % veículo.
          Incentivo: <strong>R$ {valorDia.toFixed(2)}/dia</strong> × indicador.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-5 text-primary" />
                Configuração do Pipeline Roadshow
              </CardTitle>
              <CardDescription>Consolidado Entregas (vFleet) + Performaxxi + Veículos (opcional)</CardDescription>
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

              {/* Parâmetros de incentivo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-muted-foreground" /> Meta Jornada máx (%)
                  </Label>
                  <Input type="number" value={metaJornada} onChange={e => setMetaJornada(parseFloat(e.target.value) || 100)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Weight className="size-3.5 text-muted-foreground" /> Meta Veículo mín (%)
                  </Label>
                  <Input type="number" value={metaVeiculo} onChange={e => setMetaVeiculo(parseFloat(e.target.value) || 85)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <DollarSign className="size-3.5 text-muted-foreground" /> Valor mensal (R$)
                  </Label>
                  <Input type="number" step="10" value={valorMensal} onChange={e => setValorMensal(parseFloat(e.target.value) || 400)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-muted-foreground" /> Dias de referência
                  </Label>
                  <Input type="number" value={diasMeta} onChange={e => setDiasMeta(parseInt(e.target.value) || 25)} />
                </div>
              </div>

              {/* Valor/dia calculado */}
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <TrendingUp className="size-3.5 text-primary shrink-0" />
                <span className="text-xs text-primary font-semibold">
                  Valor por dia: R$ {valorDia.toFixed(2)} &nbsp;(R$ {valorMensal.toFixed(2)} ÷ {diasMeta} dias)
                </span>
              </div>

              {/* Arquivos */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-primary">Arquivos de Entrada</Label>
                <FileInputRow
                  id="rs-consolidado"
                  label="Consolidado_Entregas_V2_Geral.xlsx"
                  tag="Consolidado"
                  tagColor="bg-primary/10 text-primary"
                  file={fileConsolidado}
                  setFile={setFileConsolidado}
                />
                <FileInputRow
                  id="rs-pedidos"
                  label="RelatorioAnaliticoRotaPedidos.xlsx"
                  tag="Performaxxi"
                  tagColor="bg-blue-100 text-blue-700"
                  file={filePedidos}
                  setFile={setFilePedidos}
                  optional
                />
                <FileInputRow
                  id="rs-veiculos"
                  label="Veiculos.xlsx"
                  tag="Veículos"
                  tagColor="bg-slate-100 text-slate-600"
                  file={fileVeiculos}
                  setFile={setFileVeiculos}
                  optional
                />
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
                    <span>{doneCount}/{stages.length} módulos</span>
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

          {/* Módulos */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Módulos de Execução
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
                { label: "Regiões",          value: stats.regioes,                          icon: MapPin,    highlight: true  },
                { label: "Rotas analisadas", value: stats.rotas,                            icon: Truck,     highlight: false },
                { label: "Dias c/ incentivo",value: stats.diasIncentivo,                    icon: CalendarDays,highlight: false},
                { label: "Total incentivo",  value: `R$ ${stats.totalIncentivo.toFixed(2)}`,icon: DollarSign,highlight: true  },
              ].map(stat => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className={cn(
                    "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm",
                    stat.label === "Total incentivo" && "col-span-2",
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
                Regra de Incentivo
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              {REGRAS_INCENTIVO.map((rule, idx) => (
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

      {lastResult && !isExecuting && <RoadshowResultViewer result={lastResult} />}
    </div>
  )
}
