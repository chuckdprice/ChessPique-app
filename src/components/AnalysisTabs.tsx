import { useState } from 'react'
import type { Move } from '../lib/convert'
import type { GameAnalysis } from '../lib/engine/analysis'
import type { ChartRow } from '../lib/gameModel'
import ClassificationTable from './ClassificationTable'
import ClockChart from './ClockChart'
import EvalChart from './EvalChart'

type Tab = 'evaluation' | 'classification' | 'times'

interface AnalysisTabsProps {
  analysis: GameAnalysis | null
  progress: { done: number; total: number } | null
  analysisError: string | null
  moves: Move[]
  ply: number
  onPlyChange: (ply: number) => void
  chartRows: ChartRow[]
  startSeconds: number
  whiteName: string
  blackName: string
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'classification', label: 'Move Classification' },
  { id: 'times', label: 'Move Times' },
]

function AnalysisPending({
  progress,
  error,
}: {
  progress: { done: number; total: number } | null
  error: string | null
}) {
  if (error) {
    return (
      <p className="px-6 py-8 text-center text-sm text-ink-mute">
        Engine analysis unavailable: {error}
      </p>
    )
  }
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0
  return (
    <div className="px-6 py-8 text-center" role="status">
      <p className="text-sm text-ink-mute">
        Analyzing game with Stockfish…{' '}
        {progress ? `${progress.done}/${progress.total} positions` : 'starting engine'}
      </p>
      <div className="mx-auto mt-3 h-1.5 w-64 overflow-hidden rounded-full bg-buff-soft">
        <div
          className="h-full rounded-full bg-felt transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function AnalysisTabs({
  analysis,
  progress,
  analysisError,
  moves,
  ply,
  onPlyChange,
  chartRows,
  startSeconds,
  whiteName,
  blackName,
}: AnalysisTabsProps) {
  const [tab, setTab] = useState<Tab>('evaluation')

  return (
    <section aria-label="Game analysis" className="rounded-xl border border-rule bg-card shadow-sm">
      <div role="tablist" aria-label="Analysis views" className="flex gap-1 border-b border-rule px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-felt-bright text-ink'
                : 'border-transparent text-ink-mute hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-4">
        {tab === 'evaluation' &&
          (analysis ? (
            <EvalChart
              analysis={analysis}
              moves={moves}
              ply={ply}
              onPlyChange={onPlyChange}
              whiteName={whiteName}
              blackName={blackName}
            />
          ) : (
            <AnalysisPending progress={progress} error={analysisError} />
          ))}
        {tab === 'classification' &&
          (analysis ? (
            <ClassificationTable
              analysis={analysis}
              whiteName={whiteName}
              blackName={blackName}
            />
          ) : (
            <AnalysisPending progress={progress} error={analysisError} />
          ))}
        {tab === 'times' && (
          <ClockChart
            rows={chartRows}
            startSeconds={startSeconds}
            whiteName={whiteName}
            blackName={blackName}
            embedded
          />
        )}
      </div>
    </section>
  )
}
