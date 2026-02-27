
import { PipelineLayout } from "@/components/pipeline/pipeline-layout"
import { VFleetPipelineView } from "@/components/pipeline/vfleet-pipeline-view"
import { notFound } from "next/navigation"

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  if (id !== 'vfleet' && id !== 'performaxxi') {
    return notFound();
  }

  return (
    <PipelineLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            {id === 'vfleet' ? 'vFleet Pilot' : 'Performaxxi Único'}
          </h2>
          <p className="text-muted-foreground">
            {id === 'vfleet' 
              ? 'Pipeline de remuneração variável: boletins, alertas e análise de condução unificada.'
              : 'Sequência de rotas, performance de motoristas e ajudantes com critérios detalhados.'}
          </p>
        </div>
        <VFleetPipelineView pipelineId={id as 'vfleet' | 'performaxxi'} />
      </div>
    </PipelineLayout>
  )
}
