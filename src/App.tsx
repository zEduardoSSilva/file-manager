import { Routes, Route } from 'react-router-dom'
import { PipelineLayout } from '@/components/pipeline/pipeline-layout'
import DashboardPage from '@/pages/DashboardPage'
import PipelinePage from '@/pages/PipelinePage'

export default function App() {
  return (
    <Routes>
      <Route element={<PipelineLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pipeline/:pipelineId" element={<PipelinePage />} />
      </Route>
    </Routes>
  )
}
