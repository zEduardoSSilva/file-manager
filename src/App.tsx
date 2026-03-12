import { Routes, Route } from 'react-router-dom'
import { PipelineLayout } from '@/pages/Layout'
import HomePage from '@/pages/HomePage'
import IndexPage from '@/pages/Index'

export default function App() {
  return (
    <Routes>
      <Route element={<PipelineLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/pipeline/:pipelineId" element={<IndexPage />} />
      </Route>
    </Routes>
  )
}
