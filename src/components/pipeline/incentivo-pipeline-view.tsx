"use client"

import * as React from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts"
import {
  Users, DollarSign, TrendingUp, TrendingDown, Target, FileText,
  Loader2, Filter, Download, Info, CheckCircle, AlertTriangle,
  ServerCrash, RefreshCw,
} from "lucide-react"
import { db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { exportExcel } from "@/lib/excel-utils"
import { collection, doc, getDocs, setDoc, writeBatch } from "firebase/firestore"
import { trackRead, trackWrite } from "@/lib/firebaseUsageTracker"
import { loadItemsFromFirebase, mainDocId } from "@/app/actions/actions-utils"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface IncentivoRow {
  _itemId?:          string
  COLABORADOR:      string
  FILIAL:           string
  CARGO:            "MOTORISTA" | "AJUDANTE"
  FATURAMENTO:      number
  FATURAMENTO_DEV:  number
  ENTREGAS:         number
  ENTREGAS_DEV:     number
  PERC_DEV_FAT:     number
  PERC_DEV_ENT:     number
  PERC_ABSENTEISMO: number
  PERC_VFLEET:      number
  PERC_PERFORMAXXI: number
}

// Status de cada fonte de dados
interface FonteStatus {
  id:        string
  label:    string
  carregada: boolean
  linhas:   number
  cor:      string
}

const FONTES_DE_DADOS: FonteStatus[] = [
  { id: 'entregas',    label: 'Entregas (Faturamento)', carregada: false, linhas: 0, cor: 'bg-blue-500' },
  { id: 'ponto',       label: 'Controle de Ponto',      carregada: false, linhas: 0, cor: 'bg-purple-500' },
  { id: 'vfleet',      label: 'vFleet (Motoristas)',    carregada: false, linhas: 0, cor: 'bg-orange-500' },
  { id: 'performaxxi', label: 'Performaxxi (Ajudantes)',carregada: false, linhas: 0, cor: 'bg-teal-500' },
  { id: 'funcionarios',label: 'Cadastro Funcionários',  carregada: false, linhas: 0, cor: 'bg-slate-500' },
]

export function IncentivoPipelineView() {
  const { toast } = useToast()
  const today = new Date()

  const [filterYear,  setFilterYear]  = React.useState(today.getFullYear())
  const [filterMonth, setFilterMonth] = React.useState(today.getMonth() + 1)
  
  const [fontes, setFontes] = React.useState<FonteStatus[]>(FONTES_DE_DADOS)
  const [isExecuting, setIsExecuting] = React.useState(false)
  const [results, setResults] = React.useState<IncentivoRow[]>([])
  const [logs, setLogs] = React.useState<string[]>([])

  const addLog = (msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    let prefix = ""
    if (type === 'error') prefix = "❌ [ERRO] "
    if (type === 'success') prefix = "✅ [OK] "
    if (type === 'warn') prefix = "⚠️ [AVISO] "
    setLogs(prev => [`[${timestamp}] ${prefix}${msg}`, ...prev])
  }
  
  const runCalculo = async () => {
    setIsExecuting(true)
    setLogs([])
    setResults([])
    setFontes(FONTES_DE_DADOS.map(f => ({ ...f, carregada: false, linhas: 0 })))
    addLog(`Iniciando cálculo de incentivos para ${filterMonth}/${filterYear}...`, 'success')

    try {
      // 1. Carregar Funcionários
      addLog("Carregando cadastro de funcionários...")
      const funcSnap = await getDocs(collection(db, "docs_funcionarios"))
      trackRead(funcSnap.size)
      const funcionarios = funcSnap.docs.map(d => d.data())
      setFontes(prev => prev.map(f => f.id === 'funcionarios' ? { ...f, carregada: true, linhas: funcionarios.length } : f))
      addLog(`${funcionarios.length} funcionários carregados.`)

      // 2. Carregar Entregas (que já contém faturamento)
      addLog("Carregando dados de Entregas/Faturamento...")
      const entregas = await loadItemsFromFirebase("consolidacao-entregas", filterYear, filterMonth)
      setFontes(prev => prev.map(f => f.id === 'entregas' ? { ...f, carregada: true, linhas: entregas.length } : f))
      addLog(`${entregas.length} registros de entrega carregados.`)
      
      // MOCK: Simular os outros pipelines por enquanto
      setFontes(prev => prev.map(f => f.id === 'ponto' ? { ...f, carregada: true, linhas: 120 } : f))
      setFontes(prev => prev.map(f => f.id === 'vfleet' ? { ...f, carregada: true, linhas: 50 } : f))
      setFontes(prev => prev.map(f => f.id === 'performaxxi' ? { ...f, carregada: true, linhas: 70 } : f))

      // LÓGICA DE CÁLCULO (Exemplo)
      // Aqui entraria a lógica real de join e cálculo
      const mockResults: IncentivoRow[] = [
        { COLABORADOR: "RODRIGO ALVES", FILIAL: "CAMBE", CARGO: "MOTORISTA", FATURAMENTO: 50000, FATURAMENTO_DEV: 1200, ENTREGAS: 450, ENTREGAS_DEV: 10, PERC_DEV_FAT: 0.024, PERC_DEV_ENT: 0.022, PERC_ABSENTEISMO: 0, PERC_VFLEET: 0.95, PERC_PERFORMAXXI: 0 },
        { COLABORADOR: "MARCOS SILVA", FILIAL: "CASCAVEL", CARGO: "AJUDANTE", FATURAMENTO: 0, FATURAMENTO_DEV: 0, ENTREGAS: 480, ENTREGAS_DEV: 25, PERC_DEV_FAT: 0, PERC_DEV_ENT: 0.052, PERC_ABSENTEISMO: 0.05, PERC_VFLEET: 0, PERC_PERFORMAXXI: 0.88 },
      ]
      
      addLog(`Cálculo de exemplo finalizado. ${mockResults.length} colaboradores processados.`, 'success')
      setResults(mockResults)

      toast({
        title: "Cálculo Concluído",
        description: `Os incentivos para ${filterMonth}/${filterYear} foram calculados.`,
      })

    } catch (e: any) {
      addLog(e.message, 'error')
      toast({ variant: "destructive", title: "Erro no cálculo", description: e.message })
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Target className="size-5 text-primary" /> Painel de Incentivos</CardTitle>
              <CardDescription>Cálculo e análise de performance de Motoristas e Ajudantes.</CardDescription>
            </div>
            <Button onClick={runCalculo} disabled={isExecuting}>
              {isExecuting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Calcular Incentivos
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Ano</Label>
              <Input type="number" className="w-24 h-8 text-xs" value={filterYear} onChange={e => setFilterYear(+e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Mês</Label>
              <Input type="number" min={1} max={12} className="w-20 h-8 text-xs" value={filterMonth} onChange={e => setFilterMonth(+e.target.value)} /></div>
          </div>
          
          <div className="grid grid-cols-5 gap-3 pt-2">
            {fontes.map(fonte => (
              <div key={fonte.id} className={cn(
                "p-3 rounded-lg border flex items-center gap-3 transition-all",
                fonte.carregada ? "bg-emerald-50 border-emerald-200" : "bg-muted/30"
              )}>
                <div className={cn("size-2 rounded-full", fonte.carregada ? fonte.cor : "bg-slate-400")} />
                <div>
                  <p className={cn("text-xs font-semibold", fonte.carregada ? "text-emerald-800" : "text-muted-foreground")}>{fonte.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{fonte.linhas > 0 ? `${fonte.linhas} regs` : "---"}</p>
                </div>
              </div>
            ))}
          </div>

        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
           <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Resultados do Cálculo</CardTitle>
            </CardHeader>
            <CardContent>
              {isExecuting && !results.length ? (
                <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /><span className="text-sm">Calculando...</span></div>
              ) : !results.length ? (
                 <div className="py-10 text-center"><ServerCrash className="size-7 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhum resultado. Clique em "Calcular".</p></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead className="text-right">Fat. (R$)</TableHead>
                      <TableHead className="text-right">% Dev.</TableHead>
                      <TableHead className="text-right">% Abs.</TableHead>
                      <TableHead className="text-right">% vFleet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.COLABORADOR}</TableCell>
                        <TableCell>{row.CARGO}</TableCell>
                        <TableCell className="text-right">{row.FATURAMENTO.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{(row.PERC_DEV_FAT * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{(row.PERC_ABSENTEISMO * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">{(row.PERC_VFLEET * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
           </Card>
        </div>
        <Card className="h-full bg-slate-900 text-white font-mono text-[11px] p-0 flex flex-col">
          <CardHeader className="py-2 px-3 border-b border-slate-700">
            <CardTitle className="text-xs text-slate-300">Log de Execução</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {logs.length === 0 && <span className="text-slate-500">Aguardando execução...</span>}
              {logs.map((l, i) => <div key={i} className={
                l.includes("❌") ? "text-red-400" : l.includes("✅") ? "text-green-400" : "text-slate-400"
              }>{l}</div>)}
            </div>
          </ScrollArea>
        </Card>
      </div>

    </div>
  )
}
