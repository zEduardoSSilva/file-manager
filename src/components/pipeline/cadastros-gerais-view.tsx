"use client"

import * as React from "react"
import {
  PlusCircle, Edit, Trash2, MoreHorizontal, Loader2, User, Truck,
  DollarSign, Search, X, Check, FileDown, FileUp, Building, Wrench, FileCog,
} from "lucide-react"
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  onSnapshot, QuerySnapshot, DocumentData,
} from "firebase/firestore"
import { db } from "@/lib/firebase" // Assuming db is exported from here

// ─── Tipos e Configurações ───────────────────────────────────────────────────

type CadastroItem = Record<string, any> & { id: string }

interface FieldConfig {
  name: string
  label: string
  type: "text" | "number" | "select"
  options?: string[]
}

interface CrudConfig {
  collectionName: string
  title: string
  icon: React.ElementType
  fields: FieldConfig[]
  searchableFields: string[]
}

const CONFIGS: Record<string, CrudConfig> = {
  funcionarios: {
    collectionName: "funcionarios",
    title: "Funcionários",
    icon: User,
    searchableFields: ["NOME", "CPF", "FUNCAO"],
    fields: [
      { name: "NOME", label: "Nome Completo", type: "text" },
      { name: "CPF", label: "CPF", type: "text" },
      { name: "FUNCAO", label: "Função", type: "select", options: ["Motorista", "Ajudante"] },
      { name: "TIPO_VINCULO", label: "Vínculo", type: "select", options: ["Próprio", "Terceiro", "Agregado"] },
      { name: "STATUS", label: "Status", type: "select", options: ["Ativo", "Inativo"] },
    ],
  },
  veiculos: {
    collectionName: "veiculos",
    title: "Veículos",
    icon: Truck,
    searchableFields: ["PLACA", "MODELO", "TIPO_VINCULO"],
    fields: [
      { name: "PLACA", label: "Placa", type: "text" },
      { name: "MODELO", label: "Modelo", type: "text" },
      { name: "TIPO_VINCULO", label: "Vínculo", type: "select", options: ["Próprio", "Terceiro", "Agregado"] },
      { name: "CAPACIDADE_KG", label: "Capacidade (kg)", type: "number" },
      { name: "STATUS", label: "Status", type: "select", options: ["Ativo", "Em Manutenção", "Inativo"] },
    ],
  },
  faturamento: {
    collectionName: "regras_faturamento",
    title: "Regras de Faturamento",
    icon: DollarSign,
    searchableFields: ["DESCRICAO", "TIPO", "FILIAL_APLICAVEL"],
    fields: [
      { name: "DESCRICAO", label: "Descrição da Regra", type: "text" },
      { name: "TIPO", label: "Tipo", type: "select", options: ["Por KM", "Por Entrega", "Fixo Mensal", "Percentual"] },
      { name: "VALOR", label: "Valor (R$ ou %)", type: "number" },
      { name: "FILIAL_APLICAVEL", label: "Filial Aplicável", type: "text" },
      { name: "VIGENCIA_INICIO", label: "Início da Vigência", type: "text" },
      { name: "VIGENCIA_FIM", label: "Fim da Vigência", type: "text" },
    ],
  },
}

// ─── Componente Genérico de CRUD ──────────────────────────────────────────────

function GenericCrudSection({ config }: { config: CrudConfig }) {
  const { toast } = useToast()
  const [items, setItems] = React.useState<CadastroItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [isFormOpen, setFormOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<CadastroItem | null>(null)
  const [formData, setFormData] = React.useState<Record<string, any>>({})
  const [isAlertOpen, setAlertOpen] = React.useState(false)
  const [itemToDelete, setItemToDelete] = React.useState<CadastroItem | null>(null)
  const [isProcessing, setProcessing] = React.useState(false)

  React.useEffect(() => {
    setLoading(true)
    const q = collection(db, config.collectionName)
    const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CadastroItem))
      setItems(data)
      setLoading(false)
    }, (error) => {
      console.error("Firebase Snapshot Error: ", error)
      toast({ variant: "destructive", title: "Erro ao buscar dados", description: error.message })
      setLoading(false)
    })
    return () => unsubscribe()
  }, [config.collectionName, toast])

  const openForm = (item: CadastroItem | null = null) => {
    setEditingItem(item)
    setFormData(item ? { ...item } : {})
    setFormOpen(true)
  }

  const handleSave = async () => {
    setProcessing(true)
    try {
      if (editingItem) {
        const { id, ...data } = formData
        await updateDoc(doc(db, config.collectionName, editingItem.id), data)
        toast({ title: "Sucesso!", description: `${config.title} atualizado.` })
      } else {
        await addDoc(collection(db, config.collectionName), formData)
        toast({ title: "Sucesso!", description: `${config.title} adicionado.` })
      }
      setFormOpen(false)
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: e.message })
    } finally {
      setProcessing(false)
    }
  }

  const openDeleteAlert = (item: CadastroItem) => {
    setItemToDelete(item)
    setAlertOpen(true)
  }

  const handleDelete = async () => {
    if (!itemToDelete) return
    setProcessing(true)
    try {
      await deleteDoc(doc(db, config.collectionName, itemToDelete.id))
      toast({ title: "Excluído", description: "O item foi removido." })
      setAlertOpen(false)
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message })
    } finally {
      setProcessing(false)
    }
  }

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const filteredItems = items.filter(item =>
    search ? config.searchableFields.some(field =>
      String(item[field] ?? "").toLowerCase().includes(search.toLowerCase())
    ) : true
  )

  const visibleFields = config.fields.slice(0, 4) // Show first 4 fields in the table

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-4 px-0 pb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar por ${config.searchableFields.slice(0, 2).join(" ou ")}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={() => openForm()} className="gap-2">
          <PlusCircle className="size-4" />
          Novo {config.title}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleFields.map(field => (
                  <TableHead key={field.name}>{field.label}</TableHead>
                ))}
                <TableHead className="w-[60px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={visibleFields.length + 1} className="h-24 text-center">
                    <div className="flex justify-center items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Carregando...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredItems.length > 0 ? (
                filteredItems.map(item => (
                  <TableRow key={item.id}>
                    {visibleFields.map(field => (
                      <TableCell key={field.name}>{item[field.name] ?? "—"}</TableCell>
                    ))}
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
                  <TableCell colSpan={visibleFields.length + 1} className="h-24 text-center">
                    Nenhum {config.title} encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} {config.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {config.fields.map(field => (
              <div key={field.name} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={field.name} className="text-right">{field.label}</Label>
                {field.type === "select" ? (
                  <Select
                    value={formData[field.name] || ""}
                    onValueChange={(value) => handleInputChange(field.name, value)}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={`Selecione um ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.name}
                    type={field.type}
                    value={formData[field.name] || ""}
                    onChange={(e) => handleInputChange(field.name, e.target.value)}
                    className="col-span-3"
                  />
                )}
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

      <AlertDialog open={isAlertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O item será excluído permanentemente.
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
    </Card>
  )
}

// ─── Componente Principal da Página ───────────────────────────────────────────

export function CadastrosGeraisView() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-5 text-primary" />
            Cadastros Gerais
          </CardTitle>
          <CardDescription>
            Gerencie os dados mestres de funcionários, veículos e regras de faturamento do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="funcionarios" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="funcionarios">
                <User className="mr-2 size-4" /> Funcionários
              </TabsTrigger>
              <TabsTrigger value="veiculos">
                <Truck className="mr-2 size-4" /> Veículos
              </TabsTrigger>
              <TabsTrigger value="faturamento">
                <FileCog className="mr-2 size-4" /> Regras de Faturamento
              </TabsTrigger>
            </TabsList>
            <TabsContent value="funcionarios" className="pt-6">
              <GenericCrudSection config={CONFIGS.funcionarios} />
            </TabsContent>
            <TabsContent value="veiculos" className="pt-6">
              <GenericCrudSection config={CONFIGS.veiculos} />
            </TabsContent>
            <TabsContent value="faturamento" className="pt-6">
              <GenericCrudSection config={CONFIGS.faturamento} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
