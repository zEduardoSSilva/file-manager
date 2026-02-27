
import { PipelineLayout } from "@/components/pipeline/pipeline-layout"
import { VFleetPipelineView } from "@/components/pipeline/vfleet-pipeline-view"
import { notFound } from "next/navigation"

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  if (id !== 'vfleet') {
    return notFound();
  }

  return (
    <PipelineLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">vFleet Pilot</h2>
          <p className="text-muted-foreground">
            Pipeline de remuneração variável: boletins, alertas e análise de condução unificada.
          </p>
        </div>
        <VFleetPipelineView />
      </div>
    </PipelineLayout>
  )
}
