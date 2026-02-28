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
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const runPipeline = async (downloadOnly = false) => {
    if (files.length === 0) return;
    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog(`Iniciando Pipeline Performaxxi de Alta Performance...`)

    try {
      addLog("Mapeando cabeçalhos e aplicando filtros agressivos (StandBy)...", "info")
      setProgress(20)

      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      addLog("Enviando dados para processamento linear (suporta 20k+ linhas)...", "info")
      const response = await executePipeline(formData, 'performaxxi')

      if (!response.success) {
        throw new Error(response.error)
      }

      setLastResult(response.result)
      setProgress(100)
      addLog("Análise proporcional de 4 critérios concluída.", "success")
      addLog("Dados salvos e sincronizados com Firebase.", "success")

      if (downloadOnly && response.result.detalheGeral) {
        addLog("Gerando Excel com abas de Detalhe e Consolidado...", "info")
        const motoristasDet = response.result.detalheGeral.filter((d: any) => d.Cargo === 'MOTORISTA')
        const ajudantesDet = response.result.detalheGeral.filter((d: any) => d.Cargo === 'AJUDANTE')
        const motoristasCons = response.result.data.filter((d: any) => d.Cargo === 'MOTORISTA')
        const ajudantesCons = response.result.data.filter((d: any) => d.Cargo === 'AJUDANTE')

        downloadMultipleSheets([
          { data: motoristasDet, name: '04_Detalhe_Motorista' },
          { data: motoristasCons, name: '05_Consolidado_Motorista' },
          { data: ajudantesDet, name: '06_Detalhe_Ajudante' },
          { data: ajudantesCons, name: '07_Consolidado_Ajudante' }
        ], `Performaxxi_Final_${month}_${year}`)
      }

      toast({
        title: "Processamento Concluído",
        description: "Os dados foram analisados e gravados com sucesso.",
      });

    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, "error")
      setProgress(0)
      toast({
        variant: "destructive",
        title: "Erro no Pipeline",
        description: "Ocorreu um problema ao processar o arquivo.",
      });
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">
      <Alert className="bg-accent/5 border-accent/20">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-accent" />
          <AlertTitle className="mb-0">Motor Performaxxi Unificado (Alta Performance)</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Análise de 4 critérios com bônus proporcional. Suporta arquivos grandes filtrando rotas StandBy automaticamente.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Processa Motoristas (R$ 8,00) e Ajudantes (R$ 7,20) com abas separadas na exportação.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Configuração</CardTitle>
              <CardDescription>Período e Relatórios</CardDescription>
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
                  <Label className="font-semibold">Arquivos ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('perf-upload')?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar
                  </Button>
                  <input id="perf-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border rounded-lg bg-muted/10 min-h-[100px] p-2 overflow-hidden">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground opacity-50">
                      <Files className="size-6 mb-2" />
                      <p className="text-[10px] italic">RelatorioAnaliticoRotaPedidos.xlsx</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[120px]">
                      <div className="space-y-1.5 p-1">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-1.5 px-2 rounded-md border text-[11px] gap-2">
                            <span className="truncate font-medium flex-1 min-w-0">{file.name}</span>
                            <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
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
                    <span>Processando 20k+ linhas...</span>
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
                <Download className="mr-2 size-4" /> Exportar (Abas 04-07)
              </Button>
              <Button
                className="flex-[2] h-12 bg-accent hover:bg-accent/90 text-white font-semibold"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || files.length === 0}
              >
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Analisando...</> : <><Play className="mr-2 fill-current" /> Processar e Salvar</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card className="h-full flex flex-col border border-border/60 bg-white rounded-lg overflow-hidden shadow-sm min-h-[300px]">
            <div className="p-3 border-b bg-muted/20">
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <FileCode className="size-3" /> Console Performaxxi
               </span>
            </div>
            <ScrollArea className="flex-1 p-4 font-code text-[11px] leading-relaxed bg-slate-50">
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic space-y-2 text-[10px]">
                  <p>Aguardando relatório de 20k linhas.</p>
                  <p className="text-accent/70 mt-4 border-l-2 border-accent/30 pl-2">
                    O sistema filtrará rotas STANDBY automaticamente.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`
                      break-words ${log.includes('[ERRO]') ? 'text-destructive font-bold' :
                        log.includes('[OK]') ? 'text-green-600' :
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
