"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  BarChart3,
  FileSpreadsheet,
  HelpCircle,
  TrendingUp,
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
import { AIParamAssistant } from "./ai-param-assistant"
import { DataViewer }   from "./data-viewer"
import { executeCcoPipeline } from "@/app/actions/cco-pipeline"
import { useToast }     from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"

// ── Componente principal ──────────────────────────────────────────────────────

export function CcoPipelineView() {
  const [year,  setYear]  = React.useState(2026)
  const [month, setMonth] = React.useState(1)

  const [fileMotoristas, setFileMotoristas] = React.useState<File | null>(null)
  const [fileAjudantes,  setFileAjudantes]  = React.useState<File | null>(null)

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
  const singleFileRow = (
    id     : string,
    label  : string,
    file   : File | null,
    setFile: (f: File | null) => void,
    hint   : string
  ) => (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
      <FileSpreadsheet className="size-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold truncate">{label}</span>
          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">obrigatório</Badge>
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
        <Button
          variant="outline" size="sm" className="h-6 text-[10px] px-2"
          onClick={() => document.getElementById(id)?.click()}
        >
          {file ? 'Trocar' : 'Selecionar'}
        </Button>
      </div>
      <input
        id={id} type="file" className="hidden" accept=".xlsx,.xls"
        onChange={e => {
          if (e.target.files?.[0]) setFile(e.target.files[0])
          e.target.value = ''
        }}
      />
    </div>
  )

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const canRun = !!(fileMotoristas && fileAjudantes)

  const runPipeline = async () => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(10)
    setLogs([])

    addLog(`Iniciando Consolidador CCO — ${String(month).padStart(2,'0')}/${year}`)
    addLog('Carregando Motoristas_Ajustado e Ajudantes_Ajustado...')

    try {
      const formData = new FormData()
      formData.append('year',           year.toString())
      formData.append('month',          month.toString())
      formData.append('fileMotoristas', fileMotoristas!)
      formData.append('fileAjudantes',  fileAjudantes!)

      setProgress(35)
      addLog('Calculando médias diárias por empresa...')
      setProgress(60)
      addLog('Removendo domingos e gerando bonificações...')
      setProgress(80)
      addLog('Consolidando resumos mensal e simples...')
      setProgress(90)

      const response = await executeCcoPipeline(formData, 'cco')

      if (!response.success) throw new Error(response.error)

      setLastResult(response.result)
      setProgress(100)

      const { data, resumoMensal, summary } = response.result
      addLog(`Análise concluída: ${data?.length ?? 0} dias processados.`, 'success')
      addLog(`${resumoMensal?.length ?? 0} empresas no resumo mensal.`, 'success')
      addLog(`Firebase ID: ${response.result.id}`, 'success')

      toast({
        title      : 'CCO — Processado com sucesso',
        description: summary || `${data?.length ?? 0} registros consolidados.`,
      })
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error')
      setProgress(0)
      toast({ variant: 'destructive', title: 'Erro no Pipeline CCO', description: error.message })
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
          <BarChart3 className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidador CCO — Análise por Empresa</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  Lógica idêntica ao Pipeline Coordenadores. Única diferença:
                  bonificação de R$ 16,00/dia (vs R$ 48,00). Domingos são
                  removidos automaticamente.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Médias diárias de Motoristas + Ajudantes por Empresa · Bonificação R$ 16,00/dia · Domingos removidos.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Configuração</CardTitle>
              <CardDescription className="text-xs">
                Período de referência e arquivos de entrada (Motoristas + Ajudantes Ajustados)
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">

              {/* Período */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ano</Label>
                  <Input
                    type="number" value={year} className="h-9"
                    onChange={e => setYear(parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mês</Label>
                  <Input
                    type="number" min={1} max={12} value={month} className="h-9"
                    onChange={e => setMonth(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <AIParamAssistant
                onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }}
                currentMonth={month}
                currentYear={year}
              />

              {/* Arquivos */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="size-3 text-blue-600" />
                  </div>
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                    Relatórios Ajustados
                  </span>
                </div>
                <div className="space-y-1.5 pl-7">
                  {singleFileRow(
                    'cco-upload-motoristas',
                    'Motoristas_Ajustado.xlsx',
                    fileMotoristas,
                    setFileMotoristas,
                    'relatorio_consolidado_Motoristas_Ajustado.xlsx'
                  )}
                  {singleFileRow(
                    'cco-upload-ajudantes',
                    'Ajudantes_Ajustado.xlsx',
                    fileAjudantes,
                    setFileAjudantes,
                    'relatorio_consolidado_Ajudantes_Ajustado.xlsx'
                  )}
                </div>
              </div>

              {/* Regras */}
              <Alert className="bg-muted/30 border-muted py-2.5 px-3">
                <AlertDescription className="text-[10px] text-muted-foreground space-y-0.5">
                  <div className="font-semibold text-foreground mb-1">Regras CCO</div>
                  <div className="grid grid-cols-2 gap-x-4">
                    <span>💰 Bonificação  → R$ 16,00/dia</span>
                    <span>🚫 Domingos     → removidos</span>
                    <span>📊 Lógica       → idêntica ao Coordenador</span>
                    <span>🏢 Saída        → por Empresa/Dia</span>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Progress */}
              {isExecuting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-primary uppercase">
                    <span>Processando</span>
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
                  ? <><Loader2 className="mr-2 animate-spin" />Processando...</>
                  : <><Play className="mr-2 fill-current" />Iniciar Consolidador CCO</>
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
                  Aguardando arquivos obrigatórios (Motoristas + Ajudantes)...
                </p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.includes('[ERRO]')  ? 'text-destructive' :
                        log.includes('[OK]')    ? 'text-green-600'   :
                        log.includes('[AVISO]') ? 'text-amber-600'   :
                        'text-slate-500'
                      }
                    >
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
                { label: 'Motoristas_Ajustado', file: fileMotoristas },
                { label: 'Ajudantes_Ajustado',  file: fileAjudantes  },
              ].map(({ label, file }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full shrink-0 ${file ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span className={`text-[10px] truncate ${file ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                  {!file && (
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