import { PipelineLayout } from "@/components/pipeline/pipeline-layout"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { 
  ArrowUpRight, 
  BarChart3, 
  Database, 
  Truck, 
  FileCheck,
  Zap,
  Clock,
  Building2,
  TrendingUp,
  PackageX,
  BadgePercent,
  MapPin,
  FileStack,
  GitMerge,
  Search
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  const indicators = [
    { id: 'vfleet', name: 'vFleet Pilot', desc: 'Telemetria e Alertas', icon: Truck, color: 'bg-primary/10 text-primary' },
    { id: 'performaxxi', name: 'Performaxxi', desc: 'Performance de Rotas', icon: Zap, color: 'bg-amber-100 text-amber-600' },
    { id: 'ponto', name: 'Absenteísmo', desc: 'Jornada e Frequência', icon: Clock, color: 'bg-indigo-100 text-indigo-600' },
    { id: 'faturista', name: 'Faturista', desc: 'Cintas e Liberação', icon: BadgePercent, color: 'bg-emerald-100 text-emerald-600' },
    { id: 'roadshow', name: 'Roadshow', desc: 'Ocupação de Veículo', icon: MapPin, color: 'bg-orange-100 text-orange-600' },
    { id: 'devolucoes', name: 'Devoluções', desc: 'Análise de Quebras', icon: PackageX, color: 'bg-rose-100 text-rose-600' },
    { id: 'coordenadores', name: 'Coordenadores', desc: 'Modular 4 Estágios', icon: Building2, color: 'bg-violet-100 text-violet-600' },
    { id: 'cco', name: 'CCO Empresa', desc: 'Consolidado p/ Filial', icon: TrendingUp, color: 'bg-blue-100 text-blue-600' },
    { id: 'consolidador', name: 'Final', desc: 'Fechamento de Folha', icon: FileStack, color: 'bg-slate-100 text-slate-600' },
  ]

  const tasks = [
    { id: 'retorno-pedidos', name: 'Retorn. Pedidos TXT', desc: 'Processamento .txt', icon: Search, color: 'bg-slate-100 text-slate-600' },
    { id: 'retorno-pedidos-ul', name: 'Retorn. Pedidos UL', desc: 'Processamento .ul', icon: MapPin, color: 'bg-amber-50 text-amber-600' },
    { id: 'mercanete-roadshow', name: 'Mercanete x Roadshow', desc: 'Matching de Status', icon: GitMerge, color: 'bg-blue-50 text-blue-500' },
  ]

  return (
    <PipelineLayout>
      <div className="space-y-4 sm:space-y-6 max-w-full min-w-0 overflow-hidden">
        <div className="px-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard Executivo</h2>
          <p className="text-[10px] sm:text-sm text-muted-foreground">Sistema central de processamento logístico File Manager.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-primary text-primary-foreground min-w-0 border-none">
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[9px] sm:text-xs font-medium uppercase tracking-wider truncate">Sistemas</CardTitle>
              <Database className="size-3 sm:size-4 opacity-70 shrink-0" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-base sm:text-2xl font-bold">12</div>
              <p className="text-[8px] sm:text-xs opacity-70 truncate">Pipelines integrados</p>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[9px] sm:text-xs font-medium uppercase tracking-wider truncate">Status Processo</CardTitle>
              <FileCheck className="size-3 sm:size-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-base sm:text-2xl font-bold">Ativo</div>
              <p className="text-[8px] sm:text-xs text-muted-foreground truncate">Ambiente de produção</p>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[9px] sm:text-xs font-medium uppercase tracking-wider truncate">Eficiência</CardTitle>
              <BarChart3 className="size-3 sm:size-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-base sm:text-2xl font-bold">94.2%</div>
              <p className="text-[8px] sm:text-xs text-muted-foreground truncate">Média de Performance</p>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[9px] sm:text-xs font-medium uppercase tracking-wider truncate">Último Fechamento</CardTitle>
              <Clock className="size-3 sm:size-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-base sm:text-2xl font-bold">01/26</div>
              <p className="text-[8px] sm:text-xs text-muted-foreground truncate">Período Concluído</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Indicadores */}
          <Card className="flex flex-col shadow-sm overflow-hidden min-w-0">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg text-primary">Indicadores de Performance</CardTitle>
              <CardDescription className="text-[10px] sm:text-sm">Fluxos analíticos e consolidação de resultados.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {indicators.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Button 
                      key={link.id} 
                      variant="outline" 
                      className="w-full justify-start h-auto p-3 sm:p-4 text-left !whitespace-normal break-words hover:bg-primary/5 transition-all border-muted/60" 
                      asChild
                    >
                      <Link href={`/pipeline/${link.id}`}>
                        <div className="flex items-center gap-3 w-full min-w-0">
                          <div className={`size-8 sm:size-10 shrink-0 rounded-lg ${link.color} flex items-center justify-center`}>
                            <Icon className="size-4 sm:size-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[12px] sm:text-sm leading-tight">{link.name}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{link.desc}</p>
                          </div>
                          <ArrowUpRight className="size-3 shrink-0 text-muted-foreground ml-auto opacity-40" />
                        </div>
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Tarefas */}
          <Card className="flex flex-col shadow-sm overflow-hidden min-w-0">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg text-primary">Tarefas de Processamento</CardTitle>
              <CardDescription className="text-[10px] sm:text-sm">Cruzamento de dados e extração de arquivos.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tasks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Button 
                      key={link.id} 
                      variant="outline" 
                      className="w-full justify-start h-auto p-3 sm:p-4 text-left !whitespace-normal break-words hover:bg-primary/5 transition-all border-muted/60" 
                      asChild
                    >
                      <Link href={`/pipeline/${link.id}`}>
                        <div className="flex items-center gap-3 w-full min-w-0">
                          <div className={`size-8 sm:size-10 shrink-0 rounded-lg ${link.color} flex items-center justify-center`}>
                            <Icon className="size-4 sm:size-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[12px] sm:text-sm leading-tight">{link.name}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{link.desc}</p>
                          </div>
                          <ArrowUpRight className="size-3 shrink-0 text-muted-foreground ml-auto opacity-40" />
                        </div>
                      </Link>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PipelineLayout>
  )
}
