"use client"

import * as React from "react"
import * as XLSX from "xlsx"
import { importFuncionariosAction } from "@/app/actions/import-funcionarios-action"
import {
  PlusCircle, Edit, Trash2, MoreHorizontal, Loader2, User, Search, Upload,
  Terminal, Users, CheckCircle2, Info, BadgeCheck,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { collection, onSnapshot, updateDoc, deleteDoc, doc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { cn } from "@/lib/utils"

type Funcionario = {
  id: string
  MATRICULA: string
  NOME_COMPLETO: string
  CARGO: string
  STATUS: string
  [key: string]: any
}

type LogEntry = { time: string; message: string; type: "info" | "success" | "error" | "warn" | "step" }

const searchableFields = ["NOME_COMPLETO", "MATRICULA", "CARGO", "STATUS"]

const logColor: Record<LogEntry["type"], string> = {
  info: "text-slate-400", success: "text-emerald-500",
  error: "text-red-400 font-semibold", warn: "text-amber-400", step: "text-primary font-semibold",
}
const logPrefix: Record<LogEntry["type"], string> = {
  info: "   ", success: "✅ ", error: "❌ ", warn: "⚠️  ", step: "▶  ",
}

export function FuncionariosPipelineView() {
  const { toast } = useToast()
  const [items, setItems] = React.useState<Funcionario[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [isFormOpen, setFormOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<Funcionario | null>(null)
  const [formData, setFormData] = React.useState<Partial<Funcionario>>({})
  const [isAlertOpen, setAlertOpen] = React.useState(false)
  const [itemToDelete, setItemToDelete] = React.useState<Funcionario | null>(null)
  const [isProcessing, setProcessing] = React.useState(false)
  const [isImportOpen, setImportOpen] = React.useState(false)
  const [isImporting, setImporting] = React.useState(false)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [logs, setLogs] = React.useState<LogEntry[]>([])
  const logEndRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [logs])

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR")
    setLogs(prev => [...prev, { time, message, type }])
  }

  React.useEffect(() => {
    addLog("Conectando à coleção docs_funcionarios...", "step")
    const unsubscribe = onSnapshot(collection(db, "docs_funcionarios"), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Funcionario))
      setItems(data)
      setLoading(false)
      addLog(`${data.length} funcionário(s) carregado(s).`, "success")
    }, (error) => {
      addLog(`Erro ao buscar dados: ${error.message}`, "error")
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: error.message })
      setLoading(false)
    })
    return () => unsubscribe()
  }, [toast])

  const openForm = (item: Funcionario | null = null) => {
    setEditingItem(item)
    setFormData(item ? { ...item } : {})
    setFormOpen(true)
  }

  const handleSave = async () => {
    setProcessing(true)
    try {
      const { id, ...dataToSave } = formData
      if (editingItem) {
        await updateDoc(doc(db, "docs_funcionarios", editingItem.id), dataToSave)
        addLog(`Funcionário ${editingItem.NOME_COMPLETO} atualizado.`, "success")
        toast({ title: "Sucesso!", description: "Funcionário atualizado." })
      } else {
        const rawName = dataToSave.NOME_COMPLETO || ""
        if (!rawName) throw new Error("O campo 'Nome Completo' é obrigatório.")
        const docId = rawName.trim().toUpperCase().replace(/\//g, ' ')
        await setDoc(doc(db, "docs_funcionarios", docId), dataToSave)
        addLog(`Funcionário ${rawName} adicionado.`, "success")
        toast({ title: "Sucesso!", description: "Funcionário adicionado." })
      }
      setFormOpen(false)
    } catch (e: any) {
      addLog(`Erro ao salvar: ${e.message}`, "error")
      toast({ variant: "destructive", title: "Erro ao salvar", description: e.message })
    } finally {
      setProcessing(false)
    }
  }

  const openDeleteAlert = (item: Funcionario) => { setItemToDelete(item); setAlertOpen(true) }

  const handleDelete = async () => {
    if (!itemToDelete) return
    setProcessing(true)
    try {
      await deleteDoc(doc(db, "docs_funcionarios", itemToDelete.id))
      addLog(`Funcionário ${itemToDelete.NOME_COMPLETO} excluído.`, "warn")
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
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)
        addLog(`${jsonData.length} registros encontrados na planilha.`, "info")

        const result = await importFuncionariosAction(jsonData)
        if (result.success) {
          addLog(result.message, "success")
          toast({ title: "Sucesso!", description: result.message })
          setImportOpen(false)
          setImportFile(null)
        } else {
          addLog(`Erro na importação: ${result.message}`, "error")
          toast({ variant: "destructive", title: "Erro na importação", description: result.message })
        }
      } catch (err: any) {
        addLog(`Erro ao processar arquivo: ${err.message}`, "error")
        toast({ variant: "destructive", title: "Erro ao processar arquivo", description: err.message })
      } finally {
        setImporting(false)
      }
    }
    reader.onerror = () => {
      addLog("Não foi possível ler o arquivo.", "error")
      toast({ variant: "destructive", title: "Erro de leitura", description: "Não foi possível ler o arquivo." })
      setImporting(false)
    }
    reader.readAsArrayBuffer(importFile)
  }

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const filteredItems = items.filter(item =>
    search ? searchableFields.some(field =>
      String(item[field] ?? "").toLowerCase().includes(search.toLowerCase())
    ) : true
  )

  const ativos = items.filter(i => String(i.STATUS).toUpperCase() === "ATIVO").length
  const inativos = items.length - ativos

  const fields = [
    { name: "NOME_COMPLETO", label: "Nome Completo", type: "text" },
    { name: "MATRICULA", label: "Matrícula", type: "text" },
    { name: "CPF", label: "CPF", type: "text" },
    { name: "CARGO", label: "Cargo", type: "text" },
    { name: "STATUS", label: "Status", type: "text" },
  ]

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-primary" />
          <AlertTitle className="mb-0">Cadastro de Funcionários</AlertTitle>
        </div>
        <AlertDescription className="text-sm mt-2">
          Gerencie os dados mestres de funcionários. O ID do documento é gerado a partir do <strong>Nome Completo</strong>.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-5 text-primary" />
                Funcionários
              </CardTitle>
              <CardDescription>Coleção: docs_funcionarios</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por Nome, Matrícula, Cargo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>

              <ScrollArea className="h-[500px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome Completo</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          <div className="flex justify-center items-center gap-2 text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" /> Carregando...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredItems.length > 0 ? (
                      filteredItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.NOME_COMPLETO}</TableCell>
                          <TableCell>{item.MATRICULA}</TableCell>
                          <TableCell>{item.CARGO}</TableCell>
                          <TableCell>
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full",
                              String(item.STATUS).toUpperCase() === "ATIVO"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            )}>
                              {item.STATUS}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
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
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          Nenhum funcionário encontrado.
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
              <Button size="sm" className="flex-1 h-9 text-xs font-semibold bg-primary hover:bg-primary/90 shadow-sm"
                onClick={() => openForm()}>
                <PlusCircle className="mr-1.5 size-3.5" /> Novo Funcionário
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* ── Coluna lateral ── */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: "Total Cadastrados", value: items.length.toLocaleString("pt-BR"), icon: Users, highlight: false },
              { label: "Ativos", value: ativos.toLocaleString("pt-BR"), icon: CheckCircle2, highlight: true },
              { label: "Inativos / Outros", value: inativos.toLocaleString("pt-BR"), icon: BadgeCheck, highlight: false },
            ].map(stat => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className={cn(
                  "rounded-xl border px-3 py-2.5 flex items-center gap-2 shadow-sm",
                  stat.highlight ? "bg-primary/5 border-primary/20" : "bg-card border-border/60"
                )}>
                  <div className={cn("size-7 rounded-lg flex items-center justify-center shrink-0",
                    stat.highlight ? "bg-primary/10" : "bg-muted/30")}>
                    <Icon className={cn("size-3.5", stat.highlight ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div>
                    <p className={cn("text-sm font-bold leading-tight", stat.highlight ? "text-primary" : "text-foreground")}>
                      {stat.value}
                    </p>
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
                {logs.length === 0 ? (
                  <span className="text-slate-500 italic">Aguardando operações...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={cn("flex gap-1.5", logColor[log.type])}>
                      <span className="text-slate-600 shrink-0">{log.time}</span>
                      <span className="shrink-0">{logPrefix[log.type]}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* ── Dialog Form ── */}
      <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} Funcionário</DialogTitle>
            <DialogDescription>
              {editingItem ? "Altere os dados do funcionário abaixo." : "Preencha os dados do novo funcionário."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {fields.map(field => (
              <div key={field.name} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={field.name} className="text-right">{field.label}</Label>
                <Input
                  id={field.name}
                  type={field.type}
                  value={formData[field.name] ?? ""}
                  onChange={(e) => handleInputChange(field.name, e.target.value)}
                  className="col-span-3"
                  disabled={!!editingItem && field.name === "NOME_COMPLETO"}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={handleSave} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Import ── */}
      <Dialog open={isImportOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Funcionários</DialogTitle>
            <DialogDescription>Selecione um arquivo Excel ou CSV para importar em lote.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="import-file" className="text-right">Arquivo</Label>
              <Input
                id="import-file"
                type="file"
                className="col-span-3"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <p className="text-xs text-muted-foreground px-4 text-center">
              Cabeçalhos esperados: NOME_COMPLETO, MATRICULA, CPF, CARGO, STATUS.
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
            <AlertDialogDescription>Esta ação não pode ser desfeita. O item será excluído permanentemente.</AlertDialogDescription>
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