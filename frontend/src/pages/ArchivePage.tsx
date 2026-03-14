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
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase border-b border-slate-700">
              <tr>
                <th className="py-3 px-3">Name</th>
                <th className="py-3 px-3">Source</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Score</th>
                <th className="py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.items.map((p: Project) => {
                const latestCase = p.cases?.[0]
                return (
                  <tr key={p.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-3">
                      <Link to={`/projects/${p.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{p.source}</td>
                    <td className="py-3 px-3">
                      {latestCase ? <StatusBadge status={latestCase.decision || latestCase.status} /> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-3 px-3">
                      <ScoreBadge score={latestCase?.scoring?.totalScore} />
                    </td>
                    <td className="py-3 px-3">
                      <button
                        className="text-xs text-blue-400 hover:text-blue-300"
                        onClick={() => unarchiveMutation.mutate(p.id)}
                        disabled={unarchiveMutation.isPending}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
