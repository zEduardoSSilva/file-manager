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
    addLog(`Iniciando Pipeline Performaxxi...`)

    try {
      addLog("Identificando arquivos anexados...", "info")
      addLog(`Arquivos: ${files.map(f => f.name).join(', ')}`, "info")
      addLog(`Período: ${String(month).padStart(2,'0')}/${year}`, "info")
      await new Promise(r => setTimeout(r, 400))
      setProgress(15)
      
      addLog("Analisando 4 critérios de performance.", "info")
      addLog("Bônus Proporcional: R$ 2,00/critério (Motorista)", "info")
      addLog("Bônus Proporcional: R$ 1,80/critério (Ajudante).", "info")
      
      setProgress(40)
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      addLog("Enviando dados ao servidor...", "info")
      
      let response: any
      try {
        response = await executePipeline(formData, 'performaxxi')
      } catch (networkErr: any) {
        // Captura erros de rede / timeout / resposta malformada
        const detail = networkErr?.message || String(networkErr)
        addLog(`Erro de comunicação com servidor: ${detail}`, "error")
        if (networkErr?.cause) addLog(`Causa: ${String(networkErr.cause)}`, "error")
        throw networkErr
      }

      addLog(`Resposta recebida. Status: ${response?.success ? 'SUCESSO' : 'FALHA'}`, response?.success ? 'info' : 'warn')

      if (!response?.success) {
        // Exibe todos os campos de erro disponíveis na resposta
        const errMsg   = response?.error   || '(sem mensagem)'
        const errStack = response?.stack   || ''
        const errCode  = response?.code    || ''
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

      // Mostra campos disponíveis no result para diagnóstico
      const resultKeys = Object.keys(result || {})
      addLog(`Campos retornados: ${resultKeys.join(', ')}`, "info")

      if (downloadOnly) {
        addLog("Gerando Excel Consolidado...", "success")
        downloadMultipleSheets([
          { data: result.detalheGeral || [], name: '01_Detalhe_Geral' },
          { data: result.data, name: '02_Consolidado_Geral' }
        ], `Performaxxi_Final_${month}_${year}`)

        if (!result.detalheGeral || result.detalheGeral.length === 0) {
          addLog("⚠️ Aba '01_Detalhe_Geral' veio vazia — verifique se o campo 'detalheGeral' é retornado pelo backend.", "warn")
        }
      } else {
        addLog("Sincronização com o Firebase concluída.", "success")
      }

      toast({ 
        title: downloadOnly ? "Arquivo Pronto" : "Concluído", 
        description: downloadOnly ? "Excel analítico baixado." : "Dados Performaxxi." 
      });

    } catch (error: any) {
      // Fallback — captura qualquer coisa não tratada acima
      const msg = error?.message || String(error)
      addLog(`FALHA GERAL: ${msg}`, "error")

      // Tenta extrair informação extra de respostas HTTP inesperadas
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
    <div className="space-y-6">
      <Alert className="bg-accent/5 border-accent/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-accent" />
          <AlertTitle className="mb-0">Análise Performaxxi</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Anexe os arquivos. O sistema analisará os critérios de performance automaticamente.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Bônus proporcional: <strong>R$ 8,00</strong> (Motorista) e <strong>R$ 7,20</strong> (Ajudante) baseados em 4 critérios.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-5 text-accent" />
                Configuração Performaxxi
              </CardTitle>
              <CardDescription>
                Análise de Performance
              </CardDescription>
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
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Relatório Analítico de Performance ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar Lote
                  </Button>
                  <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border rounded-lg bg-muted/10 min-h-[120px]">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Files className="size-10 mb-2 opacity-20" />
                      <p className="text-sm text-muted-foreground italic">Arraste ou selecione o arquivo</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[150px] p-4">
                      <div className="space-y-2">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-2 px-3 rounded-md border text-sm">
                            <span className="truncate max-w-[240px] font-medium">{file.name}</span>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
                              <Trash2 className="size-4 text-destructive/70" />
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
                    <span>Sincronizando com Firebase</span>
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
                className="flex-[2] h-12 text-base font-semibold bg-accent hover:bg-accent/90 text-accent-foreground shadow-sm" 
                onClick={() => runPipeline(false)} 
                disabled={isExecuting || files.length === 0}
              >
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Sincronizando...</> : <><Play className="mr-2 fill-current" /> Salvar</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col border border-border/60 bg-white rounded-lg overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <FileCode className="size-3" /> Console de Execução
               </span>
            </div>
            <ScrollArea className="flex-1 p-4 font-code text-[11px] leading-relaxed bg-slate-50">
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic space-y-2">
                  <p>Aguardando relatórios do Performaxxi.</p>
                  <div className="text-[10px] border-l-2 pl-2 mt-4">
                    <strong>Sugestão:</strong><br/>
                    • RelatorioAnaliticoRotaPedidos
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`
                      ${log.includes('[ERRO]') ? 'text-destructive font-semibold' : 
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