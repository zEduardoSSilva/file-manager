"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, AlertTriangle, ServerCrash, Loader2 } from "lucide-react"

// Tipos
type Status = "ONLINE" | "OFFLINE" | "MANUTENCAO"
interface PipelineStatus {
  id: string
  name: string
  status: Status
  description?: string
}

// Mapeamento de status para UI
const statusMap = {
  ONLINE: {
    label: "Online",
    icon: CheckCircle2,
    color: "bg-green-500/10 text-green-600 border-green-500/20",
    iconColor: "text-green-500",
  },
  OFFLINE: {
    label: "Offline",
    icon: XCircle,
    color: "bg-red-500/10 text-red-600 border-red-500/20",
    iconColor: "text-red-500",
  },
  MANUTENCAO: {
    label: "Manutenção",
    icon: AlertTriangle,
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    iconColor: "text-amber-500",
  },
}

// Hook para buscar dados
function usePipelineStatus() {
  const [pipelines, setPipelines] = React.useState<PipelineStatus[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "pipeline_status"))
        const statusData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PipelineStatus[]
        setPipelines(statusData)
      } catch (err) {
        setError("Falha ao buscar o status dos pipelines.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchStatus()
  }, [])

  return { pipelines, loading, error }
}

export function VisaoStatusPage() {
  const { pipelines, loading, error } = usePipelineStatus()

  const renderContent = () => {
    if (loading) {
      return (
        <div className="py-20 text-center">
          <Loader2 className="size-8 text-muted-foreground/30 mx-auto mb-4 animate-spin" />
          <h3 className='font-semibold text-lg'>Carregando Status...</h3>
          <p className="text-sm text-muted-foreground">Buscando informações em tempo real.</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="py-20 text-center">
          <ServerCrash className="size-8 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className='font-semibold text-lg text-red-500'>Erro ao Carregar</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )
    }

    if (pipelines.length === 0) {
        return (
            <div className="py-20 text-center">
                <ServerCrash className="size-8 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className='font-semibold text-lg'>Nenhum Pipeline Encontrado</h3>
                <p className="text-sm text-muted-foreground">A coleção 'pipeline_status' parece estar vazia.</p>
            </div>
        )
    }

    return (
      <div className="divide-y divide-border/60">
        {pipelines.map(pipeline => {
          const ui = statusMap[pipeline.status] || statusMap.OFFLINE
          const Icon = ui.icon
          return (
            <div key={pipeline.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                 <Icon className={cn("size-5 shrink-0", ui.iconColor)} />
                 <div>
                    <p className="font-semibold text-sm">{pipeline.name}</p>
                    {pipeline.description && <p className="text-xs text-muted-foreground">{pipeline.description}</p>}
                 </div>
              </div>
              <Badge variant="outline" className={cn("text-xs font-bold", ui.color)}>{ui.label}</Badge>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Visão de Status
              </CardTitle>
              <CardDescription>Monitoramento do status dos pipelines e integrações.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
            {renderContent()}
        </CardContent>
      </Card>
    </div>
  )
}