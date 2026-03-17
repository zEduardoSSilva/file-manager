import * as React from "react"
import * as XLSX from "xlsx"
import {
  RefreshCw, Loader2, Edit2, X, Check, ChevronDown, ChevronUp,
  Search, Database, Trash2, ServerCrash, FileStack, CalendarDays,
  Building2, Hash, FileDown, Columns3, Undo2, Truck, ChevronRight,
  FileSpreadsheet, Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { exportExcel } from "@/lib/excel-utils"
import {
  collection, doc, getDoc, getDocs, updateDoc, writeBatch, getFirestore,
} from "firebase/firestore"
import { initializeApp, getApps, getApp } from "firebase/app"
import { trackRead, trackWrite, trackDelete } from "@/lib/firebaseUsageTracker"
import { mainDocId, loadItemsFromFirebase } from "@/app/actions/actions-utils"
import { getAnaliticaCacheKey, getFromCache, setInCache, clearCacheEntry } from "@/lib/data-cache"
import { updateEntregasFromFaturamentoAction } from "@/app/actions/update-faturamento-action"

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

interface Funcionario { id: string; NOME_COMPLETO: string; CARGO: string; STATUS: string }
interface VeiculoInfo  { modelo: string; operacao: string }

function normalizarPlaca(placa: any): string {
  return String(placa ?? "").trim().toUpperCase().replace(/[-\s]/g, "")
}

// ─── SearchSelect ─────────────────────────────────────────────────────────────
function SearchSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string; sub?: string }[]; placeholder?: string
}) {
  const [open, setOpen]     = React.useState(false)
  const [search, setSearch] = React.useState("")
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler)
  }, [])
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sub ?? "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30)
  return (
    <div className="space-y-1.5" ref={ref}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="relative">
        <div className="flex items-center h-8 rounded-md border border-input bg-background px-2 cursor-pointer gap-1.5 hover:border-primary/60 transition-colors"
          onClick={() => { setOpen(o => !o); setSearch("") }}>
          <span className={cn("flex-1 text-xs truncate", !value && "text-muted-foreground/50")}>{value || placeholder || "Selecionar..."}</span>
          {value && <button className="shrink-0 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); onChange("") }}><X className="size-3" /></button>}
          <ChevronDown className="size-3 text-muted-foreground shrink-0" />
        </div>
        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
            <div className="p-1.5 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <input autoFocus className="w-full pl-6 pr-2 py-1 text-xs bg-muted/20 rounded border-0 outline-none"
                  placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="max-h-[180px] overflow-y-auto">
              {filtered.length === 0
                ? <p className="text-[11px] text-muted-foreground text-center py-3">Nenhum resultado</p>
                : filtered.map(opt => (
                  <div key={opt.value} className={cn("px-3 py-1.5 text-xs cursor-pointer hover:bg-accent flex items-center justify-between gap-2",
                    value === opt.value && "bg-primary/10 text-primary font-medium")}
                    onClick={() => { onChange(opt.value); setOpen(false); setSearch("") }}>
                    <span className="truncate">{opt.label}</span>
                    {opt.sub && <span className="text-[10px] text-muted-foreground shrink-0">{opt.sub}</span>}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const INITIAL_GRID_COLS = [
  "DATA DE ENTREGA", "FILIAL", "REGIÃO", "ROTA",
  "MOTORISTA", "AJUDANTE", "AJUDANTE 2",
  "PLACA", "PLACA SISTEMA",
  "ENTREGAS", "PESO", "TEMPO", "KM",
  "VIAGENS", "VALOR", "STATUS", "OBSERVAÇÃO",
]
const ALL_FIELDS = [
  "DATA DE ENTREGA", "DATA", "FILIAL", "REGIÃO", "ROTA",
  "MOTORISTA", "AJUDANTE", "AJUDANTE 2", "PLACA SISTEMA", "PLACA", "MODELO", "OCP",
  "ENTREGAS", "PESO", "TEMPO", "KM", "VIAGENS", "OBSERVAÇÃO", "CHAPA", "FRETE", "DESCARGA PALET",
  "HOSPEDAGEM", "DIARIA", "EXTRA", "SAÍDA", "VALOR", "STATUS", "CONTRATO",
  "PERFORMAXXI", "ENTREGAS DEV", "VALOR DEV",
]

type Row = Record<string, any> & { _itemId: string; __rowIdx: number }

function extractTempo(v: any): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{1,3}:\d{2}(:\d{2})?$/.test(s)) return s.substring(0, 5)
  const m = s.match(/(\d{2}:\d{2}:\d{2})/); if (m) return m[1].substring(0, 5)
  return null
}
function cellVal(v: any, col: string) {
  if (v == null || v === "") return <span className="text-muted-foreground/40 text-[10px]">—</span>
  if (col === "TEMPO") { const t = extractTempo(v); if (t) return <span>{t}</span> }
  return <span>{String(v)}</span>
}
function extractDay(dateStr: any): number | null {
  if (!dateStr) return null
  const m = String(dateStr).trim().match(/^(\d{1,2})[\/\.]/)
  return m ? parseInt(m[1]) : null
}
function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ─── Badges de veículo ────────────────────────────────────────────────────────
function modeloBadgeAnalitica(placa: any, veiculoMap: Map<string, VeiculoInfo>): React.ReactNode {
  const info = veiculoMap.get(normalizarPlaca(placa))
  if (!info) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Pendente</span>
  const m = info.modelo?.trim().toUpperCase()
  if (!m || m === "-") return <span className="text-muted-foreground/40 text-[10px]">—</span>
  const cor =
    m === "TRUCK"     ? "bg-slate-100 text-slate-700" :
    m === "TOCO"      ? "bg-violet-100 text-violet-700" :
    m === "CARRETA"   ? "bg-amber-100 text-amber-700" :
    m === "BITRUCK"   ? "bg-orange-100 text-orange-700" :
    m === "TRUCKINHO" ? "bg-teal-100 text-teal-700" :
    m === "VAN"       ? "bg-pink-100 text-pink-700" :
                        "bg-slate-100 text-slate-600"
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", cor)}>{m}</span>
}
function operacaoBadgeAnalitica(placa: any, veiculoMap: Map<string, VeiculoInfo>): React.ReactNode {
  const info = veiculoMap.get(normalizarPlaca(placa))
  if (!info) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Pendente</span>
  const op = info.operacao?.trim()
  if (!op) return <span className="text-muted-foreground/40 text-[10px]">—</span>
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
    op === "FRETE" ? "bg-blue-100 text-blue-700" : op === "FROTA" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"
  )}>{op}</span>
}

// ─── Gerenciar Colunas ────────────────────────────────────────────────────────
function GerenciarColunasDialog({ open, onClose, cols, setCols }: {
  open: boolean; onClose: () => void; cols: string[]; setCols: (cols: string[]) => void
}) {
  const move = (idx: number, dir: "up" | "down") => {
    const n = [...cols]; const [item] = n.splice(idx, 1)
    n.splice(dir === "up" ? idx - 1 : idx + 1, 0, item); setCols(n)
  }
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><Columns3 className="size-4 text-primary" /> Gerenciar Colunas</DialogTitle>
          <DialogDescription>Reordene as colunas da tabela.</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2 max-h-[60vh] overflow-y-auto">
          {cols.map((col, idx) => (
            <div key={col} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
              <span className="flex-1 text-sm font-medium">{col}</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(idx, "up")} disabled={idx === 0}><ChevronUp className="size-4" /></Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(idx, "down")} disabled={idx === cols.length - 1}><ChevronDown className="size-4" /></Button>
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-2 border-t">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCols(INITIAL_GRID_COLS)}><Undo2 className="size-3.5" /> Restaurar Padrão</Button>
          <DialogClose asChild><Button size="sm" className="gap-1.5"><Check className="size-3.5" /> Fechar</Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Gerenciar Importações ────────────────────────────────────────────────────
function GerenciarImportacoesDialog({ open, onClose, filterYear, filterMonth, onDeleted }: {
  open: boolean; onClose: () => void; filterYear: number; filterMonth: number; onDeleted: () => void
}) {
  const { toast } = useToast()
  const [localYear,   setLocalYear]   = React.useState(filterYear)
  const [localMonth,  setLocalMonth]  = React.useState(filterMonth)
  const [meta,        setMeta]        = React.useState<any | null>(null)
  const [loading,     setLoading]     = React.useState(false)
  const [filterDay,   setFilterDay]   = React.useState(0)
  const [confirmWipe, setConfirmWipe] = React.useState(false)
  const [wiping,      setWiping]      = React.useState(false)
  const [confirmWipeDay, setConfirmWipeDay] = React.useState(false)
  const [wipingDay,      setWipingDay]      = React.useState(false)

  const loadMeta = React.useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const id = mainDocId("consolidacao-entregas", localYear, localMonth)
      const snap = await getDoc(doc(db, "pipeline_results", id))
      trackRead(1)
      setMeta(snap.exists() ? { ...snap.data(), id } : null)
    } catch (e: any) { toast({ variant: "destructive", title: "Erro", description: e.message }) }
    finally { setLoading(false) }
  }, [open, localYear, localMonth, toast])

  React.useEffect(() => { if (open) loadMeta() }, [open, localYear, localMonth])

  const wipePeriod = async () => {
    if (!meta) return
    setWiping(true)
    try {
      const docId = meta.id
      const snap = await getDocs(collection(db, "pipeline_results", docId, "items"))
      trackRead(snap.size)
      const BATCH_LIMIT = 499; let batch = writeBatch(db), count = 0
      for (const d of snap.docs) { batch.delete(d.ref); count++; if (count >= BATCH_LIMIT) { await batch.commit(); trackDelete(count); batch = writeBatch(db); count = 0 } }
      if (count > 0) { await batch.commit(); trackDelete(count) }
      await updateDoc(doc(db, "pipeline_results", docId), { itemCount: 0, dedupKeys: [], porFilialDia: {}, summary: "", duplicadasCount: 0 })
      trackWrite(1)
      toast({ title: "Período apagado.", description: `Registros de ${String(localMonth).padStart(2,"0")}/${localYear} removidos.` })
      setConfirmWipe(false); await loadMeta(); onDeleted()
    } catch (e: any) { toast({ variant: "destructive", title: "Erro ao apagar", description: e.message }) }
    finally { setWiping(false) }
  }

  const wipeDay = async () => {
    if (!meta || filterDay === 0) return
    setWipingDay(true)
    const pad = String(filterDay).padStart(2, "0")
    try {
      const docId = meta.id
      const snap = await getDocs(collection(db, "pipeline_results", docId, "items"))
      trackRead(snap.size)
      const toDelete = snap.docs.filter(d => String(d.data()["DATA DE ENTREGA"] ?? "").trim().startsWith(pad + "/"))
      if (toDelete.length === 0) { toast({ description: "Nenhum registro para este dia." }); setConfirmWipeDay(false); setWipingDay(false); return }
      const BATCH_LIMIT = 499; let batch = writeBatch(db), count = 0
      for (const d of toDelete) { batch.delete(d.ref); count++; if (count >= BATCH_LIMIT) { await batch.commit(); trackDelete(count); batch = writeBatch(db); count = 0 } }
      if (count > 0) { await batch.commit(); trackDelete(count) }
      const newCount = (meta.itemCount ?? 0) - toDelete.length
      const newPfd = { ...(meta.porFilialDia ?? {}) }
      for (const f of Object.keys(newPfd)) {
        const dm = { ...newPfd[f] }
        for (const dt of Object.keys(dm)) { if (dt.startsWith(pad + "/")) delete dm[dt] }
        if (Object.keys(dm).length === 0) delete newPfd[f]; else newPfd[f] = dm
      }
      const newDedupKeys = (meta.dedupKeys ?? []).filter((k: string) => !k.includes(`_${pad}_`))
      await updateDoc(doc(db, "pipeline_results", docId), { itemCount: newCount, porFilialDia: newPfd, dedupKeys: newDedupKeys })
      trackWrite(1)
      toast({ title: `Dia ${pad}/${String(localMonth).padStart(2,"0")}/${localYear} apagado.`, description: `${toDelete.length} registro(s) removido(s).` })
      setConfirmWipeDay(false); await loadMeta(); onDeleted()
    } catch (e: any) { toast({ variant: "destructive", title: "Erro ao apagar dia", description: e.message }) }
    finally { setWipingDay(false) }
  }

  const porFilialDia: Record<string, Record<string, number>> = meta?.porFilialDia ?? {}
  const diasDisponiveis = React.useMemo(() => {
    const s = new Set<string>()
    for (const dm of Object.values(porFilialDia)) for (const dt of Object.keys(dm)) s.add(dt)
    return [...s].sort()
  }, [porFilialDia])

  const porFilialDiaFiltrado = React.useMemo(() => {
    const source = filterDay === 0 ? porFilialDia : (() => {
      const pad = String(filterDay).padStart(2, "0")
      const result: Record<string, Record<string, number>> = {}
      for (const [f, dm] of Object.entries(porFilialDia)) {
        const filt: Record<string, number> = {}
        for (const [dt, cnt] of Object.entries(dm)) if (dt.startsWith(pad + "/")) filt[dt] = cnt
        if (Object.keys(filt).length) result[f] = filt
      }
      return result
    })()
    const sorted: Record<string, Record<string, number>> = {}
    for (const [filial, diaMap] of Object.entries(source)) {
      sorted[filial] = Object.fromEntries(
        Object.entries(diaMap).sort(([a], [b]) => {
          const [da, ma, ya] = a.split("/").map(Number); const [db2, mb, yb] = b.split("/").map(Number)
          return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db2).getTime()
        })
      )
    }
    return sorted
  }, [porFilialDia, filterDay])

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base"><FileStack className="size-4 text-primary" /> Gerenciar Importações — Firebase</DialogTitle>
            <DialogDescription className="text-xs">Doc determinístico por mês em <span className="font-mono font-semibold text-foreground">pipeline_results</span>.</DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="px-5 py-3 flex items-end gap-3 bg-muted/5 flex-wrap">
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Ano</Label>
              <Input type="number" className="w-24 h-8 text-xs" value={localYear} onChange={e => setLocalYear(+e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Mês</Label>
              <Input type="number" min={1} max={12} className="w-20 h-8 text-xs" value={localMonth} onChange={e => setLocalMonth(+e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Filtrar dia</Label>
              <Select value={String(filterDay)} onValueChange={v => setFilterDay(parseInt(v))}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Todos os dias</SelectItem>
                  {diasDisponiveis.map(dia => <SelectItem key={dia} value={String(parseInt(dia))}>{dia}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="flex items-center gap-2 ml-auto">
              {meta && <Badge variant="outline" className="text-[10px]">{meta.itemCount?.toLocaleString("pt-BR")} registros</Badge>}
              <Button variant="ghost" size="icon" className="size-7" onClick={loadMeta} disabled={loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              </Button>
              {meta && filterDay > 0 && (
                <Button variant="destructive" size="sm" className="h-7 text-[10px] px-2.5 gap-1" onClick={() => setConfirmWipeDay(true)}>
                  <Trash2 className="size-3" /> Apagar dia
                </Button>
              )}
              {meta && (
                <Button variant="outline" size="sm" className="h-7 text-[10px] px-2.5 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmWipe(true)}>
                  <Trash2 className="size-3" /> Apagar período
                </Button>
              )}
            </div>
          </div>
          <Separator />
          <ScrollArea className="flex-1 min-h-0 px-5 py-3">
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /><span className="text-sm">Carregando...</span></div>
            ) : !meta ? (
              <div className="py-10 text-center"><ServerCrash className="size-7 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhum dado importado para este período.</p></div>
            ) : Object.keys(porFilialDiaFiltrado).length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Nenhum dado para o dia selecionado.</div>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="px-3 py-2 bg-muted/10 border-b flex items-center gap-2">
                  <Database className="size-3.5 text-primary" />
                  <span className="font-mono text-[10px] text-foreground/80">{meta.id}</span>
                  <Badge className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20 ml-1">ativo</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">{fmtTs(meta.timestamp)}</span>
                </div>
                <table className="w-full text-[10px]">
                  <thead><tr className="bg-muted/20">
                    <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground w-28"><span className="flex items-center gap-1"><Building2 className="size-2.5" /> Filial</span></th>
                    <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground"><span className="flex items-center gap-1"><CalendarDays className="size-2.5" /> Data de Entrega</span></th>
                    <th className="px-3 py-1.5 text-right font-semibold text-muted-foreground w-20"><span className="flex items-center justify-end gap-1"><Hash className="size-2.5" /> Registros</span></th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(porFilialDiaFiltrado).flatMap(([filial, diaMap], fi) =>
                      Object.entries(diaMap).map(([dia, cnt], di) => (
                        <tr key={`${fi}-${di}`} className={cn("border-t border-border/20", (fi + di) % 2 === 0 ? "bg-background" : "bg-muted/5")}>
                          {di === 0 ? <td className="px-3 py-1.5 font-semibold text-foreground/80" rowSpan={Object.keys(diaMap).length}>{filial}</td> : null}
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{dia}</td>
                          <td className="px-3 py-1.5 text-right"><Badge variant="outline" className="text-[9px] h-4 px-1.5">{cnt}</Badge></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </ScrollArea>
          <Separator />
          <div className="px-5 py-3"><DialogClose asChild><Button variant="outline" size="sm" className="gap-1.5"><X className="size-3.5" /> Fechar</Button></DialogClose></div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmWipe} onOpenChange={v => { if (!v) setConfirmWipe(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="size-4 text-destructive" /> Apagar período inteiro?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Remove <strong>todos os {meta?.itemCount?.toLocaleString("pt-BR")} registros</strong> de {String(localMonth).padStart(2,"0")}/{localYear} permanentemente.</p>
                <p className="text-muted-foreground text-xs">As chaves de dedup também serão limpas.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wiping}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={wipePeriod} disabled={wiping}>
              {wiping && <Loader2 className="size-3.5 animate-spin mr-1.5" />} Apagar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmWipeDay} onOpenChange={v => { if (!v) setConfirmWipeDay(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="size-4 text-destructive" /> Apagar dia {String(filterDay).padStart(2,"0")}/{String(localMonth).padStart(2,"0")}/{localYear}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Remove todos os registros deste dia. O restante do mês será preservado.</p>
                <p className="text-muted-foreground text-xs">As dedupKeys do dia também serão removidas — você poderá reimportar.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wipingDay}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={wipeDay} disabled={wipingDay}>
              {wipingDay && <Loader2 className="size-3.5 animate-spin mr-1.5" />} Apagar dia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export function VisaoAnaliticaPage() {
  const { toast } = useToast()
  const today = new Date()

  const [filterYear,     setFilterYear]     = React.useState(today.getFullYear())
  const [filterMonth,    setFilterMonth]    = React.useState(today.getMonth() + 1)
  const [filterDay,      setFilterDay]      = React.useState<number>(today.getDate())
  const [filterFilial,   setFilterFilial]   = React.useState("all")
  const [filterRegiao,   setFilterRegiao]   = React.useState("all")
  const [filterModelo,   setFilterModelo]   = React.useState("all")
  const [filterOperacao, setFilterOperacao] = React.useState("all")
  const [search,         setSearch]         = React.useState("")
  const [hideRotaChao,   setHideRotaChao]   = React.useState(true)

  const [rows,       setRows]       = React.useState<Row[]>([])
  const [loading,    setLoading]    = React.useState(true)
  const [totalCount, setTotalCount] = React.useState(0)
  const [gridCols,   setGridCols]   = React.useState(INITIAL_GRID_COLS)
  const [selected,   setSelected]   = React.useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting,   setDeleting]   = React.useState(false)
  const [sortCol,    setSortCol]    = React.useState<string | null>(null)
  const [sortAsc,    setSortAsc]    = React.useState(true)
  const [editRow,    setEditRow]    = React.useState<Row | null>(null)
  const [editDraft,  setEditDraft]  = React.useState<Record<string, string>>({})
  const [saving,     setSaving]     = React.useState(false)
  const [showGerenciar,        setShowGerenciar]        = React.useState(false)
  const [showGerenciarColunas, setShowGerenciarColunas] = React.useState(false)

  // ── Cadastros ─────────────────────────────────────────────────────────────
  const [funcionarios, setFuncionarios] = React.useState<Funcionario[]>([])
  const [veiculoMap,   setVeiculoMap]   = React.useState<Map<string, VeiculoInfo>>(new Map())

  React.useEffect(() => {
    getDocs(collection(db, "docs_funcionarios")).then(snap => {
      setFuncionarios(snap.docs.map(d => ({ id: d.id, ...d.data() } as Funcionario)))
    }).catch(() => {})
    getDocs(collection(db, "docs_veiculos")).then(snap => {
      const map = new Map<string, VeiculoInfo>()
      for (const d of snap.docs) {
        const data = d.data()
        map.set(normalizarPlaca(d.id), {
          modelo:   String(data.MODELO   ?? ""),
          operacao: String(data.OPERACAO ?? ""),
        })
      }
      setVeiculoMap(map)
    }).catch(() => {})
  }, [])

  const funcOptions = React.useMemo(() =>
    funcionarios.filter(f => String(f.STATUS ?? "").toUpperCase() === "ATIVO")
      .map(f => ({ value: f.NOME_COMPLETO, label: f.NOME_COMPLETO, sub: f.CARGO }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [funcionarios])

  const veiculoOptions = React.useMemo(() => {
    const opts: { value: string; label: string; sub: string }[] = []
    veiculoMap.forEach((info, placa) => opts.push({ value: placa, label: placa, sub: info.modelo || "" }))
    return opts.sort((a, b) => a.label.localeCompare(b.label))
  }, [veiculoMap])

  // ── Faturamento ───────────────────────────────────────────────────────────
  const [showFaturamento, setShowFaturamento] = React.useState(false)
  const [fatFile,         setFatFile]         = React.useState<File | null>(null)
  const [fatProcessing,   setFatProcessing]   = React.useState(false)
  const [fatLog,          setFatLog]          = React.useState<string[]>([])

  const handleFaturamentoUpdate = async () => {
    if (!fatFile) return
    setFatProcessing(true); setFatLog(["Lendo arquivo de faturamento..."])
    try {
      const buffer = await fatFile.arrayBuffer()
      const wb = XLSX.read(buffer, { type: "array" })
      const fatRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[]
      setFatLog(prev => [...prev, `${fatRows.length} linhas lidas. Iniciando matching...`])
      const result = await updateEntregasFromFaturamentoAction(fatRows, filterYear, filterMonth)
      if (result.success) {
        setFatLog(prev => [...prev,
          `✅ ${result.updated} registro(s) atualizado(s).`,
          `🔗 ${result.matched} viagem(ns) com match.`,
          result.notMatched.length > 0 ? `⚠️ ${result.notMatched.length} sem match: ${result.notMatched.slice(0,8).join(", ")}${result.notMatched.length > 8 ? "..." : ""}` : "✅ Todas com match.",
          "Recarregando...",
        ])
        clearCacheEntry(getAnaliticaCacheKey(filterYear, filterMonth))
        await fetchData(true)
        toast({ title: "Faturamento aplicado!", description: result.message })
      } else {
        setFatLog(prev => [...prev, `❌ Erro: ${result.message}`])
        toast({ variant: "destructive", title: "Erro", description: result.message })
      }
    } catch (e: any) {
      setFatLog(prev => [...prev, `❌ ${e.message}`])
      toast({ variant: "destructive", title: "Erro", description: e.message })
    } finally { setFatProcessing(false) }
  }

  const tableContainerRef = React.useRef<HTMLDivElement>(null)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = React.useCallback(async (forceRefresh = false) => {
    setLoading(true); setSelected(new Set())
    const cacheKey = getAnaliticaCacheKey(filterYear, filterMonth)
    if (!forceRefresh) {
      const cachedData = getFromCache<{ rows: Row[]; totalCount: number }>(cacheKey)
      if (cachedData && Array.isArray(cachedData.rows)) {
        setRows(cachedData.rows); setTotalCount(cachedData.totalCount ?? 0)
        toast({ description: `${cachedData.rows.length} registros carregados do cache.` })
        setLoading(false); return
      }
    }
    try {
      const docId = mainDocId("consolidacao-entregas", filterYear, filterMonth)
      const metaSnap = await getDoc(doc(db, "pipeline_results", docId))
      trackRead(1)
      if (!metaSnap.exists()) { setRows([]); setTotalCount(0); toast({ description: "Nenhum dado importado para este período." }); return }
      const itemCount = metaSnap.data().itemCount ?? 0
      setTotalCount(itemCount)
      const items = await loadItemsFromFirebase("consolidacao-entregas", filterYear, filterMonth)
      const newRows = items.map((r, idx) => ({ ...r, __rowIdx: idx })) as Row[]
      setRows(newRows)
      setInCache(cacheKey, { rows: newRows, totalCount: itemCount })
      toast({ description: `${items.length} registros carregados.` })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: e.message }); setRows([])
    } finally { setLoading(false) }
  }, [filterYear, filterMonth, toast])

  React.useEffect(() => { fetchData() }, [fetchData])

  const filiais  = React.useMemo(() => [...new Set(rows.map(r => r["FILIAL"]).filter(Boolean))].sort(), [rows])
  const regioes  = React.useMemo(() => [...new Set(rows.map(r => r["REGIÃO"]).filter(Boolean))].sort(), [rows])
  const modelos  = React.useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { const m = veiculoMap.get(normalizarPlaca(r["PLACA"] ?? ""))?.modelo; if (m && m !== "-" && m.trim()) s.add(m.trim()) })
    return [...s].sort()
  }, [rows, veiculoMap])
  const operacoes = React.useMemo(() => {
    const s = new Set<string>()
    rows.forEach(r => { const op = veiculoMap.get(normalizarPlaca(r["PLACA"] ?? ""))?.operacao; if (op && op.trim()) s.add(op.trim()) })
    return [...s].sort()
  }, [rows, veiculoMap])

  const filtered = React.useMemo(() => {
    let r = rows
    if (filterDay > 0)          r = r.filter(row => extractDay(row["DATA DE ENTREGA"]) === filterDay)
    if (filterFilial !== "all") r = r.filter(row => row["FILIAL"] === filterFilial)
    if (filterRegiao !== "all") r = r.filter(row => row["REGIÃO"] === filterRegiao)
    if (hideRotaChao)           r = r.filter(row => String(row["ROTA"] ?? "").toUpperCase().trim() !== "CHÃO")
    if (search) { const s = search.toLowerCase(); r = r.filter(row => gridCols.some(col => String(row[col] ?? "").toLowerCase().includes(s))) }
    if (filterModelo !== "all")   r = r.filter(row => (veiculoMap.get(normalizarPlaca(row["PLACA"] ?? ""))?.modelo ?? "").trim() === filterModelo)
    if (filterOperacao !== "all") r = r.filter(row => (veiculoMap.get(normalizarPlaca(row["PLACA"] ?? ""))?.operacao ?? "").trim() === filterOperacao)
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortCol] ?? ""); const bv = String(b[sortCol] ?? "")
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return r
  }, [rows, filterDay, filterFilial, filterRegiao, hideRotaChao, search, sortCol, sortAsc, gridCols, filterModelo, filterOperacao, veiculoMap])

  const filteredIdxs = filtered.map(r => r.__rowIdx)
  const allSelected  = filteredIdxs.length > 0 && filteredIdxs.every(i => selected.has(i))
  const someSelected = filteredIdxs.some(i => selected.has(i)) && !allSelected
  const toggleAll = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); filteredIdxs.forEach(i => n.delete(i)); return n })
    else             setSelected(prev => new Set([...prev, ...filteredIdxs]))
  }
  const toggleRow = (idx: number) => setSelected(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })

  const deleteSelected = async () => {
    if (!selected.size) return
    setDeleting(true)
    const docId = mainDocId("consolidacao-entregas", filterYear, filterMonth)
    try {
      const toDelete = rows.filter(r => selected.has(r.__rowIdx))
      const itemsRef = collection(db, "pipeline_results", docId, "items")
      const BATCH_LIMIT = 499; let batch = writeBatch(db), count = 0
      for (const r of toDelete) { batch.delete(doc(itemsRef, r._itemId)); count++; if (count >= BATCH_LIMIT) { await batch.commit(); trackDelete(count); batch = writeBatch(db); count = 0 } }
      if (count > 0) { await batch.commit(); trackDelete(count) }
      const newCount = totalCount - toDelete.length
      await updateDoc(doc(db, "pipeline_results", docId), { itemCount: newCount }); trackWrite(1); setTotalCount(newCount)
      setRows(prev => prev.filter(r => !selected.has(r.__rowIdx)).map((r, idx) => ({ ...r, __rowIdx: idx })))
      toast({ title: `${selected.size} registro(s) excluído(s).` }); setSelected(new Set())
    } catch (e: any) { toast({ variant: "destructive", title: "Erro ao excluir", description: e.message }) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  const openEdit = (row: Row) => {
    setEditRow(row)
    const draft: Record<string, string> = {}
    ALL_FIELDS.forEach(f => { let val = String(row[f] ?? ""); if (f === "TEMPO") { const t = extractTempo(row[f]); val = t ?? val }; draft[f] = val })
    setEditDraft(draft)
  }

  const saveEdit = async () => {
    if (!editRow) return; setSaving(true)
    try {
      const docId = mainDocId("consolidacao-entregas", filterYear, filterMonth)
      await updateDoc(doc(db, "pipeline_results", docId, "items", editRow._itemId), editDraft); trackWrite(1)
      setRows(prev => prev.map(r => r.__rowIdx === editRow.__rowIdx ? { ...r, ...editDraft } : r))
      toast({ title: "Salvo!", description: "Registro atualizado." }); setEditRow(null)
    } catch (e: any) { toast({ variant: "destructive", title: "Erro ao salvar", description: e.message }) }
    finally { setSaving(false) }
  }

  const toggleSort = (col: string) => { if (sortCol === col) setSortAsc(a => !a); else { setSortCol(col); setSortAsc(true) } }

  const exportXlsx = React.useCallback(() => {
    const data = filtered.map(row => {
      const obj: Record<string, any> = {}
      gridCols.forEach(col => { let v = row[col]; if (col === "TEMPO") { const t = extractTempo(v); if (t) v = t }; obj[col] = v })
      return obj
    })
    exportExcel(data, `Visão Analítica - ${String(filterMonth).padStart(2,"0")}-${filterYear}.xlsx`)
  }, [filtered, gridCols, filterMonth, filterYear])

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Database className="size-4 text-primary" /> Visão Analítica — Entregas</CardTitle>
              <CardDescription className="mt-0.5">
                Rotas de Entrega
                {totalCount > 0 && <span className="ml-1 font-semibold text-foreground">· {totalCount.toLocaleString("pt-BR")} registros no banco.</span>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 shrink-0" onClick={() => setShowGerenciarColunas(true)}><Columns3 className="size-3.5 text-muted-foreground" /> Colunas</Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 shrink-0" onClick={exportXlsx}><FileDown className="size-3.5 text-muted-foreground" /> Exportar Excel</Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 shrink-0" onClick={() => { setFatFile(null); setFatLog([]); setShowFaturamento(true) }}><Zap className="size-3.5 text-amber-500" /> Atualizar Faturamento</Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 shrink-0" onClick={() => setShowGerenciar(true)}><FileStack className="size-3.5 text-muted-foreground" /> Gerenciar Firebase</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Ano</Label>
              <Input type="number" className="w-24 h-8 text-xs" value={filterYear} onChange={e => setFilterYear(+e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Mês</Label>
              <Input type="number" min={1} max={12} className="w-20 h-8 text-xs" value={filterMonth} onChange={e => setFilterMonth(+e.target.value)} /></div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Dia <span className="normal-case text-muted-foreground font-normal">(0 = todos)</span></Label>
              <Input type="number" min={0} max={31} className="w-20 h-8 text-xs" value={filterDay === 0 ? "" : filterDay}
                onChange={e => { const v = parseInt(e.target.value); setFilterDay(isNaN(v) || v < 0 ? 0 : Math.min(v, 31)) }} /></div>
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
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Modelo</Label>
              <Select value={filterModelo} onValueChange={setFilterModelo}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todos</SelectItem>{modelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label className="text-[10px] uppercase tracking-wider">Operação</Label>
              <Select value={filterOperacao} onValueChange={setFilterOperacao}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas</SelectItem>{operacoes.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1 flex-1 min-w-[160px]"><Label className="text-[10px] uppercase tracking-wider">Busca geral</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input className="pl-6 h-8 text-xs" placeholder="motorista, placa..." value={search} onChange={e => setSearch(e.target.value)} />
              </div></div>
            <div className="flex items-center self-end pb-1 gap-2">
              <Checkbox id="hide-rota-chao" checked={hideRotaChao} onCheckedChange={v => setHideRotaChao(!!v)} className="size-3.5" />
              <label htmlFor="hide-rota-chao" className="text-xs font-medium leading-none cursor-pointer">Ocultar CHÃO</label></div>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fetchData(true)} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Atualizar
            </Button>
          </div>
          {rows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Badge variant="outline" className="text-[10px]">{filtered.length} de {rows.length} registros</Badge>
              {filterDay > 0 && <Badge variant="secondary" className="text-[10px]">Dia {String(filterDay).padStart(2, "0")}</Badge>}
              {selected.size > 0 && (
                <>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20">{selected.size} selecionado{selected.size > 1 ? "s" : ""}</Badge>
                  <Button variant="destructive" size="sm" className="h-6 text-[10px] px-2.5 gap-1" onClick={() => setConfirmDelete(true)} disabled={deleting}>
                    {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Excluir selecionados
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><Loader2 className="size-5 animate-spin" /><span className="text-sm">Carregando...</span></div>}
      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 py-16 text-center">
          <Database className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum dado para o período. Clique em <strong>Atualizar</strong>.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-border/60 shadow-sm overflow-hidden">
          <div ref={tableContainerRef} className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.85)" }}>
                  <th className="px-3 py-2.5 w-10" style={{ backgroundColor: "transparent" }}>
                    <Checkbox checked={allSelected} aria-checked={someSelected ? "mixed" : allSelected} onCheckedChange={toggleAll} className="size-3.5" />
                  </th>
                  {gridCols.map(col => (
                    <React.Fragment key={col}>
                      <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                        style={{ backgroundColor: "transparent" }} onClick={() => toggleSort(col)}>
                        <span className="flex items-center justify-center gap-1">
                          {col}{sortCol === col ? sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" /> : null}
                        </span>
                      </th>
                      {/* ✅ MODELO e OPERAÇÃO */}
                      {col === "AJUDANTE 2" && (
                        <>
                          <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ backgroundColor: "transparent" }}>MODELO</th>
                        </>
                      )}
                      {col === "REGIÃO" && (
                        <>
                          <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ backgroundColor: "transparent" }}>OPERAÇÃO</th>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                  <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground w-14" style={{ backgroundColor: "transparent" }}>Editar</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const isSelected = selected.has(row.__rowIdx)
                  return (
                    <tr key={row._itemId ?? i} className={cn("border-b transition-colors hover:bg-muted/10",
                      isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/5")}>
                      <td className="px-3 py-2 text-center">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(row.__rowIdx)} className="size-3.5" />
                      </td>
                      {gridCols.map(col => (
                        <React.Fragment key={col}>
                          <td className={cn("px-3 py-2 whitespace-nowrap text-center", {
                            "min-w-[240px]": col === "MOTORISTA",
                            "min-w-[200px]": col === "AJUDANTE" || col === "AJUDANTE 2",
                          })}>{cellVal(row[col], col)}</td>
                          {/* ✅ MODELO e OPERAÇÃO */}
                          {col === "AJUDANTE 2" && (
                            <>
                              <td className="px-3 py-2 text-center whitespace-nowrap">{modeloBadgeAnalitica(row["PLACA"], veiculoMap)}</td>
                            </>
                          )}
                          {col === "REGIÃO" && (
                            <>
                              <td className="px-3 py-2 text-center whitespace-nowrap">{operacaoBadgeAnalitica(row["PLACA"], veiculoMap)}</td>
                            </>
                          )}
                        </React.Fragment>
                      ))}
                      <td className="px-3 py-2 text-center">
                        <Button variant="ghost" size="icon" className="size-6" onClick={() => openEdit(row)}><Edit2 className="size-3 text-primary" /></Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registros?</AlertDialogTitle>
            <AlertDialogDescription>Remove <strong>{selected.size} registro{selected.size > 1 ? "s" : ""}</strong> do Firebase permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteSelected} disabled={deleting}>
              {deleting && <Loader2 className="size-3.5 animate-spin mr-1.5" />}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal edição ── */}
      <Dialog open={!!editRow} onOpenChange={open => { if (!open) setEditRow(null) }}>
        <DialogContent className="max-w-4xl flex flex-col gap-0 p-0" style={{ height: "min(90vh, 760px)", maxHeight: "90vh" }}>
          <DialogHeader className="px-7 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <Edit2 className="size-4 text-primary" /> Editar registro
              {editRow && <Badge variant="outline" className="ml-1 text-[11px] font-normal">{editRow["MOTORISTA"] || "—"} · {editRow["DATA DE ENTREGA"] || "—"}</Badge>}
            </DialogTitle>
            <DialogDescription>Altere os dados e clique em Confirmar para salvar.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-7 py-5">
            <div className="space-y-7">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Identificação</p>
                <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                  {(["DATA DE ENTREGA","DATA","FILIAL","REGIÃO"] as const).map(f => (
                    <div key={f} className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{f}</Label>
                      <Input className="h-8 text-xs" value={editDraft[f] ?? ""} onChange={e => setEditDraft(p => ({ ...p, [f]: e.target.value }))} /></div>
                  ))}
                  <div className="col-span-2 space-y-1.5"><Label className="text-[11px] text-muted-foreground">ROTA</Label>
                    <Input className="h-8 text-xs" value={editDraft["ROTA"] ?? ""} onChange={e => setEditDraft(p => ({ ...p, ROTA: e.target.value }))} /></div>
                  {(["VIAGENS","STATUS"] as const).map(f => (
                    <div key={f} className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{f}</Label>
                      <Input className="h-8 text-xs" value={editDraft[f] ?? ""} onChange={e => setEditDraft(p => ({ ...p, [f]: e.target.value }))} /></div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border/50" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Equipe e Veículo</p>
                <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                  <div className="col-span-2"><SearchSelect label="MOTORISTA" value={editDraft["MOTORISTA"] ?? ""} onChange={v => setEditDraft(p => ({ ...p, MOTORISTA: v }))} options={funcOptions} placeholder="Selecionar motorista..." /></div>
                  <div><SearchSelect label="AJUDANTE" value={editDraft["AJUDANTE"] ?? ""} onChange={v => setEditDraft(p => ({ ...p, AJUDANTE: v }))} options={funcOptions} placeholder="Selecionar..." /></div>
                  <div><SearchSelect label="AJUDANTE 2" value={editDraft["AJUDANTE 2"] ?? ""} onChange={v => setEditDraft(p => ({ ...p, ["AJUDANTE 2"]: v }))} options={funcOptions} placeholder="Selecionar..." /></div>
                  <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">PLACA SISTEMA</Label>
                    <Input className="h-8 text-xs" value={editDraft["PLACA SISTEMA"] ?? ""} onChange={e => setEditDraft(p => ({ ...p, ["PLACA SISTEMA"]: e.target.value }))} /></div>
                  <div><SearchSelect label="PLACA" value={editDraft["PLACA"] ?? ""} onChange={v => {
                    const info = veiculoMap.get(normalizarPlaca(v))
                    setEditDraft(p => ({ ...p, PLACA: v, MODELO: info?.modelo ?? p["MODELO"] ?? "" }))
                  }} options={veiculoOptions} placeholder="Selecionar placa..." /></div>
                  <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">MODELO</Label>
                    <Input className="h-8 text-xs" value={editDraft["MODELO"] ?? ""} onChange={e => setEditDraft(p => ({ ...p, MODELO: e.target.value }))} /></div>
                </div>
              </div>
              <div className="border-t border-border/50" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Operação</p>
                <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                  {(["ENTREGAS","PESO","TEMPO","KM","SAÍDA"] as const).map(f => (
                    <div key={f} className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{f}</Label>
                      <Input className="h-8 text-xs" value={editDraft[f] ?? ""} onChange={e => setEditDraft(p => ({ ...p, [f]: e.target.value }))} /></div>
                  ))}
                  <div className="col-span-3 space-y-1.5"><Label className="text-[11px] text-muted-foreground">OBSERVAÇÃO</Label>
                    <Input className="h-8 text-xs" value={editDraft["OBSERVAÇÃO"] ?? ""} onChange={e => setEditDraft(p => ({ ...p, OBSERVAÇÃO: e.target.value }))} /></div>
                </div>
              </div>
              <div className="border-t border-border/50" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Financeiro</p>
                <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                  {["VALOR","CHAPA","FRETE","DESCARGA PALET","HOSPEDAGEM","DIARIA","EXTRA","CONTRATO","PERFORMAXXI","ENTREGAS DEV","VALOR DEV"].map(f => (
                    <div key={f} className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">{f}</Label>
                      <Input className="h-8 text-xs" value={editDraft[f] ?? ""} onChange={e => setEditDraft(p => ({ ...p, [f]: e.target.value }))} /></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-7 py-4 border-t bg-muted/5 shrink-0">
            <DialogClose asChild><Button variant="outline" size="sm" className="gap-1.5"><X className="size-3.5" /> Cancelar</Button></DialogClose>
            <Button size="sm" className="gap-1.5" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Faturamento ── */}
      <Dialog open={showFaturamento} onOpenChange={v => { if (!v) setShowFaturamento(false) }}>
        <DialogContent className="max-w-lg flex flex-col gap-0 p-0" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base"><Zap className="size-4 text-amber-500" /> Atualizar Entregas com Faturamento</DialogTitle>
            <DialogDescription className="text-xs mt-1">
              Selecione o Excel de faturamento. Os campos serão gravados nos registros do período <strong>{String(filterMonth).padStart(2,"0")}/{filterYear}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="rounded-lg bg-muted/20 border border-border/50 px-4 py-3 text-[11px] space-y-1">
              <p className="font-semibold text-foreground/80 mb-1.5">Cabeçalhos esperados:</p>
              {[["VIAGEM","Chave de matching (obrigatório)"],["DT_FATURAMENTO","Data do faturamento"],["FATURAMENTO","Valor faturado"],["ENTREGAS","Qtd entregas faturadas"]].map(([f,d]) => (
                <div key={f} className="flex gap-2"><code className="text-primary font-mono font-bold w-36 shrink-0">{f}</code><span className="text-muted-foreground">{d}</span></div>
              ))}
              <p className="text-muted-foreground pt-1">Extras salvos com prefixo <code className="font-mono text-primary">FAT_</code>.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Arquivo Excel / CSV</Label>
              <input type="file" accept=".xlsx,.xls,.csv"
                className="w-full text-xs border border-border rounded-md px-3 py-2 file:mr-3 file:text-xs file:font-medium file:border-0 file:bg-primary/10 file:text-primary file:rounded file:px-2 file:py-1 cursor-pointer"
                onChange={e => { setFatFile(e.target.files?.[0] ?? null); setFatLog([]) }} />
              {fatFile && <p className="text-[11px] text-muted-foreground"><FileSpreadsheet className="size-3 inline mr-1" />{fatFile.name} · {(fatFile.size / 1024).toFixed(0)} KB</p>}
            </div>
            {fatLog.length > 0 && (
              <div className="rounded-lg bg-slate-950 border border-slate-800 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-slate-800 flex items-center gap-2">
                  <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Log</span>
                </div>
                <div className="p-3 font-mono text-[11px] space-y-1 max-h-40 overflow-y-auto">
                  {fatLog.map((line, i) => (
                    <div key={i} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-emerald-400" : line.startsWith("⚠️") ? "text-amber-400" : line.startsWith("🔗") ? "text-blue-400" : "text-slate-400"}>{line}</div>
                  ))}
                  {fatProcessing && <div className="text-slate-500 animate-pulse">Processando...</div>}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/5 shrink-0">
            <p className="text-[10px] text-muted-foreground">Período: <strong>{String(filterMonth).padStart(2,"0")}/{filterYear}</strong></p>
            <div className="flex gap-2">
              <DialogClose asChild><Button variant="outline" size="sm" className="gap-1.5" disabled={fatProcessing}><X className="size-3.5" /> Fechar</Button></DialogClose>
              <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" onClick={handleFaturamentoUpdate} disabled={!fatFile || fatProcessing}>
                {fatProcessing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                {fatProcessing ? "Processando..." : "Aplicar Faturamento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <GerenciarImportacoesDialog open={showGerenciar} onClose={() => setShowGerenciar(false)} filterYear={filterYear} filterMonth={filterMonth} onDeleted={() => fetchData(true)} />
      <GerenciarColunasDialog open={showGerenciarColunas} onClose={() => setShowGerenciarColunas(false)} cols={gridCols} setCols={setGridCols} />
    </div>
  )
}