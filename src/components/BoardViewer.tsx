import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
import { formatClockTime } from '../lib/convert'
import type { Move } from '../lib/convert'
import { formatVariation, hasMoveMarker } from '../lib/engine/analysis'
import type { GameAnalysis } from '../lib/engine/analysis'
import { explorationFen } from '../lib/gameModel'
import type { CapturedKind, Exploration, ReplayedGame } from '../lib/gameModel'
import CapturedPieces from './CapturedPieces'
import ClassBadge from './ClassBadge'

export interface PlayerPlate {
  name: string
  /** Remaining clock, or null when the PGN has no clock times. */
  clock: number | null
  /** The pieces this player is up, pawns first. */
  captured: CapturedKind[]
  /** Their material lead in pawns, ready to print; null unless they lead. */
  lead: string | null
}

interface BoardViewerProps {
  replay: ReplayedGame
  ply: number
  orientation: 'white' | 'black'
  analysis: GameAnalysis | null
  arrows: Arrow[]
  /** The line being played out by hand, if any; it owns the board while set. */
  exploration: Exploration | null
  /** Play a move by hand. Returning false snaps the piece back. */
  onPieceMove: (from: string, to: string) => boolean
}

/** Top-right-corner position of a square as percentages, given orientation. */
function squareCorner(square: string, orientation: 'white' | 'black') {
  const file = square.charCodeAt(0) - 97 // a=0
  const rank = parseInt(square[1], 10) // 1..8
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 8 - rank : rank - 1
  return { left: (col + 1) * 12.5, top: row * 12.5 }
}

/**
 * Name on the left; the material this player is up and their clock on the right.
 *
 * The two are one right-aligned group, pieces first, so the pieces sit against
 * the clock — and against the board's edge when the game has no clocks to show.
 */
export function PlayerPlateRow({ plate, color }: { plate: PlayerPlate; color: 'w' | 'b' }) {
  return (
    <div className="flex h-full items-center gap-2">
      <span className="min-w-0 truncate text-sm font-medium">
        {plate.name}
        <span className="sr-only">{color === 'w' ? ' (White)' : ' (Black)'}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {/* The pieces are the opponent's: they were taken from them. */}
        <CapturedPieces
          pieces={plate.captured}
          color={color === 'w' ? 'b' : 'w'}
          lead={plate.lead}
        />
        {plate.clock != null && (
          <span
            className="shrink-0 rounded bg-buff-soft px-2 py-0.5 font-score text-sm font-semibold tabular-nums"
            aria-label={`${color === 'w' ? 'White' : 'Black'} clock`}
          >
            {formatClockTime(plate.clock)}
          </span>
        )}
      </span>
    </div>
  )
}

export default function BoardViewer({
  replay,
  ply,
  orientation,
  analysis,
  arrows,
  exploration,
  onPieceMove,
}: BoardViewerProps) {
  const highlight = exploration ? exploration.lastMoveSquares : replay.lastMoveSquares[ply]
  // The badge grades a move that was actually played, so it has nothing to say
  // about a position reached by hand.
  const moveAnalysis =
    !exploration && ply > 0 ? (analysis?.moves[ply - 1] ?? null) : null
  const showBadge = moveAnalysis != null && hasMoveMarker(moveAnalysis.classification)
  const badgeSquare = showBadge && highlight ? highlight[1] : null
  const badgePos = badgeSquare ? squareCorner(badgeSquare, orientation) : null

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (highlight) {
    for (const square of highlight) {
      squareStyles[square] = { backgroundColor: 'rgba(237, 189, 71, 0.5)' }
    }
  }

  return (
    <div className="relative size-(--board-size) overflow-hidden rounded-lg shadow-md">
      <Chessboard
        options={{
          position: exploration ? explorationFen(exploration) : replay.fens[ply],
          boardOrientation: orientation,
          allowDragging: true,
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare != null && onPieceMove(sourceSquare, targetSquare),
          allowDrawingArrows: false,
          animationDurationInMs: 150,
          squareStyles,
          arrows,
          // Keep the library's geometry defaults; only take over opacity so the
          // per-arrow rgba alpha is the single source of fade.
          arrowOptions: { ...defaultArrowOptions, opacity: 1, activeOpacity: 1 },
          lightSquareStyle: { backgroundColor: '#efe8d6' },
          darkSquareStyle: { backgroundColor: '#4e7d63' },
          darkSquareNotationStyle: { color: '#efe8d6' },
          lightSquareNotationStyle: { color: '#4e7d63' },
          boardStyle: { width: '100%', height: '100%' },
        }}
      />
      {moveAnalysis && badgePos && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${badgePos.left}%`,
            top: `${badgePos.top}%`,
            transform: 'translate(-70%, -30%)',
          }}
        >
          <ClassBadge classification={moveAnalysis.classification} size={20} />
        </div>
      )}
    </div>
  )
}

/**
 * The strip that appears while a line is being tried out by hand.
 *
 * Navigation stays where it is: pressing it leaves the line, which is a normal
 * way to finish with one. What this adds is the line so far, unplaying its last
 * move, and a way back that does not move the game on.
 */
export function ExploreBar({
  exploration,
  onTakeBack,
  onExit,
}: {
  exploration: Exploration
  onTakeBack: () => void
  onExit: () => void
}) {
  const button =
    'shrink-0 rounded-md border border-rule bg-card px-2.5 py-1.5 text-xs leading-none text-ink transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-30'
  const line = formatVariation(
    exploration.sans,
    exploration.branchNumber,
    exploration.branchColor,
  )

  return (
    <div
      className="flex w-full items-center gap-2 rounded-md border border-accent-bright/40 bg-accent-bright/10 px-2 py-1"
      role="group"
      aria-label="Trying a line"
    >
      <span className="shrink-0 text-xs font-medium text-ink">Trying a line</span>
      <span
        title={line || undefined}
        className="min-w-0 flex-1 truncate font-score text-xs text-ink-mute"
      >
        {line || 'drag a piece to try a move — the engine follows the board'}
      </span>
      <button
        type="button"
        className={button}
        onClick={onTakeBack}
        disabled={exploration.sans.length === 0}
      >
        Take back
      </button>
      <button type="button" className={button} onClick={onExit}>
        Back to game
      </button>
    </div>
  )
}

interface BoardNavProps {
  moves: Move[]
  ply: number
  lastPly: number
  onPlyChange: (ply: number) => void
  onRotate: () => void
  orientation: 'white' | 'black'
}

/** "12. h3" / "13... Bg6" label for the move that lands on `ply`. */
export function plyLabel(moves: Move[], ply: number): string | null {
  if (ply <= 0 || ply > moves.length) return null
  const move = moves[ply - 1]
  return `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san}`
}

export function BoardNav({
  moves,
  ply,
  lastPly,
  onPlyChange,
  onRotate,
  orientation,
}: BoardNavProps) {
  const button =
    'rounded-md border border-rule bg-card px-2.5 py-1.5 leading-none text-ink transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-30'
  const prevLabel = plyLabel(moves, ply - 1)
  const nextLabel = plyLabel(moves, ply + 1)
  const currentLabel = plyLabel(moves, ply)

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Move navigation">
      <button
        type="button"
        className={`${button} text-lg`}
        onClick={() => onPlyChange(0)}
        disabled={ply === 0}
        aria-label="Go to start"
      >
        «
      </button>
      {/* Fixed widths so the row never reflows as move names change length. */}
      <button
        type="button"
        data-nav-step="prev"
        className={`${button} flex w-28 items-center gap-1.5 font-score text-xs`}
        onClick={() => onPlyChange(Math.max(0, ply - 1))}
        disabled={ply === 0}
        aria-label={prevLabel ? `Previous move: ${prevLabel}` : 'Back to starting position'}
      >
        <span aria-hidden="true">‹</span>
        <span data-nav-label className="truncate">{prevLabel ?? 'Start'}</span>
      </button>
      <span data-nav-current className="w-24 shrink-0 truncate rounded-md bg-felt px-2 py-1.5 text-center font-score text-xs font-semibold text-buff">
        {currentLabel ?? 'Start'}
      </span>
      <button
        type="button"
        data-nav-step="next"
        className={`${button} flex w-28 items-center justify-end gap-1.5 font-score text-xs`}
        onClick={() => onPlyChange(Math.min(lastPly, ply + 1))}
        disabled={ply === lastPly}
        aria-label={nextLabel ? `Next move: ${nextLabel}` : 'Next move'}
      >
        <span data-nav-label className="truncate">{nextLabel ?? '—'}</span>
        <span aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        className={`${button} text-lg`}
        onClick={() => onPlyChange(lastPly)}
        disabled={ply === lastPly}
        aria-label="Go to end"
      >
        »
      </button>
      <button
        type="button"
        className={button}
        onClick={onRotate}
        aria-label={`Rotate board — view from ${orientation === 'white' ? "Black's" : "White's"} side`}
        title="Rotate board"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
      <span className="sr-only" aria-live="polite">
        {currentLabel ?? 'Starting position'}
      </span>
    </div>
  )
}
