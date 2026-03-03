"use client"

import * as React from "react"
import {
  Upload,
  Play,
  Trash2,
  FileCode,
  Files,
  Loader2,
  Download,
  PackageX,
  Info,
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

// ── Tipos esperados por arquivo ───────────────────────────────────────────
type TipoArquivo = 'controle' | 'faturamento' | 'motivos' | 'funcionarios'

interface ArquivoClassificado {
  file: File
  tipo: TipoArquivo
  label: string
}

const CLASSIFICACOES: Record<TipoArquivo, { label: string; desc: string; obrigatorio: boolean; cor: string }> = {
  controle:     { label: 'Controle Logístico',  desc: 'Consolidado_Entregas_V2_Geral.xlsx',  obrigatorio: true,  cor: 'bg-blue-100 text-blue-700 border-blue-200' },
  faturamento:  { label: 'Fat. Fechamento',      desc: 'Fat_Fechamento.xlsx',                 obrigatorio: true,  cor: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  motivos:      { label: 'Motivos Sistema',       desc: 'Motivos Sistema.xlsx (opcional)',      obrigatorio: false, cor: 'bg-amber-100 text-amber-700 border-amber-200' },
  funcionarios: { label: 'Funcionários',          desc: 'Funcionario.xlsx (opcional)',          obrigatorio: false, cor: 'bg-purple-100 text-purple-700 border-purple-200' },
}

function detectarTipo(nome: string): TipoArquivo {
  const n = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (n.includes('consolidado_entregas') || n.includes('controle') || n.includes('rota')) return 'controle'
  if (n.includes('fat_fechamento') || n.includes('faturamento') || n.startsWith('fat')) return 'faturamento'
  if (n.includes('motivos') || n.includes('sistema')) return 'motivos'
  if (n.includes('funcionario') || n.includes('cadastro')) return 'funcionarios'
  return 'controle'
}

// ─────────────────────────────────────────────────────────────────────────

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
    const prefixes = { info: '', error: '❌ [ERRO] ', success: '✅ [OK] ', warn: '⚠️ [AVISO] ' }
    setLogs(prev => [...prev, `[${ts}] ${prefixes[type]}${msg}`])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const novos: ArquivoClassificado[] = Array.from(e.target.files).map(f => ({
      file: f,
      tipo: detectarTipo(f.name),
      label: f.name,
    }))
    setArquivos(prev => {
      // mantém apenas um arquivo por tipo (substitui se já existia)
      const existentes = prev.filter(a => !novos.find(n => n.tipo === a.tipo))
      return [...existentes, ...novos]
    })
    e.target.value = ''
  }

  const removerArquivo = (tipo: TipoArquivo) => {
    setArquivos(prev => prev.filter(a => a.tipo !== tipo))
  }

  const arquivoPorTipo = (tipo: TipoArquivo) => arquivos.find(a => a.tipo === tipo)

  const runPipeline = async (downloadOnly = false) => {
    const arqControle    = arquivoPorTipo('controle')
    const arqFaturamento = arquivoPorTipo('faturamento')

    if (!arqControle || !arqFaturamento) {
      toast({ title: 'Arquivos obrigatórios ausentes', description: 'Controle Logístico e Fat. Fechamento são obrigatórios.', variant: 'destructive' })
      return
    }

    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog(`Iniciando Pipeline Devoluções — ${String(month).padStart(2,'0')}/${year}`)

    try {
      addLog(`Arquivos: ${arquivos.map(a => a.file.name).join(', ')}`, 'info')
      addLog(`Filtrando Controle Logístico por ${String(month).padStart(2,'0')}/${year}...`, 'info')

      setProgress(20)
      await new Promise(r => setTimeout(r, 200))

      addLog('Normalizando nomes de colaboradores...', 'info')
      setProgress(35)
      await new Promise(r => setTimeout(r, 200))

      addLog('Explodindo viagens e cruzando faturamento...', 'info')
      setProgress(55)

      const formData = new FormData()
      formData.append('year',  year.toString())
      formData.append('month', month.toString())
      arquivos.forEach(a => formData.append('files', a.file))

      addLog('Enviando dados ao servidor...', 'info')

      let response: any
      try {
        response = await executeDevolucoesPipeline(formData)
      } catch (networkErr: any) {
        addLog(`Erro de comunicação: ${networkErr?.message || String(networkErr)}`, 'error')
        throw networkErr
      }

      addLog(`Resposta recebida. Status: ${response?.success ? 'SUCESSO' : 'FALHA'}`, response?.success ? 'info' : 'warn')

      if (!response?.success) {
        const errMsg = response?.error || '(sem mensagem)'
        addLog(`Erro do servidor: ${errMsg}`, 'error')
        throw new Error(errMsg)
      }

      const result = response.result
      setLastResult(result)
      setProgress(100)

      addLog(`Colaboradores: ${result.data?.length ?? 0}`, 'success')
      addLog(`Detalhamento: ${result.detalhamento?.length ?? 0} registros`, 'success')

      if (downloadOnly) {
        addLog('Gerando Excel com Resumo + Detalhamento...', 'success')
        downloadMultipleSheets([
          { data: result.data         || [], name: 'Resumo_por_Colaborador' },
          { data: result.detalhamento || [], name: 'Detalhamento' },
        ], `Devolucoes_${String(month).padStart(2,'0')}_${year}`)
      } else {
        addLog('Dados salvos no Firebase.', 'success')
      }

      toast({
        title: downloadOnly ? 'Excel Gerado' : 'Concluído',
        description: result.summary || 'Pipeline de devoluções concluído.',
      })

    } catch (error: any) {
      const msg = error?.message || String(error)
      addLog(`FALHA GERAL: ${msg}`, 'error')
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('unexpected')) {
        addLog('Dica: Verifique os logs do servidor (500/404).', 'warn')
      }
      setProgress(0)
    } finally {
      setIsExecuting(false)
    }
  }

  // Ordena por obrigatório primeiro na exibição
  const tiposOrdem: TipoArquivo[] = ['controle', 'faturamento', 'motivos', 'funcionarios']

  return (
    <div className="space-y-6">
      <Alert className="bg-rose-50 border-rose-200">
        <div className="flex items-center gap-2">
          <PackageX className="size-4 text-rose-600" />
          <AlertTitle className="mb-0 text-rose-900">Análise de Devoluções</AlertTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Cruza o Controle Logístico com o faturamento para calcular o percentual de devoluções por colaborador, excluindo motivos de sistema.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AlertDescription className="text-sm mt-2 text-rose-800">
          Calcula <strong>% Venda Devolvida</strong> e <strong>% NFes Devolvidas</strong> por colaborador.
          Devoluções por motivos do sistema são automaticamente excluídas.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageX className="size-5 text-rose-600" />
                Configuração de Devoluções
              </CardTitle>
              <CardDescription>Cruzamento Controle Logístico × Faturamento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Período */}
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

              {/* Upload por tipo de arquivo */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Arquivos de Entrada</Label>
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('file-upload-dev')?.click()}>
                    <Upload className="mr-2 size-4" /> Adicionar Arquivos
                  </Button>
                  <input
                    id="file-upload-dev"
                    type="file"
                    multiple
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tiposOrdem.map(tipo => {
                    const cfg     = CLASSIFICACOES[tipo]
                    const arquivo = arquivoPorTipo(tipo)
                    return (
                      <div
                        key={tipo}
                        className={`rounded-lg border p-3 flex items-start gap-3 transition-all ${
                          arquivo ? 'bg-white border-green-200' : 'bg-muted/20 border-dashed'
                        }`}
                      >
                        <div className="mt-0.5">
                          {arquivo
                            ? <CheckCircle2 className="size-4 text-green-500" />
                            : <Circle className={`size-4 ${cfg.obrigatorio ? 'text-rose-400' : 'text-muted-foreground/40'}`} />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium">{cfg.label}</span>
                            {cfg.obrigatorio && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-rose-600 border-rose-300">obrigatório</Badge>
                            )}
                          </div>
                          {arquivo ? (
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{arquivo.file.name}</span>
                              <Button
                                variant="ghost" size="icon"
                                className="size-6 p-0 hover:bg-destructive/10"
                                onClick={() => removerArquivo(tipo)}
                              >
                                <Trash2 className="size-3 text-destructive/70" />
                              </Button>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground mt-0.5 italic">{cfg.desc}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Regras de negócio visíveis */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">⚠️ Regras de negócio:</p>
                <p>• Devoluções identificadas por <code>FATURAMENTO_DEV &gt; 0</code></p>
                <p>• Sem arquivo <em>Motivos Sistema</em>: todas as devoluções são ignoradas por padrão</p>
                <p>• Viagens concatenadas <em>("67712/67715")</em> são automaticamente separadas</p>
                <p>• Chaves de viagem normalizadas (zeros à esquerda removidos)</p>
              </div>

              {isExecuting && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-rose-600">
                    <span>Processando Devoluções</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-6 flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                onClick={() => runPipeline(true)}
                disabled={isExecuting || !arquivoPorTipo('controle') || !arquivoPorTipo('faturamento')}
              >
                <Download className="mr-2 size-4" /> Exportar Excel
              </Button>
              <Button
                className="flex-[2] h-12 text-base font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md"
                onClick={() => runPipeline(false)}
                disabled={isExecuting || !arquivoPorTipo('controle') || !arquivoPorTipo('faturamento')}
              >
                {isExecuting
                  ? <><Loader2 className="mr-2 animate-spin" /> Processando...</>
                  : <><Play className="mr-2 fill-current" /> Salvar</>
                }
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Console */}
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
                  <p>Aguardando arquivos de devoluções.</p>
                  <div className="text-[10px] border-l-2 pl-2 mt-4">
                    <strong>Arquivos obrigatórios:</strong><br />
                    • Consolidado_Entregas_V2_Geral.xlsx<br />
                    • Fat_Fechamento.xlsx<br />
                    <br />
                    <strong>Opcionais:</strong><br />
                    • Motivos Sistema.xlsx<br />
                    • Funcionario.xlsx
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`
                      ${log.includes('[ERRO]')  ? 'text-destructive font-semibold' :
                        log.includes('[OK]')    ? 'text-green-600' :
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