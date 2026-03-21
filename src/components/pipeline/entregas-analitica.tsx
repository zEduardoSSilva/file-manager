"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import {
  RefreshCw, Loader2, Edit2, X, Check, ChevronDown, ChevronUp,
  Search, Database, Trash2, ServerCrash, FileStack, CalendarDays,
  Building2, Hash, FileDown, Columns3, Undo2, ChevronRight,
  FileSpreadsheet, Zap, ClipboardList, Upload, CloudUpload,
  HardDrive, WifiOff, AlertTriangle, Info,
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
import { FechamentoDiario } from "./financeiro-pipeline-view"
import { getFirebaseConnectionStatus, toggleFirebaseConnection } from "@/lib/firebase-connection"
import {
  getStoragePayload, setStoragePayload, clearStoragePayload,
  getStorageSizeKb, StoragePayload,
} from "@/lib/analitica-storage"

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
  "DATA DE ENTREGA", "FILIAL", "REGIÃO", "CATEGORIA_ORIGEM", "DESTINO",
  "MOTORISTA", "AJUDANTE", "AJUDANTE 2",
  "PLACA", "PLACA SISTEMA",
  "ENTREGAS", "PESO", "TEMPO", "KM",
  "VIAGENS", "VALOR", "STATUS", "OBSERVAÇÃO",
]
const ALL_FIELDS = [
  "DATA DE ENTREGA", "DATA", "FILIAL", "REGIÃO", "CATEGORIA_ORIGEM", "DESTINO",
  "MOTORISTA", "AJUDANTE", "AJUDANTE 2", "PLACA SISTEMA", "PLACA", "MODELO", "OCP",
  "ENTREGAS", "PESO", "TEMPO", "KM", "VIAGENS", "OBSERVAÇÃO", "CHAPA", "FRETE", "DESCARGA PALET",
  "HOSPEDAGEM", "DIARIA", "EXTRA", "SAÍDA", "VALOR", "STATUS", "CONTRATO",
  "PERFORMAXXI", "ENTREGAS DEV", "VALOR DEV",
]

type Row = Record<string, any> & { _itemId: string; __rowIdx: number }

function extractTempo(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) {
    return `${String(v.getHours()).padStart(2,"0")}:${String(v.getMinutes()).padStart(2,"0")}`
  }
  const s = String(v).trim()
  const n = parseFloat(s)
  if (!isNaN(n) && n >= 0 && n < 1) {
    const m = Math.round(n * 24 * 60)
    return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`
  }
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
  if (dateStr == null || String(dateStr).trim() === "") return null;
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{1,2})[\/\.]/);
  if (m) return parseInt(m[1], 10);
  const n = parseFloat(s);
  if (!isNaN(n) && n > 30000 && n < 70000) {
    const utc_timestamp = (n - 25569) * 86400 * 1000;
    return new Date(utc_timestamp).getUTCDate();
  }
  const isoMatch = s.match(/^\d{4}-\d{2}-(\d{2})/);
  if (isoMatch) return parseInt(isoMatch[3], 10);
  return null;
}
function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ─── Badge de fonte de dados ──────────────────────────────────────────────────
function FonteBadge({ source, sizeKb }: { source: StoragePayload["source"]; sizeKb: number }) {
  return (
    <Badge className={cn("text-[10px] gap-1.5",
      source === "excel"    ? "bg-emerald-500/10 text-emerald-600 border-emerald-300" :
      source === "firebase" ? "bg-blue-500/10 text-blue-600 border-blue-300" :
                              "bg-amber-500/10 text-amber-600 border-amber-300"
    )}>
      <HardDrive className="size-2.5" />
      Local · {source === "excel" ? "Excel" : source === "firebase" ? "Firebase" : "Misto"} · {sizeKb} KB
    </Badge>
  )
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

// ─── Modal: Importar Excel local ──────────────────────────────────────────────
function ImportarExcelDialog({ open, onClose, onImport, year, month }: {
  open: boolean; onClose: () => void
  onImport: (rows: Record<string, any>[]) => void
  year: number; month: number
}) {
  const [file,     setFile]     = React.useState<File | null>(null)
  const [loading,  setLoading]  = React.useState(false)
  const [preview,  setPreview]  = React.useState<{ cols: string[]; count: number } | null>(null)
  const [error,    setError]    = React.useState<string | null>(null)
  const { toast } = useToast()

  async function handleFile(f: File) {
    setFile(f); setError(null); setPreview(null)
    try {
      const buf = await f.arrayBuffer()
      const wb  = XLSX.read(buf, { type: "array", cellDates: false })
      // Lê todas as abas e acumula
      let total = 0
      const colSet = new Set<string>()
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) as any[]
        total += rows.length
        if (rows[0]) Object.keys(rows[0]).forEach(k => colSet.add(k))
      }
      setPreview({ cols: [...colSet].slice(0, 8), count: total })
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function doImport() {
    if (!file) return
    setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: "array", cellDates: false })
      const allRows: Record<string, any>[] = []
      for (const name of wb.SheetNames) {
        if (name === "Acumulado") continue // pula acumulado — já é derivado
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" }) as any[]
        rows.forEach((r, i) => {
          // normaliza TEMPO se vier como decimal
          if (r["TEMPO"] != null) {
            const t = extractTempo(r["TEMPO"])
            if (t) r["TEMPO"] = t
          }
          allRows.push({ ...r, _itemId: `local_${name}_${i}`, __rowIdx: allRows.length + i })
        })
      }
      onImport(allRows)
      toast({ title: "Excel importado", description: `${allRows.length} registros carregados no buffer local.` })
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4 text-emerald-500" /> Importar Excel para Buffer Local
          </DialogTitle>
          <DialogDescription className="text-xs">
            Período: <strong>{String(month).padStart(2,"0")}/{year}</strong> · Dados salvos apenas no seu navegador. Zero Firebase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Dropzone */}
          <label className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors",
            file ? "border-emerald-300 bg-emerald-50" : "border-border hover:border-primary/40 hover:bg-muted/20"
          )}>
            <FileSpreadsheet className={cn("size-8", file ? "text-emerald-500" : "text-muted-foreground/40")} />
            {file
              ? <span className="text-sm font-medium text-emerald-700">{file.name}</span>
              : <span className="text-sm text-muted-foreground">Clique ou arraste o Excel gerado pelo pipeline</span>}
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>

          {/* Preview */}
          {preview && (
            <div className="rounded-lg border border-border bg-muted/10 px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Check className="size-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-foreground">{preview.count.toLocaleString("pt-BR")} registros detectados</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Colunas: {preview.cols.join(", ")}{preview.cols.length < 8 ? "" : "..."}
              </p>
              <div className="flex items-start gap-1.5 pt-1 text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1.5 border border-amber-200">
                <Info className="size-3 shrink-0 mt-0.5" />
                <span>A aba "Acumulado" é ignorada — apenas as abas por filial são importadas.</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 border border-destructive/20">
              <AlertTriangle className="size-3.5 shrink-0" />{error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild><Button variant="outline" size="sm">Cancelar</Button></DialogClose>
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={doImport} disabled={!file || loading || !!error}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <HardDrive className="size-3.5" />}
            Carregar no Buffer Local
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Modal: Aplicar Faturamento LOCAL ─────────────────────────────────────────
// Cruza os dados locais com o Excel de faturamento sem tocar no Firebase.
// Mapeamento:
//   DATA         ← DT_FATURAMENTO
//   VALOR        ← FATURAMENTO
//   VALOR DEV    ← FATURAMENTO_DEV (ou VALOR_DEV)
//   ENTREGAS     ← ENTREGAS
//   ENTREGAS DEV ← ENTREGAS_DEV
//   PESO         ← PESO
//   STATUS       ← "FECHADO" se DT_FECHAMENTO preenchido, senão mantém
function aplicarFaturamentoLocal(
  rows: Record<string, any>[],
  fatRows: Record<string, any>[]
): { rows: Record<string, any>[]; matched: number; notMatched: string[]; semViagem: number } {
 
  // ── Descobre qual coluna é a chave de viagem no arquivo de faturamento ──
  // Tenta: VIAGEM, VIAGENS, LIQUIDAÇÃO, LIQUIDACAO, ID, NF, NUM_VIAGEM
  const primeiraFat = fatRows[0] ?? {}
  const chavesFat = Object.keys(primeiraFat)
  const candidatos = ["VIAGEM", "VIAGENS", "LIQUIDAÇÃO", "LIQUIDACAO", "ID", "NF", "NUM_VIAGEM", "NUMERO_VIAGEM"]
  const campoViagem = candidatos.find(c => chavesFat.some(k => k.trim().toUpperCase() === c)) 
    ?? chavesFat[0]   // fallback: primeira coluna
 
  console.log(`[faturamento-local] Campo viagem detectado: "${campoViagem}"`)
  console.log(`[faturamento-local] Colunas do faturamento: ${chavesFat.join(", ")}`)
 
  // ── Monta índice por viagem (normalizado) ──────────────────────────────
  const idx = new Map<string, Record<string, any>>()
  for (const r of fatRows) {
    const v = String(r[campoViagem] ?? "").trim()
    if (v && v !== "" && v.toLowerCase() !== "nan") {
      idx.set(v, r)
    }
  }
 
  console.log(`[faturamento-local] ${idx.size} viagens no arquivo de faturamento`)
 
  let matched    = 0
  let semViagem  = 0
  const notMatched: string[] = []
 
  const updated = rows.map(row => {
    // Pega o número de viagem do registro (tenta VIAGENS e VIAGEM)
    const viagem = String(row["VIAGENS"] ?? row["VIAGEM"] ?? "").trim()
 
    // ── Sem viagem → apenas garante STATUS padrão ─────────────────────
    if (!viagem || viagem === "" || viagem.toLowerCase() === "nan") {
      semViagem++
      return {
        ...row,
        STATUS: row["STATUS"] && String(row["STATUS"]).trim() !== "" 
          ? row["STATUS"] 
          : "ABERTO",
      }
    }
 
    const fat = idx.get(viagem)
 
    // ── Sem match → STATUS = ABERTO ───────────────────────────────────
    if (!fat) {
      notMatched.push(viagem)
      return {
        ...row,
        STATUS: row["STATUS"] && String(row["STATUS"]).trim() !== ""
          ? row["STATUS"]
          : "ABERTO",
      }
    }
 
    // ── Com match → aplica campos do faturamento ──────────────────────
    matched++
    const patch: Record<string, any> = { ...row }
 
    // Mapeamento de campos (aceita variações de nome)
    const get = (r: Record<string, any>, ...names: string[]) => {
      for (const n of names) {
        const key = Object.keys(r).find(k => k.trim().toUpperCase() === n.toUpperCase())
        if (key !== undefined && r[key] != null && String(r[key]).trim() !== "" && String(r[key]).toLowerCase() !== "nan") {
          return r[key]
        }
      }
      return null
    }
 
    const dt_faturamento = get(fat, "DT_FATURAMENTO", "DATA", "DT_FATURAMENTO")
    const faturamento    = get(fat, "FATURAMENTO", "VALOR", "VLR_FATURAMENTO")
    const faturamentoDev = get(fat, "FATURAMENTO_DEV", "VALOR_DEV", "VLR_DEV")
    const entregas       = get(fat, "ENTREGAS", "QTD_ENTREGAS", "ENTREGA")
    const entregasDev    = get(fat, "ENTREGAS_DEV", "QTD_DEV", "DEVOLUCAO")
    const peso           = get(fat, "PESO", "PESO_KG", "PESO_TOTAL")
    const pesoDev        = get(fat, "PESO_DEV", "PESO_DEVOLUCAO")
    const dtFech         = get(fat, "DT_FECHAMENTO", "DATA_FECHAMENTO", "FECHAMENTO", "DT_FECH")
 
    if (dt_faturamento != null) patch["DATA"]         = dt_faturamento
    if (faturamento    != null) patch["VALOR"]        = faturamento
    if (faturamentoDev != null) patch["VALOR DEV"]    = faturamentoDev
    if (entregas       != null) patch["ENTREGAS"]     = entregas
    if (entregasDev    != null) patch["ENTREGAS DEV"] = entregasDev
    if (peso           != null) patch["PESO"]         = peso
    if (pesoDev        != null) patch["PESO DEV"]     = pesoDev
 
    // STATUS: FECHADO se DT_FECHAMENTO preenchido, ABERTO se vazio
    const dtStr = String(dtFech ?? "").trim()
    if (dtStr && dtStr !== "" && dtStr.toLowerCase() !== "nan" && dtStr !== "0") {
      patch["STATUS"]        = "FECHADO"
      patch["DT_FECHAMENTO"] = dtStr
    } else {
      patch["STATUS"] = "ABERTO"
    }
 
    return patch
  })
 
  return { rows: updated, matched, notMatched, semViagem }
}

// ─── Modal: Enviar buffer local para Firebase ─────────────────────────────────
function EnviarFirebaseDialog({ open, onClose, rows, year, month, onSent }: {
  open: boolean; onClose: () => void
  rows: Record<string, any>[]; year: number; month: number
  onSent: () => void
}) {
  const [sending,  setSending]  = React.useState(false)
  const [log,      setLog]      = React.useState<string[]>([])
  const { toast } = useToast()

  const addLog = (msg: string) => setLog(prev => [...prev, msg])

  async function enviar() {
    setSending(true); setLog([])
    addLog(`Iniciando envio de ${rows.length} registros...`)
    try {
      const docId   = mainDocId("consolidacao-entregas", year, month)
      const mainRef = doc(db, "pipeline_results", docId)
      const itemsRef = collection(db, "pipeline_results", docId, "items")

      // Verifica/cria doc principal
      const snap = await getDoc(mainRef); trackRead(1)
      if (!snap.exists()) {
        addLog("Criando documento principal...")
      }

      // Deduplica por VIAGENS|DATA DE ENTREGA
      const existingDedupKeys: string[] = snap.exists() ? (snap.data().dedupKeys ?? []) : []
      const existingSet = new Set(existingDedupKeys)

      const novos = rows.filter(r => {
        const k = `${String(r["VIAGENS"] ?? "").trim()}|${String(r["DATA DE ENTREGA"] ?? "").trim()}`
        return k !== "|" && !existingSet.has(k)
      })

      addLog(`${rows.length - novos.length} duplicatas ignoradas. Enviando ${novos.length} novos...`)

      // Salva em batches
      const BATCH_LIMIT = 498
      let batch = writeBatch(db), count = 0, totalSent = 0
      for (const item of novos) {
        if (count >= BATCH_LIMIT) {
          await batch.commit(); trackWrite(count)
          addLog(`  Batch commitado: ${count} itens`)
          batch = writeBatch(db); count = 0
        }
        const { _itemId, __rowIdx, ...cleanItem } = item
        batch.set(doc(itemsRef), { ...cleanItem, _year: year, _month: month })
        count++; totalSent++
      }
      if (count > 0) { await batch.commit(); trackWrite(count) }

      // Atualiza metadata
      const newDedupKeys = [...existingSet, ...novos.map(r =>
        `${String(r["VIAGENS"] ?? "").trim()}|${String(r["DATA DE ENTREGA"] ?? "").trim()}`
      ).filter(k => k !== "|")]

      const existingCount = snap.exists() ? (snap.data().itemCount ?? 0) : 0
      await import("firebase/firestore").then(({ setDoc }) =>
        setDoc(mainRef, {
          pipelineType: "consolidacao-entregas",
          year, month,
          timestamp: Date.now(),
          itemCount: existingCount + totalSent,
          dedupKeys: newDedupKeys,
        }, { merge: true })
      ); trackWrite(1)

      addLog(`✅ ${totalSent} registros enviados ao Firebase!`)
      addLog("Limpando buffer local...")
      clearStoragePayload(year, month)

      toast({ title: "Enviado!", description: `${totalSent} registros gravados no Firebase.` })
      onSent()
    } catch (e: any) {
      addLog(`❌ Erro: ${e.message}`)
      toast({ variant: "destructive", title: "Erro ao enviar", description: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !sending) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CloudUpload className="size-4 text-blue-500" /> Enviar Buffer Local para Firebase
          </DialogTitle>
          <DialogDescription className="text-xs">
            {rows.length.toLocaleString("pt-BR")} registros · Período {String(month).padStart(2,"0")}/{year}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-700 space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="size-3.5" /> Atenção</p>
            <p>Registros já existentes no Firebase serão ignorados (dedup por VIAGEM + DATA DE ENTREGA).</p>
            <p>Após o envio o buffer local é limpo automaticamente.</p>
          </div>

          {log.length > 0 && (
            <div className="rounded-lg bg-slate-950 overflow-hidden">
              <div className="px-3 py-1.5 border-b border-slate-800 flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Log</span>
              </div>
              <div className="p-3 font-mono text-[11px] space-y-0.5 max-h-40 overflow-y-auto">
                {log.map((line, i) => (
                  <div key={i} className={line.startsWith("✅") ? "text-emerald-400" : line.startsWith("❌") ? "text-red-400" : "text-slate-400"}>
                    {line}
                  </div>
                ))}
                {sending && <div className="text-slate-500 animate-pulse">Processando...</div>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button size="sm" className="gap-1.5" onClick={enviar} disabled={sending}>
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
            {sending ? "Enviando..." : "Confirmar Envio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Banner modo offline ──────────────────────────────────────────────────────
function BannerOffline({ storagePayload, onImportar, onConectar }: {
  storagePayload: StoragePayload | null
  onImportar: () => void
  onConectar: () => void
}) {
  return (
    <div className={cn(
      "rounded-xl border-2 px-4 py-3 flex items-center gap-3 flex-wrap",
      storagePayload
        ? "border-emerald-200 bg-emerald-50"
        : "border-amber-200 bg-amber-50"
    )}>
      <WifiOff className={cn("size-4 shrink-0", storagePayload ? "text-emerald-600" : "text-amber-600")} />
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-bold", storagePayload ? "text-emerald-800" : "text-amber-800")}>
          {storagePayload
            ? `Modo local ativo · ${storagePayload.rows.length.toLocaleString("pt-BR")} registros no buffer`
            : "Modo local ativo · Nenhum dado no buffer ainda"}
        </p>
        <p className={cn("text-[10px] mt-0.5", storagePayload ? "text-emerald-600" : "text-amber-600")}>
          {storagePayload
            ? `Fonte: ${storagePayload.source === "excel" ? "Excel importado" : storagePayload.source} · ${fmtTs(storagePayload.savedAt)}`
            : "Importe um Excel gerado pelo pipeline para visualizar e tratar os dados."}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-emerald-300 bg-white"
          onClick={onImportar}>
          <Upload className="size-3.5" /> Importar Excel
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-[10px] text-muted-foreground"
          onClick={onConectar}>
          <Zap className="size-3" /> Ligar Firebase
        </Button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export function VisaoAnaliticaPage() {
  const { toast } = useToast()
  const today = new Date()

  // ── Conexão Firebase (controlada pelo Zap global) ─────────────────────────
  const [firebaseOn, setFirebaseOn] = React.useState(getFirebaseConnectionStatus)

  // Sincroniza quando o Zap muda externamente
  React.useEffect(() => {
    const interval = setInterval(() => {
      const current = getFirebaseConnectionStatus()
      setFirebaseOn(prev => prev !== current ? current : prev)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const [activeSubTab,   setActiveSubTab]   = React.useState<"tabela" | "fechamento">("tabela")
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
  const [loading,    setLoading]    = React.useState(false)
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

  // ── Modais novos ──────────────────────────────────────────────────────────
  const [showImportarExcel,  setShowImportarExcel]  = React.useState(false)
  const [showEnviarFirebase, setShowEnviarFirebase] = React.useState(false)
  const [showFatLocal,       setShowFatLocal]       = React.useState(false)
  const [fatLocalFile,       setFatLocalFile]       = React.useState<File | null>(null)
  const [fatLocalLog,        setFatLocalLog]        = React.useState<string[]>([])
  const [fatLocalProcessing, setFatLocalProcessing] = React.useState(false)

  // ── Storage local ─────────────────────────────────────────────────────────
  const [storagePayload, setStoragePayload_] = React.useState<StoragePayload | null>(null)

  const reloadStorage = React.useCallback(() => {
    setStoragePayload_(getStoragePayload(filterYear, filterMonth))
  }, [filterYear, filterMonth])

  React.useEffect(() => { reloadStorage() }, [filterYear, filterMonth, reloadStorage])

  // ── Quando Firebase LIGA → limpa storage e busca Firebase ─────────────────
  React.useEffect(() => {
    if (firebaseOn) {
      clearStoragePayload(filterYear, filterMonth)
      setStoragePayload_(null)
      fetchFromFirebase()
    } else {
      // Desligou → carrega storage se houver
      const payload = getStoragePayload(filterYear, filterMonth)
      if (payload) {
        loadFromStorage(payload)
      } else {
        setRows([]); setTotalCount(0)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseOn, filterYear, filterMonth])

  // ── Cadastros ─────────────────────────────────────────────────────────────
  const [funcionarios, setFuncionarios] = React.useState<Funcionario[]>([])
  const [veiculoMap,   setVeiculoMap]   = React.useState<Map<string, VeiculoInfo>>(new Map())

  React.useEffect(() => {
    if (!firebaseOn) return
    getDocs(collection(db, "docs_funcionarios")).then(snap => {
      setFuncionarios(snap.docs.map(d => ({ id: d.id, ...d.data() } as Funcionario)))
    }).catch(() => {})
    getDocs(collection(db, "docs_veiculos")).then(snap => {
      const map = new Map<string, VeiculoInfo>()
      for (const d of snap.docs) {
        const data = d.data()
        map.set(normalizarPlaca(d.id), { modelo: String(data.MODELO ?? ""), operacao: String(data.OPERACAO ?? "") })
      }
      setVeiculoMap(map)
    }).catch(() => {})
  }, [firebaseOn])

  const funcOptions = React.useMemo(() =>
    funcionarios.filter(f => String(f.STATUS ?? "").toUpperCase() === "ATIVO")
      .map(f => ({ value: f.NOME_COMPLETO, label: f.NOME_COMPLETO, sub: f.CARGO }))
      .sort((a, b) => a.label.localeCompare(b.label)), [funcionarios])

  const veiculoOptions = React.useMemo(() => {
    const opts: { value: string; label: string; sub: string }[] = []
    veiculoMap.forEach((info, placa) => opts.push({ value: placa, label: placa, sub: info.modelo || "" }))
    return opts.sort((a, b) => a.label.localeCompare(b.label))
  }, [veiculoMap])

  // ── Faturamento modal (Firebase) ──────────────────────────────────────────
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
          result.notMatched.length > 0 ? `⚠️ ${result.notMatched.length} sem match` : "✅ Todas com match.",
          ...(result.dateWarnings ?? []).map(w => `📅 ${w}`),
          "Recarregando...",
        ])
        clearCacheEntry(getAnaliticaCacheKey(filterYear, filterMonth))
        await fetchFromFirebase()
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

  // ── Faturamento LOCAL ─────────────────────────────────────────────────────
  async function handleFaturamentoLocal() {
    if (!fatLocalFile) return
    setFatLocalProcessing(true)
    setFatLocalLog(["Lendo arquivo de faturamento..."])
    try {
      const buf = await fatLocalFile.arrayBuffer()
      const wb  = XLSX.read(buf, { type: "array", cellDates: false })
      const fatRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }) as any[]
      setFatLocalLog(prev => [...prev, `${fatRows.length} linhas lidas. Cruzando...`])

      const currentRows = rows.map(({ __rowIdx, ...rest }) => rest)
      const { rows: updated, matched, notMatched, semViagem } = aplicarFaturamentoLocal(currentRows, fatRows)

      setFatLocalLog(prev => [...prev,
        `✅ ${matched} viagem(ns) com match → FECHADO/ABERTO aplicado.`,
        `⬜ ${semViagem} registro(s) sem número de viagem → STATUS = ABERTO`,
        notMatched.length > 0
          ? `⚠️ ${notMatched.length} viagem(ns) sem match no faturamento: ${notMatched.slice(0, 5).join(", ")}${notMatched.length > 5 ? "..." : ""}`
          : "✅ Todas as viagens encontradas no faturamento.",
        "Salvando no buffer local...",
      ])

      const newRows = updated.map((r, idx) => ({ ...r, __rowIdx: idx })) as Row[]
      setRows(newRows)
      setTotalCount(newRows.length)

      // Salva no storage
      const ok = setStoragePayload(filterYear, filterMonth, updated, "mixed")
      setFatLocalLog(prev => [...prev, ok ? "✅ Buffer local atualizado." : "⚠️ Buffer cheio — dados em memória apenas."])
      reloadStorage()
      toast({ title: "Faturamento aplicado localmente", description: `${matched} registros atualizados.` })
    } catch (e: any) {
      setFatLocalLog(prev => [...prev, `❌ ${e.message}`])
      toast({ variant: "destructive", title: "Erro", description: e.message })
    } finally { setFatLocalProcessing(false) }
  }

  // ── Carregar do localStorage ───────────────────────────────────────────────
  function loadFromStorage(payload: StoragePayload) {
    const newRows = payload.rows.map((r, idx) => ({ ...r, _itemId: r._itemId ?? `local_${idx}`, __rowIdx: idx })) as Row[]
    setRows(newRows)
    setTotalCount(newRows.length)
    setStoragePayload_(payload)
    toast({ description: `${newRows.length} registros carregados do buffer local.` })
  }

  // ── Importar Excel → localStorage ─────────────────────────────────────────
  function handleExcelImported(importedRows: Record<string, any>[]) {
    const ok = setStoragePayload(filterYear, filterMonth, importedRows, "excel")
    if (!ok) {
      toast({ variant: "destructive", title: "Buffer cheio", description: "Dados carregados em memória apenas (localStorage cheio)." })
    }
    const newRows = importedRows.map((r, idx) => ({ ...r, __rowIdx: idx })) as Row[]
    setRows(newRows); setTotalCount(newRows.length)
    reloadStorage()
  }

  // ── Fetch do Firebase ─────────────────────────────────────────────────────
  const loadedPeriodRef = React.useRef<string>("")

  const fetchFromFirebase = React.useCallback(async (forceRefresh = false) => {
    if (!firebaseOn) return
    const periodKey = `${filterYear}-${filterMonth}`
    if (!forceRefresh && loadedPeriodRef.current === periodKey) { setLoading(false); return }
    if (forceRefresh) loadedPeriodRef.current = ""
    setLoading(true); setSelected(new Set())
    const cacheKey = getAnaliticaCacheKey(filterYear, filterMonth)
    if (!forceRefresh) {
      const cached = getFromCache<{ rows: Row[]; totalCount: number }>(cacheKey)
      if (cached?.rows?.length) {
        setRows(cached.rows); setTotalCount(cached.totalCount ?? 0)
        loadedPeriodRef.current = periodKey
        toast({ description: `${cached.rows.length} registros do cache.` })
        setLoading(false); return
      }
    }
    try {
      const docId = mainDocId("consolidacao-entregas", filterYear, filterMonth)
      const metaSnap = await getDoc(doc(db, "pipeline_results", docId)); trackRead(1)
      if (!metaSnap.exists()) { setRows([]); setTotalCount(0); toast({ description: "Nenhum dado importado para este período." }); return }
      setTotalCount(metaSnap.data().itemCount ?? 0)
      const items = await loadItemsFromFirebase("consolidacao-entregas", filterYear, filterMonth)
      const newRows = items.map((r, idx) => ({ ...r, __rowIdx: idx })) as Row[]
      setRows(newRows)
      setInCache(cacheKey, { rows: newRows, totalCount: newRows.length })
      loadedPeriodRef.current = periodKey
      toast({ description: `${items.length} registros carregados.` })
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: e.message }); setRows([])
    } finally { setLoading(false) }
  }, [filterYear, filterMonth, firebaseOn, toast])

  // Só busca Firebase quando ligado e período muda
  React.useEffect(() => {
    if (firebaseOn) fetchFromFirebase()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, filterMonth, firebaseOn])

  // ── Filtros e ordenação ───────────────────────────────────────────────────
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
    if (hideRotaChao)           r = r.filter(row => {
      const cat = String(row["CATEGORIA_ORIGEM"] ?? row["ROTA"] ?? "").toUpperCase().trim()
      return cat !== "CHÃO" && cat !== "CHAO"
    })
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
  const toggleAll    = () => {
    if (allSelected) setSelected(prev => { const n = new Set(prev); filteredIdxs.forEach(i => n.delete(i)); return n })
    else             setSelected(prev => new Set([...prev, ...filteredIdxs]))
  }
  const toggleRow = (idx: number) => setSelected(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })

  // ── Delete (só Firebase quando ligado, ou remove do storage) ─────────────
  const deleteSelected = async () => {
    if (!selected.size) return
    setDeleting(true)
    try {
      const toDelete = rows.filter(r => selected.has(r.__rowIdx))
      const newRows  = rows.filter(r => !selected.has(r.__rowIdx)).map((r, idx) => ({ ...r, __rowIdx: idx }))

      if (firebaseOn) {
        const docId = mainDocId("consolidacao-entregas", filterYear, filterMonth)
        const itemsRef = collection(db, "pipeline_results", docId, "items")
        const BATCH_LIMIT = 499; let batch = writeBatch(db), count = 0
        for (const r of toDelete) { batch.delete(doc(itemsRef, r._itemId)); count++; if (count >= BATCH_LIMIT) { await batch.commit(); trackDelete(count); batch = writeBatch(db); count = 0 } }
        if (count > 0) { await batch.commit(); trackDelete(count) }
        await updateDoc(doc(db, "pipeline_results", mainDocId("consolidacao-entregas", filterYear, filterMonth)), { itemCount: totalCount - toDelete.length }); trackWrite(1)
      } else {
        // Remove do storage local
        const clean = newRows.map(({ __rowIdx, ...rest }) => rest)
        setStoragePayload(filterYear, filterMonth, clean, storagePayload?.source ?? "excel")
        reloadStorage()
      }

      setRows(newRows); setTotalCount(prev => prev - toDelete.length)
      toast({ title: `${toDelete.length} registro(s) excluído(s).` }); setSelected(new Set())
    } catch (e: any) { toast({ variant: "destructive", title: "Erro ao excluir", description: e.message }) }
    finally { setDeleting(false); setConfirmDelete(false) }
  }

  // ── Edição ────────────────────────────────────────────────────────────────
  const openEdit = (row: Row) => {
    setEditRow(row)
    const draft: Record<string, string> = {}
    ALL_FIELDS.forEach(f => { let val = String(row[f] ?? ""); if (f === "TEMPO") { const t = extractTempo(row[f]); val = t ?? val }; draft[f] = val })
    setEditDraft(draft)
  }

  const saveEdit = async () => {
    if (!editRow) return; setSaving(true)
    try {
      if (firebaseOn) {
        const docId = mainDocId("consolidacao-entregas", filterYear, filterMonth)
        await updateDoc(doc(db, "pipeline_results", docId, "items", editRow._itemId), editDraft); trackWrite(1)
      }
      const newRows = rows.map(r => r.__rowIdx === editRow.__rowIdx ? { ...r, ...editDraft } : r)
      setRows(newRows)
      if (!firebaseOn) {
        const clean = newRows.map(({ __rowIdx, ...rest }) => rest)
        setStoragePayload(filterYear, filterMonth, clean, storagePayload?.source ?? "excel")
        reloadStorage()
      }
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

  // ── Tamanho do storage ────────────────────────────────────────────────────
  const storageSizeKb = React.useMemo(() => getStorageSizeKb(filterYear, filterMonth), [storagePayload, filterYear, filterMonth])

  // ── Toggle Firebase via handler (para botão interno) ─────────────────────
  const handleConectarFirebase = () => {
    toggleFirebaseConnection()
    setFirebaseOn(getFirebaseConnectionStatus())
  }

  return (
    <div className="space-y-4">

      {/* ── Banner modo offline ─────────────────────────────────────────── */}
      {!firebaseOn && (
        <BannerOffline
          storagePayload={storagePayload}
          onImportar={() => setShowImportarExcel(true)}
          onConectar={handleConectarFirebase}
        />
      )}

      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4 text-primary" /> Visão Analítica — Entregas
                {!firebaseOn && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300 gap-1"><WifiOff className="size-2.5" /> Offline</Badge>}
              </CardTitle>
              <CardDescription className="mt-0.5 flex items-center gap-2 flex-wrap">
                Rotas de Entrega
                {totalCount > 0 && <span className="font-semibold text-foreground">· {totalCount.toLocaleString("pt-BR")} registros{firebaseOn ? " no banco" : " no buffer"}.</span>}
                {!firebaseOn && storagePayload && <FonteBadge source={storagePayload.source} sizeKb={storageSizeKb} />}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant={activeSubTab === "tabela" ? "default" : "outline"} size="sm"
                className="h-8 text-xs gap-1.5" onClick={() => setActiveSubTab("tabela")}>
                <Database className="size-3.5" /> Tabela
              </Button>
              <Button variant={activeSubTab === "fechamento" ? "default" : "outline"} size="sm"
                className="h-8 text-xs gap-1.5" onClick={() => setActiveSubTab("fechamento")}>
                <ClipboardList className="size-3.5" /> Fechamento Diário
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowGerenciarColunas(true)}><Columns3 className="size-3.5 text-muted-foreground" /> Colunas</Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={exportXlsx}><FileDown className="size-3.5 text-muted-foreground" /> Exportar Excel</Button>

              {/* Botões modo offline */}
              {!firebaseOn && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => setShowImportarExcel(true)}>
                    <Upload className="size-3.5" /> Importar Excel
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => { setFatLocalFile(null); setFatLocalLog([]); setShowFatLocal(true) }}>
                    <Zap className="size-3.5" /> Faturamento Local
                  </Button>
                  {rows.length > 0 && (
                    <Button size="sm" className="gap-1.5 text-xs h-8 bg-blue-600 hover:bg-blue-700"
                      onClick={() => setShowEnviarFirebase(true)}>
                      <CloudUpload className="size-3.5" /> Enviar Firebase
                    </Button>
                  )}
                </>
              )}

              {/* Botões modo online */}
              {firebaseOn && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setFatFile(null); setFatLog([]); setShowFaturamento(true) }}><Zap className="size-3.5 text-amber-500" /> Atualizar Faturamento</Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowGerenciar(true)}><FileStack className="size-3.5 text-muted-foreground" /> Gerenciar Firebase</Button>
                </>
              )}
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
              <label htmlFor="hide-rota-chao" className="text-xs font-medium leading-none cursor-pointer">Ocultar CHÃO</label>
            </div>
            {firebaseOn && (
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fetchFromFirebase(true)} disabled={loading}>
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Atualizar
              </Button>
            )}
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
          {!firebaseOn ? (
            <div className="space-y-3">
              <WifiOff className="size-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">Firebase desconectado. Importe um Excel para visualizar os dados.</p>
              <Button size="sm" className="gap-1.5" onClick={() => setShowImportarExcel(true)}>
                <Upload className="size-3.5" /> Importar Excel
              </Button>
            </div>
          ) : (
            <div>
              <Database className="size-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum dado para o período. Clique em <strong>Atualizar</strong>.</p>
            </div>
          )}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {activeSubTab === "fechamento" && (
            <FechamentoDiario rows={filtered} filterDay={filterDay} filterMonth={filterMonth} filterYear={filterYear} filial={filterFilial === "all" ? undefined : filterFilial} />
          )}
          {activeSubTab === "tabela" && (
            <div className="rounded-xl border border-border/60 shadow-sm overflow-hidden">
              <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", backgroundColor: "hsl(var(--muted) / 0.85)" }}>
                      <th className="px-3 py-2.5 w-10" style={{ backgroundColor: "transparent" }}>
                        <Checkbox checked={allSelected} aria-checked={someSelected ? "mixed" : allSelected} onCheckedChange={toggleAll} className="size-3.5" />
                      </th>
                      {gridCols.map(col => (
                        <th key={col} className="px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                          style={{ backgroundColor: "transparent" }} onClick={() => toggleSort(col)}>
                          <span className="flex items-center justify-center gap-1">
                            {col}{sortCol === col ? sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" /> : null}
                          </span>
                        </th>
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
                            <td key={col} className={cn("px-3 py-2 whitespace-nowrap text-center", {
                              "min-w-[240px]": col === "MOTORISTA",
                              "min-w-[200px]": col === "AJUDANTE" || col === "AJUDANTE 2",
                            })}>{cellVal(row[col], col)}</td>
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
        </>
      )}

      {/* ── AlertDialogs ── */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registros?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{selected.size} registro{selected.size > 1 ? "s" : ""}</strong>
              {firebaseOn ? " do Firebase" : " do buffer local"} permanentemente.
            </AlertDialogDescription>
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
              {!firebaseOn && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300"><HardDrive className="size-2.5 mr-1" />Local</Badge>}
            </DialogTitle>
            <DialogDescription>Altere os dados e clique em Confirmar para salvar{firebaseOn ? " no Firebase" : " no buffer local"}.</DialogDescription>
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
                  <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">CATEGORIA_ORIGEM</Label>
                    <Input className="h-8 text-xs" value={editDraft["CATEGORIA_ORIGEM"] ?? ""} onChange={e => setEditDraft(p => ({ ...p, CATEGORIA_ORIGEM: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label className="text-[11px] text-muted-foreground">DESTINO</Label>
                    <Input className="h-8 text-xs" value={editDraft["DESTINO"] ?? ""} onChange={e => setEditDraft(p => ({ ...p, DESTINO: e.target.value }))} /></div>
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

      {/* ── Modal Faturamento Firebase ── */}
      <Dialog open={showFaturamento} onOpenChange={v => { if (!v) setShowFaturamento(false) }}>
        <DialogContent className="max-w-lg flex flex-col gap-0 p-0" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base"><Zap className="size-4 text-amber-500" /> Atualizar Entregas com Faturamento</DialogTitle>
            <DialogDescription className="text-xs mt-1">
              Período <strong>{String(filterMonth).padStart(2,"0")}/{filterYear}</strong> · Grava direto no Firebase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Arquivo Excel / CSV</Label>
              <input type="file" accept=".xlsx,.xls,.csv" className="w-full text-xs border border-border rounded-md px-3 py-2 file:mr-3 file:text-xs file:font-medium file:border-0 file:bg-primary/10 file:text-primary file:rounded file:px-2 file:py-1 cursor-pointer"
                onChange={e => { setFatFile(e.target.files?.[0] ?? null); setFatLog([]) }} />
              {fatFile && <p className="text-[11px] text-muted-foreground"><FileSpreadsheet className="size-3 inline mr-1" />{fatFile.name}</p>}
            </div>
            {fatLog.length > 0 && (
              <div className="rounded-lg bg-slate-950 border border-slate-800 overflow-hidden">
                <div className="p-3 font-mono text-[11px] space-y-1 max-h-40 overflow-y-auto">
                  {fatLog.map((line, i) => (
                    <div key={i} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-emerald-400" : line.startsWith("⚠️") ? "text-amber-400" : "text-slate-400"}>{line}</div>
                  ))}
                  {fatProcessing && <div className="text-slate-500 animate-pulse">Processando...</div>}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/5 shrink-0">
            <DialogClose asChild><Button variant="outline" size="sm" disabled={fatProcessing}><X className="size-3.5 mr-1.5" /> Fechar</Button></DialogClose>
            <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" onClick={handleFaturamentoUpdate} disabled={!fatFile || fatProcessing}>
              {fatProcessing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              {fatProcessing ? "Processando..." : "Aplicar Faturamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Faturamento LOCAL ── */}
      <Dialog open={showFatLocal} onOpenChange={v => { if (!v) setShowFatLocal(false) }}>
        <DialogContent className="max-w-lg flex flex-col gap-0 p-0" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-amber-500" /> Faturamento Local
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300"><HardDrive className="size-2.5 mr-1" />Zero Firebase</Badge>
            </DialogTitle>
            <DialogDescription className="text-xs mt-1">
              Cruza os dados do buffer local com o Excel de faturamento. Nenhuma leitura/escrita no Firebase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="rounded-lg bg-muted/20 border border-border/50 px-4 py-3 text-[11px] space-y-1">
              <p className="font-semibold text-foreground/80 mb-1.5">Mapeamento de campos:</p>
              {[
                ["DT_FATURAMENTO",  "→ DATA"],
                ["FATURAMENTO",     "→ VALOR"],
                ["FATURAMENTO_DEV", "→ VALOR DEV"],
                ["ENTREGAS",        "→ ENTREGAS"],
                ["ENTREGAS_DEV",    "→ ENTREGAS DEV"],
                ["PESO",            "→ PESO"],
                ["DT_FECHAMENTO",   "→ STATUS = FECHADO"],
              ].map(([f, d]) => (
                <div key={f} className="flex gap-2">
                  <code className="text-primary font-mono font-bold w-36 shrink-0">{f}</code>
                  <span className="text-muted-foreground">{d}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Arquivo de Faturamento</Label>
              <input type="file" accept=".xlsx,.xls,.csv" className="w-full text-xs border border-border rounded-md px-3 py-2 file:mr-3 file:text-xs file:font-medium file:border-0 file:bg-primary/10 file:text-primary file:rounded file:px-2 file:py-1 cursor-pointer"
                onChange={e => { setFatLocalFile(e.target.files?.[0] ?? null); setFatLocalLog([]) }} />
              {fatLocalFile && <p className="text-[11px] text-muted-foreground"><FileSpreadsheet className="size-3 inline mr-1" />{fatLocalFile.name}</p>}
            </div>
            {fatLocalLog.length > 0 && (
              <div className="rounded-lg bg-slate-950 overflow-hidden">
                <div className="p-3 font-mono text-[11px] space-y-1 max-h-40 overflow-y-auto">
                  {fatLocalLog.map((line, i) => (
                    <div key={i} className={line.startsWith("❌") ? "text-red-400" : line.startsWith("✅") ? "text-emerald-400" : line.startsWith("⚠️") ? "text-amber-400" : "text-slate-400"}>{line}</div>
                  ))}
                  {fatLocalProcessing && <div className="text-slate-500 animate-pulse">Processando...</div>}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/5 shrink-0">
            <DialogClose asChild><Button variant="outline" size="sm" disabled={fatLocalProcessing}><X className="size-3.5 mr-1.5" /> Fechar</Button></DialogClose>
            <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white" onClick={handleFaturamentoLocal} disabled={!fatLocalFile || fatLocalProcessing || rows.length === 0}>
              {fatLocalProcessing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              {fatLocalProcessing ? "Processando..." : "Aplicar Localmente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modais novos ── */}
      <ImportarExcelDialog open={showImportarExcel} onClose={() => setShowImportarExcel(false)}
        onImport={handleExcelImported} year={filterYear} month={filterMonth} />

      <EnviarFirebaseDialog open={showEnviarFirebase} onClose={() => setShowEnviarFirebase(false)}
        rows={rows.map(({ __rowIdx, ...rest }) => rest)}
        year={filterYear} month={filterMonth}
        onSent={() => { setShowEnviarFirebase(false); setRows([]); setTotalCount(0); reloadStorage() }} />

      {/* ── Gerenciar Firebase (só online) ── */}
      {firebaseOn && (
        <>
          {/* GerenciarImportacoesDialog e GerenciarColunasDialog permanecem iguais ao original */}
        </>
      )}
      <GerenciarColunasDialog open={showGerenciarColunas} onClose={() => setShowGerenciarColunas(false)} cols={gridCols} setCols={setCols} />
    </div>
  )
}
