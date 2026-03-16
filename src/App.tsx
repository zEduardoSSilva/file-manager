
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
import FirebaseUsage from '@/pages/FirebaseUsage'
import { LoginPage } from '@/pages/LoginPage' // Importe a página de login
import { AdminDashboardPage } from '@/pages/AdminDashboardPage' // Importe a página de admin
import { ProtectedRoute } from '@/components/ProtectedRoute' // Importe a rota protegida

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Rota de login pública */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rotas protegidas */}
        <Route element={<ProtectedRoute />}>
          <Route element={<PipelineLayout />}>
            {/* Rota principal para o Dashboard */}
            <Route path="/" element={<HomePage />} />

            {/* Rota para a página de Admin Dashboard */}
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />

            {/* Rota para a página de Uso de Recursos */}
            <Route path="/usage" element={<FirebaseUsage />} />

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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
