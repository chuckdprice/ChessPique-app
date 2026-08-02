import { useEffect, useRef, useState } from 'react'
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

/** Chevron over a fade, marking a direction the tab strip can still scroll. */
function ScrollHint({ side, show }: { side: 'left' | 'right'; show: boolean }) {
  if (!show) return null
  const left = side === 'left'
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 flex w-7 items-center text-buff ${
        left
          ? 'left-0 justify-start bg-gradient-to-r from-felt via-felt to-transparent pl-0.5'
          : 'right-0 justify-end bg-gradient-to-l from-felt via-felt to-transparent pr-0.5'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={left ? 'M15 18 9 12l6-6' : 'm9 18 6-6-6-6'} />
      </svg>
    </span>
  )
}

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
  const stripRef = useRef<HTMLDivElement>(null)
  const [hint, setHint] = useState({ left: false, right: false })

  // Which way the strip can still scroll. Watched rather than measured once:
  // it changes with the viewport, and on a phone the strip overflows while on
  // a desktop it does not.
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return

    const update = () => {
      const remaining = strip.scrollWidth - strip.clientWidth - strip.scrollLeft
      setHint({ left: strip.scrollLeft > 1, right: remaining > 1 })
    }

    update()
    strip.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    // The buttons are observed as well as the strip. Watching the strip alone
    // misses the case that matters at first paint: its own box does not change
    // while the labels inside it reflow as the font loads, so the overflow
    // appears without anything firing and the hints never show.
    const observer = new ResizeObserver(update)
    observer.observe(strip)
    for (const button of strip.children) observer.observe(button)

    // Belt and braces for the same first-paint problem.
    document.fonts?.ready.then(update).catch(() => {})

    return () => {
      strip.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [])

  return (
    <section
      aria-label="Game analysis"
      className="flex h-full min-h-0 flex-col rounded-xl border border-rule bg-card shadow-sm"
    >
      {/* Carries the header's colour so the strip reads as chrome, not content. */}
      <div className="relative shrink-0 rounded-t-xl bg-felt">
        <div
          ref={stripRef}
          role="tablist"
          aria-label="Analysis views"
          className="flex gap-1 overflow-x-auto px-7 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  ? 'border-buff text-buff'
                  : 'border-transparent text-buff/60 hover:text-buff'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/*
          Only shown on the side there is actually more to see, so they say
          "there is more that way" rather than decorating both ends always.
          Not focusable: the strip itself scrolls by swipe, wheel or keyboard.
        */}
        <ScrollHint side="left" show={hint.left} />
        <ScrollHint side="right" show={hint.right} />
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
