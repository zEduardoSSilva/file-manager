import { useOutletContext } from 'react-router-dom';

// Import all the pipeline view components
import { ConsolidacaoEntregasPipelineView } from '@/components/pipeline/entregas-pipeline-view';
import { CcoPipelineView } from '@/components/pipeline/cco-pipeline-view';
import { ConsolidadorPipelineView } from '@/components/pipeline/consolidador-pipeline-view';
import { CoordenadorPipelineView } from '@/components/pipeline/coordenador-pipeline-view';
import { DevolucoesPipelineView } from '@/components/pipeline/devolucoes-pipeline-view';
import { FaturistaPipelineView } from '@/components/pipeline/faturista-pipeline-view';
import { MercaneteRoadshowPipelineView } from '@/components/pipeline/mercanete-roadshow-pipeline-view';
import { PerformaxxiPipelineView } from '@/components/pipeline/performaxxi-pipeline-view';
import { PontoPipelineView } from '@/components/pipeline/ponto-pipeline-view';
import { RetornoPedidosPipelineView } from '@/components/pipeline/retorno-pedidos-pipeline-view';
import { RetornoPedidosUlPipelineView } from '@/components/pipeline/retorno-pedidos-ul-pipeline-view';
import { RoadshowPipelineView } from '@/components/pipeline/roadshow-pipeline-view';
import { VFleetPipelineView } from '@/components/pipeline/vfleet-pipeline-view';
import { FuncionariosPipelineView } from '@/components/pipeline/funcionarios-pipeline-view';
import { VeiculosPipelineView } from '@/components/pipeline/veiculos-pipeline-view';
import { IncentivoPipelineView } from '@/components/pipeline/incentivo-pipeline-view';
import { MotivosDevPipelineView } from '@/components/pipeline/motivos-dev-pipeline-view';

// Create a map to associate pipeline IDs with their components
const pipelineViewMap: { [key: string]: React.ComponentType } = {
  'consolidacao-entregas': ConsolidacaoEntregasPipelineView,
  'cco': CcoPipelineView,
  'consolidador': ConsolidadorPipelineView,
  'coordenadores': CoordenadorPipelineView,
  'devolucoes': DevolucoesPipelineView,
  'faturista': FaturistaPipelineView,
  'mercanete-roadshow': MercaneteRoadshowPipelineView,
  'performaxxi': PerformaxxiPipelineView,
  'ponto': PontoPipelineView,
  'retorno-pedidos': RetornoPedidosPipelineView,
  'retorno-pedidos-ul': RetornoPedidosUlPipelineView,
  'roadshow': RoadshowPipelineView,
  'vfleet': VFleetPipelineView,
  'funcionarios': FuncionariosPipelineView,
  'veiculos': VeiculosPipelineView,
  'incentivo': IncentivoPipelineView,
  'motivos-dev': MotivosDevPipelineView,
};

interface PipelineContext {
  pipelineId: string;
}

export default function IndexPage() {
  const { pipelineId } = useOutletContext<PipelineContext>();

  // Find the component that corresponds to the pipelineId
  const PipelineViewComponent = pipelineId ? pipelineViewMap[pipelineId] : null;

  if (!PipelineViewComponent) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Pipeline não encontrado</h1>
        <p>O pipeline com o ID '{pipelineId}' não foi encontrado.</p>
      </div>
    );
  }

  return <PipelineViewComponent />;
}
