import * as React from "react"
import {
  RefreshCw, Loader2, ChevronDown, ChevronUp,
  Search, Database, FileDown, Columns3, Undo2,
  Check, X, Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { exportExcel } from "@/lib/excel-utils"
import { collection, doc, getDoc, getDocs, getFirestore } from "firebase/firestore"
import { initializeApp, getApps, getApp } from "firebase/app"
import { trackRead } from "@/lib/firebaseUsageTracker"
import { mainDocId } from "@/app/actions/actions-utils"
import { getFromCache, setInCache, getAcumuladaCacheKey } from "@/lib/data-cache"

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDj733yNRCHjua7X-0rkHc74VA4qkDpg9w",
  authDomain:        "file-manager-hub-50030335.firebaseapp.com",
  projectId:         "file-manager-hub-50030335",
  storageBucket:     "file-manager-hub-50030335.firebasestorage.app",
  messagingSenderId: "187801013388",
  appId:             "1:187801013388:web:ef1417fae5d8d24d93ffa9",
}
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const db  = getFirestore(app)

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface RawRow { [key: string]: any }

interface AccumulatedRow {
  "DATA DE ENTREGA": string
  "FILIAL": string; "REGIÃO": string
  "MOTORISTA": string; "AJUDANTE": string; "AJUDANTE 2": string
  "PLACA": string; "PLACA SISTEMA": string
  "TIPO CARGA": string
  "ENTREGAS": number; "PESO": number; "KM": number; "KM_MAX": number
  "TEMPO_MINUTOS": number; "TEMPO": string
  "VIAGENS": string; "ROTA": string
  "VALOR": number; "FRETE": number; "DESCARGA PALET": number
  "HOSPEDAGEM": number; "DIARIA": number; "EXTRA": number; "CHAPA": number
  __cargas: number
  __linhasOriginais: RawRow[]
}

const INITIAL_GRID_COLS = [
  "DATA DE ENTREGA", "TIPO CARGA", "FILIAL", "REGIÃO",
  "ROTA", "MOTORISTA", "AJUDANTE", "AJUDANTE 2",
  "PLACA", "PLACA SISTEMA",
  "ENTREGAS", "PESO", "TEMPO", "KM",
  "VIAGENS", "VALOR", "FRETE",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function classificarTipoCarga(obs: any): string {
  if (!obs) return "Carga A"
  const o = String(obs).toUpperCase().trim()
  if (o.includes("CARGA E") || o.includes("CARGA-E")) return "Carga E"
  if (o.includes("CARGA D") || o.includes("CARGA-D")) return "Carga D"
  if (o.includes("CARGA C") || o.includes("CARGA-C")) return "Carga C"
  if (o.includes("CARGA B") || o.includes("CARGA-B")) return "Carga B"
  return "Carga A"
}

function tempoParaMinutos(tempo: any): number {
  if (!tempo) return 0
  const s = String(tempo).trim()
  // formato HH:MM ou HH:MM:SS direto
  const m = s.match(/^(\d+):(\d{2})/)
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2])
  // string de data completa (ex: "Mon Jan 01 1900 03:02:00 GMT...")
  const md = s.match(/(\d{2}):(\d{2}):\d{2}/)
  if (md) return parseInt(md[1]) * 60 + parseInt(md[2])
  // número decimal (fração de dia)
  const n = parseFloat(s)
  if (!isNaN(n) && n > 0 && n < 1) return Math.round(n * 24 * 60)
  return 0
}

function minutosParaTempo(min: number): string {
  if (!min) return ""
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`
}

function extractDay(dateStr: any): number | null {
  if (!dateStr) return null
  const m = String(dateStr).trim().match(/^(\d{1,2})[\/\.]/)
  return m ? parseInt(m[1]) : null
}

function numVal(v: any): number {
  const n = parseFloat(String(v ?? "").replace(",", "."))
  return isNaN(n) ? 0 : n
}

function fmtNum(v: number, decimais = 2): string {
  if (!v) return ""
  return v.toLocaleString("pt-BR", { minimumFractionDigits: decimais, maximumFractionDigits: decimais })
}

function normalizarPlaca(placa: any): string {
  return String(placa ?? "").trim().toUpperCase().replace(/[-\s]/g, "")
}

function ocupacaoBadge(peso: number, placa: string, capacidadeMap: Map<string, number>): React.ReactNode {
  const cap = capacidadeMap.get(normalizarPlaca(placa)) ?? 0
  if (!normalizarPlaca(placa) || cap <= 0) {
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Sem cadastro</span>
  }
  const pct = (peso / cap) * 100
  const label = `${pct.toFixed(1)}%`
  if (pct >= 100) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{label}</span>
  if (pct >= 85)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{label}</span>
  return              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{label}</span>
}

// ─── Acumulação ───────────────────────────────────────────────────────────────
function acumularLinhas(rows: RawRow[]): AccumulatedRow[] {
  const grupos = new Map<string, AccumulatedRow>()

  for (const row of rows) {
    const data      = String(row["DATA DE ENTREGA"] ?? "").trim()
    const motorista = String(row["MOTORISTA"] ?? "").trim()
    const placa     = String(row["PLACA"] ?? row["PLACA SISTEMA"] ?? "").trim()
    if (!data || !motorista) continue

    const tipoCarga = classificarTipoCarga(row["OBSERVAÇÃO"])
    const chave     = `${data}||${motorista}||${placa}||${tipoCarga}`
    const viagem    = String(row["VIAGENS"] ?? "").trim()
    const rota      = String(row["ROTA"]    ?? "").trim()

    if (!grupos.has(chave)) {
      grupos.set(chave, {
        "DATA DE ENTREGA": data,
        "FILIAL":          String(row["FILIAL"]        ?? ""),
        "REGIÃO":          String(row["REGIÃO"]        ?? ""),
        "MOTORISTA":       motorista,
        "AJUDANTE":        String(row["AJUDANTE"]      ?? ""),
        "AJUDANTE 2":      String(row["AJUDANTE 2"]    ?? ""),
        "PLACA":           String(row["PLACA"]         ?? ""),
        "PLACA SISTEMA":   String(row["PLACA SISTEMA"] ?? ""),
        "TIPO CARGA":      tipoCarga,
        "ENTREGAS": 0, "PESO": 0, "KM": 0, "KM_MAX": 0,
        "TEMPO_MINUTOS": 0, "TEMPO": "",
        "VIAGENS": viagem, "ROTA": rota,
        "VALOR": 0, "FRETE": 0, "DESCARGA PALET": 0,
        "HOSPEDAGEM": 0, "DIARIA": 0, "EXTRA": 0, "CHAPA": 0,
        __cargas: 1, __linhasOriginais: [row],
      })
    } else {
      const g = grupos.get(chave)!
      const viagens = g["VIAGENS"].split(" / ").filter(Boolean)
      if (viagem && !viagens.includes(viagem)) viagens.push(viagem)
      g["VIAGENS"] = viagens.join(" / ")
      const rotas = g["ROTA"].split(" / ").filter(Boolean)
      if (rota && !rotas.includes(rota)) rotas.push(rota)
      g["ROTA"] = rotas.join(" / ")
      g.__cargas++
      g.__linhasOriginais.push(row)
    }

    const g = grupos.get(chave)!
    g["ENTREGAS"]       += numVal(row["ENTREGAS"])
    g["PESO"]           += numVal(row["PESO"])
    g["TEMPO_MINUTOS"]  += tempoParaMinutos(row["TEMPO"])
    g["VALOR"]          += numVal(row["VALOR"])
    g["FRETE"]          += numVal(row["FRETE"])
    g["DESCARGA PALET"] += numVal(row["DESCARGA PALET"])
    g["HOSPEDAGEM"]     += numVal(row["HOSPEDAGEM"])
    g["DIARIA"]         += numVal(row["DIARIA"])
    g["EXTRA"]          += numVal(row["EXTRA"])
    g["CHAPA"]          += numVal(row["CHAPA"])
    const km = numVal(row["KM"])
    if (km > g["KM_MAX"]) g["KM_MAX"] = km
  }

  for (const g of grupos.values()) {
    g["TEMPO"] = minutosParaTempo(g.__cargas > 0 ? Math.round(g["TEMPO_MINUTOS"] / g.__cargas) : g["TEMPO_MINUTOS"])
    g["KM"]    = Math.round(g["KM_MAX"] * 1.2 * 100) / 100
  }

  return [...grupos.values()]
}

// ─── Célula ───────────────────────────────────────────────────────────────────
function cellVal(row: AccumulatedRow, col: string) {
  const v = (row as any)[col]

  if (col === "TIPO CARGA") {
    const partes = String(v ?? "").split(" / ").filter(Boolean)
    if (!partes.length) return <span className="text-muted-foreground/40 text-[10px]">—</span>
    return (
      <div className="flex flex-wrap gap-1 justify-center">
        {partes.map(p => (
          <span key={p} className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-medium",
            p === "Carga A" ? "bg-emerald-100 text-emerald-700" :
            p === "Carga B" ? "bg-blue-100 text-blue-700" :
            p === "Carga C" ? "bg-amber-100 text-amber-700" :
            p === "Carga D" ? "bg-orange-100 text-orange-700" :
                              "bg-red-100 text-red-700"
          )}>{p}</span>
        ))}
      </div>
    )
  }

  if (col === "VIAGENS") {
    const partes = String(v ?? "").split(" / ").filter(Boolean)
    if (!partes.length) return <span className="text-muted-foreground/40 text-[10px]">—</span>
    return <span className="font-mono text-[10px] text-foreground/80">{partes.join(" / ")}</span>
  }

  if (["ENTREGAS","PESO","KM","VALOR","FRETE","DESCARGA PALET","HOSPEDAGEM","DIARIA","EXTRA","CHAPA"].includes(col)) {
    const n = numVal(v)
    if (!n) return <span className="text-muted-foreground/40 text-[10px]">—</span>
    return <span className="tabular-nums">{fmtNum(n, col === "ENTREGAS" ? 0 : 2)}</span>
  }

  if (v == null || v === "" || v === 0) return <span className="text-muted-foreground/40 text-[10px]">—</span>
  return <span>{String(v)}</span>
}

// ─── Dialog: detalhe de cargas ────────────────────────────────────────────────
function DetalheCargas({ row, open, onClose }: { row: AccumulatedRow | null; open: boolean; onClose: () => void }) {
  if (!row) return null
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-primary" />
            Detalhe — {row["MOTORISTA"]}
            <Badge variant="outline" className="ml-1 text-[10px]">{row["DATA DE ENTREGA"]}</Badge>
            <Badge className={cn("ml-1 text-[10px]",
              row["TIPO CARGA"] === "Carga A" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
              row["TIPO CARGA"] === "Carga B" ? "bg-blue-100 text-blue-700 border-blue-200" :
              row["TIPO CARGA"] === "Carga C" ? "bg-amber-100 text-amber-700 border-amber-200" :
              row["TIPO CARGA"] === "Carga D" ? "bg-orange-100 text-orange-700 border-orange-200" :
                                                "bg-red-100 text-red-700 border-red-200"
            )}>{row["TIPO CARGA"]}</Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {row.__linhasOriginais.length} rota{row.__linhasOriginais.length > 1 ? "s" : ""} agrupada{row.__linhasOriginais.length > 1 ? "s" : ""} nesta linha.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-auto flex-1">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/30 border-b sticky top-0">
                {["#","Rota","Viagens","Entregas","Peso","Tempo","KM","Observação"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row.__linhasOriginais.map((linha, i) => (
                <tr key={i} className={cn("border-b", i % 2 === 0 ? "bg-background" : "bg-muted/5")}>
                  <td className="px-3 py-2 font-semibold text-primary">{i + 1}</td>
                  <td className="px-3 py-2">{linha["ROTA"] ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{linha["VIAGENS"] ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{numVal(linha["ENTREGAS"]) || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(numVal(linha["PESO"])) || "—"}</td>
                  <td className="px-3 py-2 font-mono">{linha["TEMPO"] ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(numVal(linha["KM"])) || "—"}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground">{linha["OBSERVAÇÃO"] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/20 font-semibold">
                <td className="px-3 py-2 text-muted-foreground" colSpan={3}>Total</td>
                <td className="px-3 py-2 tabular-nums">{row["ENTREGAS"]}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(row["PESO"])}</td>
                <td className="px-3 py-2 font-mono">{row["TEMPO"]} <span className="text-muted-foreground font-normal">(÷{row.__cargas})</span></td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(row["KM"])} <span className="text-muted-foreground font-normal">(+20%)</span></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="px-6 py-3 border-t shrink-0 flex justify-end">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="gap-1.5"><X className="size-3.5" /> Fechar</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog: gerenciar colunas ────────────────────────────────────────────────
function GerenciarColunasDialog({ open, onClose, cols, setCols }: {
  open: boolean; onClose: () => void; cols: string[]; setCols: (c: string[]) => void
}) {
  const move = (idx: number, dir: "up" | "down") => {
    const n = [...cols]; const [item] = n.splice(idx, 1)
    n.splice(dir === "up" ? idx - 1 : idx + 1, 0, item); setCols(n)
  }
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Columns3 className="size-4 text-primary" /> Gerenciar Colunas
          </DialogTitle>
          <DialogDescription>Reordene as colunas da tabela acumulada.</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2 max-h-[60vh] overflow-y-auto">
          {cols.map((col, idx) => (
            <div key={col} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
              <span className="flex-1 text-sm font-medium">{col}</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(idx, "up")} disabled={idx === 0}>
                <ChevronUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(idx, "down")} disabled={idx === cols.length - 1}>
                <ChevronDown className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-2 border-t">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCols(INITIAL_GRID_COLS)}>
            <Undo2 className="size-3.5" /> Restaurar Padrão
          </Button>
          <DialogClose asChild>
            <Button size="sm" className="gap-1.5"><Check className="size-3.5" /> Fechar</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function VisaoAcumuladaPage() {
  const { toast } = useToast()
  const today = new Date()

  const [filterYear,   setFilterYear]   = React.useState(today.getFullYear())
  const [filterMonth,  setFilterMonth]  = React.useState(today.getMonth() + 1)
  const [filterDay,    setFilterDay]    = React.useState<number>(today.getDate())
  const [filterFilial, setFilterFilial] = React.useState("all")
  const [filterRegiao, setFilterRegiao] = React.useState("all")
  const [search,       setSearch]       = React.useState("")
  const [hideRotaChao, setHideRotaChao] = React.useState(true)

  const [rawRows,  setRawRows]  = React.useState<RawRow[]>([])
  const [loading,  setLoading]  = React.useState(true)
  const [totalCount, setTotalCount] = React.useState(0)
  const [gridCols, setGridCols] = React.useState(INITIAL_GRID_COLS)

  const [sortCol, setSortCol] = React.useState<string | null>(null)
  const [sortAsc, setSortAsc] = React.useState(true)

  const [detalheRow,           setDetalheRow]           = React.useState<AccumulatedRow | null>(null)
  const [showGerenciarColunas, setShowGerenciarColunas] = React.useState(false)

  const [veiculoMap, setVeiculoMap] = React.useState<Map<string, { capacidade: number; modelo: string }>>(new Map())
  const capacidadeMap = React.useMemo(() => {
    const m = new Map<string, number>()
    veiculoMap.forEach((v, k) => { if (v.capacidade > 0) m.set(k, v.capacidade) })
    return m
  }, [veiculoMap])
  const [filterModelo, setFilterModelo] = React.useState("all")

  const tableContainerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    getDocs(collection(db, "docs_veiculos")).then(snap => {
      const map = new Map<string, { capacidade: number; modelo: string }>()
      for (const d of snap.docs) {
        const data    = d.data()
        const cap     = Number(data.CAPACIDADE_KG ?? 0)
        const modelo  = String(data.MODELO ?? "")
        map.set(normalizarPlaca(d.id), { capacidade: cap, modelo })
      }
      setVeiculoMap(map)
    }).catch(() => {})
  }, [])

  const fetchData = React.useCallback(async (forceRefresh = false) => {
    setLoading(true);
    const cacheKey = getAcumuladaCacheKey(filterYear, filterMonth);

    if (!forceRefresh) {
      const cachedData = getFromCache<{ rows: RawRow[], totalCount: number }>(cacheKey);
      if (cachedData) {
        setRawRows(cachedData.rows);
        setTotalCount(cachedData.totalCount);
        toast({ description: `${cachedData.rows.length} registros carregados do cache.` });
        setLoading(false);
        return;
      }
    }

    try {
      const docId = mainDocId("consolidacao-entregas", filterYear, filterMonth);
      const metaSnap = await getDoc(doc(db, "pipeline_results", docId));
      trackRead(1);

      if (!metaSnap.exists()) {
        setRawRows([]);
        setTotalCount(0);
        toast({ description: "Nenhum dado para este período. Importe os arquivos primeiro." });
        setLoading(false);
        return;
      }

      const itemCount = metaSnap.data().itemCount ?? 0;
      setTotalCount(itemCount);

      const itemsRef = collection(db, "pipeline_results", docId, "items");
      const snap = await getDocs(itemsRef);
      trackRead(snap.size);

      const newRawRows = snap.docs.map(d => d.data() as RawRow);
      setRawRows(newRawRows);

      setInCache(cacheKey, { rows: newRawRows, totalCount: itemCount });

      toast({ description: `${newRawRows.length} registros carregados.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: e.message });
      setRawRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterMonth, toast]);

  React.useEffect(() => { fetchData() }, [fetchData])

  const filiais = React.useMemo(() =>
    [...new Set(rawRows.map(r => r["FILIAL"]).filter(Boolean))].sort(), [rawRows])
  const regioes = React.useMemo(() =>
    [...new Set(rawRows.map(r => r["REGIÃO"]).filter(Boolean))].sort(), [rawRows])
  const modelos = React.useMemo(() => {
    const s = new Set<string>()
    rawRows.forEach(r => {
      const placa = normalizarPlaca(r["PLACA"] ?? "")
      const m = veiculoMap.get(placa)?.modelo
      if (m && m !== "-" && m.trim()) s.add(m.trim())
    })
    return [...s].sort()
  }, [rawRows, veiculoMap])

  const acumulado = React.useMemo(() => {
    let r = rawRows
    if (filterDay > 0)          r = r.filter(row => extractDay(row["DATA DE ENTREGA"]) === filterDay)
    if (filterFilial !== "all") r = r.filter(row => row["FILIAL"] === filterFilial)
    if (filterRegiao !== "all") r = r.filter(row => row["REGIÃO"] === filterRegiao)
    if (hideRotaChao)           r = r.filter(row => String(row["ROTA"] ?? "").toUpperCase().trim() !== "CHÃO")
    if (search) {
      const s = search.toLowerCase()
      r = r.filter(row => Object.values(row).some(v => String(v ?? "").toLowerCase().includes(s)))
    }
    let acc = acumularLinhas(r)
    if (filterModelo !== "all") {
      acc = acc.filter(row => {
        const m = veiculoMap.get(normalizarPlaca(row["PLACA"]))?.modelo ?? ""
        return m.trim() === filterModelo
      })
    }
    if (sortCol) {
      acc = [...acc].sort((a, b) => {
        const av = String((a as any)[sortCol] ?? "")
        const bv = String((b as any)[sortCol] ?? "")
        return sortAsc
          ? av.localeCompare(bv, "pt-BR", { numeric: true })
          : bv.localeCompare(av, "pt-BR", { numeric: true })
      })
    }
    return acc
  }, [rawRows, filterDay, filterFilial, filterRegiao, hideRotaChao, search, sortCol, sortAsc, filterModelo, veiculoMap])

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  const totais = React.useMemo(() => ({
    entregas: acumulado.reduce((s, r) => s + r["ENTREGAS"], 0),
    peso:     acumulado.reduce((s, r) => s + r["PESO"],     0),
    km:       acumulado.reduce((s, r) => s + r["KM"],       0),
    tempo:    minutosParaTempo(acumulado.reduce((s, r) => s + r["TEMPO_MINUTOS"], 0)),
    valor:    acumulado.reduce((s, r) => s + r["VALOR"],    0),
    frete:    acumulado.reduce((s, r) => s + r["FRETE"],    0),
  }), [acumulado])

  const exportXlsx = React.useCallback(() => {
    const data = acumulado.map(row => {
      const obj: Record<string, any> = {}
      gridCols.forEach(col => { obj[col] = (row as any)[col] })
      return obj
    })
    exportExcel(data, `Visão Acumulada - ${String(filterMonth).padStart(2, "0")}-${filterYear}.xlsx`)
  }, [acumulado, gridCols, filterMonth, filterYear])

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4 text-primary" /> Visão Acumulada — Entregas
              </CardTitle>
              <CardDescription className="mt-0.5">
                Rotas de Entrega
                {totalCount > 0 && (
                  <span className="ml-1 font-semibold text-foreground">
                    · {totalCount.toLocaleString("pt-BR")} registros no banco.
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8"
                onClick={() => setShowGerenciarColunas(true)}>
                <Columns3 className="size-3.5 text-muted-foreground" /> Gerenciar Colunas
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={exportXlsx}>
                <FileDown className="size-3.5 text-muted-foreground" /> Exportar Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Ano</Label>
              <Input type="number" className="w-24 h-8 text-xs"
                value={filterYear} onChange={e => setFilterYear(+e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Mês</Label>
              <Input type="number" min={1} max={12} className="w-20 h-8 text-xs"
                value={filterMonth} onChange={e => setFilterMonth(+e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">
                Dia <span className="normal-case text-muted-foreground font-normal">(0 = todos)</span>
              </Label>
              <Input type="number" min={0} max={31} className="w-20 h-8 text-xs"
                value={filterDay === 0 ? "" : filterDay} placeholder="0"
                onChange={e => {
                  const v = parseInt(e.target.value)
                  setFilterDay(isNaN(v) || v < 0 ? 0 : Math.min(v, 31))
                }} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Filial</Label>
              <Select value={filterFilial} onValueChange={setFilterFilial}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filiais.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Região</Label>
              <Select value={filterRegiao} onValueChange={setFilterRegiao}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {regioes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Modelo</Label>
              <Select value={filterModelo} onValueChange={setFilterModelo}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {modelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-[10px] uppercase tracking-wider">Busca</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input className="pl-6 h-8 text-xs" placeholder="motorista, placa..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center self-end pb-1 gap-2">
              <input type="checkbox" id="hide-chao-acum" checked={hideRotaChao}
                onChange={e => setHideRotaChao(e.target.checked)} className="size-3.5 accent-primary" />
              <label htmlFor="hide-chao-acum" className="text-xs font-medium leading-none cursor-pointer">
                Ocultar CHÃO
              </label>
            </div>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fetchData(true)} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Atualizar
            </Button>
          </div>

          {acumulado.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Badge variant="outline" className="text-[10px]">
                {acumulado.length} linha{acumulado.length > 1 ? "s" : ""} acumulada{acumulado.length > 1 ? "s" : ""}
              </Badge>
              <Badge variant="outline" className="text-[10px]">{rawRows.length} registros brutos</Badge>
              <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                {totais.entregas.toLocaleString("pt-BR")} entregas
              </Badge>
              <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                {fmtNum(totais.peso)} kg
              </Badge>
              {totais.km > 0 && (
                <Badge className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                  {fmtNum(totais.km)} km
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /><span className="text-sm">Carregando...</span>
        </div>
      )}

      {!loading && acumulado.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 py-16 text-center">
          <Database className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum dado para o período. Clique em <strong>Atualizar</strong>.
          </p>
        </div>
      )}

      {!loading && acumulado.length > 0 && (
        <div className="rounded-xl border border-border/60 shadow-sm overflow-hidden">
          {/* ── Container único com scroll horizontal e vertical ── */}
          <div
            ref={tableContainerRef}
            className="overflow-auto"
            style={{ maxHeight: "calc(100vh - 320px)" }}
          >
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.85)" }}>
                  <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap w-16" style={{ backgroundColor: "transparent" }}>
                    CARGAS
                  </th>
                  {gridCols.map((col, ci) => (
                    <React.Fragment key={col}>
                      <th
                        className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                        style={{ backgroundColor: "transparent" }}
                        onClick={() => toggleSort(col)}>
                        <span className="flex items-center justify-center gap-1">
                          {col}
                          {sortCol === col ? sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" /> : null}
                        </span>
                      </th>
                      {col === "PLACA" && (
                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ backgroundColor: "transparent" }}>
                          MODELO
                        </th>
                      )}
                      {col === "PESO" && (
                        <>
                          <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap" style={{ backgroundColor: "transparent" }}>
                            CAP. (kg)
                          </th>
                          <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ backgroundColor: "transparent" }}>
                            OCUPAÇÃO
                          </th>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {acumulado.map((row, i) => {
                  const multiRota = row.__cargas > 1
                  return (
                    <tr key={i} className={cn(
                      "border-b transition-colors",
                      multiRota
                        ? "bg-amber-50/40 hover:bg-amber-50/80"
                        : i % 2 === 0 ? "bg-background hover:bg-muted/10" : "bg-muted/5 hover:bg-muted/10"
                    )}>
                      <td className="px-3 py-2 text-center">
                        {multiRota ? (
                          <button
                            onClick={() => setDetalheRow(row)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200 transition-colors"
                          >
                            <Layers className="size-2.5" />
                            {row.__cargas}
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50">1</span>
                        )}
                      </td>

                      {gridCols.map(col => (
                        <React.Fragment key={col}>
                          <td className={cn("px-3 py-2 whitespace-nowrap text-center", {
                            "min-w-[200px]": col === "MOTORISTA",
                            "min-w-[160px]": col === "AJUDANTE" || col === "AJUDANTE 2",
                            "min-w-[180px]": col === "VIAGENS" || col === "ROTA",
                          })}>
                            {cellVal(row, col)}
                          </td>
                          {col === "PLACA" && (
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              {(() => {
                                const m = veiculoMap.get(normalizarPlaca(row["PLACA"]))?.modelo
                                return m && m !== "-" && m.trim()
                                  ? <span className="text-[11px] font-medium text-foreground/80">{m}</span>
                                  : <span className="text-muted-foreground/40 text-[10px]">—</span>
                              })()}
                            </td>
                          )}
                          {col === "PESO" && (
                            <>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                {(() => {
                                  const cap = capacidadeMap.get(normalizarPlaca(row["PLACA"]))
                                  return cap
                                    ? <span>{cap.toLocaleString("pt-BR")} kg</span>
                                    : <span className="text-muted-foreground/40">—</span>
                                })()}
                              </td>
                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                {ocupacaoBadge(row["PESO"], row["PLACA"], capacidadeMap)}
                              </td>
                            </>
                          )}
                        </React.Fragment>
                      ))}
                    </tr>
                  )
                })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-border font-semibold sticky bottom-0" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.85)" }}>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground text-center">Total</td>
                  {gridCols.map(col => {
                    let content: React.ReactNode = null
                    if      (col === "ENTREGAS") content = <span className="tabular-nums">{totais.entregas.toLocaleString("pt-BR")}</span>
                    else if (col === "PESO")     content = <span className="tabular-nums">{fmtNum(totais.peso)}</span>
                    else if (col === "KM")       content = <span className="tabular-nums">{fmtNum(totais.km)}</span>
                    else if (col === "TEMPO")    content = <span className="font-mono">{totais.tempo}</span>
                    else if (col === "VALOR")    content = <span className="tabular-nums">{fmtNum(totais.valor)}</span>
                    else if (col === "FRETE")    content = <span className="tabular-nums">{fmtNum(totais.frete)}</span>
                    return (
                      <React.Fragment key={col}>
                        <td className="px-3 py-2.5 text-center text-[11px]">{content}</td>
                        {col === "PLACA" && <td className="px-3 py-2.5" />}
                        {col === "PESO" && (
                          <>
                            <td className="px-3 py-2.5" />
                            <td className="px-3 py-2.5" />
                          </>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <DetalheCargas row={detalheRow} open={!!detalheRow} onClose={() => setDetalheRow(null)} />
      <GerenciarColunasDialog
        open={showGerenciarColunas} onClose={() => setShowGerenciarColunas(false)}
        cols={gridCols} setCols={setGridCols}
      />
    </div>
  )
}