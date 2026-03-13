import { Routes, Route, Navigate } from 'react-router-dom'
import { PipelineLayout } from '@/pages/Layout'
import HomePage from '@/pages/HomePage'
import IndexPage from '@/pages/Index'
import { VisaoAnaliticaPage } from '@/components/pipeline/entregas-analitica'
import { VisaoAcumuladaPage } from '@/components/pipeline/entregas-acumulada'
import { CadastrosGeraisView } from '@/components/pipeline/cadastros-gerais-view'

export default function App() {
  return (
    <Routes>
      <Route element={<PipelineLayout />}>
        {/* Rota principal para o Dashboard */}
        <Route path="/" element={<HomePage />} />

        {/* Redireciona /pipeline para a página inicial para evitar erros */}
        <Route path="/pipeline" element={<Navigate to="/" />} />

        {/* Rotas existentes com ID e para outras seções */}
        <Route path="/pipeline/:pipelineId" element={<IndexPage />} />
        <Route path="/visuais/entregas-analitica" element={<VisaoAnaliticaPage />} />
        <Route path="/visuais/entregas-acumulada" element={<VisaoAcumuladaPage  />} />
        <Route path="/cadastros" element={<CadastrosGeraisView />} />
      </Route>
    </Routes>
  )
}
