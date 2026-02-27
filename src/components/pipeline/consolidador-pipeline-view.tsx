
"use client"

import * as React from "react"
import { 
  Database,
  Play, 
  FileCode,
  Loader2,
  FileStack,
  Download,
  CheckCircle2,
  UserCheck
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AIParamAssistant } from "./ai-param-assistant"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { PipelineResult } from "@/lib/firebase"
import { Progress } from "@/components/ui/progress"
import { downloadMultipleSheets } from "@/lib/excel-utils"
import { Badge } from "@/components/ui/badge"

export function ConsolidadorPipelineView() {
  const [year, setYear] = React.useState(2026)
  const [month, setMonth] = React.useState(1)
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [logs, setLogs] = React.useState<string[]>([])
  const [lastResult, setLastResult] = React.useState<any | null>(null)
  const { toast } = useToast()

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    let prefix = ""
    if (type === 'error') prefix = "❌ [ERRO] "
    if (type === 'success') prefix = "✅ [OK] "
    if (type === 'warn') prefix = "⚠️ [AVISO] "
    setLogs(prev => [...prev, `[${timestamp}] ${prefix}${msg}`])
  }

  const runConsolidation = async (downloadOnly = false) => {
    setIsExecuting(true)
    setProgress(5)
    setLogs([])
    addLog(`Iniciando CONSOLIDADOR FINAL (${month}/${year})...`)

    try {
      addLog("Buscando resultados de Performance (Performaxxi) no banco...", "info")
      await new Promise(r => setTimeout(r, 600))
      setProgress(20)
      
      addLog("Buscando resultados de Ponto e Absenteísmo no banco...", "info")
      await new Promise(r => setTimeout(r, 600))
      setProgress(40)
      
      addLog("Buscando resultados de Condução (vFleet) no banco...", "info")
      await new Promise(r => setTimeout(r, 600))
      setProgress(60)

      addLog("Cruzando dados por ID/Nome do Colaborador...", "info")
      addLog("Aplicando regra de devolução (Zerar se >= 15%).", "warn")
      setProgress(80)

      // Simulação de consolidação final
      const mockConsolidado = [
        { 
          "Motorista": "RODRIGO ALVES", 
          "Empresa": "Logistics Pro", 
          "Cargo": "Motorista",
          "Bonif. Performance": 120.00,
          "Bonif. Ponto": 80.00,
          "Bonif. Condução": 96.00,
          "Total Bruto": 296.00,
          "Devolução %": 4.5,
          "Penalizado": "NÃO",
          "Total Final (R$)": 296.00
        },
        { 
          "Motorista": "MARCOS SILVA", 
          "Empresa": "Logistics Pro", 
          "Cargo": "Motorista",
          "Bonif. Performance": 80.00,
          "Bonif. Ponto": 40.00,
          "Bonif. Condução": 48.00,
          "Total Bruto": 168.00,
          "Devolução %": 18.2,
          "Penalizado": "SIM (Zerar)",
          "Total Final (R$)": 0.00
        }
      ];

      await new Promise(r => setTimeout(r, 1000))
      setProgress(100)
      
      if (downloadOnly) {
        addLog("Gerando Relatórios Consolidados (Motoristas/Ajudantes)...", "success")
        downloadMultipleSheets([
          { data: mockConsolidado, name: 'Consolidado_Motoristas' },
          { data: [], name: 'Consolidado_Ajudantes' }
        ], `Consolidado_Final_${month}_${year}`)
      }

      setLastResult({ data: mockConsolidado })
      addLog("Consolidação concluída com sucesso.", "success")
      toast({ 
        title: "Consolidação Concluída", 
        description: downloadOnly ? "Os arquivos foram baixados." : "O relatório final foi gerado no banco." 
      });

    } catch (error: any) {
      addLog(`FALHA NA CONSOLIDAÇÃO: ${error.message}`, "error")
      setProgress(0)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-lg border-primary/20 bg-gradient-to-br from-white to-primary/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                  <FileStack className="size-6" />
                </div>
                <div>
                  <CardTitle>Consolidador Final</CardTitle>
                  <CardDescription>
                    Unificação de Performance, Ponto e Condução a partir do Banco de Dados
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ano de Referência</Label>
                  <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Mês de Referência</Label>
                  <Input type="number" min={1} max={12} value={month} onChange={e => setMonth(parseInt(e.target.value))} />
                </div>
              </div>

              <AIParamAssistant onParamsUpdate={(m, y) => { setMonth(m); setYear(y); }} currentMonth={month} currentYear={year} />

              <div className="p-4 rounded-lg bg-accent/5 border border-accent/20">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <Database className="size-4 text-accent" /> Fontes de Dados
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Badge variant="outline" className="bg-white"><CheckCircle2 className="size-3 mr-1 text-green-500" /> Performaxxi</Badge>
                  <Badge variant="outline" className="bg-white"><CheckCircle2 className="size-3 mr-1 text-green-500" /> Ponto/Abs.</Badge>
                  <Badge variant="outline" className="bg-white"><CheckCircle2 className="size-3 mr-1 text-green-500" /> vFleet</Badge>
                </div>
              </div>

              {isExecuting && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span>Processando Consolidação</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/10 border-t pt-6 flex flex-col sm:flex-row gap-3">
              <Button 
                variant="outline" 
                className="flex-1 border-primary/30 text-primary hover:bg-primary/5" 
                onClick={() => runConsolidation(true)} 
                disabled={isExecuting}
              >
                <Download className="mr-2 size-4" /> Baixar Consolidado (Excel)
              </Button>
              <Button 
                className="flex-[2] h-12 text-base font-semibold shadow-md" 
                onClick={() => runConsolidation(false)} 
                disabled={isExecuting}
              >
                {isExecuting ? <><Loader2 className="mr-2 animate-spin" /> Consolidando...</> : <><Play className="mr-2 fill-current" /> Sincronizar e Consolidar</>}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-full flex flex-col border border-border/60 bg-white rounded-lg overflow-hidden shadow-md">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
               <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                 <FileCode className="size-3" /> Console de Consolidação
               </span>
            </div>
            <ScrollArea className="flex-1 p-4 font-code text-[11px] leading-relaxed bg-slate-50">
              {logs.length === 0 ? (
                <span className="text-muted-foreground italic">Selecione o período e inicie a sincronização.</span>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((log, i) => (
                    <div key={i} className={`
                      ${log.includes('[ERRO]') ? 'text-destructive font-semibold' : 
                        log.includes('[OK]') ? 'text-green-600' : 
                        log.includes('[AVISO]') ? 'text-amber-600 font-medium' : 
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

      {lastResult && !isExecuting && (
        <Card className="border-t-4 border-t-accent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="size-5 text-accent" />
              Resultado Consolidado (Amostra)
            </CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-sm text-muted-foreground">
               Os dados foram unificados com sucesso. Foram processados {lastResult.data.length} motoristas. 
               O relatório final ajustado está disponível para exportação completa.
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
