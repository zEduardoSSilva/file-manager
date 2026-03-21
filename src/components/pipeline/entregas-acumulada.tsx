"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  Loader2, Search, Database, FileDown, Columns3, Undo2, ChevronDown, Check, X,
  Info, WifiOff, HardDrive, Upload, Zap, AlertTriangle, ChevronRight, ChevronsRight, Layers, LayoutGrid,
  LineChart, BarChartBig, Group, Route, Building2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { exportExcel } from "@/lib/excel-utils"
import { mainDocId, loadItemsFromFirebase } from "@/app/actions/actions-utils"
import { getAcumuladaCacheKey, getFromCache, setInCache, clearCacheEntry } from "@/lib/data-cache"
import { getFirebaseConnectionStatus, toggleFirebaseConnection } from "@/lib/firebase-connection"
import { getStoragePayload, StoragePayload } from "@/lib/analitica-storage"

const h = React.createElement

const ALL_FIELDS = [
  "FILIAL", "REGIÃO", "CATEGORIA_ORIGEM", "DESTINO", "MOTORISTA", "AJUDANTE", "AJUDANTE 2", "PLACA SISTEMA", "PLACA", "MODELO", "OCP",
  "STATUS", "CONTRATO", "ENTREGAS", "PESO", "TEMPO", "KM", "VIAGENS", "VALOR", "SAÍDA",
  "CHAPA", "FRETE", "DESCARGA PALET", "HOSPEDAGEM", "DIARIA", "EXTRA", "OBSERVAÇÃO", "PERFORMAXXI", "ENTREGAS DEV", "VALOR DEV",
]

const NUMERIC_FIELDS = new Set([
  "ENTREGAS", "PESO", "TEMPO", "KM", "VIAGENS", "VALOR",
  "CHAPA", "FRETE", "DESCARGA PALET", "HOSPEDAGEM", "DIARIA", "EXTRA",
  "PERFORMAXXI", "ENTREGAS DEV", "VALOR DEV",
])

const INITIAL_GROUP_COLS = ["FILIAL", "REGIÃO", "CATEGORIA_ORIGEM", "MOTORISTA"]
const INITIAL_DISPLAY_COLS = ["ENTREGAS", "PESO", "KM", "VIAGENS", "VALOR"]

// Detecta o período mais recente no buffer local para usar como default
const getInitialPeriod = () => {
  try {
    let latestY = 0
    let latestM = 0
    let latestTimestamp = 0

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const match = key.match(/^analitica-buffer-(\d{4})-(\d{1,2})$/)
      if (match) {
        const payloadStr = localStorage.getItem(key)
        if (payloadStr) {
          const payload = JSON.parse(payloadStr) as StoragePayload
          if (payload.savedAt > latestTimestamp) {
            latestTimestamp = payload.savedAt
            latestY = parseInt(match[1], 10)
            latestM = parseInt(match[2], 10)
          }
        }
      }
    }
    if (latestY && latestM) {
      return { year: latestY, month: latestM }
    }
  } catch (e) {
    console.error("Falha ao ler período inicial do localStorage", e)
  }
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}


function toNum(v: any): number {
  if (v == null || v === "") return 0
  if (typeof v === "number") return v
  try { return parseFloat(String(v).replace(",", ".")) } catch { return 0 }
}

function GroupingDialog({ open, onClose, groupCols, setGroupCols, displayCols, setDisplayCols }: {
  open: boolean; onClose: () => void
  groupCols: string[]; setGroupCols: (v: string[]) => void
  displayCols: string[]; setDisplayCols: (v: string[]) => void
}) {
  const toggle = (list: string[], setList: (v: string[]) => void, col: string) => {
    setList(list.includes(col) ? list.filter(c => c !== col) : [...list, col])
  }

  const renderList = (cols: string[], list: string[], setList: (v: string[]) => void) => (
    <div className="grid grid-cols-3 gap-1.5">
      {cols.map(col => (
        <label key={col} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors cursor-pointer",
          list.includes(col)
            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
            : "bg-muted/30 hover:bg-muted/60 border border-transparent"
        )}>
          <Checkbox checked={list.includes(col)} onCheckedChange={() => toggle(list, setList, col)} className="size-3.5" />
          {col}
        </label>
      ))}
    </div>
  )

  const availableGroupCols = ALL_FIELDS.filter(f => !NUMERIC_FIELDS.has(f))
  const availableDisplayCols = ALL_FIELDS.filter(f => NUMERIC_FIELDS.has(f))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><Group className="size-4 text-primary" /> Gerenciar Agrupamento</DialogTitle>
          <DialogDescription>Escolha os campos para agrupar e os que serão somados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1 py-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><Route className="size-3.5" /> Campos de Agrupamento (Chave)</h3>
            {renderList(availableGroupCols, groupCols, setGroupCols)}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><LineChart className="size-3.5" /> Campos de Exibição (Soma)</h3>
            {renderList(availableDisplayCols, displayCols, setDisplayCols)}
          </div>
        </div>
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setGroupCols(INITIAL_GROUP_COLS); setDisplayCols(INITIAL_DISPLAY_COLS) }}><Undo2 className="size-3.5" /> Padrão</Button>
          <DialogClose asChild><Button size="sm" className="gap-1.5"><Check className="size-3.5" /> Fechar</Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function aggregate(rows: any[], groupCols: string[], displayCols: string[]): any[] {
  const map = new Map<string, any>()
  for (const row of rows) {
    const key = groupCols.map(c => String(row[c] ?? "")).join("|")
    if (!map.has(key)) {
      const newItem: any = { __count: 0 }
      groupCols.forEach(c => newItem[c] = row[c])
      displayCols.forEach(c => newItem[c] = 0)
      map.set(key, newItem)
    }
    const item = map.get(key)!
    item.__count++
    displayCols.forEach(c => { item[c] = (item[c] || 0) + toNum(row[c]) })
  }
  return Array.from(map.values()).sort((a,b) => b.ENTREGAS - a.ENTREGAS)
}

// ════════════════════════════════════════════════════════════════════════════
export function VisaoAcumuladaPage() {
  const { toast } = useToast()
  const [firebaseOn, setFirebaseOn] = React.useState(getFirebaseConnectionStatus)

  React.useEffect(() => {
    const interval = setInterval(() => { setFirebaseOn(getFirebaseConnectionStatus()) }, 500)
    return () => clearInterval(interval)
  }, [])

  const [view, setView] = React.useState<"tabela" | "cards">("tabela")

  const [initialPeriod] = React.useState(getInitialPeriod)
  const [filterYear, setFilterYear] = React.useState(initialPeriod.year)
  const [filterMonth, setFilterMonth] = React.useState(initialPeriod.month)

  const [filterFilial, setFilterFilial] = React.useState("all")
  const [filterRegiao, setFilterRegiao] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [hideRotaChao, setHideRotaChao] = React.useState(true)

  const [rawRows, setRawRows] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [showGerenciar, setShowGerenciar] = React.useState(false)
  const [groupCols, setGroupCols] = React.useState<string[]>(INITIAL_GROUP_COLS)
  const [displayCols, setDisplayCols] = React.useState<string[]>(INITIAL_DISPLAY_COLS)

  const fetchFromFirebase = React.useCallback(async (forceRefresh = false) => {
    if (!firebaseOn) return
    setLoading(true)
    const cacheKey = getAcumuladaCacheKey(filterYear, filterMonth)
    if (!forceRefresh) {
      const cached = getFromCache<{ rows: any[] }>(cacheKey)
      if (cached) { setRawRows(cached.rows); setLoading(false); return }
    }
    try {
      const items = await loadItemsFromFirebase("consolidacao-entregas", filterYear, filterMonth)
      setRawRows(items)
      setInCache(cacheKey, { rows: items })
    } catch (e: any) { toast({ variant: "destructive", title: "Erro", description: e.message }) }
    finally { setLoading(false) }
  }, [filterYear, filterMonth, toast, firebaseOn])

  React.useEffect(() => {
    if (firebaseOn) {
      fetchFromFirebase()
    } else {
      const payload = getStoragePayload(filterYear, filterMonth)
      if (payload) {
        setRawRows(payload.rows)
      } else {
        setRawRows([])
      }
    }
  }, [firebaseOn, filterYear, filterMonth, fetchFromFirebase])

  const filiais = React.useMemo(() => [...new Set(rawRows.map(r => r["FILIAL"]).filter(Boolean))].sort(), [rawRows])
  const regioes = React.useMemo(() => [...new Set(rawRows.map(r => r["REGIÃO"]).filter(Boolean))].sort(), [rawRows])

  const filtered = React.useMemo(() => {
    let r = rawRows
    if (filterFilial !== "all") r = r.filter(row => row["FILIAL"] === filterFilial)
    if (filterRegiao !== "all") r = r.filter(row => row["REGIÃO"] === filterRegiao)
    if (hideRotaChao)           r = r.filter(row => {
      const cat = String(row["CATEGORIA_ORIGEM"] ?? row["ROTA"] ?? "").toUpperCase().trim()
      return cat !== "CHÃO" && cat !== "CHAO"
    })
    if (search) { const s = search.toLowerCase(); r = r.filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(s))) }
    return r
  }, [rawRows, filterFilial, filterRegiao, hideRotaChao, search])

  const aggregated = React.useMemo(() => {
    return aggregate(filtered, groupCols, displayCols)
  }, [filtered, groupCols, displayCols])

  const exportXlsx = React.useCallback(() => {
    exportExcel(aggregated, `Visão Acumulada - ${String(filterMonth).padStart(2,"0")}-${filterYear}.xlsx`)
  }, [aggregated, filterMonth, filterYear])

  const CardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {aggregated.map((row, i) => (
        <div key={i} className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="space-y-1.5">
            {groupCols.map(col => (
              <div key={col} className="flex items-baseline gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground w-24">{col}</span>
                <span className="text-sm font-medium text-foreground truncate">{row[col] || "—"}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border/60 pt-2 space-y-1">
            {displayCols.map(col => (
              <div key={col} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{col}</span>
                <span className="font-mono font-medium">{typeof row[col] === 'number' ? row[col].toLocaleString('pt-BR') : row[col]}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed">
              <span className="text-muted-foreground">COUNT</span>
              <span className="font-mono font-medium">{row.__count}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const TableView = () => (
    <div className="rounded-xl border border-border/60 shadow-sm overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.85)" }}>
              {[...groupCols, ...displayCols, "COUNT"].map(col => (
                <th key={col} className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ backgroundColor: "transparent" }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aggregated.map((row, i) => (
              <tr key={i} className={cn("border-b transition-colors", i % 2 === 0 ? "bg-background" : "bg-muted/5")}>
                {groupCols.map(col => (
                  <td key={col} className="px-3 py-2 whitespace-nowrap text-left font-medium">{row[col] || "—"}</td>
                ))}
                {displayCols.map(col => (
                  <td key={col} className="px-3 py-2 whitespace-nowrap text-right font-mono">{typeof row[col] === 'number' ? row[col].toLocaleString('pt-BR') : row[col]}</td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono">{row.__count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4 text-primary" /> Visão Acumulada — Entregas
                {!firebaseOn && <Info className="size-3 ml-2" title="Mostrando dados do buffer local da Visão Analítica" />}
              </CardTitle>
              <CardDescription className="mt-0.5">Visualização agregada dos dados de entrega{rawRows.length > 0 ? ` · ${rawRows.length.toLocaleString("pt-BR")} registros no buffer.` : "."}</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant={view === "tabela" ? "default" : "outline"} size="sm" className="h-8 text-xs gap-1.5" onClick={() => setView("tabela")}><LayoutGrid className="size-3.5" /> Tabela</Button>
              <Button variant={view === "cards" ? "default" : "outline"} size="sm" className="h-8 text-xs gap-1.5" onClick={() => setView("cards")}><Layers className="size-3.5" /> Cards</Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowGerenciar(true)}><Group className="size-3.5 text-muted-foreground" /> Gerenciar Colunas</Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={exportXlsx}><FileDown className="size-3.5 text-muted-foreground" /> Exportar Excel</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground"
                onClick={() => { const current = getFirebaseConnectionStatus(); toggleFirebaseConnection(); setFirebaseOn(!current) }}>
                {firebaseOn
                  ? <><WifiOff className="size-3.5 text-red-500" /> Desligar Firebase</>
                  : <><Zap className="size-3.5 text-emerald-500" /> Ligar Firebase</>
                }
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Ano</Label>
              <Input type="number" className="w-24 h-8 text-xs" value={filterYear} onChange={e => setFilterYear(+e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Mês</Label>
              <Input type="number" min={1} max={12} className="w-20 h-8 text-xs" value={filterMonth} onChange={e => setFilterMonth(+e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Filial</Label>
              <Select value={filterFilial} onValueChange={setFilterFilial}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas</SelectItem>{filiais.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Região</Label>
              <Select value={filterRegiao} onValueChange={setFilterRegiao}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas</SelectItem>{regioes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1 flex-1 min-w-[160px]"><Label className="text-[10px] uppercase tracking-wider">Busca</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input className="pl-6 h-8 text-xs" placeholder="motorista, placa..." value={search} onChange={e => setSearch(e.target.value)} />
              </div></div>
            <div className="flex items-center self-end pb-1 gap-2">
              <Checkbox id="hide-rota-chao" checked={hideRotaChao} onCheckedChange={v => setHideRotaChao(!!v)} className="size-3.5" />
              <label htmlFor="hide-rota-chao" className="text-xs font-medium leading-none cursor-pointer">Ocultar CHÃO</label>
            </div>
            {!firebaseOn && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-amber-600 border-amber-300 bg-amber-50">
                <HardDrive className="size-3.5" /> Buffer Local
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Mostrando {aggregated.length} grupos de {filtered.length} registros.</p>
        </CardContent>
      </Card>

      {loading && <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /><span className="text-sm">Carregando...</span></div>}

      {!loading && aggregated.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 py-16 text-center">
          <Database className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum dado para o período e filtros selecionados.</p>
          {!firebaseOn && <p className="text-xs text-muted-foreground mt-1">Seus dados do buffer local estão sendo exibidos. Tente ajustar os filtros ou importar um novo arquivo na Visão Analítica.</p>}
        </div>
      )}

      {!loading && aggregated.length > 0 && (view === "tabela" ? <TableView /> : <CardView />)}

      <GroupingDialog open={showGerenciar} onClose={() => setShowGerenciar(false)}
        groupCols={groupCols} setGroupCols={setGroupCols}
        displayCols={displayCols} setDisplayCols={setDisplayCols} />
    </div>
  )
}
