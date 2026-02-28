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
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="px-1">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard Executivo</h2>
          <p className="text-sm sm:text-base text-muted-foreground">Visão geral do sistema de processamento vFleet Studio.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Pipelines Ativos</CardTitle>
              <Database className="size-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">1</div>
              <p className="text-[10px] sm:text-xs opacity-70">+0 desde o último mês</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Execuções Realizadas</CardTitle>
              <FileCheck className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">128</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">+12% vs mês anterior</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Motoristas Processados</CardTitle>
              <Truck className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">452</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Base consolidada vFleet</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Tempo Médio Processo</CardTitle>
              <BarChart3 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">1.2s</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Performance otimizada</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Acesso Rápido</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Principais ações e fluxos de trabalho disponíveis.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button variant="outline" className="justify-start h-auto p-3 sm:p-4 whitespace-normal text-left" asChild>
                <Link href="/pipeline/vfleet">
                  <div className="flex items-center gap-3 sm:gap-4 w-full">
                    <div className="size-8 sm:size-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="size-4 sm:size-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm sm:text-base leading-tight">Pipeline vFleet Pilot</p>
                      <p className="text-xs text-muted-foreground truncate sm:whitespace-normal">Processar boletins e alertas do mês.</p>
                    </div>
                    <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  </div>
                </Link>
              </Button>
              <Button variant="outline" className="justify-start h-auto p-3 sm:p-4 whitespace-normal text-left">
                <div className="flex items-center gap-3 sm:gap-4 w-full">
                  <div className="size-8 sm:size-10 shrink-0 rounded-full bg-accent/10 flex items-center justify-center">
                    <Settings className="size-4 sm:size-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm sm:text-base leading-tight">Parâmetros de Sistema</p>
                    <p className="text-xs text-muted-foreground truncate sm:whitespace-normal">Configurar regras de bonificação (R$ 4.80).</p>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </div>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Atividade Recente</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Últimas transformações salvas no Firebase.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 sm:space-y-4">
                {[
                  { user: "Eduardo S.", action: "Executou vFleet", time: "2 horas atrás", period: "01/2026" },
                  { user: "Sistema", action: "Backup Firebase", time: "5 horas atrás", period: "-" },
                  { user: "Eduardo S.", action: "Ajustou Parâmetros", time: "Ontem", period: "02/2026" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs sm:text-sm border-b pb-3 last:border-0">
                    <div className="size-1.5 sm:size-2 shrink-0 rounded-full bg-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.action} <span className="text-muted-foreground font-normal">por {item.user}</span></p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{item.time}</p>
                    </div>
                    {item.period !== "-" && <Badge variant="secondary" className="text-[9px] sm:text-xs shrink-0">{item.period}</Badge>}
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