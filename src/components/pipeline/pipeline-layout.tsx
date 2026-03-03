"use client"

import * as React from "react"
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
  Building2,
  TrendingUp,
  PackageX,
  BadgePercent,
  MapPin
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function PipelineLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const navGroups = [
    {
      label: "Operacional",
      items: [
        { id: 'vfleet', name: 'vFleet Pilot', icon: Truck },
        { id: 'performaxxi', name: 'Performaxxi', icon: Zap },
        { id: 'ponto', name: 'Absenteísmo', icon: Clock },
      ]
    },
    {
      label: "Gestão e Comercial",
      items: [
        { id: 'faturista', name: 'Faturista', icon: BadgePercent },
        { id: 'roadshow', name: 'Roadshow', icon: MapPin },
        { id: 'devolucoes', name: 'Devoluções', icon: PackageX },
      ]
    },
    {
      label: "Consolidação",
      items: [
        { id: 'coordenadores', name: 'Coordenadores', icon: Building2 },
        { id: 'cco', name: 'CCO Empresa', icon: TrendingUp },
        { id: 'consolidador', name: 'Final', icon: FileStack },
      ]
    }
  ]

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="border-b pb-4 pt-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Database className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">File Manager</span>
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
                  <Link href="/">
                    <LayoutDashboard className="size-4" />
                    <span className="text-xs sm:text-sm font-semibold">Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {navGroups.map((group) => (
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
                        isActive={pathname === `/pipeline/${p.id}`}
                        asChild
                      >
                        <Link href={`/pipeline/${p.id}`}>
                          <Icon className="size-4" />
                          <span className="text-xs sm:text-sm">{p.name}</span>
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
      <SidebarInset className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4 border-b bg-white">
          <SidebarTrigger className="-ml-1" />
          <h1 className="text-sm sm:text-base font-bold text-primary truncate">File Manager</h1>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-6 bg-[#F4F4FB] min-w-0">
          <div className="max-w-full overflow-hidden min-w-0">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
