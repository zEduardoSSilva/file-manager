"use client"

import * as React from "react"
import {
  Play,
  Trash2,
  FileCode,
  Loader2,
  FileText,
  FileSpreadsheet,
  HelpCircle,
  Plus,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react"
import { Button }     from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress }   from "@/components/ui/progress"
import { Badge }      from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator }  from "@/components/ui/separator"
import { DataViewer } from "./data-viewer"
import { executeRetornoPedidosPipeline } from "@/app/actions/retorno-pedidos-pipeline"
import { useToast }   from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"

// ── Componente principal ──────────────────────────────────────────────────────

export function RetornoPedidosPipelineView() {
  const [filesTxt,  setFilesTxt]  = React.useState<File[]>([])
  const [fileExcel, setFileExcel] = React.useState<File | null>(null)

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

  // ── Upload TXTs múltiplos ─────────────────────────────────────────────────
  const handleTxtChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    if (selected.length === 0) return
    setFilesTxt(prev => {
      const existingNames = new Set(prev.map(f => f.name))
      const novos = selected.filter(f => !existingNames.has(f.name))
      return [...prev, ...novos]
    })
    e.target.value = ''
  }

  const removeTxt = (name: string) =>
    setFilesTxt(prev => prev.filter(f => f.name !== name))

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const canRun = filesTxt.length > 0 && !!fileExcel

  const runPipeline = async () => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(5)
    setLogs([])

    addLog(`Iniciando análise — ${filesTxt.length} arquivo(s) TXT + Excel`)

    try {
      const formData = new FormData()
      filesTxt.forEach(f  => formData.append('filesTxt',  f))
      formData.append('fileExcel', fileExcel!)

      setProgress(20)
      addLog('Etapa 1/3 — Extraindo pedidos dos arquivos TXT...')
      setProgress(50)
      addLog('Etapa 2/3 — Carregando e padronizando Excel (STATUS_PEDIDOS_MERCANETE)...')
      setProgress(75)
      addLog('Etapa 3/3 — Comparando chaves primárias (Código_Cliente + Número_Pedido)...')
      setProgress(90)

      const response = await executeRetornoPedidosPipeline(formData)
      if (!response.success) throw new Error(response.error)

      setLastResult(response.result)
      setProgress(100)

      const rg = response.result.resumoGeral ?? {}
      addLog(`Total extraído: ${rg.totalPedidos ?? 0} pedidos`, 'info')
      addLog(`Encontrados: ${rg.encontrados ?? 0} (${rg.percEncontrados ?? 0}%)`, 'success')
      addLog(`Não encontrados: ${rg.naoEncontrados ?? 0} (${rg.percNaoEncontrados ?? 0}%)`,
        (rg.naoEncontrados ?? 0) > 0 ? 'warn' : 'success')
      addLog(`Arquivos: ${rg.arquivosProcessados ?? 0} | Clientes únicos: ${rg.clientesUnicos ?? 0}`, 'info')
      addLog(`Firebase ID: ${response.result.id}`, 'success')

      toast({
        title      : 'Retorno de Pedidos — Concluído',
        description: response.result.summary || "Análise concluída.",
      })
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error')
      setProgress(0)
      toast({ variant: 'destructive', title: 'Erro no Pipeline', description: error.message })
    } finally {
      setIsExecuting(false)
    }
  }

  // ── Mini resumo de resultado ──────────────────────────────────────────────
  const rg = lastResult?.resumoGeral as any
  const showStats = rg && !isExecuting

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">

      {/* Header */}
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
                <p>
                  Extrai pedidos dos arquivos <strong>.txt</strong> usando regex
                  e compara com o <strong>STATUS_PEDIDOS_MERCANETE.xlsx</strong>
                  pela chave <code>Codigo_Cliente_NumeroPedido</code>.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Padrão reconhecido: <code className="bg-muted px-1 rounded text-[10px]">9 dígitos + 3 dígitos + BV/RK/KP + 2 dígitos + 6 dígitos</code>
          {' '}· Chave: <code className="bg-muted px-1 rounded text-[10px]">Codigo_Cliente_NumeroPedido</code>
          {' '}· Suporte a múltiplos encodings (UTF-8, Latin-1, CP1252)
        </AlertDescription>
      </Alert>

      {/* Stats de resultado (se houver) */}
      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',           value: rg.totalPedidos,        color: 'text-foreground',  icon: null },
            { label: 'Encontrados',     value: `${rg.encontrados} (${rg.percEncontrados}%)`,    color: 'text-green-600',  icon: <CheckCircle2 className="size-3" /> },
            { label: 'Não encontrados', value: `${rg.naoEncontrados} (${rg.percNaoEncontrados}%)`, color: 'text-red-500',   icon: <XCircle className="size-3" /> },
            { label: 'Clientes únicos', value: rg.clientesUnicos,      color: 'text-blue-600',   icon: null },
          ].map(s => (
            <div key={s.label} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className={`text-xs font-medium flex items-center gap-1 ${s.color}`}>
                {s.icon}{s.label}
              </div>
              <div className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Arquivos de Entrada</CardTitle>
              <CardDescription className="text-xs">
                Selecione um ou mais TXTs de relatório e o Excel de referência
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">

              {/* Arquivos TXT */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-slate-100 flex items-center justify-center">
                    <FileText className="size-3 text-slate-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Arquivos TXT (relatórios)
                  </span>
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 ml-auto">
                    obrigatório
                  </Badge>
                </div>

                <div className="pl-7 space-y-1.5">
                  {/* Botão adicionar */}
                  <button
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed bg-white hover:bg-muted/10 transition-colors text-left"
                    onClick={() => document.getElementById('rp-txt-upload')?.click()}
                  >
                    <Plus className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-muted-foreground italic">
                      {filesTxt.length === 0
                        ? 'Adicionar arquivo(s) .txt...'
                        : `Adicionar mais arquivos (${filesTxt.length} selecionado${filesTxt.length > 1 ? 's' : ''})`
                      }
                    </span>
                    <input
                      id="rp-txt-upload" type="file" className="hidden" accept=".txt" multiple
                      onChange={handleTxtChange}
                    />
                  </button>

                  {/* Lista de arquivos */}
                  {filesTxt.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {filesTxt.map(f => (
                        <div key={f.name}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/20 border">
                          <FileText className="size-3 text-slate-400 shrink-0" />
                          <span className="text-[11px] flex-1 truncate font-medium text-slate-700">
                            {f.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {(f.size / 1024).toFixed(1)} KB
                          </span>
                          <Button variant="ghost" size="icon" className="size-5 shrink-0"
                            onClick={() => removeTxt(f.name)}>
                            <Trash2 className="size-2.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Excel */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-emerald-100 flex items-center justify-center">
                    <FileSpreadsheet className="size-3 text-emerald-600" />
                  </div>
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                    Base de Referência (Excel)
                  </span>
                  <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5 ml-auto">
                    obrigatório
                  </Badge>
                </div>

                <div className="pl-7">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
                    <FileSpreadsheet className="size-3.5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold mb-0.5">
                        STATUS_PEDIDOS_MERCANETE.xlsx
                      </div>
                      {fileExcel
                        ? <span className="text-[11px] text-primary font-medium truncate block">{fileExcel.name}</span>
                        : <span className="text-[11px] text-muted-foreground italic">
                            REL. MERCANETE / STATUS_PEDIDOS_MERCANETE.xlsx
                          </span>
                      }
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {fileExcel && (
                        <Button variant="ghost" size="icon" className="size-6"
                          onClick={() => setFileExcel(null)}>
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                        onClick={() => document.getElementById('rp-excel-upload')?.click()}>
                        {fileExcel ? 'Trocar' : 'Selecionar'}
                      </Button>
                    </div>
                    <input
                      id="rp-excel-upload" type="file" className="hidden" accept=".xlsx,.xls"
                      onChange={e => { if (e.target.files?.[0]) setFileExcel(e.target.files[0]); e.target.value = '' }}
                    />
                  </div>
                </div>
              </div>

              {/* Info técnica */}
              <Alert className="bg-muted/30 border-muted py-2.5 px-3">
                <AlertDescription className="text-[10px] text-muted-foreground space-y-1">
                  <div className="font-semibold text-foreground">Lógica de padronização</div>
                  <div className="grid grid-cols-2 gap-x-4">
                    <span>Pedido → 6 dígitos (<code>zfill(6)</code>)</span>
                    <span>Cliente → 9 dígitos (<code>zfill(9)</code>)</span>
                    <span>Chave: <code>Cliente_Pedido</code></span>
                    <span>Busca O(1) via Set</span>
                  </div>
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
                  ? <><Loader2 className="mr-2 animate-spin" />Processando...</>
                  : <><Play className="mr-2 fill-current" />Iniciar Análise de Pedidos</>
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
                  Aguardando TXT(s) e Excel...
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
            <div className="p-3 border-t bg-muted/10 space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Status
              </p>

              {/* TXTs */}
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full shrink-0 ${filesTxt.length > 0 ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className={`text-[10px] truncate ${filesTxt.length > 0 ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                  Arquivos TXT
                  {filesTxt.length > 0 && ` (${filesTxt.length})`}
                </span>
                {filesTxt.length === 0 && (
                  <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 ml-auto shrink-0">req.</Badge>
                )}
              </div>

              {/* Excel */}
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full shrink-0 ${fileExcel ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className={`text-[10px] truncate ${fileExcel ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                  STATUS_PEDIDOS_MERCANETE
                </span>
                {!fileExcel && (
                  <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 ml-auto shrink-0">req.</Badge>
                )}
              </div>

              {/* Padrão regex */}
              <div className="pt-2 border-t">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Padrão Extraído
                </p>
                <code className="text-[9px] text-muted-foreground leading-relaxed block">
                  (\d{"{9}"})(\d{"{3}"})(BV|RK|KP)(\d{"{2}"})(\d{"{6}"})
                </code>
                <p className="text-[9px] text-muted-foreground mt-1">
                  Ex: <span className="font-mono">402976780<span className="text-blue-500">001</span><span className="text-violet-500">BV01</span><span className="text-green-600">135931</span></span>
                </p>
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
