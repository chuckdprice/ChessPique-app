import { useRef, useState } from 'react'
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
import TabPane from './TabPane'
import type { TabDef } from './TabPane'

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


/**
 * Tabs are icons with their name on hover.
 *
 * Five labels ran wider than the pane on anything but a desktop, so the strip
 * scrolled and a tab could sit off-screen unseen. Icons fit at any width; the
 * name is one hover, and always the accessible name.
 */
const TABS: TabDef<Tab>[] = [
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
const TAB_GROUPS: Array<{ side: string; label: string; tabs: TabDef<Tab>[] }> = [
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
