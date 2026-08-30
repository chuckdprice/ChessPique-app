import { useEffect, useRef, useState } from 'react'
import type { ExplorerSettings } from '../lib/settings'
import ExplorerSettingsPanel from './ExplorerSettings'
import type { Move } from '../lib/convert'
import type { GameAnalysis } from '../lib/engine/analysis'
import type { ChartRow } from '../lib/gameModel'
import type { MoveNode } from '../lib/moveTree'
import type { Opening } from '../lib/openings'
import ClassificationTable from './ClassificationTable'
import ClockChart from './ClockChart'
import CommentEditor from './CommentEditor'
import EvalChart from './EvalChart'
import OpeningExplorer from './OpeningExplorer'
import PhaseAccuracyTable from './PhaseAccuracyTable'

type Tab = 'evaluation' | 'phases' | 'classification' | 'times' | 'comments' | 'explorer'

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
  /** The position on the board, for the opening explorer. */
  fen: string
  /** Play a move from the explorer into the game, by SAN. */
  onPlayMove: (san: string) => boolean
  /** A move the reader is pointing at in the explorer, for the board. */
  onHoverMove: (move: { from: string; to: string } | null) => void
  /** The opening explorer's database and filters. */
  explorerSettings: ExplorerSettings
  onExplorerSettingsChange: (next: ExplorerSettings) => void
}

interface TabDef {
  id: Tab
  label: string
  icon: React.ReactNode
}

/**
 * Tabs are icons with their name on hover.
 *
 * Five labels ran wider than the pane on anything but a desktop, so the strip
 * scrolled and a tab could sit off-screen unseen. Icons fit at any width; the
 * name is one hover, and always the accessible name.
 */
const TABS: TabDef[] = [
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
  {
    id: 'explorer',
    label: 'Opening Explorer',
    // An open book.
    icon: (
      <>
        <path d="M12 6.5v13" />
        <path d="M12 6.5C10.5 5 8.3 4.5 5 4.5v13c3.3 0 5.5.5 7 2 1.5-1.5 3.7-2 7-2v-13c-3.3 0-5.5.5-7 2Z" />
      </>
    ),
  },
]

/**
 * The six views in two panes, each with its own strip and its own selection.
 *
 * Split rather than one strip of five because the pairs answer different
 * questions and are read together: the eval chart against the classification
 * counts, or the eval chart with the comment box open to write up what it
 * shows. One strip could only ever answer one of them at a time.
 *
 * The two charts share the left pane because both are wide, plotted against
 * the move number, and click to navigate; the three summaries share the right
 * because all three are tables of text that read at their natural width. The
 * opening explorer joins the charts: like them it is about the position the
 * board is on rather than about the game as a whole, and it is the widest
 * thing here.
 */
const TAB_GROUPS: Array<{ side: string; label: string; tabs: TabDef[] }> = [
  {
    side: 'left',
    label: 'Charts',
    tabs: TABS.filter(
      (t) => t.id === 'evaluation' || t.id === 'times' || t.id === 'explorer',
    ),
  },
  {
    side: 'right',
    label: 'Summaries',
    tabs: TABS.filter((t) => t.id === 'phases' || t.id === 'classification' || t.id === 'comments'),
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

/**
 * One pane: a strip of icon tabs over whatever the chosen one renders.
 *
 * The scroll hints stay even though no strip here holds more than three tabs —
 * they cost nothing when there is nothing to scroll to, and the strip still
 * overflows on a narrow phone once the two panes stack.
 */
function TabPane({
  tabs,
  label,
  tab,
  onTab,
  action,
  children,
}: {
  tabs: TabDef[]
  label: string
  tab: Tab
  onTab: (tab: Tab) => void
  /** Sits at the right of the strip, where the engine panel's gear sits. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
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
    // min-w-0 on both: two panes side by side in a flex row default to their
    // content's width, and the eval chart is wide enough to push the other one
    // off the panel.
    <section
      aria-label={label}
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-rule bg-card shadow-sm"
    >
      {/* Carries the header's colour so the strip reads as chrome, not content. */}
      <div className="relative shrink-0 rounded-t-xl bg-felt">
        <div
          ref={stripRef}
          role="tablist"
          aria-label={label}
          className={`flex gap-1 overflow-x-auto pl-7 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            action ? 'pr-10' : 'pr-7'
          }`}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              // Both, deliberately: the title is the hover tooltip, the
              // aria-label is what the tab is called to anyone not seeing it.
              title={t.label}
              aria-label={t.label}
              onClick={() => onTab(t.id)}
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

        {/* Outside the scrolling strip, so it keeps its corner however many
            tabs there are and however narrow the pane gets. */}
        {action && <div className="absolute right-1 top-1.5">{action}</div>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">{children}</div>
    </section>
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
  fen,
  onPlayMove,
  onHoverMove,
  explorerSettings,
  onExplorerSettingsChange,
}: AnalysisTabsProps) {
  const gearRef = useRef<HTMLButtonElement>(null)
  const [explorerGearOpen, setExplorerGearOpen] = useState(false)
  const [pickingPlayer, setPickingPlayer] = useState(false)
  // One selection per pane. They start on the two views that answer the first
  // question anyone asks of a finished game — how it went, and how well.
  const [leftTab, setLeftTab] = useState<Tab>('evaluation')
  const [rightTab, setRightTab] = useState<Tab>('classification')

  const pending = (
    <AnalysisPending progress={progress} error={analysisError} empty={moves.length === 0} />
  )

  const view = (tab: Tab) => {
    switch (tab) {
      case 'evaluation':
        return analysis ? (
          <EvalChart
            analysis={analysis}
            moves={moves}
            ply={ply}
            onPlyChange={onPlyChange}
            opening={opening}
          />
        ) : (
          pending
        )
      case 'phases':
        return analysis ? (
          <PhaseAccuracyTable analysis={analysis} whiteName={whiteName} blackName={blackName} />
        ) : (
          pending
        )
      case 'classification':
        return analysis ? (
          <ClassificationTable
            analysis={analysis}
            whiteName={whiteName}
            blackName={blackName}
            whiteElo={whiteElo}
            blackElo={blackElo}
            playedLikeTooltip={playedLikeTooltip}
          />
        ) : (
          pending
        )
      case 'comments':
        return <CommentEditor node={commentNode} onCommentChange={onCommentChange} />
      case 'explorer':
        // No `analysis` gate: the explorer is about the position, not about
        // the review, and it works on an empty board before any search runs.
        return (
          <OpeningExplorer
            fen={fen}
            onPlayMove={onPlayMove}
            settings={explorerSettings}
            onSettingsChange={onExplorerSettingsChange}
            picking={pickingPlayer}
            onPickingChange={setPickingPlayer}
            onHoverMove={onHoverMove}
          />
        )
      case 'times':
        return (
          <ClockChart
            rows={chartRows}
            ply={ply}
            startSeconds={startSeconds}
            whiteName={whiteName}
            blackName={blackName}
            onPlyChange={onPlyChange}
            embedded
          />
        )
    }
  }

  const [left, right] = TAB_GROUPS

  // Only on the tab it belongs to. A gear that is always there would be
  // offering the opening explorer's filters while you are reading the eval
  // chart, which is the kind of control people click once and never again.
  const explorerGear = leftTab === 'explorer' && (
    <>
      <button
        ref={gearRef}
        type="button"
        onClick={() => setExplorerGearOpen((o) => !o)}
        aria-expanded={explorerGearOpen}
        aria-label="Opening explorer settings"
        title="Opening explorer settings"
        className="rounded-md p-0.5 text-buff/70 transition-colors hover:bg-felt-deep hover:text-buff"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
        </svg>
      </button>
      {explorerGearOpen && (
        <ExplorerSettingsPanel
          anchor={gearRef}
          value={explorerSettings}
          onChange={onExplorerSettingsChange}
          onClose={() => setExplorerGearOpen(false)}
          // The picker belongs to the explorer panel, so the gear closes and
          // hands over rather than stacking a dialog on top of a popover.
          onPickPlayer={() => {
            setExplorerGearOpen(false)
            setPickingPlayer(true)
          }}
        />
      )}
    </>
  )

  return (
    // Side by side only when the panel is wide enough for two — its own width,
    // not the viewport's, the same rule the engine pane's two columns follow.
    // Stacked below that, where two half-width charts would be unreadable.
    // The container and the query have to be on different elements: an element
    // cannot query itself, and with both on the row it stayed stacked at every
    // width.
    <div className="@container/panels h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col gap-2 @[44rem]/panels:flex-row">
        <TabPane
          tabs={left.tabs}
          label={left.label}
          tab={leftTab}
          onTab={setLeftTab}
          action={explorerGear || undefined}
        >
          {view(leftTab)}
        </TabPane>
        <TabPane tabs={right.tabs} label={right.label} tab={rightTab} onTab={setRightTab}>
          {view(rightTab)}
        </TabPane>
      </div>
    </div>
  )
}
