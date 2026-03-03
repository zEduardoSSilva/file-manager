import { PipelineLayout } from "@/components/pipeline/pipeline-layout"
import { notFound } from "next/navigation"
import dynamic from "next/dynamic"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

// IDs válidos para pre-renderização
export async function generateStaticParams() {
  return [
    { id: 'vfleet' },
    { id: 'performaxxi' },
    { id: 'ponto' },
    { id: 'cco' },
    { id: 'coordenadores' },
    { id: 'faturista' },
    { id: 'roadshow' },
    { id: 'devolucoes' },
    { id: 'consolidador' },
    { id: 'mercanete-roadshow' },
    { id: 'retorno-pedidos-ul' },
    { id: 'retorno-pedidos' },
  ]
}

// Carregamento dinâmico de todos os sistemas para melhorar performance de start
const VFleetPipelineView = dynamic(() => import("@/components/pipeline/vfleet-pipeline-view").then(mod => mod.VFleetPipelineView), { 
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div> 
})
const PerformaxxiPipelineView = dynamic(() => import("@/components/pipeline/performaxxi-pipeline-view").then(mod => mod.PerformaxxiPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-amber-500" /></div>
})
const PontoPipelineView = dynamic(() => import("@/components/pipeline/ponto-pipeline-view").then(mod => mod.PontoPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-indigo-600" /></div>
})
const CcoPipelineView = dynamic(() => import("@/components/pipeline/cco-pipeline-view").then(mod => mod.CcoPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-blue-600" /></div>
})
const CoordenadorPipelineView = dynamic(() => import("@/components/pipeline/coordenador-pipeline-view").then(mod => mod.CoordenadorPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-violet-600" /></div>
})
const FaturistaPipelineView = dynamic(() => import("@/components/pipeline/faturista-pipeline-view").then(mod => mod.FaturistaPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>
})
const RoadshowPipelineView = dynamic(() => import("@/components/pipeline/roadshow-pipeline-view").then(mod => mod.RoadshowPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-orange-600" /></div>
})
const DevolucoesPipelineView = dynamic(() => import("@/components/pipeline/devolucoes-pipeline-view").then(mod => mod.DevolucoesPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-rose-600" /></div>
})
const ConsolidadorPipelineView = dynamic(() => import("@/components/pipeline/consolidador-pipeline-view").then(mod => mod.ConsolidadorPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-slate-600" /></div>
})
const MercaneteRoadshowPipelineView = dynamic(() => import("@/components/pipeline/mercanete-roadshow-pipeline-view").then(mod => mod.MercaneteRoadshowPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-blue-500" /></div>
})
const RetornoPedidosUlPipelineView = dynamic(() => import("@/components/pipeline/retorno-pedidos-ul-pipeline-view").then(mod => mod.RetornoPedidosUlPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-amber-600" /></div>
})
const RetornoPedidosPipelineView = dynamic(() => import("@/components/pipeline/retorno-pedidos-pipeline-view").then(mod => mod.RetornoPedidosPipelineView), {
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-slate-600" /></div>
})

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const validIds = [
    'vfleet', 'performaxxi', 'ponto', 'cco', 'coordenadores', 
    'faturista', 'roadshow', 'devolucoes', 'consolidador',
    'mercanete-roadshow', 'retorno-pedidos-ul', 'retorno-pedidos'
  ];
  
  if (!validIds.includes(id)) {
    return notFound();
  }

  const titles: Record<string, string> = {
    vfleet: 'vFleet Pilot',
    performaxxi: 'Performaxxi Único',
    ponto: 'Ponto e Absenteísmo',
    cco: 'Consolidador CCO',
    coordenadores: 'Pipeline Coordenadores',
    faturista: 'Eficiência Faturista',
    roadshow: 'Ocupação Roadshow',
    devolucoes: 'Gestão de Devoluções',
    consolidador: 'Consolidador Final',
    'mercanete-roadshow': 'Mercanete x Roadshow',
    'retorno-pedidos-ul': 'Retorno Pedidos UL',
    'retorno-pedidos': 'Retorn. Pedidos TXT'
  };

  const descriptions: Record<string, string> = {
    vfleet: 'Remuneração variável por telemetria: Curva, Banguela, Ociosidade e Velocidade.',
    performaxxi: 'Performance operacional: Raio, SLA, Tempo e Sequenciamento de rotas.',
    ponto: 'Análise de jornada e incentivo de absenteísmo para motoristas e ajudantes.',
    cco: 'Consolidação de médias diárias por empresa com bonificação de R$ 16,00.',
    coordenadores: 'Unificação modular: Rotas (R$ 48) + Tempo Interno (R$ 12).',
    faturista: 'Meta de horários para Entrega de Cintas e Liberação para Roteirização.',
    roadshow: 'Ocupação de Jornada vs Ocupação de Veículo por região.',
    devolucoes: 'Cruzamento de Controle Logístico com Faturamento para análise de perdas.',
    consolidador: 'Relatório final consolidado para fechamento de folha e pagamentos.',
    'mercanete-roadshow': 'Sistema de matching com prioridade e propagação de status entre Mercanete e Roadshow.',
    'retorno-pedidos-ul': 'Extração e verificação de pedidos a partir de arquivos .ul.',
    'retorno-pedidos': 'Extração e verificação de pedidos a partir de arquivos de texto .txt.'
  };

  return (
    <PipelineLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            {titles[id]}
          </h2>
          <p className="text-muted-foreground">
            {descriptions[id]}
          </p>
        </div>
        
        <Suspense fallback={<div className="flex items-center justify-center p-12"><Loader2 className="size-8 animate-spin text-primary" /></div>}>
          {id === 'vfleet' && <VFleetPipelineView />}
          {id === 'performaxxi' && <PerformaxxiPipelineView />}
          {id === 'ponto' && <PontoPipelineView />}
          {id === 'cco' && <CcoPipelineView />}
          {id === 'coordenadores' && <CoordenadorPipelineView />}
          {id === 'faturista' && <FaturistaPipelineView />}
          {id === 'roadshow' && <RoadshowPipelineView />}
          {id === 'devolucoes' && <DevolucoesPipelineView />}
          {id === 'consolidador' && <ConsolidadorPipelineView />}
          {id === 'mercanete-roadshow' && <MercaneteRoadshowPipelineView />}
          {id === 'retorno-pedidos-ul' && <RetornoPedidosUlPipelineView />}
          {id === 'retorno-pedidos' && <RetornoPedidosPipelineView />}
        </Suspense>
      </div>
    </PipelineLayout>
  )
}
