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
      <div className="space-y-8 max-w-6xl mx-auto">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard Executivo</h2>
          <p className="text-muted-foreground">Visão geral do sistema de processamento vFleet Studio.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pipelines Ativos</CardTitle>
              <Database className="size-4 opacity-70" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1</div>
              <p className="text-xs opacity-70">+0 desde o último mês</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Execuções Realizadas</CardTitle>
              <FileCheck className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">128</div>
              <p className="text-xs text-muted-foreground">+12% vs mês anterior</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Motoristas Processados</CardTitle>
              <Truck className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">452</div>
              <p className="text-xs text-muted-foreground">Base consolidada vFleet</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tempo Médio Processo</CardTitle>
              <BarChart3 className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1.2s</div>
              <p className="text-xs text-muted-foreground">Performance otimizada</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Acesso Rápido</CardTitle>
              <CardDescription>Principais ações e fluxos de trabalho disponíveis.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Button variant="outline" className="justify-start h-auto p-4" asChild>
                <Link href="/pipeline/vfleet">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Truck className="size-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold">Pipeline vFleet Pilot</p>
                      <p className="text-sm text-muted-foreground">Processar boletins e alertas do mês.</p>
                    </div>
                    <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                  </div>
                </Link>
              </Button>
              <Button variant="outline" className="justify-start h-auto p-4">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-full bg-accent/10 flex items-center justify-center">
                    <Settings className="size-5 text-accent" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">Parâmetros de Sistema</p>
                    <p className="text-sm text-muted-foreground">Configurar regras de bonificação (R$ 16,00).</p>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                </div>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Atividade Recente</CardTitle>
              <CardDescription>Últimas transformações salvas no Firebase.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { user: "Eduardo S.", action: "Executou vFleet", time: "2 horas atrás", period: "01/2026" },
                  { user: "Sistema", action: "Backup Firebase", time: "5 horas atrás", period: "-" },
                  { user: "Eduardo S.", action: "Ajustou Parâmetros", time: "Ontem", period: "02/2026" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 text-sm border-b pb-3 last:border-0">
                    <div className="size-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{item.action} <span className="text-muted-foreground font-normal">por {item.user}</span></p>
                      <p className="text-xs text-muted-foreground">{item.time}</p>
                    </div>
                    {item.period !== "-" && <Badge variant="secondary">{item.period}</Badge>}
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
