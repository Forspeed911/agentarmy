import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, archiveApi } from '../api/client'
import StatusBadge from '../components/StatusBadge'

const SECTION_LABELS: Record<string, string> = {
  market: 'Market Analysis',
  competitor: 'Competitors',
  signals: 'Demand Signals',
  tech: 'Tech Feasibility',
  risk: 'Risk Assessment',
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.projects.get(id!),
    enabled: !!id,
  })

  const latestCase = project?.cases?.[0]

  const statusQuery = useQuery({
    queryKey: ['research-status', id, latestCase?.id],
    queryFn: () => api.research.status(id!, latestCase!.id),
    enabled: !!latestCase && !['report_ready', 'go', 'hold', 'reject', 'created'].includes(latestCase.status),
    refetchInterval: 3000,
  })

  const navigate = useNavigate()

  const startMutation = useMutation({
    mutationFn: () => api.research.start(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: () => archiveApi.archive(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate('/')
    },
  })

  if (isLoading) return <p className="text-slate-400">Loading...</p>
  if (error) return <p className="text-red-400">{(error as Error).message}</p>
  if (!project) return null

  const status = statusQuery.data
  const isRunning = latestCase && !['report_ready', 'go', 'hold', 'reject'].includes(latestCase.status) && latestCase.status !== 'created'

  return (
    <div>
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-300 mb-4 inline-block">&larr; Back</Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          {project.url && <p className="text-slate-400 text-sm mt-1">{project.url}</p>}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{project.source}</span>
            {latestCase && <StatusBadge status={latestCase.decision || latestCase.status} />}
          </div>
          {project.notes && <p className="text-slate-400 text-sm mt-3">{project.notes}</p>}
        </div>

        <div className="flex gap-2">
          {latestCase?.status === 'report_ready' && (
            <Link
              to={`/projects/${id}/report/${latestCase.id}`}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded"
            >
              View Report
            </Link>
          )}
          {(!latestCase || ['report_ready', 'go', 'hold', 'reject'].includes(latestCase.status)) && (
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? 'Starting...' : latestCase ? 'Re-run Research' : 'Start Research'}
            </button>
          )}
          <button
            className="bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
          >
            {archiveMutation.isPending ? '...' : 'Archive'}
          </button>
        </div>
      </div>

      {startMutation.isError && (
        <p className="text-red-400 text-sm mb-4">{(startMutation.error as Error).message}</p>
      )}

      {/* Pipeline Progress */}
      {isRunning && status && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">Pipeline Progress</h2>
            <span className="text-xs text-slate-500">{status.progress}</span>
          </div>

          <div className="space-y-2">
            {Object.entries(status.sections).map(([type, sec]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-32">{SECTION_LABELS[type] || type}</span>
                <div className="flex-1 bg-slate-900 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      sec.status === 'completed' ? 'bg-green-500 w-full' :
                      sec.status === 'in_progress' ? 'bg-blue-500 w-2/3 animate-pulse' :
                      sec.status === 'pending' ? 'bg-slate-700 w-0' :
                      'bg-slate-600 w-1/3'
                    }`}
                    style={{
                      width: sec.status === 'completed' ? '100%' :
                             sec.status === 'in_progress' ? '66%' :
                             sec.status === 'pending' ? '0%' : '33%'
                    }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-16 text-right">iter {sec.iteration}</span>
                {sec.critic && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    sec.critic === 'pass' ? 'text-green-400 bg-green-900/30' :
                    sec.critic === 'fail' ? 'text-red-400 bg-red-900/30' :
                    'text-yellow-400 bg-yellow-900/30'
                  }`}>
                    {sec.critic}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-xs text-slate-500">
              {status.status === 'research_in_progress' ? 'Agents researching...' :
               status.status === 'critic_review' ? 'Critic reviewing...' :
               status.status === 'scoring' ? 'Computing scores...' :
               status.status}
            </span>
          </div>
        </div>
      )}

      {/* Completed — link to report */}
      {latestCase && ['go', 'hold', 'reject'].includes(latestCase.status) && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
          <p className="text-slate-300 mb-2">Decision made: <StatusBadge status={latestCase.status} /></p>
          <Link
            to={`/projects/${id}/report/${latestCase.id}`}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            View full report &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}
