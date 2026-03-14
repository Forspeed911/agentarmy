import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, type Project } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ScoreBadge from '../components/ScoreBadge'

function AddProjectForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', url: '', source: 'trustmrr', notes: '' })

  const mutation = useMutation({
    mutationFn: () => api.projects.create({
      name: form.name,
      url: form.url || undefined,
      source: form.source,
      notes: form.notes || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); onClose() },
  })

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">Add Startup</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          placeholder="Name *"
          value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <input
          className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          placeholder="URL (optional)"
          value={form.url}
          onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))}
        />
        <select
          className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          value={form.source}
          onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))}
        >
          <option value="trustmrr">TrustMRR</option>
          <option value="manual">Manual</option>
          <option value="other">Other</option>
        </select>
        <input
          className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>
      <div className="flex gap-2 mt-3">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
          disabled={!form.name || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Adding...' : 'Add'}
        </button>
        <button className="text-slate-400 hover:text-white text-sm px-4 py-2" onClick={onClose}>Cancel</button>
      </div>
      {mutation.isError && <p className="text-red-400 text-xs mt-2">{(mutation.error as Error).message}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Startups</h1>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded"
          onClick={() => setShowForm(true)}
        >
          + Add
        </button>
      </div>

      {showForm && <AddProjectForm onClose={() => setShowForm(false)} />}

      {isLoading && <p className="text-slate-400">Loading...</p>}
      {error && <p className="text-red-400">{(error as Error).message}</p>}

      {data && data.items.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg mb-2">No startups yet</p>
          <p className="text-sm">Add your first startup to begin analysis</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.items.map((p: Project) => {
              const latestCase = p.cases?.[0]
              return (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="block bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-500 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-blue-400 font-medium text-sm truncate">{p.name}</h3>
                    <ScoreBadge score={latestCase?.scoring?.totalScore} />
                  </div>
                  {p.url && (
                    <p className="text-slate-500 text-xs truncate mb-2">{p.url}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      {latestCase ? (
                        <StatusBadge status={latestCase.decision || latestCase.status} />
                      ) : (
                        <span className="text-slate-600 text-xs">No research</span>
                      )}
                      <span className="text-slate-600 text-xs">{p.source}</span>
                    </div>
                    <span className="text-slate-600 text-xs">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
          <p className="text-xs text-slate-600 mt-3">{data.total} total</p>
        </div>
      )}
    </div>
  )
}
