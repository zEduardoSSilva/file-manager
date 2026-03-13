import * as React from "react"
import {
  RefreshCw, Loader2, Edit2, X, Check, ChevronDown, ChevronUp,
  Search, Database, Trash2, ServerCrash, FileStack, CalendarDays,
  Building2, Hash, FileDown, Columns3, ArrowUpDown, Undo2,
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
  collection, query, where, getDocs, getDoc,
  doc, updateDoc, deleteDoc, writeBatch, getFirestore,
} from "firebase/firestore"
import { initializeApp, getApps, getApp } from "firebase/app"

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

// ─── Colunas do grid ─────────────────────────────────────────────────────────
const INITIAL_GRID_COLS = [
  "DATA DE ENTREGA", "FILIAL", "REGIÃO", "ROTA",
  "MOTORISTA", "AJUDANTE", "AJUDANTE 2",
  "PLACA", "PLACA SISTEMA",
  "ENTREGAS", "PESO", "TEMPO", "KM",
  "VIAGENS", "VALOR",
  "STATUS", "OBSERVAÇÃO",
]

const ALL_FIELDS = [
  "DATA DE ENTREGA", "DATA", "FILIAL", "REGIÃO", "ROTA",
  "MOTORISTA", "AJUDANTE", "AJUDANTE 2",
  "PLACA SISTEMA", "PLACA", "MODELO", "OCP",
  "ENTREGAS", "PESO", "TEMPO", "KM",
  "VIAGENS", "OBSERVAÇÃO",
  "CHAPA", "FRETE", "DESCARGA PALET",
  "HOSPEDAGEM", "DIARIA", "EXTRA", "SAÍDA",
  "VALOR", "STATUS", "CONTRATO",
  "PERFORMAXXI", "ENTREGAS DEV", "VALOR DEV",
]

// ✅ Row agora inclui __itemDocId (ID do documento na subcoleção items/)
type Row = Record<string, any> & {
  __mainDocId: string   // ID do pipeline_results/{id}
  __itemDocId: string   // ID do pipeline_results/{id}/items/{itemDocId}
  __rowIdx:    number
}

interface FireDoc {
  id: string
  timestamp: number
  itemCount: number
  porFilialDia: Record<string, Record<string, number>>
}

function cellVal(v: any, col: string) {
  if (v == null || v === "") return <span className="text-muted-foreground/40 text-[10px]">—</span>
  if (col === "TEMPO" && typeof v === "string" && v.includes("1899")) {
    const m = v.match(/(\d{2}:\d{2}:\d{2})/)
    if (m) return <span>{m[1]}</span>
  }
  return <span>{String(v)}</span>
}

function extractDay(dateStr: any): number | null {
  if (!dateStr) return null
  const m = String(dateStr).trim().match(/^(\d{1,2})[\/\.]/)
  return m ? parseInt(m[1]) : null
}

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// ════════════════════════════════════════════════════════════════════════════
// ── Gerenciar Colunas
// ════════════════════════════════════════════════════════════════════════════
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
          <DialogTitle className="flex items-center gap-2 text-base">
            <Columns3 className="size-4 text-primary" /> Gerenciar Colunas
          </DialogTitle>
          <DialogDescription>Reordene as colunas da tabela.</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2">
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
        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCols(INITIAL_GRID_COLS)}>
            <Undo2 className="size-3.5" /> Restaurar Padrão
          </Button>
          <DialogClose asChild>
            <Button size="sm" className="gap-1.5"><Check className="size-3.5" /> Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ── Gerenciar Importações
// ════════════════════════════════════════════════════════════════════════════
function GerenciarImportacoesDialog({
  open, onClose, filterYear, filterMonth, onDeleted,
}: {
  open: boolean; onClose: () => void
  filterYear: number; filterMonth: number; onDeleted: () => void
}) {
  const { toast } = useToast()
  const [docs,       setDocs]       = React.useState<FireDoc[]>([])
  const [loading,    setLoading]    = React.useState(false)
  const [filterDay,  setFilterDay]  = React.useState(0)
  const [confirmDoc, setConfirmDoc] = React.useState<FireDoc | null>(null)
  const [deleting,   setDeleting]   = React.useState(false)

  const loadDocs = React.useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const q = query(
        collection(db, "pipeline_results"),
        where("pipelineType", "==", "consolidacao-entregas"),
        where("year",  "==", filterYear),
        where("month", "==", filterMonth),
      )
      const snap = await getDocs(q)

      // ✅ Lê metadados + busca itens da subcoleção para montar porFilialDia
      const result: FireDoc[] = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data()
          const itemsSnap = await getDocs(collection(db, "pipeline_results", d.id, "items"))
          const rows = itemsSnap.docs.map(i => i.data())

          const porFilialDia: Record<string, Record<string, number>> = {}
          for (const row of rows) {
            const filial = String(row["FILIAL"] ?? "—")
            const dt     = String(row["DATA DE ENTREGA"] ?? "—")
            if (!porFilialDia[filial]) porFilialDia[filial] = {}
            porFilialDia[filial][dt] = (porFilialDia[filial][dt] ?? 0) + 1
          }
          return {
            id: d.id,
            timestamp: data.timestamp ?? 0,
            itemCount: data.itemCount ?? rows.length,
            porFilialDia,
          }
        })
      )
      setDocs(result.sort((a, b) => b.timestamp - a.timestamp))
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao carregar documentos", description: e.message })
    } finally {
      setLoading(false)
    }
  }, [open, filterYear, filterMonth, toast])

  React.useEffect(() => { loadDocs() }, [loadDocs])

  const deleteDoc_ = async (fireDoc: FireDoc) => {
    setDeleting(true)
    try {
      // ✅ Exclui subcoleção items/ antes de excluir o doc principal
      const itemsSnap = await getDocs(collection(db, "pipeline_results", fireDoc.id, "items"))
      const BATCH_LIMIT = 499
      let batch = writeBatch(db)
      let count = 0
      for (const itemDoc of itemsSnap.docs) {
        batch.delete(itemDoc.ref)
        count++
        if (count >= BATCH_LIMIT) {
          await batch.commit()
          batch = writeBatch(db); count = 0
        }
      }
      if (count > 0) await batch.commit()
      await deleteDoc(doc(db, "pipeline_results", fireDoc.id))
      toast({ title: "Documento excluído.", description: `ID: ${fireDoc.id}` })
      setConfirmDoc(null)
      await loadDocs()
      onDeleted()
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message })
    } finally {
      setDeleting(false)
    }
  }

  const diasDisponiveis = React.useMemo(() => {
    const s = new Set<string>()
    for (const d of docs) for (const dm of Object.values(d.porFilialDia)) for (const dia of Object.keys(dm)) s.add(dia)
    return [...s].sort()
  }, [docs])

  const docsFiltrados = React.useMemo(() => {
    if (filterDay === 0) return docs
    const pad = String(filterDay).padStart(2, "0")
    return docs.map(d => {
      const porFilialDia: Record<string, Record<string, number>> = {}
      for (const [f, dm] of Object.entries(d.porFilialDia)) {
        const filt: Record<string, number> = {}
        for (const [dt, cnt] of Object.entries(dm)) if (dt.startsWith(pad + "/")) filt[dt] = cnt
        if (Object.keys(filt).length) porFilialDia[f] = filt
      }
      const itemCount = Object.values(porFilialDia).reduce((a, dm) => a + Object.values(dm).reduce((b, n) => b + n, 0), 0)
      return { ...d, porFilialDia, itemCount }
    }).filter(d => d.itemCount > 0)
  }, [docs, filterDay])

  const latestTimestampsByFilial = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const doc of docs) {
      for (const filial of Object.keys(doc.porFilialDia)) {
        if (!map.has(filial) || doc.timestamp > map.get(filial)!) {
          map.set(filial, doc.timestamp)
        }
      }
    }
    return map
  }, [docs])

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileStack className="size-4 text-primary" /> Gerenciar Importações — Firebase
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Documentos em <span className="font-mono font-semibold text-foreground">pipeline_results</span>{" "}
              para {String(filterMonth).padStart(2, "0")}/{filterYear}.
            </DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="px-5 py-3 flex items-end gap-3 bg-muted/5">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Filtrar dia</Label>
              <Select value={String(filterDay)} onValueChange={v => setFilterDay(parseInt(v))}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Todos os dias</SelectItem>
                  {diasDisponiveis.map(dia => (
                    <SelectItem key={dia} value={String(parseInt(dia))}>{dia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="outline" className="text-[10px]">{docs.length} documento(s)</Badge>
              {docs.length > 1 && (
                <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-200">
                  {docs.length - latestTimestampsByFilial.size} redundante(s)
                </Badge>
              )}
              <Button variant="ghost" size="icon" className="size-7" onClick={loadDocs} disabled={loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex-1 px-5 py-3 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /><span className="text-sm">Carregando...</span>
              </div>
            )}
            {!loading && docsFiltrados.length === 0 && (
              <div className="py-10 text-center">
                <ServerCrash className="size-7 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
              </div>
            )}
            {!loading && docsFiltrados.length > 0 && (
              <div className="space-y-3">
                {docsFiltrados.map((fireDoc) => {
                  const filiaisNesteDoc = Object.keys(fireDoc.porFilialDia)
                  const isNewestForAtLeastOneFilial = filiaisNesteDoc.some(f => latestTimestampsByFilial.get(f) === fireDoc.timestamp)
                  
                  return (
                    <div key={fireDoc.id} className={cn(
                      "rounded-xl border overflow-hidden shadow-sm",
                      isNewestForAtLeastOneFilial ? "border-primary/30" : "border-border/60"
                    )}>
                      <div className={cn("flex items-center gap-2 px-3 py-2.5",
                        isNewestForAtLeastOneFilial ? "bg-primary/5" : "bg-muted/10")}>
                        <Database className={cn("size-3.5 shrink-0", isNewestForAtLeastOneFilial ? "text-primary" : "text-muted-foreground")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-foreground/80 truncate">{fireDoc.id}</span>
                            {isNewestForAtLeastOneFilial && <Badge className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">ativo</Badge>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">Importado em {fmtTs(fireDoc.timestamp)}</span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] font-semibold text-foreground">{fireDoc.itemCount} registros</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="size-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => setConfirmDoc(fireDoc)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className="border-t border-border/40">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-muted/20">
                              <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground w-28">
                                <span className="flex items-center gap-1"><Building2 className="size-2.5" /> Filial</span>
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">
                                <span className="flex items-center gap-1"><CalendarDays className="size-2.5" /> Data de Entrega</span>
                              </th>
                              <th className="px-3 py-1.5 text-right font-semibold text-muted-foreground w-20">
                                <span className="flex items-center justify-end gap-1"><Hash className="size-2.5" /> Registros</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(fireDoc.porFilialDia).flatMap(([filial, diaMap], fi) =>
                              Object.entries(diaMap).map(([dia, cnt], di) => (
                                <tr key={`${fi}-${di}`} className={cn("border-t border-border/20",
                                  (fi + di) % 2 === 0 ? "bg-background" : "bg-muted/5")}>
                                  {di === 0 ? (
                                    <td className="px-3 py-1.5 font-semibold text-foreground/80" rowSpan={Object.keys(diaMap).length}>
                                      {filial}
                                    </td>
                                  ) : null}
                                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{dia}</td>
                                  <td className="px-3 py-1.5 text-right">
                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">{cnt}</Badge>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <Separator />
          <div className="px-5 py-3">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <X className="size-3.5" /> Fechar
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDoc} onOpenChange={v => { if (!v) setConfirmDoc(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" /> Excluir documento do Firebase?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Remove permanentemente <span className="font-mono text-foreground bg-muted px-1 rounded">{confirmDoc?.id}</span>{" "}
                  com <strong>{confirmDoc?.itemCount} registros</strong>.
                </p>
                <p className="text-muted-foreground text-xs">Esta ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDoc && deleteDoc_(confirmDoc)} disabled={deleting}
            >
              {deleting && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Excluir do Firebase
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ── Página principal
// ════════════════════════════════════════════════════════════════════════════
export function VisaoAnaliticaPage() {
  const { toast } = useToast()
  const today = new Date()

  const [filterYear,   setFilterYear]   = React.useState(today.getFullYear())
  const [filterMonth,  setFilterMonth]  = React.useState(today.getMonth() + 1)
  const [filterDay,    setFilterDay]    = React.useState<number>(today.getDate())
  const [filterRegiao, setFilterRegiao] = React.useState("all")
  const [filterFilial, setFilterFilial] = React.useState("all")
  const [search,       setSearch]       = React.useState("")
  const [hideRotaChao, setHideRotaChao] = React.useState(true)

  const [rows,    setRows]    = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(true)
  const [gridCols, setGridCols] = React.useState(INITIAL_GRID_COLS)

  const [selected,      setSelected]      = React.useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting,      setDeleting]      = React.useState(false)

  const [sortCol, setSortCol] = React.useState<string | null>(null)
  const [sortAsc, setSortAsc] = React.useState(true)

  const [editRow,   setEditRow]   = React.useState<Row | null>(null)
  const [editDraft, setEditDraft] = React.useState<Record<string, string>>({})
  const [saving,    setSaving]    = React.useState(false)

  const [showGerenciar,        setShowGerenciar]        = React.useState(false)
  const [showGerenciarColunas, setShowGerenciarColunas] = React.useState(false)

  // ─── ✅ Fetch: Combina múltiplas importações, usando a mais recente por FILIAL ───
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const q = query(
        collection(db, "pipeline_results"),
        where("pipelineType", "==", "consolidacao-entregas"),
        where("year",  "==", filterYear),
        where("month", "==", filterMonth)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setRows([]);
        toast({ description: "Nenhum resultado encontrado para este período." });
        return;
      }

      // 1. Carrega todos os items de todos os documentos do período, guardando o timestamp e filial.
      const allItems: any[] = [];
      for (const mainDoc of snap.docs) {
        const timestamp = mainDoc.data().timestamp ?? 0;
        const itemsSnap = await getDocs(collection(db, "pipeline_results", mainDoc.id, "items"));
        for (const itemDoc of itemsSnap.docs) {
          const itemData = itemDoc.data();
          allItems.push({
            ...itemData,
            __mainDocId: mainDoc.id,
            __itemDocId: itemDoc.id,
            __timestamp: timestamp,
            __filial: itemData["FILIAL"] ?? "INDEFINIDA",
          });
        }
      }

      // 2. Encontra o timestamp mais recente para cada filial
      const latestTimestampByFilial = new Map<string, number>();
      for (const item of allItems) {
        const currentLatest = latestTimestampByFilial.get(item.__filial) ?? 0;
        if (item.__timestamp > currentLatest) {
          latestTimestampByFilial.set(item.__filial, item.__timestamp);
        }
      }

      // 3. Filtra os items, mantendo apenas aqueles do documento mais recente para sua respectiva filial
      const finalRows = allItems
        .filter(item => item.__timestamp === latestTimestampByFilial.get(item.__filial))
        .map((item, idx) => {
          // Remove os campos de ajuda antes de salvar no estado
          const { __timestamp, __filial, ...rest } = item;
          return {
            ...rest,
            __rowIdx: idx,
          };
        });

      setRows(finalRows as Row[]);
      toast({ description: `${finalRows.length} registros carregados de ${latestTimestampByFilial.size} filial(is) ativa(s).` });

    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: e.message });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterMonth, toast]);

  React.useEffect(() => { fetchData() }, [fetchData])

  const filiais = React.useMemo(() => [...new Set(rows.map(r => r["FILIAL"]).filter(Boolean))].sort(), [rows])
  const regioes = React.useMemo(() => [...new Set(rows.map(r => r["REGIÃO"]).filter(Boolean))].sort(), [rows])

  const filtered = React.useMemo(() => {
    let r = rows
    if (filterDay > 0)          r = r.filter(row => extractDay(row["DATA DE ENTREGA"]) === filterDay)
    if (filterFilial !== "all") r = r.filter(row => row["FILIAL"] === filterFilial)
    if (filterRegiao !== "all") r = r.filter(row => row["REGIÃO"] === filterRegiao)
    if (hideRotaChao)           r = r.filter(row => String(row["ROTA"] ?? "").toUpperCase().trim() !== "CHÃO")
    if (search) {
      const s = search.toLowerCase()
      r = r.filter(row => gridCols.some(col => String(row[col] ?? "").toLowerCase().includes(s)))
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortCol] ?? "")
        const bv = String(b[sortCol] ?? "")
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return r
  }, [rows, filterDay, filterFilial, filterRegiao, hideRotaChao, search, sortCol, sortAsc, gridCols])

  const filteredIdxs = filtered.map(r => r.__rowIdx)
  const allSelected  = filteredIdxs.length > 0 && filteredIdxs.every(i => selected.has(i))
  const someSelected = filteredIdxs.some(i => selected.has(i)) && !allSelected

  const toggleAll = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); filteredIdxs.forEach(i => n.delete(i)); return n })
    else             setSelected(prev => new Set([...prev, ...filteredIdxs]))
  }
  const toggleRow = (idx: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })

  // ✅ deleteSelected: exclui documentos individuais da subcoleção items/
  const deleteSelected = async () => {
    if (!selected.size) return
    setDeleting(true)
    try {
      const toDelete = rows.filter(r => selected.has(r.__rowIdx))

      // Agrupa por mainDocId (normalmente só 1)
      const byMainDoc = new Map<string, Row[]>()
      for (const r of toDelete) {
        if (!byMainDoc.has(r.__mainDocId)) byMainDoc.set(r.__mainDocId, [])
        byMainDoc.get(r.__mainDocId)!.push(r)
      }

      const BATCH_LIMIT = 499
      let batch = writeBatch(db)
      let count = 0

      for (const [mainDocId, rowsToDelete] of byMainDoc) {
        for (const r of rowsToDelete) {
          const itemRef = doc(db, "pipeline_results", mainDocId, "items", r.__itemDocId)
          batch.delete(itemRef)
          count++
          if (count >= BATCH_LIMIT) {
            await batch.commit()
            batch = writeBatch(db); count = 0
          }
        }
        // Atualiza itemCount no documento principal
        const newCount = (rows.filter(r => r.__mainDocId === mainDocId).length) - rowsToDelete.length
        batch.update(doc(db, "pipeline_results", mainDocId), { itemCount: newCount })
        count++
      }
      if (count > 0) await batch.commit()

      setRows(prev => prev.filter(r => !selected.has(r.__rowIdx)).map((r, idx) => ({ ...r, __rowIdx: idx })))
      toast({ title: `${selected.size} registro(s) excluído(s).` })
      setSelected(new Set())
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message })
    } finally {
      setDeleting(false); setConfirmDelete(false)
    }
  }

  const openEdit = (row: Row) => {
    setEditRow(row)
    const draft: Record<string, string> = {}
    ALL_FIELDS.forEach(f => { draft[f] = String(row[f] ?? "") })
    setEditDraft(draft)
  }

  // ✅ saveEdit: atualiza o documento individual na subcoleção items/
  const saveEdit = async () => {
    if (!editRow) return
    setSaving(true)
    try {
      const itemRef = doc(db, "pipeline_results", editRow.__mainDocId, "items", editRow.__itemDocId)
      await updateDoc(itemRef, editDraft)
      setRows(prev => prev.map(r =>
        r.__rowIdx === editRow.__rowIdx ? { ...r, ...editDraft } : r
      ))
      toast({ title: "Salvo!", description: "Registro atualizado." })
      setEditRow(null)
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: e.message })
    } finally {
      setSaving(false)
    }
  }

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  const exportXlsx = React.useCallback(() => {
    const data = filtered.map(row => {
      const newRow: Record<string, any> = {}
      gridCols.forEach(col => { newRow[col] = row[col] })
      const tempo = newRow["TEMPO"]
      if (typeof tempo === "string" && tempo.includes("1899")) {
        const m = tempo.match(/(\d{2}:\d{2}:\d{2})/)
        if (m) newRow["TEMPO"] = m[1]
      }
      return newRow
    })
    exportExcel(data, `Visão Analítica - ${new Date().toLocaleDateString()}.xlsx`)
  }, [filtered, gridCols])

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4 text-primary" /> Visão Analítica — Entregas
              </CardTitle>
              <CardDescription className="mt-0.5">Rotas de Entrega</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 shrink-0"
                onClick={() => setShowGerenciarColunas(true)}>
                <Columns3 className="size-3.5 text-muted-foreground" /> Gerenciar Colunas
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 shrink-0" onClick={exportXlsx}>
                <FileDown className="size-3.5 text-muted-foreground" /> Exportar Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 shrink-0"
                onClick={() => setShowGerenciar(true)}>
                <FileStack className="size-3.5 text-muted-foreground" /> Gerenciar Firebase
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
                value={filterDay === 0 ? "" : filterDay}
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
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-[10px] uppercase tracking-wider">Busca geral</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input className="pl-6 h-8 text-xs" placeholder="motorista, placa..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center self-end pb-1">
              <Checkbox id="hide-rota-chao" checked={hideRotaChao} onCheckedChange={v => setHideRotaChao(!!v)} className="size-3.5" />
              <label htmlFor="hide-rota-chao" className="ml-2 text-xs font-medium leading-none">
                Ocultar rota 'CHÃO'
              </label>
            </div>
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Atualizar
            </Button>
          </div>

          {rows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Badge variant="outline" className="text-[10px]">{filtered.length} de {rows.length} registros</Badge>
              {filterDay > 0 && <Badge variant="secondary" className="text-[10px]">Dia {String(filterDay).padStart(2, "0")}</Badge>}
              {selected.size > 0 && (
                <>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20">
                    {selected.size} selecionado{selected.size > 1 ? "s" : ""}
                  </Badge>
                  <Button variant="destructive" size="sm" className="h-6 text-[10px] px-2.5 gap-1"
                    onClick={() => setConfirmDelete(true)} disabled={deleting}>
                    {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                    Excluir selecionados
                  </Button>
                </>
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

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 py-16 text-center">
          <Database className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum dado para o período. Clique em <strong>Atualizar</strong>.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-border/60 overflow-x-auto shadow-sm">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="px-3 py-2.5 w-10">
                  <Checkbox checked={allSelected} aria-checked={someSelected ? "mixed" : allSelected}
                    onCheckedChange={toggleAll} className="size-3.5" />
                </th>
                {gridCols.map(col => (
                  <th key={col}
                    className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort(col)}>
                    <span className="flex items-center justify-center gap-1">
                      {col}
                      {sortCol === col ? (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : null}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground w-14">Editar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const isSelected = selected.has(row.__rowIdx)
                return (
                  <tr key={i} className={cn(
                    "border-b transition-colors hover:bg-muted/10",
                    isSelected ? "bg-primary/5" : i % 2 === 0 ? "bg-background" : "bg-muted/5"
                  )}>
                    <td className="px-3 py-2 text-center">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(row.__rowIdx)} className="size-3.5" />
                    </td>
                    {gridCols.map(col => (
                      <td key={col} className={cn("px-3 py-2 whitespace-nowrap text-center", {
                        "min-w-[240px]": col === "MOTORISTA",
                        "min-w-[200px]": col === "AJUDANTE" || col === "AJUDANTE 2",
                      })}>
                        {cellVal(row[col], col)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <Button variant="ghost" size="icon" className="size-6" onClick={() => openEdit(row)}>
                        <Edit2 className="size-3 text-primary" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registros?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{selected.size} registro{selected.size > 1 ? "s" : ""}</strong> do Firebase permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteSelected} disabled={deleting}>
              {deleting && <Loader2 className="size-3.5 animate-spin mr-1.5" />}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editRow} onOpenChange={open => { if (!open) setEditRow(null) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-7 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <Edit2 className="size-4 text-primary" /> Editar registro
              {editRow && (
                <Badge variant="outline" className="ml-1 text-[11px] font-normal">
                  {editRow["MOTORISTA"] || "—"} · {editRow["DATA DE ENTREGA"] || "—"}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>Altere os dados e clique em Confirmar para salvar.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 px-7 py-5">
            <div className="space-y-7">
              {[
                { title: "Identificação", fields: [
                  { field: "DATA DE ENTREGA", span: 1 }, { field: "DATA", span: 1 },
                  { field: "FILIAL", span: 1 }, { field: "REGIÃO", span: 1 },
                  { field: "ROTA", span: 2 }, { field: "VIAGENS", span: 1 }, { field: "STATUS", span: 1 },
                ]},
                { title: "Equipe e veículo", fields: [
                  { field: "MOTORISTA", span: 2 }, { field: "AJUDANTE", span: 1 }, { field: "AJUDANTE 2", span: 1 },
                  { field: "PLACA SISTEMA", span: 1 }, { field: "PLACA", span: 1 },
                  { field: "MODELO", span: 1 }, { field: "OCP", span: 1 },
                ]},
                { title: "Operação", fields: [
                  { field: "ENTREGAS", span: 1 }, { field: "PESO", span: 1 },
                  { field: "TEMPO", span: 1 }, { field: "KM", span: 1 },
                  { field: "SAÍDA", span: 1 }, { field: "OBSERVAÇÃO", span: 3 },
                ]},
                { title: "Financeiro", fields: [
                  "VALOR", "CHAPA", "FRETE", "DESCARGA PALET",
                  "HOSPEDAGEM", "DIARIA", "EXTRA", "CONTRATO",
                  "PERFORMAXXI", "ENTREGAS DEV", "VALOR DEV",
                ].map(f => ({ field: f, span: 1 })) },
              ].map(section => (
                <div key={section.title}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">{section.title}</p>
                  <div className="grid grid-cols-4 gap-x-4 gap-y-3">
                    {section.fields.map(({ field, span }) => (
                      <div key={field} className={cn("space-y-1.5", span > 1 && `col-span-${span}`)}>
                        <Label className="text-[11px] text-muted-foreground">{field}</Label>
                        <Input className="h-8 text-xs" value={editDraft[field] ?? ""}
                          onChange={e => setEditDraft(p => ({ ...p, [field]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border/50 mt-6" />
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex items-center justify-end gap-2 px-7 py-4 border-t bg-muted/5 shrink-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="gap-1.5"><X className="size-3.5" /> Cancelar</Button>
            </DialogClose>
            <Button size="sm" className="gap-1.5" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <GerenciarImportacoesDialog
        open={showGerenciar} onClose={() => setShowGerenciar(false)}
        filterYear={filterYear} filterMonth={filterMonth} onDeleted={fetchData}
      />
      <GerenciarColunasDialog
        open={showGerenciarColunas} onClose={() => setShowGerenciarColunas(false)}
        cols={gridCols} setCols={setGridCols}
      />
    </div>
  )
}
