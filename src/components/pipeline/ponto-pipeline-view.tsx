
"use client"

import * as React from "react"
import { 
  Upload, 
  Play, 
  Trash2,
  FileCode,
  Files,
  Loader2,
  Clock,
  Download,
  Calendar as CalendarIcon,
  X,
  CheckCircle2,
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
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function PontoPipelineView() {
  const [year, setYear] = React.useState(2026)
  const [month, setMonth] = React.useState(1)
  const [files, setFiles] = React.useState<File[]>([])
  const [excludedDates, setExcludedDates] = React.useState<Date[]>([])
  const [includeSundays, setIncludeSundays] = React.useState(false)
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
    addLog(`Iniciando Pipeline PONTO E ABSENTEÍSMO...`)

    try {
      addLog("Lendo arquivos de Ponto...", "info")
      if (excludedDates.length > 0) {
        addLog(`Aplicando ${excludedDates.length} feriados/exclusões globais...`, "warn")
      }
      addLog(`Configuração: Domingos como dias úteis? ${includeSundays ? 'SIM' : 'NÃO'}`, "info")
      
      await new Promise(r => setTimeout(r, 400))
      setProgress(20)
      
      addLog("Analisando Jornada, HE, Almoço e Descanso Interjornada...", "info")
      addLog("Calculando bônus e absenteísmo proporcional...", "info")
      
      setProgress(50)
      const formData = new FormData()
      formData.append('year', year.toString())
      formData.append('month', month.toString())
      formData.append('includeSundays', includeSundays.toString())
      
      const formattedExcluded = excludedDates.map(d => format(d, 'dd/MM/yyyy'))
      formData.append('excludedDates', JSON.stringify(formattedExcluded))
      
      files.forEach(f => formData.append('files', f))

      const response = await executePipeline(formData, 'ponto')
      
      if (response.success && response.result) {
        const result = response.result;
        setLastResult(result)
        setProgress(100)

        if (downloadOnly) {
          addLog("Gerando Excel com abas Detalhe, Consolidado e Absenteísmo...", "success")
          downloadMultipleSheets([
            { data: result.detalhePonto || [], name: '03_Detalhe_Ponto' },
            { data: result.data, name: '04_Consolidado' },
            { data: result.absenteismoData || [], name: '10_Absenteismo_Resumo' }
          ], `Ponto_Consolidado_${month}_${year}`)
        } else {
          addLog("Processamento concluído with sucesso.", "success")
        }

        toast({ 
          title: downloadOnly ? "Arquivo Pronto" : "Concluído", 
          description: downloadOnly ? "O Excel analítico foi baixado." : "Processamento finalizado." 
        });
      } else {
        throw new Error(response.success === false ? response.error : 'Erro desconhecido')
      }
    } catch (error: any) {
      addLog(`FALHA NO PONTO: ${error.message}`, "error")
      setProgress(0)
    } finally {
      setIsExecuting(false)
    }
  }

  const removeDate = (dateToRemove: Date) => {
    setExcludedDates(prev => prev.filter(d => d.getTime() !== dateToRemove.getTime()))
  }

  return (
    <div className="space-y-6">
      <Alert className="bg-indigo-50 border-indigo-200">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-indigo-600" />
          <AlertTitle className="mb-0 text-indigo-900">Gestão de Jornada e Absenteísmo</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Anexe os arquivos. O sistema consolidará a jornada diária e calculará o incentivo de absenteísmo proporcional.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2 text-indigo-800">
          Esta análise cruza as marcações de ponto com as regras de jornada e aplica bônus por conformidade.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-5 text-indigo-600" />
                Configuração de Ponto
              </CardTitle>
              <CardDescription>
                Consolidação de Jornada e Absenteísmo (Lógica Automatizada)
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

              <div className="flex items-center space-x-2 p-3 rounded-lg border bg-muted/5">
                <Checkbox 
                  id="include-sundays" 
                  checked={includeSundays} 
                  onCheckedChange={(checked) => setIncludeSundays(!!checked)} 
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="include-sundays"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Considerar Domingos como dia útil
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Por padrão, domingos são ignorados no cálculo da base de dias trabalhados.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <CalendarIcon className="size-4 text-primary" />
                  Gestão de Feriados e Abonos (Excluir do Período)
                </Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {excludedDates.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">Nenhum feriado selecionado.</span>
                  ) : (
                    excludedDates.sort((a,b) => a.getTime() - b.getTime()).map((date, i) => (
                      <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1">
                        {format(date, 'dd/MM/yyyy')}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="size-4 p-0 h-4 w-4 rounded-full hover:bg-destructive hover:text-white"
                          onClick={() => removeDate(date)}
                        >
                          <X className="size-2" />
                        </Button>
                      </Badge>
                    ))
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      <CalendarIcon className="mr-2 size-4" /> Selecionar Datas para Abono/Feriado
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="multiple"
                      selected={excludedDates}
                      onSelect={(dates) => setExcludedDates(dates || [])}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Arquivos de Ponto ({files.length})</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                    <Upload className="mr-2 size-4" /> Selecionar Lote
                  </Button>
                  <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
                </div>

                <div className="border rounded-lg bg-muted/10 min-h-[120px]">
                  {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Files className="size-10 mb-2 opacity-20" />
                      <p className="text-sm">Anexe os arquivos Excel de Ponto.</p>
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
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-indigo-600">
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
                className="flex-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50" 
                onClick={() => runPipeline(true)} 
                disabled={isExecuting || files.length === 0}
              >
                <Download className="mr-2 size-4" /> Exportar Excel
              </Button>
              <Button 
                className="flex-[2] h-12 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md" 
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
                 <FileCode className="size-3" /> Monitor de Ponto
               </span>
            </div>
            <ScrollArea className="flex-1 p-4 font-code text-[11px] leading-relaxed bg-slate-50">
              {logs.length === 0 ? (
                <div className="text-muted-foreground italic space-y-2">
                  <p>Aguardando arquivos de Ponto.</p>
                  <div className="text-[10px] border-l-2 pl-2 mt-4">
                    <strong>Sugestão:</strong><br/>
                    • Ponto_Original
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
