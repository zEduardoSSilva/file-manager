
"use client"

import * as React from "react"
import { 
  FileSpreadsheet, 
  Upload, 
  Play, 
  Trash2,
  FileCode,
  Files,
  Loader2,
  Search,
  Truck,
  UserGroup
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

interface VFleetPipelineViewProps {
  pipelineId: 'vfleet' | 'performaxxi';
}

export function VFleetPipelineView({ pipelineId }: VFleetPipelineViewProps) {
  const [year, setYear] = React.useState(2026)
  const [month, setMonth] = React.useState(1)
  const [files, setFiles] = React.useState<File[]>([])
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [logs, setLogs] = React.useState<string[]>([])
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null)
  const { toast } = useToast()

  const isPerformaxxi = pipelineId === 'performaxxi';

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

  const runPipeline = async () => {
    if (files.length === 0) return;
    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog(`Iniciando Pipeline ${pipelineId.toUpperCase()}...`)

    try {
      addLog("Conectando ao Firebase Studio...", "info")
      await new Promise(r => setTimeout(r, 400))
      setProgress(20)
      
      addLog(`Validando colunas do arquivo ${isPerformaxxi ? 'Performaxxi' : 'vFleet'}...`)
      if (isPerformaxxi) {
        addLog("Buscando: nome_motorista, nome_ajudante, sla, distancia_metros...", "info")
      } else {
        addLog("Buscando: MOTORISTA, TIPO, PLACA SISTEMA...", "info")
      }
      
      setProgress(50)
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      const response = await executePipeline(formData, pipelineId)
      
      if (response.success) {
        setLastResult(response.result as PipelineResult)
        setProgress(100)
        addLog("Transformação concluída e salva no Firebase.", "success")
        toast({ title: "Concluído", description: "Dados processados com sucesso." });
      } else {
        throw new Error(response.error)
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>{isPerformaxxi ? "Performaxxi Único" : "vFleet Pilot"}</CardTitle>
              <CardDescription>
                {isPerformaxxi 
                  ? "Análise de Rotas, Pedidos e Performance (Motoristas R$ 8,00 / Ajudantes R$ 7,20)" 
                  : "Consolidação de Alertas e Controle para Remuneração Variável (R$ 4,80)"}
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
                  <Label className="text-base font-semibold">Anexar Lote de Arquivos ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="mr-2 size-4" /> Anexar
                  </Button>
                  <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border rounded-lg bg-muted/20 min-h-[120px]">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Files className="size-10 mb-2 opacity-10" />
                      <p className="text-sm">Selecione arquivos Excel ou CSV para o lote.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[150px] p-4">
                      <div className="space-y-2">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-background p-2 px-3 rounded-md border text-sm">
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
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span>Processando Dados</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/5 border-t pt-6">
              <Button className="w-full h-12 text-base font-semibold" onClick={runPipeline} disabled={isExecuting || files.length === 0}>
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Processando Lote...</> : <><Play className="mr-2 fill-current" /> Iniciar Transformação</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col border border-border/60 bg-white rounded-lg overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <FileCode className="size-3" /> Console de Saída
               </span>
               {isExecuting && <div className="size-2 rounded-full bg-primary animate-pulse" />}
            </div>
            <ScrollArea className="flex-1 p-4 font-code text-[11px] leading-relaxed">
              {logs.length === 0 ? (
                <span className="text-muted-foreground italic">Aguardando gatilho do sistema...</span>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`
                      ${log.includes('[ERRO]') ? 'text-destructive font-semibold' : 
                        log.includes('[OK]') ? 'text-green-600' : 
                        log.includes('[AVISO]') ? 'text-amber-600' : 
                        'text-slate-600'}
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
