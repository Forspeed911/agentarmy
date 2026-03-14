import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type SectionReport } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ScoreBadge from '../components/ScoreBadge'

const SECTION_LABELS: Record<string, string> = {
  market: 'Market Analysis',
  competitor: 'Competitors',
  signals: 'Demand Signals',
  tech: 'Tech Feasibility',
  risk: 'Risk Assessment',
}

const SCORE_LABELS: Record<string, string> = {
  market_need: 'Market Need',
  competition: 'Competition',
  demand_signals: 'Demand Signals',
  tech_feasibility: 'Tech Feasibility',
  risk: 'Risk',
  differentiation: 'Differentiation',
  monetization: 'Monetization',
}

function SectionCard({ section }: { section: SectionReport }) {
  const [expanded, setExpanded] = useState(false)
  const content = section.content as Record<string, unknown>

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-750 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-white text-sm">
            {SECTION_LABELS[section.sectionType] || section.sectionType}
          </span>
          <span className="text-xs text-slate-500">iter {section.iteration}</span>
        </div>
        <div className="flex items-center gap-2">
          {section.critic && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              section.critic.verdict === 'pass' ? 'text-green-400 bg-green-900/30' :
              section.critic.verdict === 'fail' ? 'text-red-400 bg-red-900/30' :
              'text-yellow-400 bg-yellow-900/30'
            }`}>
              {section.critic.verdict}
            </span>
          )}
          <span className="text-slate-500 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700">
          {/* Critic scores */}
          {section.critic && (
            <div className="flex gap-4 py-2 text-xs text-slate-400 border-b border-slate-700/50 mb-3">
              <span>Evidence: <b className="text-slate-300">{section.critic.evidenceQuality}/5</b></span>
              <span>Logic: <b className="text-slate-300">{section.critic.logicQuality}/5</b></span>
              <span>Completeness: <b className="text-slate-300">{section.critic.completeness}/5</b></span>
            </div>
          )}

          {/* Content */}
          {content.raw_text ? (() => {
            // Try to extract JSON from raw_text (LLM sometimes wraps JSON in text)
            try {
              const raw = String(content.raw_text);
              const firstBrace = raw.indexOf('{');
              const lastBrace = raw.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace > firstBrace) {
                const parsed = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
                if (parsed.findings) {
                  return (
                    <div className="space-y-3">
                      {parsed.summary && <p className="text-sm text-slate-400 mb-3">{parsed.summary}</p>}
                      {(parsed.findings as Array<Record<string, unknown>>).map((finding: Record<string, unknown>, i: number) => (
                        <div key={i} className="text-sm">
                          <p className="text-slate-300">{String(finding.claim || finding.insight || finding.finding || '')}</p>
                          {Boolean(finding.source_url) && (
                            <a href={String(finding.source_url)} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">{String(finding.source_url)}</a>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
              }
            } catch {}
            return <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{String(content.raw_text)}</pre>;
          })() : content.findings ? (
            <div className="space-y-3">
              {(content.findings as Array<Record<string, unknown>>).map((finding, i) => (
                <div key={i} className="text-sm">
                  <p className="text-slate-300"> {String(finding.claim || finding.insight || finding.finding || '')}</p>
                  {Boolean(finding.source_url) && (
                    <a
                      href={String(finding.source_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {String(finding.source_url)}
                    </a>
                  )}
                </div>
              ))}
              {Boolean(content.summary) && (
                <p className="text-sm text-slate-400 pt-2 border-t border-slate-700/50">{String(content.summary)}</p>
              )}
            </div>
          ) : (
            <pre className="text-xs text-slate-400 whitespace-pre-wrap">{JSON.stringify(content, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}

function DecisionPanel({ projectId, caseId, currentStatus }: { projectId: string; caseId: string; currentStatus: string }) {
  const qc = useQueryClient()
  const [comment, setComment] = useState('')

  const mutation = useMutation({
    mutationFn: ({ decision }: { decision: string }) =>
      api.research.decide(projectId, caseId, decision, comment || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report'] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })

  if (['go', 'hold', 'reject'].includes(currentStatus)) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
        <p className="text-slate-300">Decision: <StatusBadge status={currentStatus} /></p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">Make Decision</h3>
      <textarea
        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none resize-none mb-3"
        rows={2}
        placeholder="Comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
          onClick={() => mutation.mutate({ decision: 'go' })}
          disabled={mutation.isPending}
        >
          GO — Clone it
        </button>
        <button
          className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
          onClick={() => mutation.mutate({ decision: 'hold' })}
          disabled={mutation.isPending}
        >
          HOLD — Watch
        </button>
        <button
          className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
          onClick={() => mutation.mutate({ decision: 'reject' })}
          disabled={mutation.isPending}
        >
          REJECT — Skip
        </button>
      </div>
      {mutation.isError && <p className="text-red-400 text-xs mt-2">{(mutation.error as Error).message}</p>}
    </div>
  )
}

export default function ReportPage() {
  const { id, caseId } = useParams<{ id: string; caseId: string }>()

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['report', id, caseId],
    queryFn: () => api.research.report(id!, caseId!),
    enabled: !!id && !!caseId,
  })

  if (isLoading) return <p className="text-slate-400">Loading report...</p>
  if (error) return <p className="text-red-400">{(error as Error).message}</p>
  if (!report) return null

  const scoring = report.scoring

  return (
    <div>
      <Link to={`/projects/${id}`} className="text-sm text-slate-400 hover:text-slate-300 mb-4 inline-block">
        &larr; Back to {report.project.name}
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{report.project.name}</h1>
          <p className="text-slate-400 text-sm mt-1">Research Report</p>
        </div>
        <StatusBadge status={report.status} />
      </div>

      {/* Scoring Summary */}
      {scoring && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Score</h2>
            <div className="flex items-center gap-2">
              <ScoreBadge score={scoring.totalScore} />
              <span className="text-xs text-slate-500">/ 5.00</span>
              <StatusBadge status={scoring.recommendation} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {Object.entries(scoring.scores).map(([key, val]) => (
              <div key={key} className="text-center">
                <p className="text-xs text-slate-500">{SCORE_LABELS[key] || key}</p>
                <p className="text-lg font-bold text-slate-200">{Number(val).toFixed(1)}</p>
              </div>
            ))}
          </div>

          {scoring.reasoning && (
            <p className="text-sm text-slate-400 border-t border-slate-700 pt-3">{scoring.reasoning}</p>
          )}

          <div className="flex gap-6 mt-3 text-xs">
            {scoring.strongSections.length > 0 && (
              <span className="text-green-400">Strong: {scoring.strongSections.join(', ')}</span>
            )}
            {scoring.weakSections.length > 0 && (
              <span className="text-red-400">Weak: {scoring.weakSections.join(', ')}</span>
            )}
          </div>
        </div>
      )}

      {/* Research Sections */}
      <div className="space-y-2 mb-6">
        <h2 className="text-sm font-semibold text-slate-400 mb-2">Research Sections</h2>
        {report.sections.map((section) => (
          <SectionCard key={section.sectionType} section={section} />
        ))}
      </div>

      {/* Decision */}
      <DecisionPanel projectId={id!} caseId={caseId!} currentStatus={report.status} />
    </div>
  )
}
