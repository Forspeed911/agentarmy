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

/** Extract a flat findings array from any LLM content shape */
function extractFindings(obj: Record<string, unknown>): Array<Record<string, unknown>> | null {
  // Direct findings array
  if (Array.isArray(obj.findings)) return obj.findings
  // Some LLMs nest items/results/risks as the main array
  for (const key of ['items', 'results', 'risks', 'analysis', 'data']) {
    if (Array.isArray(obj[key])) return obj[key] as Array<Record<string, unknown>>
  }
  // Look for the first array value in the object
  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      return val as Array<Record<string, unknown>>
    }
  }
  return null
}

/** Try to parse a JSON object from raw text */
function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const firstBrace = raw.indexOf('{')
    const lastBrace = raw.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(raw.substring(firstBrace, lastBrace + 1))
    }
  } catch {}
  return null
}

/** Get the display text from a finding object (tries common key names) */
function findingText(f: Record<string, unknown>): string {
  for (const key of ['claim', 'insight', 'finding', 'description', 'risk', 'title', 'name', 'text', 'summary']) {
    if (f[key] && typeof f[key] === 'string') return f[key] as string
  }
  // If the finding has nested sub-fields but no obvious text key, join string values
  const strings = Object.entries(f)
    .filter(([k, v]) => typeof v === 'string' && k !== 'source_url' && k !== 'url' && k !== 'confidence')
    .map(([, v]) => v as string)
  return strings.join(' — ') || JSON.stringify(f)
}

function findingUrl(f: Record<string, unknown>): string | null {
  const url = f.source_url || f.url || f.link || f.source
  return typeof url === 'string' && url.startsWith('http') ? url : null
}

function findingMeta(f: Record<string, unknown>): string | null {
  const parts: string[] = []
  if (f.confidence) parts.push(`confidence: ${f.confidence}`)
  if (f.severity) parts.push(`severity: ${f.severity}`)
  if (f.level) parts.push(`level: ${f.level}`)
  if (f.likelihood) parts.push(`likelihood: ${f.likelihood}`)
  if (f.impact) parts.push(`impact: ${f.impact}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function FindingsList({ findings, summary }: { findings: Array<Record<string, unknown>>; summary?: string }) {
  return (
    <div className="space-y-3">
      {summary && <p className="text-sm text-slate-400 mb-3">{summary}</p>}
      {findings.map((f, i) => {
        const url = findingUrl(f)
        const meta = findingMeta(f)
        return (
          <div key={i} className="text-sm">
            <p className="text-slate-300">{findingText(f)}</p>
            {meta && <p className="text-xs text-slate-500 mt-0.5">{meta}</p>}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">{url}</a>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Render any content object as readable blocks (last resort, better than JSON.stringify) */
function ContentFallback({ content }: { content: Record<string, unknown> }) {
  const entries = Object.entries(content).filter(([, v]) => v != null && v !== '')
  return (
    <div className="space-y-3">
      {entries.map(([key, val]) => (
        <div key={key}>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{key.replace(/_/g, ' ')}</p>
          {typeof val === 'string' ? (
            <p className="text-sm text-slate-300">{val}</p>
          ) : Array.isArray(val) ? (
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
              {val.map((item, i) => (
                <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
              ))}
            </ul>
          ) : typeof val === 'object' ? (
            <pre className="text-xs text-slate-400 whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>
          ) : (
            <p className="text-sm text-slate-300">{String(val)}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function SectionContent({ content }: { content: Record<string, unknown> }) {
  // 1. If raw_text — try to parse JSON from it, then render
  if (content.raw_text) {
    const parsed = tryParseJson(String(content.raw_text))
    if (parsed) {
      const findings = extractFindings(parsed)
      if (findings) {
        return <FindingsList findings={findings} summary={parsed.summary as string | undefined} />
      }
      return <ContentFallback content={parsed} />
    }
    return <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{String(content.raw_text)}</pre>
  }

  // 2. Try to extract findings from content directly
  const findings = extractFindings(content)
  if (findings) {
    return <FindingsList findings={findings} summary={content.summary as string | undefined} />
  }

  // 3. Render as readable key-value blocks (no more JSON.stringify)
  return <ContentFallback content={content} />
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
          {section.critic && (
            <div className="flex gap-4 py-2 text-xs text-slate-400 border-b border-slate-700/50 mb-3">
              <span>Evidence: <b className="text-slate-300">{section.critic.evidenceQuality}/5</b></span>
              <span>Logic: <b className="text-slate-300">{section.critic.logicQuality}/5</b></span>
              <span>Completeness: <b className="text-slate-300">{section.critic.completeness}/5</b></span>
            </div>
          )}
          <SectionContent content={content} />
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
