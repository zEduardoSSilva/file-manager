
import { PipelineLayout } from "@/components/pipeline/pipeline-layout"
import { notFound } from "next/navigation"
import dynamic from "next/dynamic"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

// Carregamento dinâmico para melhorar a performance de navegação
const VFleetPipelineView = dynamic(() => import("@/components/pipeline/vfleet-pipeline-view").then(mod => mod.VFleetPipelineView), { 
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div> 
})
const PerformaxxiPipelineView = dynamic(() => import("@/components/pipeline/performaxxi-pipeline-view").then(mod => mod.PerformaxxiPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-accent" /></div>
})
const PontoPipelineView = dynamic(() => import("@/components/pipeline/ponto-pipeline-view").then(mod => mod.PontoPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-indigo-600" /></div>
})
const ConsolidadorPipelineView = dynamic(() => import("@/components/pipeline/consolidador-pipeline-view").then(mod => mod.ConsolidadorPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div>
})

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const validIds = ['vfleet', 'performaxxi', 'ponto', 'consolidador'];
  if (!validIds.includes(id)) {
    return notFound();
  }

  const titles = {
    vfleet: 'vFleet Pilot',
    performaxxi: 'Performaxxi Único',
    ponto: 'Ponto e Absenteísmo',
    consolidador: 'Consolidador Final'
  };

  const descriptions = {
    vfleet: 'Pipeline de remuneração variável: alertas de telemetria e análise de condução (R$ 4,80).',
    performaxxi: 'Sequência de rotas e performance de motoristas (R$ 8,00) e ajudantes (R$ 7,20).',
    ponto: 'Gestão de jornada e presença: análise de CSVs de ponto e incentivos de absenteísmo.',
    consolidador: 'Unificação de todas as fontes de dados para geração dos relatórios de pagamento finais.'
  };

  return (
    <PipelineLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            {titles[id as keyof typeof titles]}
          </h2>
          <p className="text-muted-foreground">
            {descriptions[id as keyof typeof descriptions]}
          </p>
        </div>
        
        <Suspense fallback={<div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div>}>
          {id === 'vfleet' && <VFleetPipelineView />}
          {id === 'performaxxi' && <PerformaxxiPipelineView />}
          {id === 'ponto' && <PontoPipelineView />}
          {id === 'consolidador' && <ConsolidadorPipelineView />}
        </Suspense>
      </div>
    </PipelineLayout>
  )
}
