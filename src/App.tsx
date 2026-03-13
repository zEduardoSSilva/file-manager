import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PipelineLayout } from '@/pages/Layout'
import HomePage from '@/pages/HomePage'
import IndexPage from '@/pages/Index'
import { VisaoAnaliticaPage } from '@/components/pipeline/entregas-analitica'
import { VisaoAcumuladaPage } from '@/components/pipeline/entregas-acumulada'
import { VeiculosPipelineView } from '@/components/pipeline/veiculos-pipeline-view'
import { FuncionariosPipelineView } from '@/components/pipeline/funcionarios-pipeline-view'
import { FaturamentoPipelineView } from '@/components/pipeline/faturamento-pipeline-view'
import { MotivosDevPipelineView } from '@/components/pipeline/motivos-dev-pipeline-view'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<PipelineLayout />}>
          {/* Rota principal para o Dashboard */}
          <Route path="/" element={<HomePage />} />

          {/* Redireciona /pipeline para a página inicial para evitar erros */}
          <Route path="/pipeline" element={<Navigate to="/" />} />

          {/* Rotas de cadastros */}
          <Route path="/pipeline/veiculos" element={<VeiculosPipelineView />} />
          <Route path="/pipeline/funcionarios" element={<FuncionariosPipelineView />} />
          <Route path="/pipeline/faturamento" element={<FaturamentoPipelineView />} />
          <Route path="/pipeline/motivos-dev" element={<MotivosDevPipelineView />} />

          {/* Rotas de visualização */}
          <Route path="/visuais/entregas-analitica" element={<VisaoAnaliticaPage />} />
          <Route path="/visuais/entregas-acumulada" element={<VisaoAcumuladaPage  />} />

          {/* Rotas legadas */}
          <Route path="/pipeline/:pipelineId" element={<IndexPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
