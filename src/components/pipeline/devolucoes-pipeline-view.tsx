"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  Download,
  PackageX,
  HelpCircle,
  CheckCircle2,
  Circle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "./ai-param-assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { executeDevolucoesPipeline } from "@/app/actions/devolucoes-pipeline"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { DataViewer } from "./data-viewer"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type TipoArquivo = 'controle' | 'faturamento' | 'motivos' | 'funcionarios'

interface ArquivoClassificado {
  file: File
  tipo: TipoArquivo
  label: string
}

const CLASSIFICACOES: Record<TipoArquivo, { label: string; desc: string; obrigatorio: boolean }> = {
  controle:     { label: 'Controle Logístico',  desc: 'Consolidado_Entregas_V2_Geral.xlsx',  obrigatorio: true },
  faturamento:  { label: 'Fat. Fechamento',      desc: 'Fat_Fechamento.xlsx',                 obrigatorio: true },
  motivos:      { label: 'Motivos Sistema',       desc: 'Motivos Sistema.xlsx (opcional)',      obrigatorio: false },
  funcionarios: { label: 'Funcionários',          desc: 'Funcionario.xlsx (opcional)',          obrigatorio: false },
}

export function DevolucoesPipelineView() {
  const [year, setYear]   = React.useState(2026)
  const [month, setMonth] = React.useState(1)
  const [arquivos, setArquivos] = React.useState<ArquivoClassificado[]>([])
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress]       = React.useState(0)
  const [logs, setLogs]               = React.useState<string[]>([])
  const [lastResult, setLastResult]   = React.useState<PipelineResult | null>(null)
  const { toast } = useToast()

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts = new Date().toLocaleTimeString()
    const prefixes = { info: '', error: '❌ ', success: '✅ ', warn: '⚠️ ' }
    setLogs(prev => [...prev, `[${ts}] ${prefixes[type]}${msg}`])
  }

  const arquivoPorTipo = (tipo: TipoArquivo) => arquivos.find(a => a.tipo === tipo)

  const runPipeline = async (downloadOnly = false) => {
    if (!arquivoPorTipo('controle') || !arquivoPorTipo('faturamento')) {
      toast({ title: 'Arquivos obrigatórios ausentes', variant: 'destructive' })
      return
    }

    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog(`Iniciando Devoluções...`)

    try {
      const formData = new FormData()
      formData.append('year',  year.toString())
      formData.append('month', month.toString())
      arquivos.forEach(a => formData.append('files', a.file))

      const response = await executeDevolucoesPipeline(formData)
      if (!response.success) throw new Error(response.error)

      setLastResult(response.result)
      setProgress(100)
      addLog(`Processado com sucesso.`, 'success')

      if (downloadOnly) {
        downloadMultipleSheets([
          { data: response.result.data, name: 'Resumo' },
          { data: response.result.detalhamento, name: 'Detalhe' }
        ], `Devolucoes_${month}_${year}`)
      }

      toast({ title: 'Pipeline Concluído' })
    } catch (error: any) {
      addLog(`Erro: ${error.message}`, 'error')
      setProgress(0)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Alert className="bg-rose-50 border-rose-200">
        <PackageX className="size-4 text-rose-600" />
        <AlertTitle className="text-rose-900">Gestão de Devoluções</AlertTitle>
        <AlertDescription className="text-xs text-rose-800">
          Análise de quebras e devoluções por colaborador com cruzamento de faturamento.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
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

              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }} currentMonth={month} currentYear={year} />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Arquivos (.xlsx)</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('dev-up')?.click()}>
                    Selecionar
                  </Button>
                  <input id="dev-up" type="file" multiple className="hidden" onChange={e => {
                    if (e.target.files) {
                      const list = Array.from(e.target.files).map(f => ({
                        file: f,
                        tipo: f.name.toLowerCase().includes('fat') ? 'faturamento' : 'controle' as TipoArquivo,
                        label: f.name
                      }))
                      setArquivos(list)
                    }
                  }} />
                </div>
                <div className="space-y-2">
                  {arquivos.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border rounded text-xs bg-white">
                      <span className="truncate flex-1">{a.file.name}</span>
                      <Button variant="ghost" size="icon" className="size-6" onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {isExecuting && <Progress value={progress} className="h-1.5" />}
            </CardContent>
            <CardFooter className="border-t pt-4 gap-3">
              <Button variant="outline" className="flex-1" onClick={() => runPipeline(true)} disabled={isExecuting || arquivos.length < 2}>
                Excel
              </Button>
              <Button className="flex-[2]" onClick={() => runPipeline(false)} disabled={isExecuting || arquivos.length < 2}>
                {isExecuting ? <Loader2 className="animate-spin" /> : 'Processar'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card className="h-full bg-slate-50 font-mono text-[10px] p-4">
          {logs.length === 0 ? "Aguardando..." : logs.map((l, i) => <div key={i}>{l}</div>)}
        </Card>
      </div>

      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}
