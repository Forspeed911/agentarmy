export default function ScoreBadge({ score }: { score: number | undefined }) {
  if (score == null) return <span className="text-slate-500">—</span>

  const color =
    score >= 4.0 ? 'text-green-400' :
    score >= 3.0 ? 'text-yellow-400' :
    'text-red-400'

  return <span className={`font-bold ${color}`}>{score.toFixed(2)}</span>
}
