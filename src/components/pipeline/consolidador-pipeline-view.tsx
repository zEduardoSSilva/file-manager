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
      addLog("Buscando resultados no banco...", "info")
      await new Promise(r => setTimeout(r, 1000))
      setProgress(50)
      
      const mockConsolidado = [
        { "Motorista": "RODRIGO ALVES", "Empresa": "Logistics Pro", "Bonif. Total": 296.00, "Penalizado": "NÃO" },
        { "Motorista": "MARCOS SILVA", "Empresa": "Logistics Pro", "Bonif. Total": 0.00, "Penalizado": "SIM" }
      ];

      if (downloadOnly) {
        downloadMultipleSheets([{ data: mockConsolidado, name: 'Consolidado' }], `Consolidado_Final_${month}_${year}`)
      }

      setLastResult({ data: mockConsolidado })
      setProgress(100)
      addLog("Concluído.", "success")
      toast({ title: "Consolidação Concluída" })
    } catch (error: any) {
      addLog(`Falha: ${error.message}`, "error")
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
                  <CardDescription>Fechamento de folha integrado.</CardDescription>
                </div>
              </div>
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

              {isExecuting && <Progress value={progress} className="h-1.5" />}
            </CardContent>
            <CardFooter className="border-t pt-6 gap-3">
              <Button variant="outline" className="flex-1" onClick={() => runConsolidation(true)} disabled={isExecuting}>
                Excel
              </Button>
              <Button className="flex-[2]" onClick={() => runConsolidation(false)} disabled={isExecuting}>
                {isExecuting ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2" />} Sincronizar
              </Button>
            </CardFooter>
          </Card>
        </div>

        <Card className="h-full bg-slate-50 p-4 font-mono text-[10px]">
          {logs.length === 0 ? "Aguardando..." : logs.map((l, i) => <div key={i}>{l}</div>)}
        </Card>
      </div>
    </div>
  )
}
