
import { PipelineLayout } from "@/components/pipeline/pipeline-layout"
import { VFleetPipelineView } from "@/components/pipeline/vfleet-pipeline-view"
import { PerformaxxiPipelineView } from "@/components/pipeline/performaxxi-pipeline-view"
import { PontoPipelineView } from "@/components/pipeline/ponto-pipeline-view"
import { notFound } from "next/navigation"

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  if (id !== 'vfleet' && id !== 'performaxxi' && id !== 'ponto') {
    return notFound();
  }

  return (
    <PipelineLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            {id === 'vfleet' ? 'vFleet Pilot' : id === 'performaxxi' ? 'Performaxxi Único' : 'Ponto e Absenteísmo'}
          </h2>
          <p className="text-muted-foreground">
            {id === 'vfleet' 
              ? 'Pipeline de remuneração variável: alertas de telemetria e análise de condução (R$ 4,80).'
              : id === 'performaxxi'
              ? 'Sequência de rotas e performance de motoristas (R$ 8,00) e ajudantes (R$ 7,20).'
              : 'Gestão de jornada e presença: análise de CSVs de ponto e incentivos de absenteísmo.'}
          </p>
        </div>
        
        {id === 'vfleet' && <VFleetPipelineView />}
        {id === 'performaxxi' && <PerformaxxiPipelineView />}
        {id === 'ponto' && <PontoPipelineView />}
      </div>
    </PipelineLayout>
  )
}
