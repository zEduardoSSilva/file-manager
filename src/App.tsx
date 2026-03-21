import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PipelineLayout } from '@/pages/Layout'
import HomePage from '@/pages/HomePage'
import IndexPage from '@/pages/Index'
import { VisaoAnaliticaPage } from '@/components/pipeline/entregas-analitica'
import { VisaoAcumuladaPage } from '@/components/pipeline/entregas-acumulada'
import  VisaoStatusPage  from '@/components/pipeline/status-pipeline-view'
import  VisaoComercialPage  from '@/components/pipeline/comercial-pipeline-view'
import { VeiculosPipelineView } from '@/components/pipeline/veiculos-pipeline-view'
import { FuncionariosPipelineView } from '@/components/pipeline/funcionarios-pipeline-view'
import { IncentivoMensalPipelineView } from '@/components/pipeline/incentivo-mensal-pipeline-view'
import { IncentivoVeraoPipelineView } from '@/components/pipeline/incentivo-verao-pipeline-view'
import { MotivosDevPipelineView } from '@/components/pipeline/motivos-dev-pipeline-view'
import FirebaseUsage from '@/pages/FirebaseUsage'
import { LoginPage } from '@/pages/LoginPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import UserManagementPage from '@/pages/UserManagementPage'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<PipelineLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/user-management" element={<UserManagementPage />} />
            <Route path="/usage" element={<FirebaseUsage />} />
            <Route path="/pipeline" element={<Navigate to="/" />} />

            {/* Rotas de cadastros e incentivos */}
            <Route path="/pipeline/veiculos" element={<VeiculosPipelineView />} />
            <Route path="/pipeline/funcionarios" element={<FuncionariosPipelineView />} />
            <Route path="/pipeline/incentivo-mensa" element={<IncentivoMensalPipelineView />} />
            <Route path="/pipeline/incentivo-verao" element={<IncentivoVeraoPipelineView />} />
            <Route path="/pipeline/motivos-dev" element={<MotivosDevPipelineView />} />

            {/* Rotas de visualização */}
            <Route path="/visuais/entregas-analitica" element={<VisaoAnaliticaPage />} />
            <Route path="/visuais/entregas-acumulada" element={<VisaoAcumuladaPage  />} />
            <Route path="/visuais/status" element={<VisaoStatusPage />} />
            <Route path="/visuais/visao-comercial" element={<VisaoComercialPage />} />

            <Route path="/pipeline/:pipelineId" element={<IndexPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
