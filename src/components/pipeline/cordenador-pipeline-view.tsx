"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  Building2,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  ClipboardList,
  HelpCircle,
  AlertTriangle,
} from "lucide-react"
import { Button }       from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input }        from "@/components/ui/input"
import { Label }        from "@/components/ui/label"
import { ScrollArea }   from "@/components/ui/scroll-area"
import { Progress }     from "@/components/ui/progress"
import { Badge }        from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator }    from "@/components/ui/separator"
import { AIParamAssistant } from "./ai-param-assistant"
import { DataViewer }   from "./data-viewer"
import { executeCoordenadorPipeline } from "@/app/actions/coordenador-pipeline"
import { useToast }     from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"

// ── Tipos ────────────────────────────────────────────────────────────────────

interface FileSlot {
  key     : string;
  label   : string;
  hint    : string;
  icon    : React.ReactNode;
  required: boolean;
  accept  : string;
  multiple?: boolean;
  file    ?: File[];
}

// ── Módulos visuais ───────────────────────────────────────────────────────────

const MODULE_INFO = [
  {
    num  : "01",
    title: "Desempenho de Rotas",
    desc : "Lê Motoristas/Ajudantes_Ajustado · remove domingos · bonificação R$ 48,00",
    color: "text-blue-600",
    bg   : "bg-blue-50 border-blue-200",
  },
  {
    num  : "02",
    title: "Processador de Ponto",
    desc : "CSVs Ponto_Original · filtra mês · remove duplicatas por pontuação",
    color: "text-violet-600",
    bg   : "bg-violet-50 border-violet-200",
  },
  {
    num  : "03",
    title: "Tempo Interno",
    desc : `T1 ≤ 30 min (chegada→rota) · T2 ≤ 40 min (rota→saída) · bonificação R$ 12,00`,
    color: "text-amber-600",
    bg   : "bg-amber-50 border-amber-200",
  },
  {
    num  : "04",
    title: "Consolidação Final",
    desc : "Rotas + Tempo + Peso · penalização ≥ 15% devolvido · R$ 60,00/dia máx",
    color: "text-emerald-600",
    bg   : "bg-emerald-50 border-emerald-200",
  },
]

// ── Componente principal ──────────────────────────────────────────────────────

export function CoordenadorPipelineView() {
  const [year,  setYear]  = React.useState(2026)
  const [month, setMonth] = React.useState(1)

  // Arquivos individuais
  const [fileMotoristas,  setFileMotoristas]  = React.useState<File | null>(null)
  const [fileAjudantes,   setFileAjudantes]   = React.useState<File | null>(null)
  const [fileRotas,       setFileRotas]       = React.useState<File | null>(null)
  const [fileAnaliseRotas,setFileAnaliseRotas]= React.useState<File | null>(null)
  const [filesPonto,      setFilesPonto]      = React.useState<File[]>([])

  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress,    setProgress]    = React.useState(0)
  const [logs,        setLogs]        = React.useState<string[]>([])
  const [lastResult,  setLastResult]  = React.useState<PipelineResult | null>(null)

  const { toast } = useToast()

  // ── Logs ─────────────────────────────────────────────────────────────────
  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts = new Date().toLocaleTimeString('pt-BR')
    const prefix = type === 'error'   ? '❌ [ERRO] '
                 : type === 'success' ? '✅ [OK] '
                 : type === 'warn'    ? '⚠️ [AVISO] '
                 : ''
    setLogs(prev => [...prev, `[${ts}] ${prefix}${msg}`])
  }

  // ── Upload helpers ────────────────────────────────────────────────────────
  const makeInputRef = (id: string) => () => document.getElementById(id)?.click()

  const singleFileRow = (
    id     : string,
    label  : string,
    file   : File | null,
    setFile: (f: File | null) => void,
    hint   : string,
    required = true,
    icon   : React.ReactNode = <FileSpreadsheet className="size-3.5" />
  ) => (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold truncate">{label}</span>
          {required && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">obrigatório</Badge>}
          {!required && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">opcional</Badge>}
        </div>
        {file
          ? <span className="text-[11px] text-primary font-medium truncate block">{file.name}</span>
          : <span className="text-[11px] text-muted-foreground italic truncate block">{hint}</span>
        }
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {file && (
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setFile(null)}>
            <Trash2 className="size-3 text-destructive" />
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={makeInputRef(id)}>
          {file ? 'Trocar' : 'Selecionar'}
        </Button>
      </div>
      <input
        id={id} type="file" className="hidden" accept=".xlsx,.xls"
        onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const canRun = fileMotoristas && fileAjudantes

  const runPipeline = async () => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(5)
    setLogs([])

    addLog(`Iniciando Pipeline Coordenadores — ${String(month).padStart(2,'0')}/${year}`)
    addLog(`Módulo 01: Desempenho de Rotas...`)

    try {
      const formData = new FormData()
      formData.append('year',  year.toString())
      formData.append('month', month.toString())
      formData.append('fileMotoristas',  fileMotoristas)
      formData.append('fileAjudantes',   fileAjudantes)
      if (fileRotas)        formData.append('fileRotas',       fileRotas)
      if (fileAnaliseRotas) formData.append('fileAnaliseRotas',fileAnaliseRotas)
      filesPonto.forEach(f => formData.append('filesPonto', f))

      setProgress(20)
      addLog(`Módulo 02: Processando ${filesPonto.length} arquivo(s) de ponto...`)
      setProgress(45)
      addLog(`Módulo 03: Calculando T1/T2 por empresa-dia...`)
      setProgress(65)
      addLog(`Módulo 04: Consolidando bonificações + penalizações...`)
      setProgress(80)

      const response = await executeCoordenadorPipeline(formData, 'coordenadores')

      if (!response.success) throw new Error(response.error)

      setLastResult(response.result)
      setProgress(100)

      const { data, resumoMensal, summary } = response.result
      addLog(`Consolidação concluída: ${data?.length ?? 0} dias analisados.`, 'success')
      addLog(`${resumoMensal?.length ?? 0} empresas no resumo mensal.`, 'success')
      addLog(`Firebase ID: ${response.result.id}`, 'success')

      toast({
        title      : 'Coordenadores — Processado',
        description: summary || `${data?.length ?? 0} registros consolidados.`,
      })
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error')
      setProgress(0)
      toast({ variant: 'destructive', title: 'Erro no Pipeline', description: error.message })
    } finally {
      setIsExecuting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">

      {/* Header Alert */}
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <AlertTitle className="mb-0">Pipeline Coordenadores — 4 Módulos</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Rotas (R$ 48) + Tempo Interno (R$ 12) = R$ 60,00/dia máximo. Penalização automática se devolução ≥ 15%.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Desempenho de Rotas · Ponto · Tempo Interno · Consolidação Final com penalização por peso devolvido.
        </AlertDescription>
      </Alert>

      {/* Módulos visuais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {MODULE_INFO.map(m => (
          <div key={m.num} className={`rounded-lg border p-3 ${m.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-black tracking-widest ${m.color}`}>MOD {m.num}</span>
            </div>
            <p className={`text-xs font-bold ${m.color} leading-tight mb-1`}>{m.title}</p>
            <p className="text-[10px] text-muted-foreground leading-snug">{m.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Coluna principal: configuração + arquivos */}
        <div className="lg:col-span-2 space-y-6 min-w-0">

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Configuração</CardTitle>
              <CardDescription className="text-xs">Período de referência e arquivos de entrada</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">

              {/* Período */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ano</Label>
                  <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mês</Label>
                  <Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} className="h-9" />
                </div>
              </div>

              <AIParamAssistant
                onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }}
                currentMonth={month}
                currentYear={year}
              />

              <Separator />

              {/* Módulo 1 — Rotas */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="size-3 text-blue-600" />
                  </div>
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                    Módulo 01 — Desempenho de Rotas
                  </span>
                </div>
                <div className="space-y-1.5 pl-7">
                  {singleFileRow(
                    'upload-motoristas', 'Motoristas_Ajustado.xlsx', fileMotoristas, setFileMotoristas,
                    'relatorio_consolidado_Motoristas_Ajustado.xlsx'
                  )}
                  {singleFileRow(
                    'upload-ajudantes', 'Ajudantes_Ajustado.xlsx', fileAjudantes, setFileAjudantes,
                    'relatorio_consolidado_Ajudantes_Ajustado.xlsx'
                  )}
                </div>
              </div>

              <Separator />

              {/* Módulo 2 — Ponto */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-violet-100 flex items-center justify-center">
                    <ClipboardList className="size-3 text-violet-600" />
                  </div>
                  <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">
                    Módulo 02 — Arquivos de Ponto (CSV)
                  </span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">opcional</Badge>
                </div>
                <div className="pl-7 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      {filesPonto.length === 0
                        ? 'Ponto_Original_*-*.csv — múltiplos arquivos permitidos'
                        : `${filesPonto.length} arquivo(s) selecionado(s)`}
                    </p>
                    <Button
                      variant="outline" size="sm" className="h-6 text-[10px] px-2"
                      onClick={() => document.getElementById('upload-ponto')?.click()}
                    >
                      <Upload className="size-3 mr-1" />Adicionar CSV
                    </Button>
                    <input
                      id="upload-ponto" type="file" multiple className="hidden" accept=".csv"
                      onChange={e => {
                        if (e.target.files) setFilesPonto(prev => [...prev, ...Array.from(e.target.files!)])
                        e.target.value = ''
                      }}
                    />
                  </div>
                  {filesPonto.length > 0 && (
                    <div className="space-y-1">
                      {filesPonto.map((f, i) => (
                        <div key={i} className="flex items-center justify-between bg-white border rounded p-1.5 text-[11px]">
                          <span className="truncate flex-1 font-medium">{f.name}</span>
                          <Button
                            variant="ghost" size="icon" className="size-5 ml-1"
                            onClick={() => setFilesPonto(prev => prev.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Módulos 3 & 4 — Arquivos complementares */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-amber-100 flex items-center justify-center">
                    <Clock className="size-3 text-amber-600" />
                  </div>
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                    Módulos 03 & 04 — Arquivos Complementares
                  </span>
                </div>
                <div className="space-y-1.5 pl-7">
                  {singleFileRow(
                    'upload-rotas', 'RelatorioAnaliticoRotaPedidos.xlsx', fileRotas, setFileRotas,
                    'Consulta_Performaxxi / RelatorioAnaliticoRotaPedidos.xlsx',
                    false,
                    <Clock className="size-3.5" />
                  )}
                  {singleFileRow(
                    'upload-analise', 'analise_rotas_pedidos.xlsx', fileAnaliseRotas, setFileAnaliseRotas,
                    'Consulta_Performaxxi / analise_rotas_pedidos.xlsx (penalização)',
                    false,
                    <AlertTriangle className="size-3.5 text-amber-500" />
                  )}
                </div>
              </div>

              {/* Regras financeiras */}
              <Alert className="bg-muted/30 border-muted py-2.5 px-3">
                <AlertDescription className="text-[10px] text-muted-foreground space-y-0.5">
                  <div className="font-semibold text-foreground mb-1">Regras de Bonificação</div>
                  <div className="grid grid-cols-2 gap-x-4">
                    <span>💰 Rotas     → R$ 48,00/dia (80%)</span>
                    <span>⏱️  Tempo     → R$ 12,00/dia (20%)</span>
                    <span>🏆 Máximo    → R$ 60,00/dia</span>
                    <span>⚠️  Penaliz.  → ≥ 15% devolvido → R$ 0</span>
                    <span>🚫 Domingos  → removidos</span>
                    <span>⏲️  T1 ≤ 30 min · T2 ≤ 40 min</span>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Progress bar */}
              {isExecuting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-primary uppercase">
                    <span>Processando Módulos</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4">
              <Button
                className="w-full h-12 bg-primary text-white font-bold text-base shadow-md disabled:opacity-50"
                onClick={runPipeline}
                disabled={isExecuting || !canRun}
              >
                {isExecuting
                  ? <><Loader2 className="mr-2 animate-spin" />Processando Módulos...</>
                  : <><Play className="mr-2 fill-current" />Iniciar Pipeline Coordenadores</>
                }
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Console de execução */}
        <div className="min-w-0">
          <Card className="h-full flex flex-col border bg-slate-50 overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-muted/20 flex items-center gap-2">
              <FileCode className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Console de Execução
              </span>
              {logs.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0">
                  {logs.length}
                </Badge>
              )}
            </div>
            <ScrollArea className="flex-1 p-4 font-mono text-[11px] leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-muted-foreground italic">
                  Aguardando arquivos obrigatórios (Motoristas + Ajudantes)...
                </p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.includes('[ERRO]')   ? 'text-destructive' :
                        log.includes('[OK]')     ? 'text-green-600' :
                        log.includes('[AVISO]')  ? 'text-amber-600' :
                        'text-slate-500'
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Status dos arquivos */}
            <div className="p-3 border-t bg-muted/10 space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Status dos Arquivos
              </p>
              {[
                { label: 'Motoristas_Ajustado', file: fileMotoristas, req: true },
                { label: 'Ajudantes_Ajustado',  file: fileAjudantes,  req: true },
                { label: `Ponto (${filesPonto.length} CSVs)`, file: filesPonto.length > 0 ? filesPonto[0] : null, req: false },
                { label: 'RelatorioAnalitico',  file: fileRotas,       req: false },
                { label: 'AnaliseRotasPedidos', file: fileAnaliseRotas,req: false },
              ].map(({ label, file, req }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full shrink-0 ${file ? 'bg-green-500' : req ? 'bg-red-400' : 'bg-slate-300'}`} />
                  <span className={`text-[10px] truncate ${file ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                  {req && !file && (
                    <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 ml-auto shrink-0">
                      req.
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Resultado */}
      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}