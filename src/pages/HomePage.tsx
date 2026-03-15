import * as React from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import {
  ArrowUpRight, BarChart3, Database, Truck, FileSpreadsheet,
  FileCheck, Zap, Clock, Building2, TrendingUp, PackageX,
  BadgePercent, MapPin, FileStack, GitMerge, Search,
  User, FileX, LayoutGrid, Activity, CheckCircle2,
  AlertTriangle, Layers, Route, Calendar, Warehouse,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface LiveStats {
  totalVeiculos:    number
  totalFuncionarios: number
  ultimaImportacao: string | null
  registrosMes:    number
  filiaisAtivas:   number
  loading:         boolean
}

// ─── Dados das seções ─────────────────────────────────────────────────────────
const REGISTRATIONS = [
  { id: "funcionarios",  name: "Funcionários",       desc: "Cadastro de pessoal",     icon: User,         color: "bg-blue-500/10 text-blue-500 border border-blue-500/20",   path: "/pipeline/funcionarios"  },
  { id: "veiculos",      name: "Veículos",            desc: "Gerenciamento de frota",  icon: Truck,        color: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20", path: "/pipeline/veiculos" },
  { id: "faturamento",   name: "Faturamento",         desc: "Lançamentos financeiros", icon: BadgePercent, color: "bg-violet-500/10 text-violet-500 border border-violet-500/20", path: "/pipeline/faturamento"  },
  { id: "motivos-dev",   name: "Motivos Devolução",   desc: "Causas e logística",      icon: PackageX,     color: "bg-rose-500/10 text-rose-500 border border-rose-500/20",     path: "/pipeline/motivos-dev"  },
]

const VISUALS = [
  { id: "entregas-analitica", name: "Visão Analítica", desc: "Registros brutos por filial", icon: LayoutGrid, color: "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20", path: "/visuais/entregas-analitica" },
  { id: "entregas-acumulada", name: "Visão Acumulada", desc: "Agrupamento de rotas",        icon: Layers,     color: "bg-sky-500/10 text-sky-500 border border-sky-500/20",   path: "/visuais/entregas-acumulada" },
]

const ROUTINES = [
  { id: "consolidacao-entregas", name: "Analítico de Entregas", desc: "Consolidação por filial", icon: FileSpreadsheet, color: "bg-teal-500/10 text-teal-500 border border-teal-500/20", path: "/pipeline/consolidacao-entregas" },
]

const INDICATORS = [
  { id: "vfleet",        name: "vFleet Pilot",    desc: "Telemetria e Alertas",     icon: Activity,     color: "bg-primary/10 text-primary border border-primary/20"          },
  { id: "performaxxi",   name: "Performaxxi",     desc: "Performance de Rotas",     icon: Zap,          color: "bg-amber-500/10 text-amber-500 border border-amber-500/20"    },
  { id: "ponto",         name: "Absenteísmo",     desc: "Jornada e Frequência",     icon: Clock,        color: "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20" },
  { id: "faturista",     name: "Faturista",       desc: "Cintas e Liberação",       icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" },
  { id: "roadshow",      name: "Roadshow",        desc: "Ocupação de Veículo",      icon: Route,        color: "bg-orange-500/10 text-orange-500 border border-orange-500/20" },
  { id: "devolucoes",    name: "Devoluções",      desc: "Análise de Quebras",       icon: PackageX,     color: "bg-rose-500/10 text-rose-500 border border-rose-500/20"       },
  { id: "coordenadores", name: "Coordenadores",   desc: "Modular 4 Estágios",       icon: Building2,    color: "bg-violet-500/10 text-violet-500 border border-violet-500/20" },
  { id: "cco",           name: "CCO Empresa",     desc: "Consolidado p/ Filial",    icon: TrendingUp,   color: "bg-blue-500/10 text-blue-500 border border-blue-500/20"       },
  { id: "consolidador",  name: "Final",           desc: "Fechamento de Folha",      icon: FileStack,    color: "bg-slate-500/10 text-slate-400 border border-slate-500/20"   },
]

const TASKS = [
  { id: "retorno-pedidos",    name: "Retorn. Pedidos TXT",  desc: "Processamento .txt",   icon: Search,   color: "bg-slate-500/10 text-slate-400 border border-slate-500/20" },
  { id: "retorno-pedidos-ul", name: "Retorn. Pedidos UL",   desc: "Processamento .ul",    icon: MapPin,   color: "bg-amber-500/10 text-amber-500 border border-amber-500/20"  },
  { id: "mercanete-roadshow", name: "Mercanete x Roadshow", desc: "Matching de Status",   icon: GitMerge, color: "bg-blue-500/10 text-blue-500 border border-blue-500/20"     },
]

// ─── Hook de dados vivos — 1 leitura por coleção, leve ───────────────────────
function useLiveStats(): LiveStats {
  const [stats, setStats] = React.useState<LiveStats>({
    totalVeiculos: 0, totalFuncionarios: 0,
    ultimaImportacao: null, registrosMes: 0,
    filiaisAtivas: 0, loading: true,
  })

  React.useEffect(() => {
    const hoje = new Date()
    const ano  = hoje.getFullYear()
    const mes  = hoje.getMonth() + 1

    Promise.all([
      // veículos — só conta documentos
      getDocs(collection(db, "docs_veiculos")),
      // funcionários — só conta documentos
      getDocs(collection(db, "docs_funcionarios")),
      // pipeline do mês — metadados leves, sem items/
      getDocs(query(
        collection(db, "pipeline_results"),
        where("pipelineType", "==", "consolidacao-entregas"),
        where("year",  "==", ano),
        where("month", "==", mes),
        orderBy("timestamp", "desc"),
        limit(50),
      )),
    ]).then(([veicSnap, funcSnap, pipeSnap]) => {
      // timestamp mais recente
      let ultimaImportacao: string | null = null
      let registrosMes = 0
      const filiaisSet = new Set<string>()

      for (const d of pipeSnap.docs) {
        const data = d.data()
        // porFilialDia já está nos metadados — zero leituras extras
        const pfd = data.porFilialDia ?? {}
        for (const filial of Object.keys(pfd)) filiaisSet.add(filial)
        registrosMes = Math.max(registrosMes, data.itemCount ?? 0)
        if (!ultimaImportacao && data.timestamp) {
          ultimaImportacao = new Date(data.timestamp).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
          })
        }
      }

      setStats({
        totalVeiculos:     veicSnap.size,
        totalFuncionarios: funcSnap.size,
        ultimaImportacao,
        registrosMes,
        filiaisAtivas:     filiaisSet.size,
        loading:           false,
      })
    }).catch(() => setStats(s => ({ ...s, loading: false })))
  }, [])

  return stats
}

// ─── Componente de card de link ───────────────────────────────────────────────
function LinkCard({ item }: { item: { id: string; name: string; desc: string; icon: any; color: string; path?: string } }) {
  const Icon = item.icon
  const content = (
    <div className="flex items-center gap-3 w-full min-w-0">
      <div className={cn(
        "size-9 shrink-0 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
        item.color
      )}>
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[12px] sm:text-[13px] leading-tight group-hover:text-primary transition-colors">
          {item.name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{item.desc}</p>
      </div>
      <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/40 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )

  if (!item.path) {
    return (
      <div className="flex items-center w-full h-auto p-3 rounded-lg border border-muted/40 bg-muted/5 opacity-50 cursor-not-allowed">
        {content}
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-start h-auto p-3 text-left !whitespace-normal break-words hover:bg-primary/5 hover:border-primary/30 transition-all border-muted/40 group rounded-xl"
      asChild
    >
      <Link to={item.path}>{content}</Link>
    </Button>
  )
}

// ─── Seção com título e grid ──────────────────────────────────────────────────
function Section({ title, desc, icon: Icon, iconColor, items, cols = 3 }: {
  title: string; desc: string; icon: any; iconColor: string
  items: any[]; cols?: number
}) {
  return (
    <Card className="shadow-sm border-border/50 overflow-hidden">
      <CardHeader className="p-4 sm:p-5 border-b bg-muted/5 flex flex-row items-center gap-3 space-y-0">
        <div className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", iconColor)}>
          <Icon className="size-4" />
        </div>
        <div>
          <CardTitle className="text-sm font-bold text-foreground">{title}</CardTitle>
          <CardDescription className="text-[11px] mt-0">{desc}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <div className={cn(
          "grid gap-2",
          cols === 2 && "grid-cols-1 sm:grid-cols-2",
          cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          cols === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        )}>
          {items.map(item => <LinkCard key={item.id} item={item} />)}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function HomePage() {
  const stats = useLiveStats()
  const hoje  = new Date()

  const statCards = [
    {
      label: "Veículos Ativos",
      value: stats.loading ? "—" : stats.totalVeiculos.toString(),
      sub:   "frota cadastrada",
      icon:  Truck,
      color: "text-emerald-500",
      bg:    "bg-emerald-500/10",
    },
    {
      label: "Funcionários",
      value: stats.loading ? "—" : stats.totalFuncionarios.toString(),
      sub:   "colaboradores",
      icon:  User,
      color: "text-blue-500",
      bg:    "bg-blue-500/10",
    },
    {
      label: "Registros no Mês",
      value: stats.loading ? "—" : stats.registrosMes.toLocaleString("pt-BR"),
      sub:   `${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`,
      icon:  Database,
      color: "text-violet-500",
      bg:    "bg-violet-500/10",
    },
    {
      label: "Filiais Importadas",
      value: stats.loading ? "—" : stats.filiaisAtivas.toString(),
      sub:   stats.ultimaImportacao ? `última: ${stats.ultimaImportacao}` : "nenhuma importação",
      icon:  Warehouse,
      color: "text-amber-500",
      bg:    "bg-amber-500/10",
    },
  ]

  return (
    <div className="space-y-5 max-w-full min-w-0 overflow-hidden">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5">
            Sistema central de processamento logístico — {hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0",
          "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
        )}>
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Operacional
        </div>
      </div>

      {/* Stats vivos — dados do Firestore */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="shadow-sm border-border/50 overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                      {s.label}
                    </p>
                    <p className={cn(
                      "text-2xl font-bold mt-1 tabular-nums",
                      stats.loading && "opacity-30 animate-pulse"
                    )}>
                      {s.value}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.sub}</p>
                  </div>
                  <div className={cn("size-9 rounded-xl flex items-center justify-center shrink-0", s.bg)}>
                    <Icon className={cn("size-4", s.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Seções */}
      <div className="space-y-4">
        <Section
          title="Visuais"
          desc="Dashboards analíticos e visões de dados"
          icon={BarChart3}
          iconColor="bg-cyan-500/10 text-cyan-500"
          items={VISUALS}
          cols={2}
        />
        <Section
          title="Cadastros"
          desc="Dados mestres do sistema"
          icon={Database}
          iconColor="bg-blue-500/10 text-blue-500"
          items={REGISTRATIONS}
          cols={4}
        />
        <Section
          title="Rotinas"
          desc="Processamentos recorrentes e consolidações periódicas"
          icon={Calendar}
          iconColor="bg-teal-500/10 text-teal-500"
          items={ROUTINES}
          cols={3}
        />
        <Section
          title="Indicadores de Performance"
          desc="Fluxos analíticos e consolidação de resultados"
          icon={TrendingUp}
          iconColor="bg-violet-500/10 text-violet-500"
          items={INDICATORS.map(i => ({ ...i, path: `/pipeline/${i.id}` }))}
          cols={3}
        />
        <Section
          title="Tarefas de Processamento"
          desc="Cruzamento de dados e extração de arquivos"
          icon={GitMerge}
          iconColor="bg-slate-500/10 text-slate-400"
          items={TASKS.map(i => ({ ...i, path: `/pipeline/${i.id}` }))}
          cols={3}
        />
      </div>
    </div>
  )
}