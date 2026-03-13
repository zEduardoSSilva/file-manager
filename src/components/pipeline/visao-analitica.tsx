import * as React from "react"
import {
  RefreshCw, Loader2, Edit2, X, Check, ChevronDown, ChevronUp,
  Search, Database, Trash2, ServerCrash, FileStack, CalendarDays,
  Building2, Hash,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
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
import {
  collection, query, where, getDocs,
  doc, updateDoc, deleteDoc, getFirestore,
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

const GRID_COLS = [
  "DATA DE ENTREGA", "FILIAL", "REGIÃO", "ROTA",
  "MOTORISTA", "AJUDANTE",
  "PLACA", "PLACA SISTEMA",
  "ENTREGAS", "PESO", "TEMPO", "KM",
  "LIQUIDAÇÃO", "VALOR",
  "STATUS", "OBSERVAÇÃO",
]

const ALL_FIELDS = [
  "DATA DE ENTREGA", "DATA", "FILIAL", "REGIÃO", "ROTA",
  "MOTORISTA", "AJUDANTE",
  "PLACA SISTEMA", "PLACA", "MODELO", "OCP",
  "ENTREGAS", "PESO", "TEMPO", "KM",
  "LIQUIDAÇÃO", "OBSERVAÇÃO",
  "CHAPA", "FRETE", "DESCARGA PALET",
  "HOSPEDAGEM", "DIARIA", "EXTRA", "SAÍDA",
  "VALOR", "STATUS", "CONTRATO",
  "PERFORMAXXI", "ENTREGAS DEV", "VALOR DEV",
]

type Row = Record<string, any> & { __docId: string; __rowIdx: number }

// Metadados de um documento Firebase
interface FireDoc {
  id: string
  timestamp: number
  totalRows: number
  // { "Curitiba": { "12/03/2026": 5, ... }, ... }
  porFilialDia: Record<string, Record<string, number>>
}

function cellVal(v: any) {
  if (v == null || v === "") return <span className="text-muted-foreground/40 text-[10px]">—</span>
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
// ── Painel Gerenciar Importações ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
function GerenciarImportacoesDialog({
  open, onClose, filterYear, filterMonth,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  filterYear: number
  filterMonth: number
  onDeleted: () => void   // avisa o grid para recarregar
}) {
  const { toast } = useToast()

  const [docs,        setDocs]        = React.useState<FireDoc[]>([])
  const [loading,     setLoading]     = React.useState(false)
  const [filterDay,   setFilterDay]   = React.useState(0)      // 0 = todos
  const [confirmDoc,  setConfirmDoc]  = React.useState<FireDoc | null>(null)
  const [deleting,    setDeleting]    = React.useState(false)

  // ── Carrega documentos do período ────────────────────────────────────────
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
      const result: FireDoc[] = snap.docs.map(d => {
        const data = d.data()
        const rows: any[] = data.data ?? []

        // Agrupa por filial → dia → contagem
        const porFilialDia: Record<string, Record<string, number>> = {}
        for (const row of rows) {
          const filial = String(row["FILIAL"] ?? "—")
          const data_  = String(row["DATA DE ENTREGA"] ?? "—")
          if (!porFilialDia[filial]) porFilialDia[filial] = {}
          porFilialDia[filial][data_] = (porFilialDia[filial][data_] ?? 0) + 1
        }

        return {
          id:         d.id,
          timestamp:  data.timestamp ?? 0,
          totalRows:  rows.length,
          porFilialDia,
        }
      }).sort((a, b) => b.timestamp - a.timestamp)

      setDocs(result)
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao carregar documentos", description: e.message })
    } finally {
      setLoading(false)
    }
  }, [open, filterYear, filterMonth, toast])

  React.useEffect(() => { loadDocs() }, [loadDocs])

  // ── Excluir documento inteiro do Firebase ────────────────────────────────
  const deleteDoc_ = async (fireDoc: FireDoc) => {
    setDeleting(true)
    try {
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

  // ── Dias disponíveis (para o filtro) ────────────────────────────────────
  const diasDisponiveis = React.useMemo(() => {
    const s = new Set<string>()
    for (const d of docs) {
      for (const diaMap of Object.values(d.porFilialDia)) {
        for (const dia of Object.keys(diaMap)) s.add(dia)
      }
    }
    return [...s].sort()
  }, [docs])

  // ── Filtra os docs pela data selecionada ─────────────────────────────────
  const docsFiltrados = React.useMemo(() => {
    if (filterDay === 0) return docs
    const pad = String(filterDay).padStart(2, "0")
    return docs.map(d => {
      const porFilialDia: Record<string, Record<string, number>> = {}
      for (const [filial, diaMap] of Object.entries(d.porFilialDia)) {
        const filtered: Record<string, number> = {}
        for (const [data, cnt] of Object.entries(diaMap)) {
          if (data.startsWith(pad + "/")) filtered[data] = cnt
        }
        if (Object.keys(filtered).length > 0) porFilialDia[filial] = filtered
      }
      const totalRows = Object.values(porFilialDia).reduce(
        (acc, dm) => acc + Object.values(dm).reduce((a, n) => a + n, 0), 0
      )
      return { ...d, porFilialDia, totalRows }
    }).filter(d => d.totalRows > 0)
  }, [docs, filterDay])

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileStack className="size-4 text-primary" />
              Gerenciar Importações — Firebase
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Todos os documentos salvos em{" "}
              <span className="font-mono font-semibold text-foreground">pipeline_results</span>{" "}
              para {String(filterMonth).padStart(2,"0")}/{filterYear}.
              Aqui você pode apagar documentos inteiros do banco.
            </p>
          </DialogHeader>

          <Separator />

          {/* Filtro de dia */}
          <div className="px-5 py-3 flex items-end gap-3 bg-muted/5">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Filtrar dia</Label>
              <Select
                value={String(filterDay)}
                onValueChange={v => setFilterDay(parseInt(v))}
              >
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="Todos os dias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Todos os dias</SelectItem>
                  {diasDisponiveis.map(dia => (
                    <SelectItem key={dia} value={String(parseInt(dia))}>{dia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="outline" className="text-[10px]">
                {docs.length} documento{docs.length !== 1 ? "s" : ""} no banco
              </Badge>
              {docs.length > 1 && (
                <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  {docs.length - 1} redundante{docs.length - 1 !== 1 ? "s" : ""}
                </Badge>
              )}
              <Button variant="ghost" size="icon" className="size-7" onClick={loadDocs} disabled={loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Lista de documentos */}
          <ScrollArea className="flex-1 min-h-0 max-h-[420px] px-5 py-3">
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Carregando...</span>
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
                {docsFiltrados.map((fireDoc, docIdx) => {
                  const isNewest = docIdx === 0
                  return (
                    <div key={fireDoc.id} className={cn(
                      "rounded-xl border overflow-hidden shadow-sm",
                      isNewest ? "border-primary/30" : "border-border/60"
                    )}>
                      {/* Cabeçalho do doc */}
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-2.5",
                        isNewest ? "bg-primary/5" : "bg-muted/10"
                      )}>
                        <Database className={cn("size-3.5 shrink-0", isNewest ? "text-primary" : "text-muted-foreground")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-foreground/80 truncate">
                              {fireDoc.id}
                            </span>
                            {isNewest && (
                              <Badge className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">
                                ativo
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              Importado em {fmtTs(fireDoc.timestamp)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] font-semibold text-foreground">
                              {fireDoc.totalRows} registro{fireDoc.totalRows !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="size-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => setConfirmDoc(fireDoc)}
                          title="Excluir documento inteiro do Firebase"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>

                      {/* Mini-tabela: filial × dia × contagem */}
                      <div className="border-t border-border/40">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-muted/20">
                              <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground w-28">
                                <span className="flex items-center gap-1">
                                  <Building2 className="size-2.5" /> Filial
                                </span>
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="size-2.5" /> Data de Entrega
                                </span>
                              </th>
                              <th className="px-3 py-1.5 text-right font-semibold text-muted-foreground w-20">
                                <span className="flex items-center justify-end gap-1">
                                  <Hash className="size-2.5" /> Registros
                                </span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(fireDoc.porFilialDia).flatMap(([filial, diaMap], fi) =>
                              Object.entries(diaMap).map(([dia, cnt], di) => (
                                <tr key={`${fi}-${di}`} className={cn(
                                  "border-t border-border/20",
                                  (fi + di) % 2 === 0 ? "bg-background" : "bg-muted/5"
                                )}>
                                  {di === 0 ? (
                                    <td
                                      className="px-3 py-1.5 font-semibold text-foreground/80"
                                      rowSpan={Object.keys(diaMap).length}
                                    >
                                      {filial}
                                    </td>
                                  ) : null}
                                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{dia}</td>
                                  <td className="px-3 py-1.5 text-right">
                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                                      {cnt}
                                    </Badge>
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
          </ScrollArea>

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

      {/* Confirmar exclusão do documento inteiro */}
      <AlertDialog open={!!confirmDoc} onOpenChange={v => { if (!v) setConfirmDoc(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" />
              Excluir documento do Firebase?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Isso remove <strong>permanentemente</strong> o documento{" "}
                  <span className="font-mono text-foreground bg-muted px-1 rounded">
                    {confirmDoc?.id}
                  </span>{" "}
                  com <strong>{confirmDoc?.totalRows} registros</strong> do Firestore.
                </p>
                <p className="text-muted-foreground text-xs">
                  Esta ação não pode ser desfeita. Se este for o documento ativo (mais recente),
                  o grid ficará vazio até a próxima importação.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDoc && deleteDoc_(confirmDoc)}
              disabled={deleting}
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
// ── Página principal ─────────────────────────────────────────────────────────
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

  const [rows,    setRows]    = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(true)

  const [selected,      setSelected]      = React.useState<Set<number>>(new Set())
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting,      setDeleting]      = React.useState(false)

  const [sortCol, setSortCol] = React.useState<string | null>(null)
  const [sortAsc, setSortAsc] = React.useState(true)

  const [editRow,   setEditRow]   = React.useState<Row | null>(null)
  const [editDraft, setEditDraft] = React.useState<Record<string, string>>({})
  const [saving,    setSaving]    = React.useState(false)

  const [showGerenciar, setShowGerenciar] = React.useState(false)

  // ─── Fetch ──────────────────────────────────────────────────────────────
  const fetchData = React.useCallback(async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const q = query(
        collection(db, "pipeline_results"),
        where("pipelineType", "==", "consolidacao-entregas"),
        where("year",  "==", filterYear),
        where("month", "==", filterMonth),
      )
      const snap = await getDocs(q)
      if (snap.empty) {
        setRows([])
        toast({ description: "Nenhum resultado encontrado para este período." })
        return
      }
      const sorted = snap.docs.sort(
        (a, b) => (b.data().timestamp ?? 0) - (a.data().timestamp ?? 0)
      )
      const latestDoc = sorted[0]
      const rawRows: any[] = latestDoc.data().data ?? []
      if (rawRows.length === 0) {
        toast({ variant: "destructive", title: "Documento sem dados", description: "Re-processe o período." })
        setRows([])
        return
      }
      setRows(rawRows.map((r, idx) => ({ ...r, __docId: latestDoc.id, __rowIdx: idx })))
      toast({ description: `${rawRows.length} registros carregados.` })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: e.message })
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filterYear, filterMonth, toast])

  React.useEffect(() => { fetchData() }, [fetchData])

  const filiais = React.useMemo(() =>
    [...new Set(rows.map(r => r["FILIAL"]).filter(Boolean))].sort(), [rows])

  const regioes = React.useMemo(() =>
    [...new Set(rows.map(r => r["REGIÃO"]).filter(Boolean))].sort(), [rows])

  const filtered = React.useMemo(() => {
    let r = rows
    if (filterDay > 0)          r = r.filter(row => extractDay(row["DATA DE ENTREGA"]) === filterDay)
    if (filterFilial !== "all") r = r.filter(row => row["FILIAL"] === filterFilial)
    if (filterRegiao !== "all") r = r.filter(row => row["REGIÃO"] === filterRegiao)
    if (search) {
      const s = search.toLowerCase()
      r = r.filter(row => GRID_COLS.some(col => String(row[col] ?? "").toLowerCase().includes(s)))
    }
    if (sortCol) {
      r = [...r].sort((a, b) => {
        const av = String(a[sortCol] ?? "")
        const bv = String(b[sortCol] ?? "")
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return r
  }, [rows, filterDay, filterFilial, filterRegiao, search, sortCol, sortAsc])

  // Seleção
  const filteredIdxs = filtered.map(r => r.__rowIdx)
  const allSelected  = filteredIdxs.length > 0 && filteredIdxs.every(i => selected.has(i))
  const someSelected = filteredIdxs.some(i => selected.has(i)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filteredIdxs.forEach(i => n.delete(i)); return n })
    } else {
      setSelected(prev => new Set([...prev, ...filteredIdxs]))
    }
  }
  const toggleRow = (idx: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })

  // Excluir linhas selecionadas
  const deleteSelected = async () => {
    if (!selected.size) return
    setDeleting(true)
    try {
      const byDoc = new Map<string, Set<number>>()
      rows.forEach(r => {
        if (!selected.has(r.__rowIdx)) return
        if (!byDoc.has(r.__docId)) byDoc.set(r.__docId, new Set())
        byDoc.get(r.__docId)!.add(r.__rowIdx)
      })
      for (const [docId, idxSet] of byDoc) {
        const kept = rows
          .filter(r => r.__docId === docId && !idxSet.has(r.__rowIdx))
          .map(({ __docId, __rowIdx, ...clean }) => clean)
        await updateDoc(doc(db, "pipeline_results", docId), { data: kept })
      }
      const kept = rows.filter(r => !selected.has(r.__rowIdx))
      setRows(kept.map((r, idx) => ({ ...r, __rowIdx: idx })))
      toast({ title: `${selected.size} registro(s) excluído(s).` })
      setSelected(new Set())
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message })
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const openEdit = (row: Row) => {
    setEditRow(row)
    const draft: Record<string, string> = {}
    ALL_FIELDS.forEach(f => { draft[f] = String(row[f] ?? "") })
    setEditDraft(draft)
  }

  const saveEdit = async () => {
    if (!editRow) return
    setSaving(true)
    try {
      const newRows = rows.map(r => {
        const { __docId, __rowIdx, ...clean } = r
        return r.__rowIdx === editRow.__rowIdx ? { ...clean, ...editDraft } : clean
      })
      await updateDoc(doc(db, "pipeline_results", editRow.__docId), { data: newRows })
      setRows(prev => prev.map(r => r.__rowIdx === editRow.__rowIdx ? { ...r, ...editDraft } : r))
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

  return (
    <div className="space-y-4">

      {/* ── Filtros ── */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4 text-primary" />
                Visão Analítica — Entregas
              </CardTitle>
              <CardDescription className="mt-0.5">
                Dados do último pipeline processado para o período selecionado.
              </CardDescription>
            </div>
            {/* Botão gerenciar importações */}
            <Button
              variant="outline" size="sm"
              className="gap-1.5 text-xs h-8 shrink-0"
              onClick={() => setShowGerenciar(true)}
            >
              <FileStack className="size-3.5 text-muted-foreground" />
              Gerenciar Firebase
            </Button>
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
              <Input
                type="number" min={0} max={31} className="w-20 h-8 text-xs"
                value={filterDay === 0 ? "" : filterDay}
                onChange={e => {
                  const v = parseInt(e.target.value)
                  setFilterDay(isNaN(v) || v < 0 ? 0 : Math.min(v, 31))
                }}
              />
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
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Atualizar
            </Button>
          </div>

          {rows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Badge variant="outline" className="text-[10px]">
                {filtered.length} de {rows.length} registros
              </Badge>
              {filterDay > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  Dia {String(filterDay).padStart(2, "0")}
                </Badge>
              )}
              {selected.size > 0 && (
                <>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20">
                    {selected.size} selecionado{selected.size > 1 ? "s" : ""}
                  </Badge>
                  <Button
                    variant="destructive" size="sm"
                    className="h-6 text-[10px] px-2.5 gap-1"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                    Excluir selecionados
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 py-16 text-center">
          <Database className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhum dado para o período. Clique em <strong>Atualizar</strong> para recarregar.
          </p>
        </div>
      )}

      {/* ── Grid ── */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
          <ScrollArea className="w-full">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="px-3 py-2.5 w-10">
                      <Checkbox
                        checked={allSelected}
                        aria-checked={someSelected ? "mixed" : allSelected}
                        onCheckedChange={toggleAll}
                        className="size-3.5"
                      />
                    </th>
                    {GRID_COLS.map(col => (
                      <th key={col}
                        className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                        onClick={() => toggleSort(col)}
                      >
                        <span className="flex items-center gap-1">
                          {col}
                          {sortCol === col
                            ? sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
                            : null}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground w-14">
                      Editar
                    </th>
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
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(row.__rowIdx)}
                            className="size-3.5"
                          />
                        </td>
                        {GRID_COLS.map(col => (
                          <td key={col} className="px-3 pyial-2 whitespace-nowrap max-w-[160px] truncate">
                            {cellVal(row[col])}
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
          </ScrollArea>
        </div>
      )}

      {/* ── Confirmar exclusão de linhas ── */}
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
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteSelected} disabled={deleting}
            >
              {deleting && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal de Edição ── */}
      <Dialog open={!!editRow} onOpenChange={open => { if (!open) setEditRow(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit2 className="size-4 text-primary" />
              Editar Registro
              {editRow && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {editRow["MOTORISTA"] || "—"} · {editRow["DATA DE ENTREGA"] || "—"}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {ALL_FIELDS.map(field => (
              <div key={field} className={cn("space-y-1", ["OBSERVAÇÃO", "STATUS"].includes(field) && "col-span-2")}>
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {field}
                </Label>
                <Input
                  className="h-8 text-xs"
                  value={editDraft[field] ?? ""}
                  onChange={e => setEditDraft(prev => ({ ...prev, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <X className="size-3.5" /> Cancelar
              </Button>
            </DialogClose>
            <Button size="sm" className="gap-1.5" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Gerenciar Importações ── */}
      <GerenciarImportacoesDialog
        open={showGerenciar}
        onClose={() => setShowGerenciar(false)}
        filterYear={filterYear}
        filterMonth={filterMonth}
        onDeleted={fetchData}
      />
    </div>
  )
}