const colors: Record<string, string> = {
  created: 'bg-slate-600 text-slate-200',
  research_queued: 'bg-yellow-600/20 text-yellow-400',
  research_in_progress: 'bg-blue-600/20 text-blue-400',
  critic_review: 'bg-purple-600/20 text-purple-400',
  scoring: 'bg-indigo-600/20 text-indigo-400',
  report_ready: 'bg-green-600/20 text-green-400',
  go: 'bg-green-600 text-white',
  hold: 'bg-yellow-600 text-white',
  reject: 'bg-red-600 text-white',
}

const labels: Record<string, string> = {
  created: 'New',
  research_queued: 'Queued',
  research_in_progress: 'Researching',
  critic_review: 'Critic Review',
  scoring: 'Scoring',
  report_ready: 'Report Ready',
  go: 'GO',
  hold: 'HOLD',
  reject: 'REJECT',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-slate-600 text-slate-300'}`}>
      {labels[status] || status}
    </span>
  )
}
