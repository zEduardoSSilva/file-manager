
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
  FileText
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

export function VFleetPipelineView() {
  const [year, setYear] = React.useState(2026)
  const [month, setMonth] = React.useState(1)
  const [files, setFiles] = React.useState<File[]>([])
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [logs, setLogs] = React.useState<string[]>([])
  const [lastResult, setLastResult] = React.useState<PipelineResult | null>(null)
  const { toast } = useToast()

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const runPipeline = async () => {
    if (files.length === 0) {
      toast({
        variant: "destructive",
        title: "Arquivos ausentes",
        description: "Adicione os arquivos Excel/CSV necessários.",
      });
      return;
    }

    setIsExecuting(true)
    setLogs([])
    addLog("Iniciando Pipeline vFleet...")
    addLog(`Configurado para período: ${month.toString().padStart(2, '0')}/${year}`)

    try {
      addLog("Carregando arquivos de entrada...")
      await new Promise(r => setTimeout(r, 600))
      addLog(`Processando ${files.length} arquivos...`)
      
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      files.forEach(f => formData.append('files', f))

      const response = await executeVFleetPipeline(formData)
      
      if (response.success) {
        addLog("Etapa 1: Atualizando motoristas no Boletim do Veículo...")
        await new Promise(r => setTimeout(r, 400))
        addLog("Etapa 2: Gerando Boletim do Motorista...")
        await new Promise(r => setTimeout(r, 400))
        addLog("Etapa 3: Consolidando alertas e corrigindo IDs...")
        await new Promise(r => setTimeout(r, 400))
        addLog("Etapa 4: Executando análise de condução (4/4 critérios)...")
        await new Promise(r => setTimeout(r, 600))
        addLog("Exportando dados para o Firebase...")
        
        setLastResult(response.result as PipelineResult)
        addLog("Pipeline concluído com sucesso!")
        
        toast({
          title: "Pipeline Finalizado",
          description: "Os dados foram salvos no Firebase.",
        });
      }
    } catch (error) {
      addLog("ERRO: Falha crítica na execução do pipeline.")
      toast({
        variant: "destructive",
        title: "Erro na Execução",
        description: "Ocorreu uma falha ao processar os arquivos.",
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
                Configure os parâmetros e adicione os arquivos base para o processamento.
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
                  <Label className="text-base">Arquivos de Entrada</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="mr-2 size-4" />
                    Adicionar Arquivos
                  </Button>
                  <input 
                    id="file-upload" 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileChange} 
                    accept=".csv,.xlsx,.xls"
                  />
                </div>

                <div className="border rounded-lg bg-muted/30 p-4">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <FileSpreadsheet className="size-12 mb-2 opacity-20" />
                      <p>Nenhum arquivo selecionado</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-background p-2 rounded border">
                          <div className="flex items-center gap-3">
                            {file.name.endsWith('.csv') ? <FileText className="size-4 text-blue-500" /> : <FileSpreadsheet className="size-4 text-green-600" />}
                            <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6 bg-muted/5">
              <Button 
                className="w-full h-12 text-lg font-semibold shadow-lg" 
                onClick={runPipeline}
                disabled={isExecuting || files.length === 0}
              >
                {isExecuting ? (
                  <>Executando Processamento...</>
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
            <CardContent className="flex-1 p-0">
              <ScrollArea className="h-[400px] p-4 font-code text-xs">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground italic">Aguardando início do pipeline...</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, i) => (
                      <div key={i} className={`${log.includes('ERRO') ? 'text-destructive font-bold' : log.includes('sucesso') ? 'text-green-600 font-bold' : ''}`}>
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {lastResult && (
        <DataViewer result={lastResult} />
      )}
    </div>
  )
}
