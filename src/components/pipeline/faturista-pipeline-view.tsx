"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  Package,
  Truck,
  HelpCircle,
  FileSpreadsheet,
  BadgePercent,
  Clock,
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
import { executeFaturistaPipeline } from "@/app/actions/faturista-pipeline"
import { useToast }   from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"

// ── Regras visuais ────────────────────────────────────────────────────────────

const REGRAS = [
  {
    tipo : 'CINTAS',
    icon : <Package className="size-3.5" />,
    color: 'text-violet-600',
    bg   : 'bg-violet-50 border-violet-200',
    faixas: [
      { label: '≤ 22h00',        perc: '100%', color: 'text-green-600'  },
      { label: '22h00 – 23h00',  perc: '85%',  color: 'text-yellow-600' },
      { label: '23h00 – 00h00',  perc: '75%',  color: 'text-orange-500' },
      { label: 'Após 00h00',     perc: '0%',   color: 'text-red-600'    },
    ],
  },
  {
    tipo : 'LIBERAÇÃO',
    icon : <Truck className="size-3.5" />,
    color: 'text-blue-600',
    bg   : 'bg-blue-50 border-blue-200',
    faixas: [
      { label: '≤ 20h30',        perc: '100%', color: 'text-green-600'  },
      { label: '20h30 – 21h00',  perc: '85%',  color: 'text-yellow-600' },
      { label: '21h00 – 22h00',  perc: '75%',  color: 'text-orange-500' },
      { label: 'Após 22h00',     perc: '0%',   color: 'text-red-600'    },
    ],
  },
]

// ── Componente principal ──────────────────────────────────────────────────────

export function FaturistaPipelineView() {
  const [year,  setYear]  = React.useState(2026)
  const [month, setMonth] = React.useState(1)

  const [fileTempos,   setFileTempos]   = React.useState<File | null>(null)
  const [metaCintas,   setMetaCintas]   = React.useState<number>(200)
  const [metaLib,      setMetaLib]      = React.useState<number>(200)

  const [isExecuting,  setIsExecuting]  = React.useState(false)
  const [progress,     setProgress]     = React.useState(0)
  const [logs,         setLogs]         = React.useState<string[]>([])
  const [lastResult,   setLastResult]   = React.useState<PipelineResult | null>(null)

  const { toast } = useToast()

  const metaTotal = metaCintas + metaLib

  // ── Logs ─────────────────────────────────────────────────────────────────
  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts     = new Date().toLocaleTimeString('pt-BR')
    const prefix = type === 'error'   ? '❌ [ERRO] '
                 : type === 'success' ? '✅ [OK] '
                 : type === 'warn'    ? '⚠️ [AVISO] '
                 : ''
    setLogs(prev => [...prev, `[${ts}] ${prefix}${msg}`])
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const canRun = !!fileTempos

  const runPipeline = async () => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(5)
    setLogs([])

    addLog(`Iniciando Pipeline Faturista — ${String(month).padStart(2,'0')}/${year}`)
    addLog(`Metas: Cintas R$ ${metaCintas.toFixed(2)} | Lib R$ ${metaLib.toFixed(2)} | Total R$ ${metaTotal.toFixed(2)}`)

    try {
      const formData = new FormData()
      formData.append('year',       year.toString())
      formData.append('month',      month.toString())
      formData.append('fileTempos', fileTempos!)
      formData.append('metaCintas', metaCintas.toString())
      formData.append('metaLib',    metaLib.toString())

      setProgress(15)
      addLog('Etapa 1/2 — Carregando Tempos e Movimentos...')
      setProgress(30)
      addLog('Etapa 1/2 — Ajustando horários com virada de dia...')
      setProgress(50)
      addLog('Etapa 1/2 — Aplicando regras de Cintas e Liberação...')
      setProgress(70)
      addLog('Etapa 2/2 — Consolidando por dia/empresa...')
      setProgress(85)
      addLog('Etapa 2/2 — Gerando resumo mensal...')
      setProgress(95)

      const response = await executeFaturistaPipeline(formData, 'faturista')
      if (!response.success) throw new Error(response.error)

      setLastResult(response.result)
      setProgress(100)

      const cfg = response.result.config ?? {}
      addLog(`Dias úteis: ${cfg.diasUteis ?? '?'}`, 'info')
      addLog(`Total Cintas  : R$ ${(cfg.totalCintas  ?? 0).toFixed(2)}`, 'success')
      addLog(`Total Liberação: R$ ${(cfg.totalLib    ?? 0).toFixed(2)}`, 'success')
      addLog(`Total Geral   : R$ ${(cfg.totalGeral   ?? 0).toFixed(2)}`, 'success')
      addLog(`Firebase ID: ${response.result.id}`, 'success')

      toast({
        title      : 'Faturista — Processado com sucesso',
        description: response.result.summary,
      })
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error')
      setProgress(0)
      toast({ variant: 'destructive', title: 'Erro no Pipeline Faturista', description: error.message })
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
          <BadgePercent className="size-4 text-primary" />
          <AlertTitle className="mb-0">Pipeline Faturista — Cintas + Liberação</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Processa Tempos e Movimentos em 2 etapas: (1) aplica regras de horário
                  por processo com ajuste de virada de dia, (2) consolida por dia/empresa
                  e gera resumo mensal.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Entrega de Cintas · Liberação para Roteirização · Consolidação Diária · Resumo Mensal por Empresa.
        </AlertDescription>
      </Alert>

      {/* Regras de horário */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REGRAS.map(r => (
          <div key={r.tipo} className={`rounded-lg border p-3 ${r.bg}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={r.color}>{r.icon}</span>
              <span className={`text-xs font-bold uppercase tracking-wide ${r.color}`}>{r.tipo}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {r.faixas.map(f => (
                <div key={f.label} className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className={`font-bold ${f.color}`}>{f.perc}</span>
                </div>
              ))}
            </div>
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
                Período, metas mensais e arquivo de entrada
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

              {/* Metas mensais */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-emerald-100 flex items-center justify-center">
                    <BadgePercent className="size-3 text-emerald-600" />
                  </div>
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                    Metas Mensais
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 pl-7">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] flex items-center gap-1">
                      <Package className="size-3 text-violet-500" /> Cintas (R$)
                    </Label>
                    <Input
                      type="number" step="0.01" value={metaCintas} className="h-8 text-xs"
                      onChange={e => setMetaCintas(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] flex items-center gap-1">
                      <Truck className="size-3 text-blue-500" /> Liberação (R$)
                    </Label>
                    <Input
                      type="number" step="0.01" value={metaLib} className="h-8 text-xs"
                      onChange={e => setMetaLib(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Total Mensal</Label>
                    <div className="h-8 flex items-center px-3 rounded-md bg-muted/40 border text-xs font-bold text-primary">
                      R$ {metaTotal.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Arquivo */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-slate-100 flex items-center justify-center">
                    <Clock className="size-3 text-slate-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Arquivo de Entrada
                  </span>
                </div>
                <div className="pl-7">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
                    <FileSpreadsheet className="size-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold truncate">
                          Tempos e Movimentos - PR, MS.xlsx
                        </span>
                        <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">
                          obrigatório
                        </Badge>
                      </div>
                      {fileTempos
                        ? <span className="text-[11px] text-primary font-medium truncate block">{fileTempos.name}</span>
                        : <span className="text-[11px] text-muted-foreground italic truncate block">
                            Consulta_Faturamento / Tempos e Movimentos *.xlsx
                          </span>
                      }
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {fileTempos && (
                        <Button variant="ghost" size="icon" className="size-6"
                          onClick={() => setFileTempos(null)}>
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                        onClick={() => document.getElementById('fat-upload')?.click()}>
                        {fileTempos ? 'Trocar' : 'Selecionar'}
                      </Button>
                    </div>
                    <input
                      id="fat-upload" type="file" className="hidden" accept=".xlsx,.xls"
                      onChange={e => {
                        if (e.target.files?.[0]) setFileTempos(e.target.files[0])
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Info empresas */}
              <Alert className="bg-muted/30 border-muted py-2.5 px-3">
                <AlertDescription className="text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Empresas filtradas:</span>
                  {' '}RK01, BV01 · Processos: CINTAS e LIBERAÇÃO · Ajuste automático de virada de dia.
                </AlertDescription>
              </Alert>

              {/* Progress */}
              {isExecuting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-primary uppercase">
                    <span>Processando Etapas</span>
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
                  ? <><Loader2 className="mr-2 animate-spin" />Processando Etapas...</>
                  : <><Play className="mr-2 fill-current" />Iniciar Pipeline Faturista</>
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
                  Aguardando arquivo Tempos e Movimentos...
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

            {/* Status */}
            <div className="p-3 border-t bg-muted/10 space-y-2">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                Status
              </p>
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full shrink-0 ${fileTempos ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className={`text-[10px] truncate ${fileTempos ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                  Tempos e Movimentos
                </span>
                {!fileTempos && (
                  <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 ml-auto shrink-0">
                    req.
                  </Badge>
                )}
              </div>

              {/* Mini preview de metas */}
              <div className="pt-1 border-t space-y-0.5">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                  Metas Configuradas
                </p>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1">
                      <Package className="size-2.5 text-violet-400" /> Cintas
                    </span>
                    <span className="font-medium text-foreground">R$ {metaCintas.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1">
                      <Truck className="size-2.5 text-blue-400" /> Liberação
                    </span>
                    <span className="font-medium text-foreground">R$ {metaLib.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-0.5">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-bold text-primary">R$ {metaTotal.toFixed(2)}</span>
                  </div>
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