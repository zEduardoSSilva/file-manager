import { PipelineLayout } from "@/components/pipeline/pipeline-layout"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { 
  ArrowUpRight, 
  BarChart3, 
  Database, 
  Settings, 
  Truck, 
  FileCheck 
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default function Home() {
  return (
    <PipelineLayout>
      <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto">
        <div className="px-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard Executivo</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Visão geral do sistema vFleet Studio.</p>
        </div>

        {/* Stats Grid: 2 columns on mobile for compactness */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Pipelines</CardTitle>
              <Database className="size-3 sm:size-4 opacity-70" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">4</div>
              <p className="text-[9px] sm:text-xs opacity-70">Sistemas ativos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Execuções</CardTitle>
              <FileCheck className="size-3 sm:size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">128</div>
              <p className="text-[9px] sm:text-xs text-muted-foreground">+12% este mês</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Motoristas</CardTitle>
              <Truck className="size-3 sm:size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">452</div>
              <p className="text-[9px] sm:text-xs text-muted-foreground">Base consolidada</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 space-y-0 p-3 sm:p-6">
              <CardTitle className="text-[10px] sm:text-xs font-medium uppercase tracking-wider">Performance</CardTitle>
              <BarChart3 className="size-3 sm:size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">94.2%</div>
              <p className="text-[9px] sm:text-xs text-muted-foreground">Média global</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="flex flex-col shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Acesso Rápido</CardTitle>
              <CardDescription className="text-[11px] sm:text-sm">Inicie os fluxos de trabalho do vFleet.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 p-4 pt-0 sm:p-6 sm:pt-0">
              <Button variant="outline" className="w-full justify-start h-auto p-3 sm:p-4 text-left !whitespace-normal" asChild>
                <Link href="/pipeline/vfleet" className="w-full">
                  <div className="flex items-center gap-3 w-full">
                    <div className="size-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="size-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs sm:text-sm leading-tight">Pipeline vFleet Pilot</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Processar boletins e alertas de telemetria.</p>
                    </div>
                    <ArrowUpRight className="size-3 shrink-0 text-muted-foreground ml-auto" />
                  </div>
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto p-3 sm:p-4 text-left !whitespace-normal" asChild>
                <Link href="/pipeline/performaxxi" className="w-full">
                  <div className="flex items-center gap-3 w-full">
                    <div className="size-8 shrink-0 rounded-full bg-accent/10 flex items-center justify-center">
                      <BarChart3 className="size-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs sm:text-sm leading-tight">Performaxxi Único</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Análise de Raio, SLA, Tempo e Sequência.</p>
                    </div>
                    <ArrowUpRight className="size-3 shrink-0 text-muted-foreground ml-auto" />
                  </div>
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto p-3 sm:p-4 text-left !whitespace-normal">
                <div className="flex items-center gap-3 w-full">
                  <div className="size-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                    <Settings className="size-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs sm:text-sm leading-tight">Parâmetros de Sistema</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Configurar regras globais de bonificação.</p>
                  </div>
                  <ArrowUpRight className="size-3 shrink-0 text-muted-foreground ml-auto" />
                </div>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col shadow-sm">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Atividade Recente</CardTitle>
              <CardDescription className="text-[11px] sm:text-sm">Últimas transformações salvas.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="space-y-3">
                {[
                  { user: "Eduardo S.", action: "Executou vFleet", time: "2h atrás", period: "01/2026", color: "bg-primary" },
                  { user: "Sistema", action: "Backup Realizado", time: "5h atrás", period: "-", color: "bg-slate-300" },
                  { user: "Eduardo S.", action: "Ajustou Performaxxi", time: "Ontem", period: "12/2025", color: "bg-accent" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs border-b border-border/50 pb-2 last:border-0 last:pb-0">
                    <div className={`size-1.5 shrink-0 rounded-full ${item.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[11px] sm:text-xs truncate">{item.action} <span className="text-muted-foreground font-normal">por {item.user}</span></p>
                      <p className="text-[10px] text-muted-foreground">{item.time}</p>
                    </div>
                    {item.period !== "-" && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 font-bold">{item.period}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PipelineLayout>
  )
}
