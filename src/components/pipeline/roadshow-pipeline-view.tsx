"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  Truck,
  Clock,
  Package,
  HelpCircle,
  FileSpreadsheet,
  TrendingUp,
  MapPin,
} from "lucide-react"
import { Button }     from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input }      from "@/components/ui/input"
import { Label }      from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress }   from "@/components/ui/progress"
import { Badge }      from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator }  from "@/components/ui/separator"
import { AIParamAssistant } from "./ai-param-assistant"
import { DataViewer } from "./data-viewer"
import { executeRoadshowPipeline } from "@/app/actions/roadshow-pipeline"
import { useToast }   from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"

// ── Módulos visuais ───────────────────────────────────────────────────────────

const MODULE_INFO = [
  {
    num  : '01',
    title: 'Consolidado',
    desc : 'Entregas V2 · PLACA · PESO · TEMPO · REGIÃO',
    color: 'text-blue-600',
    bg   : 'bg-blue-50 border-blue-200',
  },
  {
    num  : '02',
    title: 'Tempo Produtivo',
    desc : 'Performaxxi · Fim − Início por Placa/Dia',
    color: 'text-violet-600',
    bg   : 'bg-violet-50 border-violet-200',
  },
  {
    num  : '03',
    title: 'Ocupações',
    desc : 'Jornada = Prod/Total × 100 · Veículo = Peso/Cap × 100',
    color: 'text-amber-600',
    bg   : 'bg-amber-50 border-amber-200',
  },
  {
    num  : '04',
    title: 'Incentivo',
    desc : 'Por Região/Dia · R$ 16,00 × % indicador',
    color: 'text-emerald-600',
    bg   : 'bg-emerald-50 border-emerald-200',
  },
]

// ── Componente principal ──────────────────────────────────────────────────────

export function RoadshowPipelineView() {
  const [year,  setYear]  = React.useState(2026)
  const [month, setMonth] = React.useState(1)

  const [fileConsolidado, setFileConsolidado] = React.useState<File | null>(null)
  const [filePedidos,     setFilePedidos]     = React.useState<File | null>(null)
  const [fileVeiculos,    setFileVeiculos]    = React.useState<File | null>(null)

  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress,    setProgress]    = React.useState(0)
  const [logs,        setLogs]        = React.useState<string[]>([])
  const [lastResult,  setLastResult]  = React.useState<PipelineResult | null>(null)

  const { toast } = useToast()

  // ── Logs ─────────────────────────────────────────────────────────────────
  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts     = new Date().toLocaleTimeString('pt-BR')
    const prefix = type === 'error'   ? '❌ [ERRO] '
                 : type === 'success' ? '✅ [OK] '
                 : type === 'warn'    ? '⚠️ [AVISO] '
                 : ''
    setLogs(prev => [...prev, `[${ts}] ${prefix}${msg}`])
  }

  // ── Upload helper ─────────────────────────────────────────────────────────
  const fileRow = (
    id      : string,
    label   : string,
    hint    : string,
    file    : File | null,
    setFile : (f: File | null) => void,
    required: boolean = true,
    icon    : React.ReactNode = <FileSpreadsheet className="size-3.5" />
  ) => (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold truncate">{label}</span>
          {required
            ? <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">obrigatório</Badge>
            : <Badge variant="secondary"   className="text-[9px] px-1 py-0 h-3.5">opcional</Badge>
          }
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
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
          onClick={() => document.getElementById(id)?.click()}>
          {file ? 'Trocar' : 'Selecionar'}
        </Button>
      </div>
      <input id={id} type="file" className="hidden" accept=".xlsx,.xls"
        onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = '' }} />
    </div>
  )

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const canRun = !!fileConsolidado

  const runPipeline = async () => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(5)
    setLogs([])

    addLog(`Iniciando Pipeline Roadshow — ${String(month).padStart(2,'0')}/${year}`)
    addLog('Módulo 01 — Preparando Consolidado_Entregas...')

    try {
      const formData = new FormData()
      formData.append('year',  year.toString())
      formData.append('month', month.toString())
      formData.append('fileConsolidado', fileConsolidado!)
      if (filePedidos)  formData.append('filePedidos',  filePedidos)
      if (fileVeiculos) formData.append('fileVeiculos', fileVeiculos)

      setProgress(20)
      addLog(`Módulo 02 — Calculando tempo produtivo por placa/dia...`)
      setProgress(40)
      addLog('Módulo 03 — Calculando Ocupação de Jornada e Veículo...')
      setProgress(60)
      addLog('Módulo 04 — Aplicando regra de incentivo por região...')
      setProgress(80)
      addLog('Módulo 05/06 — Gerando resumos mensal e aritmético...')
      setProgress(92)

      const response = await executeRoadshowPipeline(formData, 'roadshow')
      if (!response.success) throw new Error(response.error)

      setLastResult(response.result)
      setProgress(100)

      const cfg = response.result.config ?? {}
      addLog(`Rotas processadas: ${cfg.rotasProcessadas ?? '?'}`, 'info')
      addLog(`Com tempo produtivo: ${cfg.comTempoProdutivo ?? '?'}`, 'info')
      addLog(`Com ocupação jornada: ${cfg.comOcupJornada ?? '?'}`, 'info')
      addLog(`Total incentivo: R$ ${(cfg.totalIncentivo ?? 0).toFixed(2)}`, 'success')
      addLog(`Firebase ID: ${response.result.id}`, 'success')

      toast({
        title      : 'Roadshow — Processado com sucesso',
        description: response.result.summary,
      })
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error')
      setProgress(0)
      toast({ variant: 'destructive', title: 'Erro no Pipeline Roadshow', description: error.message })
    } finally {
      setIsExecuting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">

      {/* Header */}
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-primary" />
          <AlertTitle className="mb-0">Pipeline Roadshow — Ocupação de Jornada e Veículo</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Jornada ≤ 100% → incentivo = 100% | Jornada &gt; 100% → usa % Veículo.
                  Incentivo diário = indicador × R$ {(400/25).toFixed(2)} (R$ 400,00 / 25 dias).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Consolidado_Entregas · Tempo Produtivo · Ocupação Jornada/Veículo · Incentivo por Região · Resumo Aritmético.
        </AlertDescription>
      </Alert>

      {/* Módulos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {MODULE_INFO.map(m => (
          <div key={m.num} className={`rounded-lg border p-3 ${m.bg}`}>
            <span className={`text-[10px] font-black tracking-widest ${m.color}`}>MOD {m.num}</span>
            <p className={`text-xs font-bold ${m.color} leading-tight mt-1 mb-1`}>{m.title}</p>
            <p className="text-[10px] text-muted-foreground leading-snug">{m.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Configuração</CardTitle>
              <CardDescription className="text-xs">
                Período de referência e arquivos de entrada
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">

              {/* Período */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ano</Label>
                  <Input type="number" value={year} className="h-9"
                    onChange={e => setYear(parseInt(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mês</Label>
                  <Input type="number" min={1} max={12} value={month} className="h-9"
                    onChange={e => setMonth(parseInt(e.target.value))} />
                </div>
              </div>

              <AIParamAssistant
                onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }}
                currentMonth={month}
                currentYear={year}
              />

              <Separator />

              {/* Arquivo principal */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-blue-100 flex items-center justify-center">
                    <Truck className="size-3 text-blue-600" />
                  </div>
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                    Fonte Principal (vFleet)
                  </span>
                </div>
                <div className="pl-7">
                  {fileRow(
                    'rs-consolidado',
                    'Consolidado_Entregas_V2_Geral.xlsx',
                    'Consulta_Roterizador / Consolidado_Entregas_V2_Geral.xlsx',
                    fileConsolidado, setFileConsolidado, true,
                    <Truck className="size-3.5" />
                  )}
                </div>
              </div>

              <Separator />

              {/* Arquivos complementares */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-violet-100 flex items-center justify-center">
                    <Clock className="size-3 text-violet-600" />
                  </div>
                  <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">
                    Arquivos Complementares
                  </span>
                </div>
                <div className="space-y-1.5 pl-7">
                  {fileRow(
                    'rs-pedidos',
                    'RelatorioAnaliticoRotaPedidos.xlsx',
                    'Consulta_Performaxxi / RelatorioAnaliticoRotaPedidos.xlsx',
                    filePedidos, setFilePedidos, false,
                    <Clock className="size-3.5 text-violet-400" />
                  )}
                  {fileRow(
                    'rs-veiculos',
                    'Veiculos.xlsx',
                    'Consulta_Veiculos / Veiculos.xlsx (fallback de capacidade)',
                    fileVeiculos, setFileVeiculos, false,
                    <Package className="size-3.5 text-amber-400" />
                  )}
                </div>
              </div>

              {/* Regra de incentivo */}
              <Alert className="bg-muted/30 border-muted py-2.5 px-3">
                <AlertDescription className="text-[10px] text-muted-foreground">
                  <div className="font-semibold text-foreground mb-1.5">Regra de Incentivo por Região/Dia</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    <span>
                      <span className="text-green-600 font-bold">Jornada ≤ 100%</span>
                      {' '}→ indicador = 100%
                    </span>
                    <span>
                      <span className="text-amber-600 font-bold">Jornada &gt; 100%</span>
                      {' '}→ indicador = % Veículo
                    </span>
                    <span>💰 Valor diário = indicador × R$ {(400/25).toFixed(2)}</span>
                    <span>📦 Meta veículo mín. = 85%</span>
                    <span>🗓️ R$ 400,00 / 25 dias</span>
                    <span>🚫 Domingos não removidos</span>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Progress */}
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
                  : <><Play className="mr-2 fill-current" />Iniciar Pipeline Roadshow</>
                }
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Console */}
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
                  Aguardando Consolidado_Entregas_V2_Geral...
                </p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className={
                      log.includes('[ERRO]')  ? 'text-destructive' :
                      log.includes('[OK]')    ? 'text-green-600'   :
                      log.includes('[AVISO]') ? 'text-amber-600'   :
                      'text-slate-500'
                    }>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Status arquivos */}
            <div className="p-3 border-t bg-muted/10 space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Status dos Arquivos
              </p>
              {[
                { label: 'Consolidado_Entregas',    file: fileConsolidado, req: true  },
                { label: 'RelatorioAnalitico',       file: filePedidos,    req: false },
                { label: 'Veiculos (capacidade)',    file: fileVeiculos,   req: false },
              ].map(({ label, file, req }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full shrink-0 ${file ? 'bg-green-500' : req ? 'bg-red-400' : 'bg-slate-300'}`} />
                  <span className={`text-[10px] truncate ${file ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                  {req && !file && (
                    <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 ml-auto shrink-0">req.</Badge>
                  )}
                </div>
              ))}

              {/* Mini config */}
              <div className="pt-2 border-t space-y-0.5">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Config</p>
                <div className="text-[10px] text-muted-foreground grid grid-cols-2 gap-x-2">
                  <span>Jornada max: <span className="font-medium text-foreground">100%</span></span>
                  <span>Veículo min: <span className="font-medium text-foreground">85%</span></span>
                  <span>Meta mensal: <span className="font-medium text-foreground">R$ 400,00</span></span>
                  <span>Valor/dia: <span className="font-medium text-primary">R$ {(400/25).toFixed(2)}</span></span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Resultado */}
      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}