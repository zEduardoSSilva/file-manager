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
  Settings2, 
  Database, 
  LayoutDashboard, 
  History,
  LogOut,
  ChevronRight,
  User,
  Zap,
  Clock,
  FileStack
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function PipelineLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const pipelines = [
    { id: 'vfleet', name: 'vFleet Pilot', icon: Truck },
    { id: 'performaxxi', name: 'Performaxxi', icon: Zap },
    { id: 'ponto', name: 'Ponto e Absenteísmo', icon: Clock },
    { id: 'consolidador', name: 'Consolidador Final', icon: FileStack },
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
                    <span className="truncate font-semibold">File Studio</span>
                    <span className="truncate text-xs">Logistics Engine</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Principal</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Dashboard" isActive={pathname === '/'} asChild>
                  <Link href="/">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Pipelines Ativos</SidebarGroupLabel>
            <SidebarMenu>
              {pipelines.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton 
                    tooltip={p.name} 
                    isActive={pathname === `/pipeline/${p.id}`}
                    asChild
                  >
                    <Link href={`/pipeline/${p.id}`}>
                      <p.icon />
                      <span>{p.name}</span>
                      <ChevronRight className="ml-auto size-4 opacity-50" />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Configurações</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Parâmetros">
                  <Settings2 />
                  <span>Parâmetros Globais</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Histórico">
                  <History />
                  <span>Histórico de Execuções</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t pt-4">
           <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <User className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Eduardo Sousa</span>
                  <span className="truncate text-xs">eduardo.sousa@rfk.com</span>
                </div>
                <LogOut className="ml-auto size-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 sm:h-16 shrink-0 items-center gap-2 px-3 sm:px-4 border-b">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1 min-w-0">
             <h1 className="text-sm sm:text-lg font-semibold text-primary truncate">vFleet Studio</h1>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-3 sm:p-6 bg-background">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}