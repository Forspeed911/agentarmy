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
    enabled: !!latestCase && !['report_ready', 'go', 'hold', 'reject', 'created', 'stopped', 'failed'].includes(latestCase.status),
    refetchInterval: 3000,
  })

  const navigate = useNavigate()

  const startMutation = useMutation({
    mutationFn: () => api.research.start(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: () => api.research.stop(id!, latestCase!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  const restartMutation = useMutation({
    mutationFn: () => api.research.restart(id!, latestCase!.id),
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
  const isRunning = latestCase && ['research_queued', 'research_in_progress', 'critic_review', 'scoring'].includes(latestCase.status)
  const canRestart = latestCase && ['stopped', 'failed', 'report_ready', 'go', 'hold', 'reject'].includes(latestCase.status)

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-300 mb-4 inline-block">&larr; Back</Link>

      {/* Header card */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
        <h1 className="text-xl font-bold text-white break-words">{project.name}</h1>
        {project.url && (
          <a href={project.url} target="_blank" rel="noreferrer" className="text-blue-400 text-sm break-all hover:text-blue-300">
            {project.url}
          </a>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded">{project.source}</span>
          {latestCase && <StatusBadge status={latestCase.decision || latestCase.status} />}
        </div>
        {project.notes && <p className="text-slate-400 text-sm mt-3">{project.notes}</p>}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {latestCase?.status === 'report_ready' && (
          <Link
            to={`/projects/${id}/report/${latestCase.id}`}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-3 rounded-lg text-center"
          >
            View Report
          </Link>
        )}
        {latestCase && ['go', 'hold', 'reject'].includes(latestCase.status) && (
          <Link
            to={`/projects/${id}/report/${latestCase.id}`}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-3 rounded-lg text-center"
          >
            View Report
          </Link>
        )}
        {!latestCase && (
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg disabled:opacity-50"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? 'Starting...' : 'Start Research'}
          </button>
        )}
        {isRunning && (
          <button
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-3 rounded-lg disabled:opacity-50"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
          >
            {stopMutation.isPending ? 'Stopping...' : 'Stop'}
          </button>
        )}
        {canRestart && (
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-3 rounded-lg disabled:opacity-50"
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
          >
            {restartMutation.isPending ? 'Restarting...' : 'Restart Research'}
          </button>
        )}
        <button
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium px-4 py-3 rounded-lg disabled:opacity-50"
          onClick={() => archiveMutation.mutate()}
          disabled={archiveMutation.isPending}
        >
          {archiveMutation.isPending ? '...' : 'Archive'}
        </button>
      </div>

      {startMutation.isError && (
        <p className="text-red-400 text-sm mb-4">{(startMutation.error as Error).message}</p>
      )}

      {/* Pipeline Progress */}
      {isRunning && status && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">Pipeline Progress</h2>
            <span className="text-xs text-slate-500">{status.progress}</span>
          </div>

          <div className="space-y-3">
            {Object.entries(status.sections).map(([type, sec]) => (
              <div key={type}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">{SECTION_LABELS[type] || type}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">iter {sec.iteration}</span>
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
                </div>
                <div className="bg-slate-900 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      sec.status === 'completed' ? 'bg-green-500' :
                      sec.status === 'in_progress' ? 'bg-blue-500 animate-pulse' :
                      'bg-slate-700'
                    }`}
                    style={{
                      width: sec.status === 'completed' ? '100%' :
                             sec.status === 'in_progress' ? '66%' :
                             sec.status === 'pending' ? '0%' : '33%'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs text-slate-500">
                {status.status === 'research_in_progress' ? 'Agents researching...' :
                 status.status === 'critic_review' ? 'Critic reviewing...' :
                 status.status === 'scoring' ? 'Computing scores...' :
                 status.status}
              </span>
            </div>
            {(status as any).cost && (
              <span className="text-xs text-slate-500">
                {(status as any).cost.totalTokens.toLocaleString()} tok · ${(status as any).cost.totalCostUsd.toFixed(4)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Completed — decision info */}
      {latestCase && ['go', 'hold', 'reject'].includes(latestCase.status) && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
          <p className="text-slate-300 mb-1">Decision: <StatusBadge status={latestCase.status} /></p>
        </div>
      )}
    </div>
  )
}
