
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
    { id: 'vfleet', name: 'vFleet', icon: Truck },
    { id: 'performaxxi', name: 'Performaxxi', icon: Zap },
    { id: 'ponto', name: 'Absenteísmo', icon: Clock },
    { id: 'consolidador', name: 'Consolidador', icon: FileStack },
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
                    <span className="truncate text-[10px] opacity-70">Logistics Engine</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">Principal</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Dashboard" isActive={pathname === '/'} asChild>
                  <Link href="/">
                    <LayoutDashboard className="size-4" />
                    <span className="text-xs sm:text-sm">Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">Pipelines Ativos</SidebarGroupLabel>
            <SidebarMenu>
              {pipelines.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton 
                    tooltip={p.name} 
                    isActive={pathname === `/pipeline/${p.id}`}
                    asChild
                  >
                    <Link href={`/pipeline/${p.id}`}>
                      <p.icon className="size-4" />
                      <span className="text-xs sm:text-sm">{p.name}</span>
                      <ChevronRight className="ml-auto size-3 opacity-50" />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider">Gestão</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Parâmetros">
                  <Settings2 className="size-4" />
                  <span className="text-xs sm:text-sm">Parâmetros</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Histórico">
                  <History className="size-4" />
                  <span className="text-xs sm:text-sm">Histórico</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t pt-2">
           <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <User className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-[11px] leading-tight">
                  <span className="truncate font-semibold">Eduardo Sousa</span>
                  <span className="truncate opacity-70">eduardo@rfk.com</span>
                </div>
                <LogOut className="ml-auto size-3 opacity-50" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 max-w-full overflow-hidden flex flex-col">
        <header className="flex h-12 sm:h-16 shrink-0 items-center gap-2 px-3 sm:px-4 border-b">
          <SidebarTrigger className="-ml-1 size-8" />
          <div className="flex-1 min-w-0">
             <h1 className="text-sm sm:text-lg font-bold text-primary truncate">File Studio</h1>
          </div>
        </header>
        <main className="flex-1 min-w-0 max-w-full overflow-hidden p-3 sm:p-6 bg-background">
          <div className="max-w-full overflow-auto h-full">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
