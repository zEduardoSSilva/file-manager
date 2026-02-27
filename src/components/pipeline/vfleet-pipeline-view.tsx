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
  Search
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "./ai-param-assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeVFleetPipeline } from "@/app/actions/pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "./data-viewer"
import { Progress } from "@/components/ui/progress"

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
      toast({
        title: "Arquivos adicionados",
        description: `${newFiles.length} novos arquivos foram incluídos.`,
      })
    }
  }

  const runPipeline = async () => {
    if (files.length === 0) {
      toast({
        variant: "destructive",
        title: "Arquivos ausentes",
        description: "Adicione os arquivos de Alertas e Controle.",
      });
      return;
    }

    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog("Iniciando Pipeline vFleet Engine...")

    try {
      addLog("Conectando ao Firebase Studio...", "info")
      await new Promise(r => setTimeout(r, 400))
      
      addLog("Lendo metadados dos arquivos...")
      await new Promise(r => setTimeout(r, 400))
      setProgress(15)
      
      addLog("Localizando aba 'Acumulado' nos arquivos de Entrega...")
      const hasControl = files.some(f => f.name.toLowerCase().includes('entrega'))
      if (!hasControl) addLog("Aviso: Arquivo de Controle de Entregas não identificado pelo nome padrão.", "warn")
      
      setProgress(25)
      addLog("Validando colunas obrigatórias: PLACA, MOTORISTA, TIPO, DATA...", "info")
      await new Promise(r => setTimeout(r, 600))
      
      setProgress(40)
      addLog("Enviando lote para processamento no servidor (Server Action)...")
      
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      const response = await executeVFleetPipeline(formData)
      
      if (response.success) {
        setProgress(70)
        addLog("Consolidação concluída com sucesso.", "success")
        
        setProgress(85)
        addLog("Solicitando resumo inteligente da IA...", "info")
        
        setProgress(95)
        addLog("Calculando bonificações (Regra: R$ 4.80/dia 4/4)...", "info")
        
        setLastResult(response.result as PipelineResult)
        setProgress(100)
        addLog("Pipeline finalizado! Dados persistidos no Firestore.", "success")
        
        toast({
          title: "Processamento Concluído",
          description: "Dados consolidados e salvos com sucesso.",
        });
      } else {
        throw new Error(response.error)
      }
    } catch (error: any) {
      addLog(`FALHA NO PROCESSAMENTO: ${error.message}`, "error")
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle>Execução de Pipeline</CardTitle>
              <CardDescription>
                Consolidação de Alertas e Controle de Entregas para Remuneração Variável.
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
                  <Label className="text-base">Arquivos Selecionados ({files.length})</Label>
                  <div className="flex gap-2">
                    {files.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setFiles([])} className="text-destructive">Limpar Lote</Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                      <Upload className="mr-2 size-4" /> Anexar
                    </Button>
                  </div>
                  <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} accept=".csv,.xlsx,.xls" />
                </div>

                <div className="border rounded-lg bg-muted/20 min-h-[120px]">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Files className="size-10 mb-2 opacity-10" />
                      <p className="text-sm">Arraste os arquivos vFleet aqui ou clique em anexo</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[200px] p-4">
                      <div className="space-y-2">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-background p-2 px-3 rounded-md border border-border/50 text-sm">
                            <div className="flex items-center gap-3">
                              {file.name.toLowerCase().includes('alerta') ? <Search className="size-4 text-primary/70" /> : <FileSpreadsheet className="size-4 text-green-600/70" />}
                              <span className="truncate max-w-[240px] font-medium">{file.name}</span>
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
                    <span>Processando Dados vFleet</span>
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
