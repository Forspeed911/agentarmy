import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { archiveApi, type Project } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ScoreBadge from '../components/ScoreBadge'

export default function ArchivePage() {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects-archived'],
    queryFn: archiveApi.listArchived,
  })

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => archiveApi.unarchive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects-archived'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Archive</h1>
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-300">&larr; Back</Link>
      </div>

      {isLoading && <p className="text-slate-400">Loading...</p>}
      {error && <p className="text-red-400">{(error as Error).message}</p>}

      {data && data.items.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg mb-2">Archive is empty</p>
          <p className="text-sm">Archived projects will appear here</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.items.map((p: Project) => {
              const latestCase = p.cases?.[0]
              return (
                <div
                  key={p.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Link to={`/projects/${p.id}`} className="text-blue-400 font-medium text-sm truncate hover:text-blue-300">
                      {p.name}
                    </Link>
                    <ScoreBadge score={latestCase?.scoring?.totalScore} />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      {latestCase ? (
                        <StatusBadge status={latestCase.decision || latestCase.status} />
                      ) : (
                        <span className="text-slate-600 text-xs">No research</span>
                      )}
                      <span className="text-slate-600 text-xs">{p.source}</span>
                    </div>
                    <button
                      className="text-xs text-blue-400 hover:text-blue-300 bg-slate-700 px-2 py-1 rounded"
                      onClick={() => unarchiveMutation.mutate(p.id)}
                      disabled={unarchiveMutation.isPending}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-600 mt-3">{data.total} total</p>
        </div>
      )}
    </div>
  )
}
