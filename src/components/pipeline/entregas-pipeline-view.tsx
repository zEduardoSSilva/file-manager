'use client'

import * as React from 'react'
import { executeConsolidacaoEntregasPipeline } from '@/app/actions/import-entregas-action'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import {
  Loader2,
  Upload,
  Info,
  Terminal,
  FileSpreadsheet,
  FileCheck2,
  FileX2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PipelineResponse } from '@/app/actions/actions-utils'

type LogEntry = {
  time: string
  message: string
  type: 'info' | 'success' | 'error' | 'warn' | 'step'
}

const logColor: Record<LogEntry['type'], string> = {
  info: 'text-slate-400',
  success: 'text-emerald-500',
  error: 'text-red-400 font-semibold',
  warn: 'text-amber-400',
  step: 'text-primary font-semibold',
}

const logPrefix: Record<LogEntry['type'], string> = {
  info: '   ',
  success: '✅ ',
  error: '❌ ',
  warn: '⚠️  ',
  step: '▶  ',
}

export function ConsolidacaoEntregasPipelineView() {
  const { toast } = useToast()
  const [isProcessing, setProcessing] = React.useState(false)
  const [files, setFiles] = React.useState<File[] | null>(null)
  const [year, setYear] = React.useState(new Date().getFullYear())
  const [month, setMonth] = React.useState(new Date().getMonth() + 1)
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const logEndRef = React.useRef<HTMLDivElement>(null)
  const [result, setResult] = React.useState<PipelineResponse['result'] | null>(
    null,
  )

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR')
    setLogs((prev) => [...prev, { time, message, type }])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
      addLog(`${e.target.files.length} arquivo(s) selecionado(s).`)
    }
  }

  const handleExecute = async () => {
    if (!files || files.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum arquivo selecionado',
        description: 'Por favor, selecione os arquivos para processar.',
      })
      return
    }

    setProcessing(true)
    setLogs([])
    setResult(null)
    addLog(
      `Iniciando pipeline 'consolidacao-entregas' para ${String(
        month,
      ).padStart(2, '0')}/${year}`,
      'step',
    )

    const formData = new FormData()
    formData.append('year', String(year))
    formData.append('month', String(month))
    files.forEach((file) => {
      formData.append('files', file)
      formData.append('fileNames', file.name)
    })

    try {
      const response = await executeConsolidacaoEntregasPipeline(formData)
      if (response.success) {
        addLog('Pipeline executado com sucesso!', 'success')
        addLog(response.result.summary, 'info')
        toast({
          title: 'Pipeline Concluído',
          description: response.result.summary,
        })
        setResult(response.result)

        if (response.result.duplicadas && response.result.duplicadas.length > 0) {
            addLog(`${response.result.duplicadas.length} viagens duplicadas foram ignoradas.`, 'warn')
        }

      } else {
        addLog(response.error ?? 'Ocorreu um erro desconhecido.', 'error')
        toast({
          variant: 'destructive',
          title: 'Erro no Pipeline',
          description: response.error,
        })
      }
    } catch (e: any) {
      addLog(`Erro inesperado: ${e.message}`, 'error')
      toast({
        variant: 'destructive',
        title: 'Erro Inesperado',
        description: e.message,
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <AlertTitle className="mb-0">Consolidação de Entregas</AlertTitle>
        </div>
        <AlertDescription className="text-sm mt-2">
          Importe múltiplos arquivos de entrega (Excel/CSV) para um mês e ano específicos. O sistema irá consolidar os dados, remover duplicatas e salvar o resultado.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* -- Coluna Principal -- */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="size-5 text-primary" />
                Executar Pipeline de Consolidação
              </CardTitle>
              <CardDescription>
                Selecione os arquivos e o período para iniciar o processamento.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-3">
                    <Label htmlFor="files">Arquivos de Entregas</Label>
                    <Input
                        id="files"
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        className="mt-1"
                        accept=".xlsx,.xls,.csv"
                    />
                </div>
                <div>
                    <Label htmlFor="month">Mês</Label>
                    <Input
                        id="month"
                        type="number"
                        value={month}
                        onChange={(e) => setMonth(Number(e.target.value))}
                        placeholder="Mês (1-12)"
                        className="mt-1"
                    />
                </div>
                <div>
                    <Label htmlFor="year">Ano</Label>
                    <Input
                        id="year"
                        type="number"
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        placeholder="Ano (YYYY)"
                        className="mt-1"
                    />
                </div>
              </div>
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4 pb-4">
              <Button
                onClick={handleExecute}
                disabled={isProcessing || !files}
                className="w-full h-10 text-sm font-semibold bg-primary hover:bg-primary/90 shadow-sm"
              >
                {isProcessing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
                ) : (
                  'Executar Consolidação'
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* -- Coluna Lateral -- */}
        <div className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                <Terminal className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Console de Execução</span>
                </div>
                {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                    limpar
                </button>
                )}
            </div>
            <ScrollArea className="h-[300px] bg-slate-950">
                <div className="p-3 font-mono text-[10px] leading-relaxed space-y-0.5">
                {logs.length === 0 ? (
                    <span className="text-slate-500 italic">Aguardando execução do pipeline...</span>
                ) : (
                    logs.map((log, i) => (
                    <div key={i} className={cn('flex gap-1.5', logColor[log.type])}>
                        <span className="text-slate-600 shrink-0">{log.time}</span>
                        <span className="shrink-0">{logPrefix[log.type]}</span>
                        <span className="break-all">{log.message}</span>
                    </div>
                    ))
                )}
                <div ref={logEndRef} />
                </div>
            </ScrollArea>
            </div>

            {result && (
                 <Card className="shadow-sm border-border/60">
                    <CardHeader className='pb-2'>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <FileCheck2 className="size-5 text-emerald-500" />
                            Resultado
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='text-xs space-y-2'>
                       <p>{result.summary}</p>
                       {result.duplicadas && result.duplicadas.length > 0 && (
                           <Alert variant={'destructive'} className='p-2'>
                               <div className='flex items-start gap-2'>
                                <FileX2 className='size-4 mt-0.5'/>
                                <div className='flex-1'>
                                <AlertTitle className='text-sm mb-1'>Viagens Duplicadas Ignoradas</AlertTitle>
                                <AlertDescription className='text-xs'>
                                    <ScrollArea className='h-20'>
                                        <ul className='space-y-1'>
                                        {result.duplicadas.map((d: any, i:number) => (
                                            <li key={i}>{d.viagens} - {d.data} - {d.motorista}</li>
                                        ))}
                                        </ul>
                                    </ScrollArea>
                                </AlertDescription>
                                </div>
                               </div>
                           </Alert>
                       )}
                    </CardContent>
                </Card>
            )}

        </div>
      </div>
    </div>
  )
}
