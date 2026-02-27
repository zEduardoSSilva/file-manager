"use client"

import * as React from "react"
import { 
  Upload, 
  Play, 
  Trash2,
  FileCode,
  Files,
  Loader2,
  Truck,
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

export function VFleetPipelineView() {
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
    addLog(`Iniciando Pipeline vFLEET PILOT (Boletim + Alertas)...`)

    try {
      addLog("Identificando arquivos anexados...", "info")
      await new Promise(r => setTimeout(r, 400))
      setProgress(15)
      
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      const response = await executePipeline(formData, 'vfleet')
      
      if (response.success && response.result) {
        const result = response.result;
        setLastResult(result)
        setProgress(100)
        
        if (downloadOnly) {
          addLog("Gerando Excel Analítico vFleet...", "success")
          downloadMultipleSheets([
            { data: result.detalhePonto || [], name: '04_Detalhe_Diario' },
            { data: result.data, name: '05_Consolidado_Motorista' }
          ], `vFleet_Analitico_${month}_${year}`)
        } else {
          addLog("Processamento vFleet concluído com sucesso.", "success")
        }
        
        toast({ 
          title: downloadOnly ? "Arquivo Pronto" : "Concluído", 
          description: downloadOnly ? "O Excel analítico foi baixado." : "Dados vFleet processados." 
        });
      } else {
        throw new Error(response.success === false ? response.error : 'Erro desconhecido');
      }
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, "error")
      setProgress(0)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <AlertTitle className="mb-0">Análise de Condução vFleet</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Anexe arquivos do tipo Boletim do Veículo e Histórico de Alertas. O sistema analisará os critérios de condução automaticamente.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2">
          Esta análise processa falhas de <strong>Curva, Banguela, Ociosidade e Velocidade</strong>. 
          O bônus de R$ 4,80 é concedido para dias sem nenhuma violação.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-5 text-primary" />
                Configuração vFleet
              </CardTitle>
              <CardDescription>
                Análise de Telemetria e Comportamento do Motorista
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
                  <Label className="text-base font-semibold text-primary">Arquivos de Entrada ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar Lote
                  </Button>
                  <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border-2 border-dashed rounded-lg bg-muted/10 min-h-[140px] flex flex-col items-center justify-center p-4">
                  {files.length === 0 ? (
                    <div className="text-center space-y-2">
                      <Files className="size-10 mx-auto opacity-20" />
                      <p className="text-sm text-muted-foreground italic">Arraste ou selecione o Boletim e os Alertas</p>
                    </div>
                  ) : (
                    <ScrollArea className="w-full h-[150px]">
                      <div className="grid grid-cols-1 gap-2">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-2 px-3 rounded-md border text-sm">
                            <div className="flex items-center gap-2 truncate">
                              <FileCode className="size-3 text-muted-foreground" />
                              <span className="truncate max-w-[300px] font-medium">{file.name}</span>
                            </div>
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
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span>Processando com Firebase</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/5 border-t pt-6 flex flex-col sm:flex-row gap-3">
              <Button 
                variant="outline" 
                className="flex-1 border-primary/30 text-primary hover:bg-primary/5" 
                onClick={() => runPipeline(true)} 
                disabled={isExecuting || files.length === 0}
              >
                <Download className="mr-2 size-4" /> Exportar Excel
              </Button>
              <Button 
                className="flex-[2] h-12 text-base font-semibold shadow-md" 
                onClick={() => runPipeline(false)} 
                disabled={isExecuting || files.length === 0}
              >
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Sincronizando...</> : <><Play className="mr-2 fill-current" /> Iniciar Análise vFleet</>}
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
                  <p>Aguardando arquivos do vFleet.</p>
                  <div className="text-[10px] border-l-2 pl-2 mt-4">
                    <strong>Sugestão:</strong><br/>
                    • Boletim_do_Veiculo
                    • Historico_Alertas
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