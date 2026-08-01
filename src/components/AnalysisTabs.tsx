import { useState } from 'react'
import type { Move } from '../lib/convert'
import type { GameAnalysis } from '../lib/engine/analysis'
import type { ChartRow } from '../lib/gameModel'
import ClassificationTable from './ClassificationTable'
import ClockChart from './ClockChart'
import EvalChart from './EvalChart'
import PhaseAccuracyTable from './PhaseAccuracyTable'

type Tab = 'evaluation' | 'phases' | 'classification' | 'times'

interface AnalysisTabsProps {
  analysis: GameAnalysis | null
  progress: { done: number; total: number } | null
  analysisError: string | null
  moves: Move[]
  ply: number
  onPlyChange: (ply: number) => void
  chartRows: ChartRow[]
  startSeconds: number | null
  whiteName: string
  blackName: string
  whiteElo: string | null
  blackElo: string | null
  playedLikeTooltip: string
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'phases', label: 'Phase Accuracy' },
  { id: 'classification', label: 'Move Classification' },
  { id: 'times', label: 'Move Times' },
]

/** Short placeholder; the banner above the board carries the live progress. */
function AnalysisPending({
  progress,
  error,
}: {
  progress: { done: number; total: number } | null
  error: string | null
}) {
  return (
    <p className="px-6 py-10 text-center text-sm text-ink-mute">
      {error
        ? `Engine review unavailable: ${error}`
        : progress && progress.total > 0
          ? `Waiting for the engine review — ${progress.done} of ${progress.total} positions done.`
          : 'Waiting for the engine review to start…'}
    </p>
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
  whiteElo,
  blackElo,
  playedLikeTooltip,
}: AnalysisTabsProps) {
  const [tab, setTab] = useState<Tab>('evaluation')

  return (
    <section
      aria-label="Game analysis"
      className="flex h-full min-h-0 flex-col rounded-xl border border-rule bg-card shadow-sm"
    >
      <div
        role="tablist"
        aria-label="Analysis views"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-rule px-3 pt-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-felt-bright text-ink'
                : 'border-transparent text-ink-mute hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {tab === 'evaluation' &&
          (analysis ? (
            <EvalChart analysis={analysis} moves={moves} ply={ply} onPlyChange={onPlyChange} />
          ) : (
            <AnalysisPending progress={progress} error={analysisError} />
          ))}
        {tab === 'phases' &&
          (analysis ? (
            <PhaseAccuracyTable
              analysis={analysis}
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
              whiteElo={whiteElo}
              blackElo={blackElo}
              playedLikeTooltip={playedLikeTooltip}
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
