
"use client"

import * as React from "react"
import { 
  Upload, 
  Play, 
  Trash2,
  FileCode,
  Loader2,
  Zap,
  HelpCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "./ai-param-assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executePerformaxxiPipeline } from "@/app/actions/performaxxi-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "./data-viewer"
import { Progress } from "@/components/ui/progress"
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

  const runPipeline = async () => {
    if (files.length === 0) return;
    setIsExecuting(true)
    setProgress(10)
    setLogs([])
    addLog(`Iniciando Performaxxi Ultra-Rápido (Filtragem STANDBY)...`)

    try {
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      addLog("Processando 20k+ linhas e consolidando cargos...", "info")
      const response = await executePerformaxxiPipeline(formData)

      if (!response.success) {
        throw new Error(response.error)
      }

      setLastResult(response.result)
      setProgress(100)
      addLog("Análise unificada concluída com sucesso.", "success")
      addLog(`Firebase ID: ${response.result.id}`, "success")

      toast({
        title: "Processamento Concluído",
        description: `${response.result.data.length} funcionários analisados.`,
      });

    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, "error")
      setProgress(0)
      toast({
        variant: "destructive",
        title: "Erro no Pipeline",
        description: error.message,
      });
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <AlertTitle className="mb-0">Performaxxi Único (Alta Performance)</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Otimizado para 20.000+ linhas. Ignora STANDBY e processa Motoristas (R$ 8,00) e Ajudantes (R$ 7,20) em segundos.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">
          Bonificação Proporcional (4 critérios: Raio, SLA, Tempo, Sequência).
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Configuração</CardTitle>
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
                  <Label className="font-semibold">Relatório de Rotas ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('perf-upload')?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar
                  </Button>
                  <input id="perf-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border-2 border-dashed rounded-lg bg-muted/10 p-4 min-h-[100px] flex items-center justify-center">
                  {files.length === 0 ? (
                    <p className="text-center text-muted-foreground text-xs italic">Selecione o arquivo .xlsx</p>
                  ) : (
                    <div className="w-full space-y-2">
                      {files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-md border text-xs">
                          <span className="truncate flex-1 font-medium">{file.name}</span>
                          <Button variant="ghost" size="icon" className="size-6 ml-2" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {isExecuting && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-primary uppercase">
                    <span>Processando Dados</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1" />
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/5 border-t pt-4">
              <Button
                className="w-full h-12 bg-primary text-white font-bold text-base shadow-md"
                onClick={runPipeline}
                disabled={isExecuting || files.length === 0}
              >
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Analisando...</> : <><Play className="mr-2 fill-current" /> Iniciar Processamento</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-full flex flex-col border bg-slate-50 overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-muted/20 flex items-center gap-2">
              <FileCode className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Console de Execução</span>
            </div>
            <ScrollArea className="flex-1 p-4 font-code text-[11px] leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-muted-foreground italic">Aguardando arquivo...</p>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className={log.includes('[ERRO]') ? 'text-destructive' : log.includes('[OK]') ? 'text-green-600' : 'text-slate-500'}>
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
