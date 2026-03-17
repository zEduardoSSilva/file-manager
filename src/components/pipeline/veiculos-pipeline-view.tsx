"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { importVeiculosAction } from "@/app/actions/import-veiculos-action"
import {
  PlusCircle, Edit, Trash2, MoreHorizontal, Loader2, Truck, Search, Upload,
  Terminal, Info, CheckCircle2, Gauge, Car,
} from "lucide-react"
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { collection, onSnapshot, updateDoc, deleteDoc, doc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { cn } from "@/lib/utils"

// ─── Tipo alinhado com os campos reais do banco ───────────────────────────────
type Veiculo = {
  id:             string
  PLACA:          string
  MODELO:         string
  MARCA:          string
  ANO_FABRICACAO: number
  ANO_MODELO:     number
  FILIAL:         string
  OPERACAO:       string   // ex: "FRETE", "FROTA"
  CAPACIDADE:     number   // campo real no banco (não CAPACIDADE_KG)
  TARA:           number
  [key: string]: any
}

type LogEntry = { time: string; message: string; type: "info" | "success" | "error" | "warn" | "step" }

// ─── Campos buscáveis ─────────────────────────────────────────────────────────
const searchableFields = ["PLACA", "MODELO", "MARCA", "FILIAL", "OPERACAO"]

const logColor: Record<LogEntry["type"], string> = {
  info:    "text-slate-400",
  success: "text-emerald-500",
  error:   "text-red-400 font-semibold",
  warn:    "text-amber-400",
  step:    "text-primary font-semibold",
}
const logPrefix: Record<LogEntry["type"], string> = {
  info: "   ", success: "✅ ", error: "❌ ", warn: "⚠️  ", step: "▶  ",
}

const operacaoColor: Record<string, string> = {
  "FRETE": "bg-blue-100 text-blue-700",
  "FROTA": "bg-primary/10 text-primary",
}

const modeloColor: Record<string, string> = {
  "TRUCK":      "bg-slate-100 text-slate-700",
  "TOCO":       "bg-violet-100 text-violet-700",
  "CARRETA":    "bg-amber-100 text-amber-700",
  "BITRUCK":    "bg-orange-100 text-orange-700",
  "TRUCKINHO":  "bg-teal-100 text-teal-700",
  "VAN":        "bg-pink-100 text-pink-700",
}

export function VeiculosPipelineView() {
  const { toast } = useToast()
  const [items,       setItems]       = React.useState<Veiculo[]>([])
  const [loading,     setLoading]     = React.useState(true)
  const [search,      setSearch]      = React.useState("")
  const [filterFilial, setFilterFilial] = React.useState("all")
  const [filterOp,    setFilterOp]    = React.useState("all")
  const [isFormOpen,  setFormOpen]    = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<Veiculo | null>(null)
  const [formData,    setFormData]    = React.useState<Partial<Veiculo>>({})
  const [isAlertOpen, setAlertOpen]   = React.useState(false)
  const [itemToDelete,setItemToDelete]= React.useState<Veiculo | null>(null)
  const [isProcessing,setProcessing]  = React.useState(false)
  const [isImportOpen,setImportOpen]  = React.useState(false)
  const [isImporting, setImporting]   = React.useState(false)
  const [importFile,  setImportFile]  = React.useState<File | null>(null)
  const [logs,        setLogs]        = React.useState<LogEntry[]>([])
  const logEndRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR")
    setLogs(prev => [...prev, { time, message, type }])
  }

  React.useEffect(() => {
    addLog("Conectando à coleção docs_veiculos...", "step")
    const unsubscribe = onSnapshot(collection(db, "docs_veiculos"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Veiculo))
      setItems(data)
      setLoading(false)
      addLog(`${data.length} veículo(s) carregado(s).`, "success")
    }, (error) => {
      addLog(`Erro ao buscar dados: ${error.message}`, "error")
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: error.message })
      setLoading(false)
    })
    return () => unsubscribe()
  }, [toast])

  // ─── Opções de filtro ─────────────────────────────────────────────────────
  const filiais  = React.useMemo(() => [...new Set(items.map(i => i.FILIAL).filter(Boolean))].sort(), [items])
  const operacoes = React.useMemo(() => [...new Set(items.map(i => i.OPERACAO).filter(Boolean))].sort(), [items])

  const filteredItems = React.useMemo(() => items.filter(item => {
    if (filterFilial !== "all" && item.FILIAL !== filterFilial) return false
    if (filterOp    !== "all" && item.OPERACAO !== filterOp)   return false
    if (search) return searchableFields.some(f =>
      String(item[f] ?? "").toLowerCase().includes(search.toLowerCase())
    )
    return true
  }), [items, search, filterFilial, filterOp])

  const openForm = (item: Veiculo | null = null) => {
    setEditingItem(item)
    setFormData(item ? { ...item } : {})
    setFormOpen(true)
  }

  const handleSave = async () => {
    setProcessing(true)
    try {
      const { id, ...dataToSave } = formData
      if (dataToSave.CAPACIDADE) dataToSave.CAPACIDADE = Number(dataToSave.CAPACIDADE)
      if (dataToSave.TARA)       dataToSave.TARA       = Number(dataToSave.TARA)

      if (editingItem) {
        await updateDoc(doc(db, "docs_veiculos", editingItem.id), dataToSave)
        addLog(`Veículo ${editingItem.PLACA} atualizado.`, "success")
        toast({ title: "Sucesso!", description: "Veículo atualizado." })
      } else {
        const rawPlaca = dataToSave.PLACA
        if (!rawPlaca || typeof rawPlaca !== "string") throw new Error("O campo 'Placa' é obrigatório.")
        const docId = rawPlaca.trim().toUpperCase().replace(/-/g, "")
        await setDoc(doc(db, "docs_veiculos", docId), dataToSave)
        addLog(`Veículo ${docId} adicionado.`, "success")
        toast({ title: "Sucesso!", description: "Veículo adicionado." })
      }
      setFormOpen(false)
    } catch (e: any) {
      addLog(`Erro ao salvar: ${e.message}`, "error")
      toast({ variant: "destructive", title: "Erro ao salvar", description: e.message })
    } finally {
      setProcessing(false)
    }
  }

  const openDeleteAlert = (item: Veiculo) => { setItemToDelete(item); setAlertOpen(true) }

  const handleDelete = async () => {
    if (!itemToDelete) return
    setProcessing(true)
    try {
      await deleteDoc(doc(db, "docs_veiculos", itemToDelete.id))
      addLog(`Veículo ${itemToDelete.PLACA} excluído.`, "warn")
      toast({ title: "Excluído", description: "O item foi removido." })
      setAlertOpen(false)
    } catch (e: any) {
      addLog(`Erro ao excluir: ${e.message}`, "error")
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message })
    } finally {
      setProcessing(false)
    }
  }

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    addLog(`Lendo arquivo: ${importFile.name}...`, "step")
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        if (!data) throw new Error("Não foi possível ler o arquivo.")
        const workbook = XLSX.read(data, { type: "array" })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)
        addLog(`${jsonData.length} registros encontrados na planilha.`, "info")
        const result = await importVeiculosAction(jsonData)
        if (result.success) {
          addLog(result.message, "success")
          toast({ title: "Sucesso!", description: result.message })
          setImportOpen(false); setImportFile(null)
        } else {
          addLog(`Erro na importação: ${result.message}`, "error")
          toast({ variant: "destructive", title: "Erro na importação", description: result.message })
        }
      } catch (err: any) {
        addLog(`Erro ao processar: ${err.message}`, "error")
        toast({ variant: "destructive", title: "Erro", description: err.message })
      } finally { setImporting(false) }
    }
    reader.onerror = () => { addLog("Falha na leitura do arquivo.", "error"); setImporting(false) }
    reader.readAsArrayBuffer(importFile)
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  const totalCap   = items.reduce((s, i) => s + (Number(i.CAPACIDADE) || 0), 0)
  const comCap     = items.filter(i => Number(i.CAPACIDADE) > 0).length
  const frete      = items.filter(i => i.OPERACAO === "FRETE").length
  const frota      = items.filter(i => i.OPERACAO === "FROTA").length

  // ─── Campos do formulário alinhados com o banco ───────────────────────────
  const formFields = [
    { name: "PLACA",          label: "Placa",            type: "text"   },
    { name: "MODELO",         label: "Modelo",           type: "text"   },
    { name: "MARCA",          label: "Marca",            type: "text"   },
    { name: "ANO_FABRICACAO", label: "Ano Fabricação",   type: "number" },
    { name: "ANO_MODELO",     label: "Ano Modelo",       type: "number" },
    { name: "FILIAL",         label: "Filial",           type: "text"   },
    { name: "OPERACAO",       label: "Operação",         type: "select", options: ["FRETE", "FROTA"] },
    { name: "CAPACIDADE",     label: "Capacidade (kg)",  type: "number" },
    { name: "TARA",           label: "Tara (kg)",        type: "number" },
  ]

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <AlertTitle className="mb-0">Cadastro de Veículos</AlertTitle>
        </div>
        <AlertDescription className="text-sm mt-2">
          Dados importados da planilha de veículos. Campos: <strong>PLACA, MODELO, MARCA, FILIAL, OPERACAO, CAPACIDADE, TARA</strong>.
          O ID do documento é gerado a partir da <strong>Placa</strong>.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-5 text-primary" /> Veículos
              </CardTitle>
              <CardDescription>Coleção: docs_veiculos · {filteredItems.length} de {items.length} exibidos</CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Filtros */}
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar placa, modelo, marca..."
                    value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
                <Select value={filterFilial} onValueChange={setFilterFilial}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Todas filiais" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas filiais</SelectItem>
                    {filiais.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterOp} onValueChange={setFilterOp}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Operação" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {operacoes.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[500px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Placa</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead>Operação</TableHead>
                      <TableHead className="text-right">Capacidade</TableHead>
                      <TableHead className="text-right">Tara</TableHead>
                      <TableHead>Ano</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                          <div className="flex justify-center items-center gap-2 text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" /> Carregando...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredItems.length > 0 ? (
                      filteredItems.map(item => {
                        const cap  = Number(item.CAPACIDADE ?? 0)
                        const tara = Number(item.TARA ?? 0)
                        const modelo = String(item.MODELO ?? "").toUpperCase().trim()
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium font-mono text-xs">{item.PLACA || item.id}</TableCell>
                            <TableCell>
                              {modelo && modelo !== "-" ? (
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  modeloColor[modelo] ?? "bg-slate-100 text-slate-600"
                                )}>{modelo}</span>
                              ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {item.MARCA && item.MARCA !== "-" ? item.MARCA : <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="text-xs">{item.FILIAL || <span className="text-muted-foreground/40">—</span>}</TableCell>
                            <TableCell>
                              {item.OPERACAO ? (
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  operacaoColor[item.OPERACAO] ?? "bg-slate-100 text-slate-600"
                                )}>{item.OPERACAO}</span>
                              ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {cap > 0
                                ? <span className="font-medium">{cap.toLocaleString("pt-BR")} kg</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {tara > 0
                                ? tara.toLocaleString("pt-BR") + " kg"
                                : <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.ANO_MODELO || item.ANO_FABRICACAO || <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openForm(item)}>
                                    <Edit className="mr-2 h-4 w-4" /> Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openDeleteAlert(item)} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground text-sm">
                          Nenhum veículo encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>

            <CardFooter className="bg-muted/5 border-t pt-4 pb-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs font-semibold"
                onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 size-3.5" /> Importar Excel/CSV
              </Button>
              <Button size="sm" className="flex-1 h-9 text-xs font-semibold"
                onClick={() => openForm()}>
                <PlusCircle className="mr-1.5 size-3.5" /> Novo Veículo
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* ── Coluna lateral ── */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: "Total de Veículos",    value: items.length.toLocaleString("pt-BR"),                        icon: Car,          color: "text-foreground",    bg: "bg-muted/30"      },
              { label: "Operação FRETE",        value: frete.toLocaleString("pt-BR"),                               icon: Truck,        color: "text-blue-600",      bg: "bg-blue-500/10"   },
              { label: "Operação FROTA",        value: frota.toLocaleString("pt-BR"),                               icon: CheckCircle2, color: "text-primary",       bg: "bg-primary/10"    },
              { label: "Com Capacidade",        value: comCap.toLocaleString("pt-BR"),                              icon: Gauge,        color: "text-emerald-600",   bg: "bg-emerald-500/10"},
              { label: "Cap. Total (kg)",       value: totalCap > 0 ? totalCap.toLocaleString("pt-BR") + " kg" : "—", icon: Gauge,     color: "text-violet-600",    bg: "bg-violet-500/10" },
            ].map(stat => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 flex items-center gap-2 shadow-sm">
                  <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0", stat.bg)}>
                    <Icon className={cn("size-3.5", stat.color)} />
                  </div>
                  <div>
                    <p className={cn("text-sm font-bold leading-tight", stat.color)}>{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Console */}
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b bg-muted/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="size-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Console</span>
              </div>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                  limpar
                </button>
              )}
            </div>
            <ScrollArea className="h-[200px] bg-slate-950">
              <div className="p-3 font-mono text-[10px] leading-relaxed space-y-0.5">
                {logs.length === 0
                  ? <span className="text-slate-500 italic">Aguardando operações...</span>
                  : logs.map((log, i) => (
                    <div key={i} className={cn("flex gap-1.5", logColor[log.type])}>
                      <span className="text-slate-600 shrink-0">{log.time}</span>
                      <span className="shrink-0">{logPrefix[log.type]}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                }
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* ── Dialog Form ── */}
      <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} Veículo</DialogTitle>
            <DialogDescription>
              {editingItem ? "Altere os dados do veículo." : "Preencha os dados do novo veículo."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {formFields.map(field => (
              <div key={field.name} className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor={field.name} className="text-right text-xs">{field.label}</Label>
                {field.type === "select" ? (
                  <Select
                    value={String(formData[field.name] ?? "")}
                    onValueChange={v => setFormData(p => ({ ...p, [field.name]: v }))}
                  >
                    <SelectTrigger className="col-span-3 h-8 text-xs">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type}
                    value={String(formData[field.name] ?? "")}
                    onChange={e => setFormData(p => ({ ...p, [field.name]: e.target.value }))}
                    className="col-span-3 h-8 text-xs"
                    disabled={!!editingItem && field.name === "PLACA"}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" size="sm">Cancelar</Button></DialogClose>
            <Button size="sm" onClick={handleSave} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Import ── */}
      <Dialog open={isImportOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Veículos</DialogTitle>
            <DialogDescription>Selecione um arquivo Excel ou CSV para importar em lote.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="import-file" className="text-right">Arquivo</Label>
              <Input id="import-file" type="file" className="col-span-3"
                accept=".xlsx,.xls,.csv"
                onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
            </div>
            <p className="text-xs text-muted-foreground px-4 text-center">
              Colunas esperadas: PLACA, MODELO, MARCA, ANO_FABRICACAO, ANO_MODELO,
              FILIAL, OPERACAO, CAPACIDADE, TARA.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={handleImport} disabled={isImporting || !importFile}>
              {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Importação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Alert Delete ── */}
      <AlertDialog open={isAlertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O veículo será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}