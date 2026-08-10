import { useEffect, useRef, useState } from 'react'
import type { Move } from '../lib/convert'
import type { GameAnalysis } from '../lib/engine/analysis'
import type { ChartRow } from '../lib/gameModel'
import type { MoveNode } from '../lib/moveTree'
import type { Opening } from '../lib/openings'
import ClassificationTable from './ClassificationTable'
import ClockChart from './ClockChart'
import CommentEditor from './CommentEditor'
import EvalChart from './EvalChart'
import PhaseAccuracyTable from './PhaseAccuracyTable'

type Tab = 'evaluation' | 'phases' | 'classification' | 'times' | 'comments'

interface AnalysisTabsProps {
  analysis: GameAnalysis | null
  progress: { done: number; total: number } | null
  analysisError: string | null
  moves: Move[]
  ply: number
  onPlyChange: (ply: number) => void
  chartRows: ChartRow[]
  startSeconds: number | null
  /** Named opening for the evaluation chart's caption; null while it loads. */
  opening: Opening | null
  whiteName: string
  blackName: string
  whiteElo: string | null
  blackElo: string | null
  playedLikeTooltip: string
  /** The move the comment tab edits — the board's own node. */
  commentNode: MoveNode
  onCommentChange: (nodeId: string, comment: string) => void
}

/**
 * Tabs are icons with their name on hover.
 *
 * Five labels ran wider than the pane on anything but a desktop, so the strip
 * scrolled and a tab could sit off-screen unseen. Icons fit at any width; the
 * name is one hover, and always the accessible name.
 */
const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  {
    id: 'evaluation',
    label: 'Evaluation',
    // Axes with a line climbing across them.
    icon: <path d="M4 4v15a1 1 0 0 0 1 1h15M7 15l4-5 3 3 5-7" />,
  },
  {
    id: 'phases',
    label: 'Phase Accuracy',
    // Bullseye.
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="0.6" fill="currentColor" />
      </>
    ),
  },
  {
    id: 'classification',
    label: 'Move Classification',
    // A tally: each line ticked off, which is what the tab counts.
    icon: (
      <>
        <path d="m3 6 2 2 3-3M3 13l2 2 3-3M3 20l2 2 3-3" />
        <path d="M12 6h9M12 14h9M12 21h9" />
      </>
    ),
  },
  {
    id: 'times',
    label: 'Move Times',
    // Clock.
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    id: 'comments',
    label: 'Comments',
    // Speech bubble.
    icon: <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12Z" />,
  },
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

/** Short placeholder; the ring in the engine pane carries the live progress. */
function AnalysisPending({
  progress,
  error,
  empty,
}: {
  progress: { done: number; total: number } | null
  error: string | null
  /** A game with no moves yet — there is nothing to wait for, only to play. */
  empty: boolean
}) {
  return (
    <p className="px-6 py-10 text-center text-sm text-ink-mute">
      {empty
        ? 'Play a move on the board to start the game.'
        : error
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
  commentNode,
  chartRows,
  startSeconds,
  opening,
  whiteName,
  blackName,
  whiteElo,
  blackElo,
  playedLikeTooltip,
  onCommentChange,
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
              // Both, deliberately: the title is the hover tooltip, the
              // aria-label is what the tab is called to anyone not seeing it.
              title={t.label}
              aria-label={t.label}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-t-lg border-b-2 px-4 py-1.5 transition-colors ${
                tab === t.id
                  ? 'border-buff text-buff'
                  : 'border-transparent text-buff/60 hover:text-buff'
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {t.icon}
              </svg>
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
            <EvalChart
              analysis={analysis}
              moves={moves}
              ply={ply}
              onPlyChange={onPlyChange}
              opening={opening}
            />
          ) : (
            <AnalysisPending
              progress={progress}
              error={analysisError}
              empty={moves.length === 0}
            />
          ))}
        {tab === 'phases' &&
          (analysis ? (
            <PhaseAccuracyTable
              analysis={analysis}
              whiteName={whiteName}
              blackName={blackName}
            />
          ) : (
            <AnalysisPending
              progress={progress}
              error={analysisError}
              empty={moves.length === 0}
            />
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
            <AnalysisPending
              progress={progress}
              error={analysisError}
              empty={moves.length === 0}
            />
          ))}
        {tab === 'comments' && (
          <CommentEditor node={commentNode} onCommentChange={onCommentChange} />
        )}
        {tab === 'times' && (
          <ClockChart
            rows={chartRows}
            startSeconds={startSeconds}
            whiteName={whiteName}
            blackName={blackName}
            onPlyChange={onPlyChange}
            embedded
          />
        )}
      </div>
    </section>
  )
}
