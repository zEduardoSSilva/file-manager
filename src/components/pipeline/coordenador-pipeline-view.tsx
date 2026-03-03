"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Loader2,
  Building2,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  ClipboardList,
  HelpCircle,
  AlertTriangle,
} from "lucide-react"
import { Button }       from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input }        from "@/components/ui/input"
import { Label }        from "@/components/ui/label"
import { ScrollArea }   from "@/components/ui/scroll-area"
import { Progress }     from "@/components/ui/progress"
import { Badge }        from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator }    from "@/components/ui/separator"
import { AIParamAssistant } from "./ai-param-assistant"
import { DataViewer }   from "./data-viewer"
import { executeCoordenadorPipeline } from "@/app/actions/coordenador-pipeline"
import { useToast }     from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"

const MODULE_INFO = [
  {
    num  : "01",
    title: "Desempenho de Rotas",
    desc : "Lê Motoristas/Ajudantes_Ajustado · remove domingos · bonificação R$ 48,00",
    color: "text-blue-600",
    bg   : "bg-blue-50 border-blue-200",
  },
  {
    num  : "02",
    title: "Processador de Ponto",
    desc : "CSVs Ponto_Original · filtra mês · remove duplicatas por pontuação",
    color: "text-violet-600",
    bg   : "bg-violet-50 border-violet-200",
  },
  {
    num  : "03",
    title: "Tempo Interno",
    desc : `T1 ≤ 30 min (chegada→rota) · T2 ≤ 40 min (rota→saída) · bonificação R$ 12,00`,
    color: "text-amber-600",
    bg   : "bg-amber-50 border-amber-200",
  },
  {
    num  : "04",
    title: "Consolidação Final",
    desc : "Rotas + Tempo + Peso · penalização ≥ 15% devolvido · R$ 60,00/dia máx",
    color: "text-emerald-600",
    bg   : "bg-emerald-50 border-emerald-200",
  },
]

export function CoordenadorPipelineView() {
  const [year,  setYear]  = React.useState(2026)
  const [month, setMonth] = React.useState(1)

  const [fileMotoristas,  setFileMotoristas]  = React.useState<File | null>(null)
  const [fileAjudantes,   setFileAjudantes]   = React.useState<File | null>(null)
  const [fileRotas,       setFileRotas]       = React.useState<File | null>(null)
  const [fileAnaliseRotas,setFileAnaliseRotas]= React.useState<File | null>(null)
  const [filesPonto,      setFilesPonto]      = React.useState<File[]>([])

  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress,    setProgress]    = React.useState(0)
  const [logs,        setLogs]        = React.useState<string[]>([])
  const [lastResult,  setLastResult]  = React.useState<PipelineResult | null>(null)

  const { toast } = useToast()

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts = new Date().toLocaleTimeString('pt-BR')
    const prefix = type === 'error'   ? '❌ [ERRO] '
                 : type === 'success' ? '✅ [OK] '
                 : type === 'warn'    ? '⚠️ [AVISO] '
                 : ''
    setLogs(prev => [...prev, `[${ts}] ${prefix}${msg}`])
  }

  const makeInputRef = (id: string) => () => document.getElementById(id)?.click()

  const singleFileRow = (
    id     : string,
    label  : string,
    file   : File | null,
    setFile: (f: File | null) => void,
    hint   : string,
    required = true,
    icon   : React.ReactNode = <FileSpreadsheet className="size-3.5" />
  ) => (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
      <div className="shrink-0 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold truncate">{label}</span>
          {required && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">obrigatório</Badge>}
          {!required && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">opcional</Badge>}
        </div>
        {file
          ? <span className="text-[11px] text-primary font-medium truncate block">{file.name}</span>
          : <span className="text-[11px] text-muted-foreground italic truncate block">{hint}</span>
        }
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {file && (
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setFile(null)}>
            <Trash2 className="size-3 text-destructive" />
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={makeInputRef(id)}>
          {file ? 'Trocar' : 'Selecionar'}
        </Button>
      </div>
      <input
        id={id} type="file" className="hidden" accept=".xlsx,.xls"
        onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )

  const canRun = !!(fileMotoristas && fileAjudantes)

  const runPipeline = async () => {
    if (!canRun) return
    setIsExecuting(true)
    setProgress(5)
    setLogs([])

    addLog(`Iniciando Pipeline Coordenadores — ${String(month).padStart(2,'0')}/${year}`)

    try {
      const formData = new FormData()
      formData.append('year',  year.toString())
      formData.append('month', month.toString())
      formData.append('fileMotoristas',  fileMotoristas!)
      formData.append('fileAjudantes',   fileAjudantes!)
      if (fileRotas)        formData.append('fileRotas',       fileRotas)
      if (fileAnaliseRotas) formData.append('fileAnaliseRotas',fileAnaliseRotas)
      filesPonto.forEach(f => formData.append('filesPonto', f))

      const response = await executeCoordenadorPipeline(formData, 'coordenadores')

      if (!response.success) throw new Error(response.error)

      setLastResult(response.result)
      setProgress(100)
      addLog(`Consolidação concluída.`, 'success')

      toast({
        title      : 'Coordenadores — Processado',
        description: response.result.summary || 'Pipeline concluído com sucesso.',
      })
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error')
      setProgress(0)
      toast({ variant: 'destructive', title: 'Erro no Pipeline', description: error.message })
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <AlertTitle className="mb-0">Pipeline Coordenadores — Gestão Modular</AlertTitle>
        </div>
        <AlertDescription className="text-xs mt-2">
          Análise em 4 módulos: Desempenho, Ponto, Tempo Interno e Consolidação Final.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Arquivos e Metas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Ano</Label>
                  <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mês</Label>
                  <Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} className="h-9" />
                </div>
              </div>

              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y) }} currentMonth={month} currentYear={year} />

              <Separator />

              <div className="space-y-3">
                {singleFileRow('co-mot', 'Motoristas_Ajustado.xlsx', fileMotoristas, setFileMotoristas, 'relatorio_consolidado_Motoristas_Ajustado.xlsx')}
                {singleFileRow('co-aju', 'Ajudantes_Ajustado.xlsx', fileAjudantes, setFileAjudantes, 'relatorio_consolidado_Ajudantes_Ajustado.xlsx')}
              </div>

              {isExecuting && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[10px] font-bold text-primary uppercase">
                    <span>Processando</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t pt-4">
              <Button className="w-full" onClick={runPipeline} disabled={isExecuting || !canRun}>
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Processando...</> : <><Play className="mr-2" /> Iniciar Coordenadores</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-full flex flex-col border bg-slate-50 overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-muted/20 flex items-center gap-2">
              <FileCode className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Console</span>
            </div>
            <ScrollArea className="flex-1 p-4 font-mono text-[11px]">
              {logs.length === 0 ? <p className="text-muted-foreground italic">Aguardando início...</p> : logs.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
            </ScrollArea>
          </Card>
        </div>
      </div>

      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}
