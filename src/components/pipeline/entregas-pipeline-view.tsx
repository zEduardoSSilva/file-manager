import * as React from "react"
import {
  Play, Trash2, FileCode, Loader2, FileSpreadsheet, HelpCircle,
  Download, CheckCircle2, Circle, XCircle, AlertTriangle,
  ChevronRight, Terminal, Info, Database, Building2, Calendar,
  Clock, ShieldAlert,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import { AIParamAssistant } from "../../pages/AI-Param-Assistant"
import { executeConsolidacaoEntregasPipeline, montarNomeAba } from "@/app/actions/entregas-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────
type StageStatus = "idle" | "running" | "done" | "error" | "warn"
interface Stage { id: string; label: string; description: string; status: StageStatus }
interface LogEntry { time: string; message: string; type: "info" | "success" | "error" | "warn" | "step" }
interface DuplicadaInfo {
  liquidacao: string; data: string; motorista: string; filial: string
}

// ─── Filiais ──────────────────────────────────────────────────────────────────
const FILIAIS = [
  { id: "cambe",        label: "CAMBE.xlsx",         regiao: "RK01" },
  { id: "cascavel",     label: "CASCAVEL.xlsx",       regiao: "KP01" },
  { id: "curitiba",     label: "CURITIBA.xlsx",       regiao: "RK03" },
  { id: "campo-grande", label: "CAMPO GRANDE.xlsx",   regiao: "BV01" },
  { id: "dourados",     label: "DOURADOS.xlsx",       regiao: "BV02" },
]

const STAGES_DIA: Stage[] = [
  { id: "load",   label: "Carregar arquivos",          description: "Lê os arquivos de cada filial selecionada",      status: "idle" },
  { id: "sheet",  label: "Localizar aba",              description: "Busca a aba DD.MM.YYYY em cada arquivo",         status: "idle" },
  { id: "parse",  label: "Processar registros",        description: "Extrai tabelas · PLACA fallback · TEMPO HH:MM",  status: "idle" },
  { id: "accum",  label: "Gerar Acumulado",            description: "Consolida filiais · remove CHÃO",                status: "idle" },
  { id: "export", label: "Exportar / Salvar Firebase", description: "Abas por filial + Acumulado",                    status: "idle" },
]

const STAGES_MES: Stage[] = [
  { id: "load",   label: "Carregar arquivo",           description: "Lê um arquivo por vez",                          status: "idle" },
  { id: "scan",   label: "Varrer abas do mês",         description: "Filtra abas DD.MM.YYYY do mês/ano selecionado",  status: "idle" },
  { id: "parse",  label: "Processar registros",        description: "Extrai tabelas de cada aba encontrada",          status: "idle" },
  { id: "accum",  label: "Gerar Acumulado",            description: "Consolida todos os dias · remove CHÃO",          status: "idle" },
  { id: "export", label: "Exportar / Salvar Firebase", description: "Abas por filial + Acumulado",                    status: "idle" },
]

const REGRAS = [
  { condition: "Registros CHÃO",    result: "Removidos apenas no Acumulado",    variant: "warn"    as const },
  { condition: "PLACA vazia",       result: "Substituída por PLACA SISTEMA",     variant: "info"    as const },
  { condition: "TEMPO",             result: "Convertido para HH:MM",             variant: "info"    as const },
  { condition: "Viagem duplicada",  result: "Ignorada, já existe no Firebase",   variant: "warn"    as const },
  { condition: "Abas geradas",      result: "Uma por filial + Acumulado",        variant: "success" as const },
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
const stageLbl: Record<StageStatus, string> = {
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

// ─── Dialog de duplicadas ─────────────────────────────────────────────────────
function DuplicadasDialog({
  open, onClose, duplicadas,
}: {
  open: boolean
  onClose: () => void
  duplicadas: DuplicadaInfo[]
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-amber-500" />
            Viagens não importadas — já existem no banco
          </DialogTitle>
          <DialogDescription className="text-xs">
            As viagens abaixo já constam no Firebase para este período e <strong>não foram cadastradas novamente</strong>.
            Para substituir, exclua os registros existentes na Visão Analítica antes de reimportar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1">
          <Badge variant="outline" className="text-[11px] border-amber-300 text-amber-700 bg-amber-50">
            {duplicadas.length} viagem{duplicadas.length !== 1 ? "ns" : ""} ignorada{duplicadas.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <ScrollArea className="flex-1 rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/30 border-b sticky top-0">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Liquidação</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Data</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Motorista</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Filial</th>
              </tr>
            </thead>
            <tbody>
              {duplicadas.map((d, i) => (
                <tr key={i} className={cn(
                  "border-b transition-colors",
                  i % 2 === 0 ? "bg-background" : "bg-muted/5"
                )}>
                  <td className="px-3 py-2 font-mono text-amber-700">{d.liquidacao}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.data}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate">{d.motorista}</td>
                  <td className="px-3 py-2">{d.filial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>

        <DialogFooter className="pt-2">
          <DialogClose asChild>
            <Button size="sm" className="gap-1.5">
              <CheckCircle2 className="size-3.5" />
              Entendido
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function ConsolidacaoEntregasPipelineView() {
  const [year,  setYear]  = React.useState(new Date().getFullYear())
  const [month, setMonth] = React.useState(new Date().getMonth() + 1)
  const [day,   setDay]   = React.useState<number>(new Date().getDate())

  const [files,       setFiles]       = React.useState<Record<string, File | null>>({})
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress,    setProgress]    = React.useState(0)
  const [stages,      setStages]      = React.useState<Stage[]>(STAGES_DIA)
  const [logs,        setLogs]        = React.useState<LogEntry[]>([])
  const [lastResult,  setLastResult]  = React.useState<PipelineResult | null>(null)
  const [stats,       setStats]       = React.useState<{
    filiaisOk: number; total: number; acumulado: number; duplicadas: number
  } | null>(null)

  // Dialog duplicadas
  const [duplicadas,      setDuplicadas]      = React.useState<DuplicadaInfo[]>([])
  const [showDuplicadas,  setShowDuplicadas]  = React.useState(false)

  const logEndRef = React.useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const modoMesCompleto = day === 0

  React.useEffect(() => {
    setStages((modoMesCompleto ? STAGES_MES : STAGES_DIA).map(s => ({ ...s, status: "idle" })))
  }, [modoMesCompleto])

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") =>
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString("pt-BR"), message, type }])

  const setStage = (id: string, status: StageStatus) =>
    setStages(prev => prev.map(s => s.id === id ? { ...s, status } : s))

  const resetAll = () => {
    setStages((modoMesCompleto ? STAGES_MES : STAGES_DIA).map(s => ({ ...s, status: "idle" })))
    setProgress(0); setStats(null)
  }

  const canRun = FILIAIS.some(f => files[f.id])
  const handleFileChange = (id: string, file: File | null) =>
    setFiles(prev => ({ ...prev, [id]: file }))

  const abaPreview = day > 0 ? montarNomeAba(day, month, year) : null

  const runPipeline = async (downloadOnly = false) => {
    if (!canRun) return
    setIsExecuting(true); setLogs([]); resetAll()
    setDuplicadas([]); setShowDuplicadas(false)

    try {
      const selecionados = FILIAIS.filter(f => files[f.id])
      const modoLabel    = day > 0 ? `aba ${montarNomeAba(day, month, year)}` : `mês ${String(month).padStart(2,"0")}/${year} completo`

      addLog(`Consolidação de Entregas — ${modoLabel}`, "step")
      addLog(`${selecionados.length} filial(is): ${selecionados.map(f => f.regiao).join(" · ")}`)
      if (modoMesCompleto) addLog("⚠️  Modo mês completo — processamento pode ser demorado.", "warn")

      setStage("load", "running"); setProgress(10)
      await new Promise(r => setTimeout(r, 150))
      selecionados.forEach(f => addLog(`• [${f.regiao}] ${f.label}`))
      setStage("load", "done"); setProgress(20)

      const formData = new FormData()
      formData.append("year", String(year))
      formData.append("month", String(month))
      formData.append("day", String(day))
      if (day > 0) formData.append("sheetName", montarNomeAba(day, month, year))
      for (const filial of FILIAIS) {
        if (files[filial.id]) {
          formData.append("files", files[filial.id]!)
          formData.append("fileNames", filial.id)  // ← usa o id fixo: "cambe", "cascavel", etc.
        }
      }

      const stage2id = modoMesCompleto ? "scan" : "sheet"
      addLog(day > 0
        ? `Localizando aba "${abaPreview}" em cada arquivo...`
        : "Varrendo todas as abas DD.MM.YYYY do mês...", "step")
      addLog("Verificando duplicatas no Firebase...", "info")
      setStage(stage2id, "running"); setProgress(35)

      const response = await executeConsolidacaoEntregasPipeline(formData)
      if (!response.success) throw new Error(response.error)

      setStage(stage2id, "done"); setProgress(52)
      addLog("Abas localizadas e lidas.", "success")

      setStage("parse", "running"); setProgress(65)
      await new Promise(r => setTimeout(r, 100))
      setStage("parse", "done"); setProgress(78)
      addLog("Registros extraídos e padronizados.", "success")

      addLog("Gerando aba Acumulado — removendo registros CHÃO...", "step")
      setStage("accum", "running"); setProgress(88)
      await new Promise(r => setTimeout(r, 100))
      setStage("accum", "done"); setProgress(95)

      setStage("export", "running"); setProgress(97)
      const result = response.result
      setLastResult(result)

      // ── Captura duplicadas retornadas pelo pipeline ─────────────────────
      const dups: DuplicadaInfo[] = result.duplicadas ?? []
      if (dups.length > 0) {
        setDuplicadas(dups)
        addLog(`${dups.length} viagem(ns) ignorada(s) — já existem no banco.`, "warn")
        // Mostra o dialog após um pequeno delay para não sobrepor o toast
        setTimeout(() => setShowDuplicadas(true), 600)
      }

      const sumMatch = (result.summary ?? "").match(/(\d+) filiais · (\d+) registros · (\d+)/)
      if (sumMatch) {
        setStats({
          filiaisOk: parseInt(sumMatch[1]),
          total:     parseInt(sumMatch[2]),
          acumulado: parseInt(sumMatch[3]),
          duplicadas: dups.length,
        })
      }

      if (downloadOnly && result.extraSheets) {
        const fileName = day > 0
          ? `Consolidado_Entregas_${String(day).padStart(2,"0")}-${String(month).padStart(2,"0")}-${year}`
          : `Consolidado_Entregas_${String(month).padStart(2,"0")}-${year}`
        downloadMultipleSheets(
          result.extraSheets.map((s: any) => ({ data: s.data, name: s.name })),
          fileName
        )
        addLog(`Excel baixado: ${fileName}.xlsx`, "success")
      } else {
        addLog("Dados sincronizados com Firebase.", "success")
      }

      setStage("export", "done"); setProgress(100)
      addLog(result.summary ?? "Pipeline concluído.", "success")

      toast({
        title: downloadOnly ? "Excel pronto" : "Pipeline concluído",
        description: dups.length > 0
          ? `${result.summary} — verifique as duplicatas.`
          : result.summary,
      })

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
          <Building2 className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidação de Entregas</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Lê a aba correspondente à data nos arquivos de cada filial. As abas seguem o padrão <strong>DD.MM.YYYY</strong>.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Com dia preenchido → lê apenas a aba daquele dia.
          Com dia <strong>em branco / zero</strong> → lê todas as abas do mês (mais lento).
          Viagens já existentes no banco serão <strong>ignoradas automaticamente</strong>.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                Configuração da Consolidação
              </CardTitle>
              <CardDescription>Selecione o período e os arquivos de cada filial.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Período */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Ano
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="size-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Ano de referência do consolidado. Ex: <strong>2026</strong>.<br />
                          Usado para filtrar as abas no formato <span className="font-mono">DD.MM.YYYY</span> e para indexar os dados no Firebase.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Input type="number" value={year}
                    onChange={e => setYear(parseInt(e.target.value))} />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Mês
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="size-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Mês de referência (1–12). Ex: <strong>3</strong> para março.<br />
                          Apenas abas cujo mês e ano coincidam serão processadas.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Input type="number" min={1} max={12} value={month}
                    onChange={e => setMonth(parseInt(e.target.value))} />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Dia
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="size-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Dia específico a processar. Ex: <strong>12</strong> → busca a aba <span className="font-mono">12.03.2026</span>.<br />
                          Deixe <strong>0</strong> ou vazio para processar <strong>todas as abas do mês</strong> (mais lento).</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Input
                    type="number" min={0} max={31}
                    value={day === 0 ? "" : day}
                    placeholder="0 = mês todo"
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      setDay(isNaN(v) || v < 0 ? 0 : Math.min(v, 31))
                    }}
                  />
                </div>
              </div>

              {modoMesCompleto ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <Clock className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-700">
                    <span className="font-semibold">Modo mês completo</span> — todas as abas{" "}
                    <span className="font-mono">DD.{String(month).padStart(2,"0")}.{year}</span>{" "}
                    serão processadas. Pode levar alguns minutos por arquivo.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <Calendar className="size-3.5 text-primary shrink-0" />
                  <span className="text-[11px] text-primary">
                    Aba alvo: <span className="font-mono font-bold">{abaPreview}</span>
                  </span>
                </div>
              )}

              <AIParamAssistant
                onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }}
                currentMonth={month} currentYear={year}
              />

              {/* Filiais */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-primary">
                  Arquivos de Controle ({FILIAIS.filter(f => files[f.id]).length}/{FILIAIS.length} selecionados)
                </Label>
                <div className="space-y-1.5 rounded-xl border border-border/60 p-2 bg-muted/5">
                  {FILIAIS.map(filial => {
                    const hasFile = !!files[filial.id]
                    return (
                      <div key={filial.id} className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                        hasFile ? "bg-emerald-50 border-emerald-200" : "bg-background border-border/40 hover:bg-muted/10"
                      )}>
                        <FileSpreadsheet className={cn("size-4 shrink-0", hasFile ? "text-emerald-600" : "text-primary/50")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
                              hasFile ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                            )}>
                              {filial.regiao}
                            </span>
                            <span className="text-xs font-semibold truncate">
                              CONTROLE DE DISTRIBUIÇÃO — {filial.label}
                            </span>
                          </div>
                          {hasFile
                            ? <span className="text-[11px] text-emerald-600 font-medium truncate block mt-0.5">{files[filial.id]?.name}</span>
                            : <span className="text-[11px] text-muted-foreground italic mt-0.5 block">Nenhum arquivo selecionado</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasFile && (
                            <Button variant="ghost" size="icon" className="size-6"
                              onClick={() => handleFileChange(filial.id, null)}>
                              <Trash2 className="size-3 text-destructive/70" />
                            </Button>
                          )}
                          <Button
                            variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => document.getElementById(`file-ent-${filial.id}`)?.click()}
                          >
                            {hasFile ? "Trocar" : "Selecionar"}
                          </Button>
                        </div>
                        <input
                          id={`file-ent-${filial.id}`} type="file" className="hidden"
                          accept=".xlsx,.xls"
                          onChange={e => handleFileChange(filial.id, e.target.files?.[0] || null)}
                        />
                      </div>
                    )
                  })}
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
                    <span>
                      {isExecuting
                        ? (stages.find(s => s.status === "running")?.label ?? "...")
                        : progress === 100 ? "Pipeline finalizado" : ""}
                    </span>
                  </div>
                </div>
              )}

              {/* Banner de duplicadas (após conclusão) */}
              {!isExecuting && duplicadas.length > 0 && (
                <button
                  onClick={() => setShowDuplicadas(true)}
                  className="w-full flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left transition-colors hover:bg-amber-100"
                >
                  <ShieldAlert className="size-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-amber-800">
                      {duplicadas.length} viagem{duplicadas.length !== 1 ? "ns" : ""} não importada{duplicadas.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] text-amber-600">
                      Já existem no banco. Clique para ver os detalhes.
                    </p>
                  </div>
                  <ChevronRight className="size-3.5 text-amber-500 shrink-0" />
                </button>
              )}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4 pb-4 flex gap-2">
              <Button
                variant="outline" size="sm"
                className="flex-1 h-9 text-xs font-semibold border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400"
                onClick={() => runPipeline(true)}
                disabled={isExecuting || !canRun}
              >
                <Download className="mr-1.5 size-3.5" /> Exportar Excel
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 text-xs font-semibold shadow-sm"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || !canRun}
              >
                {isExecuting
                  ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Processando...</>
                  : <><Play className="mr-1.5 size-3.5 fill-current" /> Iniciar Consolidação</>}
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
                Etapas — {modoMesCompleto ? "Mês Completo" : "Dia Específico"}
              </span>
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
                { label: "Filiais",          value: `${stats.filiaisOk}/5`,                     icon: Building2,     highlight: false, warn: false },
                { label: "Registros",        value: stats.total.toLocaleString("pt-BR"),         icon: Database,      highlight: false, warn: false },
                { label: "Linhas Acumulado", value: stats.acumulado.toLocaleString("pt-BR"),     icon: CheckCircle2,  highlight: true,  warn: false, span: true },
                ...(stats.duplicadas > 0 ? [{
                  label: "Duplicadas ignoradas", value: stats.duplicadas.toLocaleString("pt-BR"),
                  icon: ShieldAlert, highlight: false, warn: true, span: true,
                }] : []),
              ].map(stat => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className={cn(
                    "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm",
                    (stat as any).span ? "col-span-2" : "",
                    stat.warn    ? "bg-amber-50 border-amber-200" :
                    stat.highlight ? "bg-primary/5 border-primary/20" : "bg-card border-border/60"
                  )}>
                    <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0",
                      stat.warn ? "bg-amber-100" : stat.highlight ? "bg-primary/10" : "bg-muted/30")}>
                      <Icon className={cn("size-3.5",
                        stat.warn ? "text-amber-500" : stat.highlight ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-bold leading-tight",
                        stat.warn ? "text-amber-700" : stat.highlight ? "text-primary" : "text-foreground")}>
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

      {/* ── Dialog de viagens duplicadas ── */}
      <DuplicadasDialog
        open={showDuplicadas}
        onClose={() => setShowDuplicadas(false)}
        duplicadas={duplicadas}
      />
    </div>
  )
}