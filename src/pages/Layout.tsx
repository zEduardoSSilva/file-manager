import { Outlet, Link, useLocation, useParams } from "react-router-dom"
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter
} from "@/components/ui/sidebar"
import { 
  Truck, 
  Database, 
  LayoutDashboard, 
  LogOut,
  ChevronRight,
  User,
  Zap,
  Clock,
  FileStack,
  FileSpreadsheet,
  Building2,
  TrendingUp,
  PackageX,
  BadgePercent,
  MapPin,
  GitMerge,
  Search,
  LayoutGrid // Corrigido e importado
} from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"

// A página VisaoAnaliticaPage não é importada aqui, pois a rota decide qual componente renderizar.

const NAV_GROUPS = [
  {
    label: "Visuais", // Grupo correto
    items: [
      // O path foi corrigido para a rota independente.
      // A propriedade 'component' foi removida pois não é utilizada aqui.
    { id: 'visao-analitica',       name: 'Visão Analítica', icon: LayoutGrid,      path: "/visuais/visao-analitica" },
    ]
  },
  {
    label: "Rotina",
    items: [
    { id: 'consolidacao-entregas', name: 'Entregas',        icon: FileSpreadsheet, path: '/pipeline/consolidacao-entregas' },
    ]
  },
  {
    label: "Indicadores",
    items: [
      { id: 'vfleet',        name: 'vFleet Pilot',   icon: Truck,          path: '/pipeline/vfleet' },
      { id: 'performaxxi',   name: 'Performaxxi',    icon: Zap,            path: '/pipeline/performaxxi' },
      { id: 'ponto',         name: 'Absenteísmo',    icon: Clock,          path: '/pipeline/ponto' },
      { id: 'faturista',     name: 'Faturista',      icon: BadgePercent,   path: '/pipeline/faturista' },
      { id: 'roadshow',      name: 'Roadshow',       icon: MapPin,         path: '/pipeline/roadshow' },
      { id: 'devolucoes',    name: 'Devoluções',     icon: PackageX,       path: '/pipeline/devolucoes' },
      { id: 'coordenadores', name: 'Coordenadores',  icon: Building2,      path: '/pipeline/coordenadores' },
      { id: 'cco',           name: 'CCO Empresa',    icon: TrendingUp,     path: '/pipeline/cco' },
      { id: 'consolidador',  name: 'Final',          icon: FileStack,      path: '/pipeline/consolidador' },
    ]
  },
  {
    label: "Tarefas",
    items: [
      { id: 'retorno-pedidos',    name: 'Retorn. Pedidos TXT',    icon: Search,    path: '/pipeline/retorno-pedidos' },
      { id: 'retorno-pedidos-ul', name: 'Retorn. Pedidos UL',     icon: MapPin,    path: '/pipeline/retorno-pedidos-ul' },
      { id: 'mercanete-roadshow', name: 'Mercanete x Roadshow',   icon: GitMerge,  path: '/pipeline/mercanete-roadshow' },
    ]
  }
]

export function PipelineLayout() {
  const { pathname } = useLocation()
  const { pipelineId } = useParams<{ pipelineId: string }>()

  return (
    <SidebarProvider>
      <Sidebar
        variant="inset"
        collapsible="offcanvas"
        className="bg-sidebar will-change-transform"
      >
        <SidebarHeader className="border-b pb-4 pt-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <Database className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-bold">File Manager</span>
                    <span className="truncate text-[10px] opacity-70">Logistics Intelligence</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Dashboard" isActive={pathname === '/'} asChild>
                  <Link to="/">
                    <LayoutDashboard className="size-4" />
                    <span className="text-xs font-semibold">Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider font-black text-muted-foreground/70">
                {group.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((p) => {
                  const Icon = p.icon;
                  return (
                    <SidebarMenuItem key={p.id}>
                      <SidebarMenuButton
                        tooltip={p.name}
                        isActive={pathname === p.path}
                        asChild
                      >
                        <Link to={p.path}>
                          <Icon className="size-4" />
                          <span className="text-xs">{p.name}</span>
                          <ChevronRight className="ml-auto size-3 opacity-50" />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <User className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-[11px] leading-tight">
                  <span className="truncate font-semibold text-primary">Eduardo Sousa</span>
                  <span className="truncate opacity-70">eduardo@rfk.com</span>
                </div>
                <LogOut className="ml-auto size-3 opacity-50" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 flex-1 flex flex-col overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-30">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-sm sm:text-base font-bold text-primary truncate">File Manager</h1>
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-6 min-w-0 scroll-smooth">
          <div className="max-w-full overflow-hidden min-w-0">
            <Outlet context={{ pipelineId }} />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
