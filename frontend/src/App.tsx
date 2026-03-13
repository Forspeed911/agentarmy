import { Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ProjectPage from './pages/ProjectPage'
import ReportPage from './pages/ReportPage'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="border-b border-slate-700 bg-slate-800/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-white tracking-tight">
            Army of Agents
          </Link>
          <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">MVP</span>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/projects/:id/report/:caseId" element={<ReportPage />} />
        </Routes>
      </main>
    </div>
  )
}
