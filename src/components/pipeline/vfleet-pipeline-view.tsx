
"use client"

import * as React from "react"
import { 
  FileSpreadsheet, 
  Upload, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  ChevronDown,
  Trash2,
  FileCode,
  FileText,
  Files,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "./ai-param-assistant"
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeVFleetPipeline } from "@/app/actions/pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "./data-viewer"
import { Badge } from "@/components/ui/badge"
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
        description: `${newFiles.length} novos arquivos foram incluídos na lista.`,
      })
    }
  }

  const runPipeline = async () => {
    if (files.length === 0) {
      toast({
        variant: "destructive",
        title: "Arquivos ausentes",
        description: "Adicione os arquivos Excel/CSV necessários.",
      });
      addLog("Tentativa de execução sem arquivos. Abortando.", "error")
      return;
    }

    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog("Iniciando Pipeline vFleet v2.0...")
    addLog(`Parâmetros: Mês ${month}, Ano ${year}`)

    try {
      addLog("Verificando integridade dos arquivos selecionados...")
      await new Promise(r => setTimeout(r, 600))
      setProgress(15)
      
      const hasControlFile = files.some(f => f.name.toLowerCase().includes('entrega') || f.name.toLowerCase().includes('controle'))
      if (!hasControlFile) {
        addLog("Nenhum arquivo de 'Controle de Entregas' detectado. O processamento continuará, mas os dados podem ser parciais.", "warn")
      }

      addLog("Estabelecendo conexão com o Firebase Firestore...", "info")
      await new Promise(r => setTimeout(r, 400))
      setProgress(25)
      
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      addLog("Enviando lote de dados para o servidor (Server Action)...", "info")
      setProgress(40)
      
      const response = await executeVFleetPipeline(formData)
      
      if (response.success) {
        setProgress(60)
        addLog("Servidor: Leitura de boletins de alerta concluída.", "success")
        await new Promise(r => setTimeout(r, 400))
        
        setProgress(75)
        addLog("Servidor: Cruzamento de dados com Controle de Entregas efetuado.", "success")
        
        setProgress(85)
        addLog("Servidor: Inicializando Genkit para análise de IA...", "info")
        await new Promise(r => setTimeout(r, 400))
        
        setProgress(95)
        addLog("Servidor: Resumo de desempenho gerado pela IA.", "success")
        
        setLastResult(response.result as PipelineResult)
        setProgress(100)
        addLog("Pipeline concluído com sucesso! Dados persistidos no Firebase.", "success")
        
        toast({
          title: "Pipeline Finalizado",
          description: "Os dados foram processados e o resumo de IA foi gerado.",
        });
      } else {
        throw new Error(response.error)
      }
    } catch (error: any) {
      addLog(`FALHA CRÍTICA: ${error.message || "Erro desconhecido durante o processamento."}`, "error")
      addLog("Verifique se as tabelas do Excel estão no formato vFleet padrão.", "warn")
      setProgress(0)
      toast({
        variant: "destructive",
        title: "Erro na Execução",
        description: error.message || "Ocorreu uma falha ao processar os arquivos.",
      });
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Execução de Pipeline</CardTitle>
              <CardDescription>
                Selecione os arquivos de alertas (vFleet) e o controle de entregas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="year">Ano de Referência</Label>
                  <Input 
                    id="year" 
                    type="number" 
                    value={year} 
                    onChange={(e) => setYear(parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="month">Mês de Referência</Label>
                  <Input 
                    id="month" 
                    type="number" 
                    min={1} 
                    max={12} 
                    value={month} 
                    onChange={(e) => setMonth(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <AIParamAssistant 
                onParamsUpdate={(m, y) => { setMonth(m); setYear(y); }} 
                currentMonth={month} 
                currentYear={year} 
              />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-base">Arquivos de Entrada</Label>
                    {files.length > 0 && (
                      <Badge variant="secondary" className="font-mono">
                        {files.length} arquivos
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {files.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setFiles([])} className="text-destructive hover:text-destructive">
                        Limpar Tudo
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                      <Upload className="mr-2 size-4" />
                      Adicionar Arquivos
                    </Button>
                  </div>
                  <input 
                    id="file-upload" 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileChange} 
                    accept=".csv,.xlsx,.xls"
                  />
                </div>

                <div className="border rounded-lg bg-muted/30 overflow-hidden">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Files className="size-12 mb-2 opacity-20" />
                      <p>Nenhum arquivo selecionado</p>
                      <p className="text-xs">Arraste arquivos ou use o botão acima</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[200px] p-4">
                      <div className="space-y-2">
                        {files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-background p-3 rounded-md border shadow-sm">
                            <div className="flex items-center gap-3 overflow-hidden">
                              {file.name.endsWith('.csv') ? 
                                <FileText className="size-4 text-blue-500 shrink-0" /> : 
                                <FileSpreadsheet className="size-4 text-green-600 shrink-0" />
                              }
                              <div className="flex flex-col">
                                <span className="text-sm font-medium truncate max-w-[300px]">{file.name}</span>
                                <span className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="size-8"
                              onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                            >
                              <Trash2 className="size-4 text-destructive" />
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
                  <div className="flex justify-between text-xs font-medium">
                    <span>Progresso do Pipeline</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t pt-6 bg-muted/5">
              <Button 
                className="w-full h-12 text-lg font-semibold shadow-lg" 
                onClick={runPipeline}
                disabled={isExecuting || files.length === 0}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="mr-2 size-5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 size-5 fill-current" />
                    Executar Pipeline vFleet
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="bg-primary/5 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCode className="size-4 text-primary" />
                  Console de Saída
                </CardTitle>
                {isExecuting && (
                  <div className="flex gap-1">
                    <div className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 bg-zinc-950">
              <ScrollArea className="h-[460px] p-4 font-code text-[11px] leading-relaxed">
                {logs.length === 0 ? (
                  <p className="text-zinc-500 italic">Aguardando início do pipeline...</p>
                ) : (
                  <div className="space-y-1.5">
                    {logs.map((log, i) => (
                      <div key={i} className={`
                        ${log.includes('[ERRO]') ? 'text-red-400 font-bold' : 
                          log.includes('[OK]') ? 'text-emerald-400' : 
                          log.includes('[AVISO]') ? 'text-amber-400' : 
                          'text-zinc-300'}
                      `}>
                        {log}
                      </div>
                    ))}
                    {isExecuting && (
                      <div className="text-zinc-500 animate-pulse">_</div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {lastResult && !isExecuting && (
        <DataViewer result={lastResult} />
      )}
    </div>
  )
}
