"use client"

import * as React from "react"
import { Play, Trash2, FileCode, Loader2, FileSpreadsheet, HelpCircle, CheckCircle2, XCircle, GitMerge, Layers, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { DataViewer } from "../../pages/Data-Viewer"
import { executeMercaneteRoadshowPipeline } from "@/app/actions/import-mercanete-roadshow-actions"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"

const FASES = [
  { num: '01', label: 'Preparação',  desc: 'clean_digits · Semana_Ano',                   color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200'    },
  { num: '02', label: 'Lookups',     desc: 'LK1 Ped+Emp · LK2 NPed+Emp · LK3 Cli+Sem',   color: 'text-violet-600',  bg: 'bg-violet-50 border-violet-200' },
  { num: '03', label: 'Matching',    desc: 'Left-merge + coalescência por prioridade',     color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200'   },
  { num: '04', label: 'Propagação',  desc: 'Propaga status no grupo Cliente+Emp+Semana',   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200'},
]

export function MercaneteRoadshowPipelineView() {
  const [fileMercante, setFileMercante] = React.useState<File | null>(null)
  const [fileRoadshow, setFileRoadshow] = React.useState<File | null>(null)
  const [isExecuting,  setIsExecuting]  = React.useState(false)
  const [progress,     setProgress]     = React.useState(0)
  const [logs,         setLogs]         = React.useState<string[]>([])
  const [lastResult,   setLastResult]   = React.useState<PipelineResult | null>(null)
  const { toast } = useToast()

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const ts     = new Date().toLocaleTimeString('pt-BR')
    const prefix = type === 'error' ? '❌ [ERRO] ' : type === 'success' ? '✅ [OK] ' : type === 'warn' ? '⚠️ [AVISO] ' : ''
    setLogs(prev => [...prev, `[${ts}] ${prefix}${msg}`])
  }

  const canRun = !!(fileMercante && fileRoadshow)

  const runPipeline = async () => {
    if (!canRun) return
    setIsExecuting(true); setProgress(5); setLogs([])
    addLog('Iniciando Mercanete × Roadshow — Matching com Prioridade')
    try {
      const fd = new FormData()
      fd.append('fileMercante', fileMercante!)
      fd.append('fileRoadshow', fileRoadshow!)
      setProgress(15); addLog('Fase 01 — Preparando dados (clean_digits, Semana_Ano)...')
      setProgress(35); addLog('Fase 02 — Criando Lookups LK1 · LK2 · LK3...')
      setProgress(60); addLog('Fase 03 — Matching + coalescência (LK1 > LK2 > LK3)...')
      setProgress(80); addLog('Fase 04 — Propagando Status_RoadShow por grupo...')
      setProgress(92)
      const response = await executeMercaneteRoadshowPipeline(fd)
      if (!response.success) throw new Error(response.error)
      setLastResult(response.result); setProgress(100)
      const rm = response.result.resumoMatch ?? {}
      const mv = (rm as any).matchVia ?? {}
      addLog(`Total: ${rm.total ?? 0} | Com match: ${rm.comMatch ?? 0} (${rm.percMatch ?? 0}%)`, 'success')
      if ((rm.semMatch ?? 0) > 0) addLog(`Sem match: ${rm.semMatch}`, 'warn')
      addLog(`LK1:${mv.lk1 ?? 0} LK2:${mv.lk2 ?? 0} LK3:${mv.lk3 ?? 0} Prop:${mv.propagado ?? 0}`, 'info')
      addLog(`Firebase ID: ${response.result.id}`, 'success')
      toast({ title: 'Mercanete × Roadshow — Concluído', description: response.result.summary || "Análise concluída." })
    } catch (error: any) {
      addLog(`FALHA: ${error.message}`, 'error'); setProgress(0)
      toast({ variant: 'destructive', title: 'Erro no Pipeline', description: error.message })
    } finally { setIsExecuting(false) }
  }

  const rm  = lastResult?.resumoMatch as any
  const mv  = rm?.matchVia as any
  const cfg = lastResult?.config as any
  const showStats = rm && !isExecuting

  const fileRow = (id: string, label: string, hint: string, file: File | null, setFile: (f: File | null) => void, accent = 'text-blue-500') => (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-white hover:bg-muted/10 transition-colors">
      <FileSpreadsheet className={`size-3.5 shrink-0 ${accent}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold truncate">{label}</span>
          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">obrigatório</Badge>
        </div>
        {file ? <span className="text-[11px] text-primary font-medium truncate block">{file.name}</span>
              : <span className="text-[11px] text-muted-foreground italic truncate block">{hint}</span>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {file && <Button variant="ghost" size="icon" className="size-6" onClick={() => setFile(null)}><Trash2 className="size-3 text-destructive" /></Button>}
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => document.getElementById(id)?.click()}>{file ? 'Trocar' : 'Selecionar'}</Button>
      </div>
      <input id={id} type="file" className="hidden" accept=".xlsx,.xls" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = '' }} />
    </div>
  )

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-hidden">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <GitMerge className="size-4 text-primary" />
          <AlertTitle className="mb-0">Análise Mercanete × Roadshow — Matching com Prioridade</AlertTitle>
          <TooltipProvider><Tooltip><TooltipTrigger asChild><HelpCircle className="size-4 text-muted-foreground cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs"><p>3 lookups em cascata: LK1 Pedido+Empresa → LK2 NPedido+Empresa → LK3 Cliente+Empresa+Semana. Após merge, propaga por grupo.</p></TooltipContent>
          </Tooltip></TooltipProvider>
        </div>
        <AlertDescription className="text-xs mt-2">STATUS_PEDIDOS_MERCANTE × STATUS_PEDIDOS_ROADSHOW · Coalescência por prioridade · Propagação por semana.</AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {FASES.map((f, i) => (
          <div key={f.num} className={`rounded-lg border p-3 ${f.bg}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-black tracking-widest ${f.color}`}>MOD {f.num}</span>
              {i < FASES.length - 1 && <ArrowRight className={`size-3 ${f.color} ml-auto`} />}
            </div>
            <p className={`text-xs font-bold ${f.color} mb-1`}>{f.label}</p>
            <p className="text-[10px] text-muted-foreground leading-snug">{f.desc}</p>
          </div>
        ))}
      </div>

      {showStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',      value: rm.total,                            color: 'text-foreground'  },
            { label: 'Com match',  value: `${rm.comMatch} (${rm.percMatch}%)`, color: 'text-green-600',  icon: <CheckCircle2 className="size-3" /> },
            { label: 'Sem match',  value: rm.semMatch,                         color: 'text-red-500',    icon: <XCircle className="size-3" /> },
            { label: 'Propagados', value: mv?.propagado ?? 0,                  color: 'text-violet-600', icon: <Layers className="size-3" /> },
          ].map(s => (
            <div key={s.label} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className={`text-xs font-medium flex items-center gap-1 ${s.color}`}>{(s as any).icon}{s.label}</div>
              <div className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Arquivos de Entrada</CardTitle>
              <CardDescription className="text-xs">Base MERCANTE (left) e Roadshow (lookup)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-blue-100 flex items-center justify-center"><FileSpreadsheet className="size-3 text-blue-600" /></div>
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Base Principal (Mercante)</span>
                </div>
                <div className="pl-7">{fileRow('mr-mercante','STATUS_PEDIDOS_MERCANTE.xlsx','REL. MERCANETE / STATUS_PEDIDOS_MERCANTE.xlsx',fileMercante,setFileMercante,'text-blue-500')}</div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="size-5 rounded-full bg-violet-100 flex items-center justify-center"><FileSpreadsheet className="size-3 text-violet-600" /></div>
                  <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">Lookups (Roadshow)</span>
                </div>
                <div className="pl-7">{fileRow('mr-roadshow','STATUS_PEDIDOS_ROADSHOW.xlsx','REL. ROADSHOW / STATUS_PEDIDOS_ROADSHOW.xlsx',fileRoadshow,setFileRoadshow,'text-violet-500')}</div>
              </div>
              <Alert className="bg-muted/30 border-muted py-2.5 px-3">
                <AlertDescription className="text-[10px] text-muted-foreground space-y-1">
                  <div className="font-semibold text-foreground mb-1.5">3 Lookups em Cascata</div>
                  <div className="space-y-0.5">
                    {[['LK1','bg-blue-500','Pedido + Empresa → Nome da Rota (prioridade máxima)'],
                      ['LK2','bg-violet-500','Nº do Pedido + Empresa → fallback por campo alternativo'],
                      ['LK3','bg-amber-500','Cliente + Empresa + Semana → fallback temporal'],
                      ['PROP','bg-emerald-500','Propaga para pedidos do mesmo grupo sem match direto'],
                    ].map(([lbl, cls, desc]) => (
                      <div key={lbl} className="flex items-start gap-1.5">
                        <Badge className={`text-[8px] px-1 h-3.5 ${cls} shrink-0`}>{lbl}</Badge>
                        <span>{desc}</span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
              {isExecuting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-primary uppercase"><span>Processando Fases</span><span>{progress}%</span></div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/5 border-t pt-4">
              <Button className="w-full h-12 bg-primary text-white font-bold text-base shadow-md disabled:opacity-50" onClick={runPipeline} disabled={isExecuting || !canRun}>
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" />Processando Fases...</> : <><Play className="mr-2 fill-current" />Iniciar Matching Mercanete × Roadshow</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-full flex flex-col border bg-slate-50 overflow-hidden shadow-sm">
            <div className="p-3 border-b bg-muted/20 flex items-center gap-2">
              <FileCode className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Console</span>
              {logs.length > 0 && <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0">{logs.length}</Badge>}
            </div>
            <ScrollArea className="flex-1 p-4 font-mono text-[11px] leading-relaxed">
              {logs.length === 0
                ? <p className="text-muted-foreground italic">Aguardando MERCANTE e ROADSHOW...</p>
                : <div className="space-y-1">{logs.map((log, i) => (
                    <div key={i} className={log.includes('[ERRO]') ? 'text-destructive' : log.includes('[OK]') ? 'text-green-600' : log.includes('[AVISO]') ? 'text-amber-600' : 'text-slate-500'}>{log}</div>
                  ))}</div>}
            </ScrollArea>
            <div className="p-3 border-t bg-muted/10 space-y-1">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Status</p>
              {[['STATUS_PEDIDOS_MERCANTE', fileMercante], ['STATUS_PEDIDOS_ROADSHOW', fileRoadshow]].map(([label, file]) => (
                <div key={label as string} className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full shrink-0 ${file ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span className={`text-[10px] truncate ${file ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>{label as string}</span>
                  {!file && <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3 ml-auto shrink-0">req.</Badge>}
                </div>
              ))}
              {cfg && (
                <div className="pt-2 border-t space-y-0.5">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Lookups criados</p>
                  <div className="text-[10px] text-muted-foreground grid grid-cols-2 gap-x-2">
                    <span>LK1: <span className="font-medium text-foreground">{cfg.lk1Size}</span></span>
                    <span>LK2: <span className="font-medium text-foreground">{cfg.lk2Size}</span></span>
                    <span>LK3: <span className="font-medium text-foreground">{cfg.lk3Size}</span></span>
                    <span>Road: <span className="font-medium text-foreground">{cfg.roadRows}</span></span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {lastResult && !isExecuting && <DataViewer result={lastResult} />}
    </div>
  )
}