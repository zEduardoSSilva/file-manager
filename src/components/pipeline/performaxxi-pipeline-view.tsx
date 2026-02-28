"use client"

import * as React from "react"
import { 
  Upload, 
  Play, 
  Trash2,
  FileCode,
  Files,
  Loader2,
  Zap,
  Download,
  Info,
  HelpCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "./ai-param-assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executePipeline } from "@/app/actions/pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "./data-viewer"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function PerformaxxiPipelineView() {
  const [year, setYear] = React.useState(2026)
  const [month, setMonth] = React.useState(1)
  const [files, setFiles] = React.useState<File[]>([])
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [logs, setLogs] = React.useState<string[]>([])
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null)
  const { toast } = useToast()

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    let prefix = ""
    if (type === 'error') prefix = "❌ [ERRO] "
    if (type === 'success') prefix = "✅ [OK] "
    if (type === 'warn') prefix = "⚠️ [AVISO] "
    setLogs(prev => [...prev, `[${timestamp}] ${prefix}${msg}`])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setFiles(prev => [...prev, ...newFiles])
    }
  }

  const runPipeline = async (downloadOnly = false) => {
    if (files.length === 0) return;
    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog(`Iniciando Pipeline Performaxxi Unificado...`)

    try {
      addLog("Identificando arquivos anexados...", "info")
      addLog(`Arquivos: ${files.map(f => f.name).join(', ')}`, "info")
      addLog(`Período: ${String(month).padStart(2,'0')}/${year}`, "info")

      addLog("Análise em lote de 4 critérios simultâneos.", "info")
      addLog("Processando Motoristas (R$ 8,00) e Ajudantes (R$ 7,20)...", "info")

      setProgress(30)
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      addLog("Enviando dados ao servidor...", "info")

      let response: any
      try {
        response = await executePipeline(formData, 'performaxxi')
      } catch (networkErr: any) {
        const detail = networkErr?.message || String(networkErr)
        addLog(`Erro de comunicação com servidor: ${detail}`, "error")
        if (networkErr?.cause) addLog(`Causa: ${String(networkErr.cause)}`, "error")
        throw networkErr
      }

      addLog(`Resposta recebida. Status: ${response?.success ? 'SUCESSO' : 'FALHA'}`, response?.success ? 'info' : 'warn')

      if (!response?.success) {
        const errMsg    = response?.error  || '(sem mensagem)'
        const errStack  = response?.stack  || ''
        const errCode   = response?.code   || ''
        const errDetail = response?.detail || ''

        addLog(`Erro retornado pelo servidor:`, "error")
        addLog(`→ Mensagem : ${errMsg}`, "error")
        if (errCode)   addLog(`→ Código   : ${errCode}`, "error")
        if (errDetail) addLog(`→ Detalhe  : ${errDetail}`, "error")
        if (errStack)  addLog(`→ Stack    : ${errStack.split('\n')[0]}`, "error")

        throw new Error(errMsg)
      }

      const result = response.result;
      setLastResult(result)
      setProgress(100)

      const resultKeys = Object.keys(result || {})
      addLog(`Campos retornados: ${resultKeys.join(', ')}`, "info")

      if (downloadOnly) {
        addLog("Gerando Excel Unificado com colunas ordenadas...", "success")
        downloadMultipleSheets([
          { data: result.detalheGeral || [], name: '01_Detalhe_Unificado' },
          { data: result.data || [], name: '02_Consolidado_Unificado' }
        ], `Performaxxi_Final_${month}_${year}`)

        if (!result.detalheGeral || result.detalheGeral.length === 0)
          addLog("⚠️ Aba '01_Detalhe_Unificado' veio vazia — verifique se o campo 'detalheGeral' é retornado pelo backend.", "warn")
      } else {
        addLog("Sincronização com o Firebase concluída com sucesso.", "success")
      }

      toast({
        title: downloadOnly ? "Arquivo Pronto" : "Concluído",
        description: downloadOnly ? "Excel baixado com sucesso." : "Resultados salvos no banco."
      });

    } catch (error: any) {
      const msg = error?.message || String(error)
      addLog(`FALHA GERAL: ${msg}`, "error")

      if (msg.toLowerCase().includes('unexpected response') || msg.toLowerCase().includes('fetch')) {
        addLog("Dica: O servidor pode ter retornado HTML de erro (500/404) em vez de JSON.", "warn")
        addLog("Verifique os logs do servidor (terminal / Vercel / Firebase Functions).", "warn")
      }

      setProgress(0)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <Alert className="bg-accent/5 border-accent/20">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-accent" />
          <AlertTitle className="mb-0">Pipeline Performaxxi Único (Unificado)</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Análise consolidada de Motoristas e Ajudantes em uma única base de funcionários.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Motoristas (R$ 8,00) e Ajudantes (R$ 7,20). Base de dados integrada e sincronizada.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Configuração Performaxxi</CardTitle>
              <CardDescription>Upload unificado de funcionários</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y); }} currentMonth={month} currentYear={year} />

              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="font-semibold">Relatório de Pedidos ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar Lote
                  </Button>
                  <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border rounded-lg bg-muted/10 min-h-[120px] p-2 overflow-hidden">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50">
                      <Files className="size-8 mb-2" />
                      <p className="text-xs italic text-center px-4">RelatorioAnaliticoRotaPedidos_*.xlsx</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-2 p-1">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-2 px-3 rounded-md border text-xs gap-2">
                            <span className="truncate font-medium flex-1 min-w-0">{file.name}</span>
                            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
                              <Trash2 className="size-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>

              {isExecuting && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-accent">
                    <span>Processando em Lote...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/5 border-t pt-6 flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1 border-accent/30 text-accent hover:bg-accent/5"
                onClick={() => runPipeline(true)}
                disabled={isExecuting || files.length === 0}
              >
                <Download className="mr-2 size-4" /> Exportar Excel
              </Button>
              <Button
                className="flex-[2] h-12 bg-accent hover:bg-accent/90 text-white font-semibold"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || files.length === 0}
              >
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Consolidando...</> : <><Play className="mr-2 fill-current" /> Salvar no Firebase</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col border border-border/60 bg-white rounded-lg overflow-hidden shadow-sm min-h-[300px]">
            <div className="p-3 border-b bg-muted/20">
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <FileCode className="size-3" /> Console Performaxxi
               </span>
            </div>
            <ScrollArea className="flex-1 p-4 font-code text-[11px] leading-relaxed bg-slate-50">
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic space-y-2">
                  <p>Aguardando RelatorioAnaliticoRotaPedidos.</p>
                  <p className="text-[10px] text-accent/70 mt-4 border-l-2 border-accent/30 pl-2">
                    Lógica unificada para Motoristas e Ajudantes.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`
                      break-words ${log.includes('[ERRO]') ? 'text-destructive font-bold' :
                        log.includes('[OK]') ? 'text-green-600' :
                        log.includes('[AVISO]') ? 'text-amber-600' :
                        'text-slate-500'}
                    `}>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>
      </div>

      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}