import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ProjectPage from './pages/ProjectPage'
import ReportPage from './pages/ReportPage'
import LoginPage from './pages/LoginPage'
import ArchivePage from './pages/ArchivePage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function Logout() {
  localStorage.removeItem('token')
  return <Navigate to="/login" replace />
}

export default function App() {
  const token = localStorage.getItem('token')

  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="border-b border-slate-700 bg-slate-800/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.svg" alt="" className="w-8 h-8" />
              <span className="text-lg font-bold text-white tracking-tight">Army of Agents</span>
            </Link>
            <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded hidden sm:inline">MVP</span>
            {token && (
              <Link to="/archive" className="text-sm text-slate-400 hover:text-slate-300 ml-2">
                Archive
              </Link>
            )}
          </div>
          {token && (
            <Link to="/logout" className="text-xs text-slate-400 hover:text-slate-300">
              Logout
            </Link>
          )}
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/archive" element={<RequireAuth><ArchivePage /></RequireAuth>} />
          <Route path="/projects/:id" element={<RequireAuth><ProjectPage /></RequireAuth>} />
          <Route path="/projects/:id/report/:caseId" element={<RequireAuth><ReportPage /></RequireAuth>} />
        </Routes>
      </main>
    </div>
  )
}
