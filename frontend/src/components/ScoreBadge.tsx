export default function ScoreBadge({ score }: { score: number | string | undefined }) {
  if (score == null) return <span className="text-slate-500">—</span>

  const num = Number(score)
  const color =
    num >= 4.0 ? 'text-green-400' :
    num >= 3.0 ? 'text-yellow-400' :
    'text-red-400'

  return <span className={`font-bold ${color}`}>{num.toFixed(2)}</span>
}
