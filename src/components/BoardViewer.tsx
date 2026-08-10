import { useMemo, useState } from 'react'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import type { Arrow, PieceRenderObject, SquareHandlerArgs } from 'react-chessboard'
import { PIECE_CODES, pieceSrc } from '../lib/appearance'
import { formatClockTime } from '../lib/convert'
import { hasMoveMarker } from '../lib/engine/analysis'
import type { GameAnalysis } from '../lib/engine/analysis'
import { moveTargets } from '../lib/gameModel'
import type { CapturedKind } from '../lib/gameModel'
import { isMainline, lineEndId, nextId, previousId } from '../lib/moveTree'
import type { MoveTree } from '../lib/moveTree'
import CapturedPieces from './CapturedPieces'
import ClassBadge from './ClassBadge'

export interface PlayerPlate {
  name: string
  /** Rating from the PGN tag, ready to print; null when the file gives none. */
  elo: string | null
  /** Remaining clock, or null when the PGN has no clock times. */
  clock: number | null
  /** The pieces this player is up, pawns first. */
  captured: CapturedKind[]
  /** Their material lead in pawns, ready to print; null unless they lead. */
  lead: string | null
}

interface BoardViewerProps {
  tree: MoveTree
  /** The node the board is showing. */
  currentId: string
  orientation: 'white' | 'black'
  analysis: GameAnalysis | null
  arrows: Arrow[]
  /** Play a move, which writes it into the game. False snaps the piece back. */
  onPieceMove: (from: string, to: string) => boolean
  /** Piece set id from the appearance settings. */
  pieceSet: string
}

/**
 * The chosen set as react-chessboard wants it. `classic` returns undefined so
 * the library keeps its own drawing; the rest are files under public/piece,
 * which are plain <img> rather than inlined SVG so the browser caches them and
 * the bundle never carries twelve drawings per set.
 */
function pieceRenderers(setId: string): PieceRenderObject | undefined {
  if (setId === 'classic') return undefined
  return Object.fromEntries(
    PIECE_CODES.map((code) => [
      code,
      () => (
        <img
          src={pieceSrc(setId, code)}
          alt=""
          draggable={false}
          className="size-full select-none"
        />
      ),
    ]),
  )
}

/** The square of the last move played, and of a piece picked up to move. */
const HIGHLIGHT = 'rgba(237, 189, 71, 0.5)'
/**
 * Where a selected piece may go: a dot on an empty square, a ring around a
 * piece it can take. Gradients rather than elements, so they cost nothing but
 * a style on squares the board already draws.
 *
 * `closest-side` is what makes their sizes predictable — a gradient's 100% is
 * otherwise the distance to the square's *corner*, which put the ring under
 * the piece instead of around it. With it, 100% is half the square's width, so
 * the ring reaches the edges; its last stop is transparent so it stops there
 * rather than flooding the corners.
 *
 * The dot is dark with a pale rim because the board themes run from cream to
 * near-black, and a plain dark dot all but vanished on Midnight.
 */
const MOVE_DOT =
  'radial-gradient(circle closest-side, rgba(0, 0, 0, 0.42) 0 26%, rgba(255, 255, 255, 0.18) 27% 31%, transparent 32%)'
const CAPTURE_RING =
  'radial-gradient(circle closest-side, transparent 0 76%, rgba(226, 74, 74, 0.8) 78% 97%, transparent 98%)'

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
      {/* The rating sits outside the truncating span so that a long name eats
          its own characters rather than the number's. */}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="min-w-0 truncate text-sm font-medium">
          {plate.name}
          <span className="sr-only">{color === 'w' ? ' (White)' : ' (Black)'}</span>
        </span>
        {plate.elo && (
          <span className="shrink-0 font-score text-xs text-ink-mute">({plate.elo})</span>
        )}
      </div>
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
  tree,
  currentId,
  orientation,
  analysis,
  arrows,
  onPieceMove,
  pieceSet,
}: BoardViewerProps) {
  const pieces = useMemo(() => pieceRenderers(pieceSet), [pieceSet])
  const current = tree.nodes.get(currentId) ?? tree.nodes.get(tree.root)!
  const fen = current.fen
  // The position the piece was picked in is carried with it so that any change
  // of position — a move played here, a step through the game, a take-back —
  // drops the selection without an effect to clear it.
  const [picked, setPicked] = useState<{ square: string; fen: string } | null>(null)
  const selected = picked && picked.fen === fen ? picked.square : null
  const targets = useMemo(() => (selected ? moveTargets(fen, selected) : []), [fen, selected])

  const handleSquareClick = ({ square }: SquareHandlerArgs) => {
    if (selected === square) {
      setPicked(null)
      return
    }
    if (selected && targets.some((target) => target.to === square)) {
      onPieceMove(selected, square)
      setPicked(null)
      return
    }
    // A square with nothing to move — empty, the other side's, or a piece with
    // no legal move — clears the selection rather than taking it.
    setPicked(moveTargets(fen, square).length > 0 ? { square, fen } : null)
  }

  const highlight =
    current.from && current.to ? ([current.from, current.to] as [string, string]) : null
  // The review only covers the mainline, so a move in a variation has no grade
  // to show — and neither does the starting position, which is not a move.
  const graded = current.parent != null && isMainline(tree, currentId)
  const moveAnalysis = graded ? (analysis?.moves[current.ply - 1] ?? null) : null
  const showBadge = moveAnalysis != null && hasMoveMarker(moveAnalysis.classification)
  const badgeSquare = showBadge && highlight ? highlight[1] : null
  const badgePos = badgeSquare ? squareCorner(badgeSquare, orientation) : null

  const squareStyles: Record<string, React.CSSProperties> = {}
  if (highlight) {
    for (const square of highlight) {
      squareStyles[square] = { backgroundColor: HIGHLIGHT }
    }
  }
  if (selected) {
    squareStyles[selected] = { backgroundColor: HIGHLIGHT }
    for (const target of targets) {
      // The gradient sits behind the piece, so a capture ring encircles it
      // rather than covering it. Merged with any highlight already here: the
      // move just played is often what the selected piece can take back.
      squareStyles[target.to] = {
        ...squareStyles[target.to],
        backgroundImage: target.capture ? CAPTURE_RING : MOVE_DOT,
      }
    }
  }

  return (
    <div className="relative size-(--board-size) overflow-hidden rounded-lg shadow-md">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: true,
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare != null && onPieceMove(sourceSquare, targetSquare),
          onSquareClick: handleSquareClick,
          allowDrawingArrows: false,
          animationDurationInMs: 150,
          squareStyles,
          arrows,
          // Keep the library's geometry defaults; only take over opacity so the
          // per-arrow rgba alpha is the single source of fade.
          arrowOptions: { ...defaultArrowOptions, opacity: 1, activeOpacity: 1 },
          // The chosen board, read from the vars the appearance settings put
          // on <html>, so a change lands without this component knowing.
          // Coordinates keep taking the other square's colour.
          lightSquareStyle: { backgroundColor: 'var(--board-light)' },
          darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
          darkSquareNotationStyle: { color: 'var(--board-light)' },
          lightSquareNotationStyle: { color: 'var(--board-dark)' },
          pieces,
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

interface BoardNavProps {
  tree: MoveTree
  currentId: string
  onNavigate: (nodeId: string) => void
  /** Forward is not always one place: at a branch it asks which way first. */
  onStepForward: () => void
  onRotate: () => void
  orientation: 'white' | 'black'
}

/** "12. h3" / "13... Bg6" for a node, or null for the starting position. */
export function moveLabel(tree: MoveTree, nodeId: string | null): string | null {
  const node = nodeId ? tree.nodes.get(nodeId) : null
  if (!node || node.parent == null || !node.san) return null
  return `${node.number}${node.color === 'w' ? '.' : '…'} ${node.san}`
}

export function BoardNav({
  tree,
  currentId,
  onNavigate,
  onStepForward,
  onRotate,
  orientation,
}: BoardNavProps) {
  // A heavier outline and a lift, because these sit on the bare page rather
  // than in a card and were reading as flat text next to the board.
  const face =
    'border-2 border-felt-bright/60 bg-card py-1 text-felt-bright shadow-sm transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-30'
  // The four share edges rather than sitting apart, so the run of them reads
  // as one control. Overlapping the borders keeps the seams a single rule.
  const seg = `${face} flex-1 -ml-0.5 first:ml-0 first:rounded-l-md last:rounded-r-md`
  // Forward is this line's own continuation, so the buttons walk a variation
  // rather than jumping back onto the mainline at the first press.
  const atStart = currentId === tree.root
  const previous = previousId(tree, currentId)
  const next = nextId(tree, currentId)
  const end = lineEndId(tree, currentId)
  const prevLabel = moveLabel(tree, previous)
  const nextLabel = moveLabel(tree, next)
  const currentLabel = moveLabel(tree, currentId)

  // Exactly the board's width, so the row's ends line up with the board's
  // edges rather than running past them into the page margin. The cluster is
  // centred on the board and the rotate button is taken out of the flow to
  // hold that right edge, so the one does not push the other off centre; the
  // cluster's own width stops short of it on both sides.
  return (
    <div
      className="relative flex w-(--board-size) max-w-full items-center justify-center"
      role="group"
      aria-label="Move navigation"
    >
      <div className="flex w-full max-w-[min(20rem,calc(100%-5rem))] items-center">
        <button
          type="button"
          className={seg}
          onClick={() => onNavigate(tree.root)}
          disabled={atStart}
          aria-label="Go to start"
        >
          <NavIcon d="M11 18l-6-6 6-6M18 18l-6-6 6-6" />
        </button>
        {/* The neighbouring moves are named in the labels rather than on the
            buttons: the names changed width as the game went on, which is what
            pushed this row wider than the board. */}
        <button
          type="button"
          className={seg}
          onClick={() => onNavigate(previous)}
          disabled={atStart}
          title={prevLabel ?? 'Start'}
          aria-label={prevLabel ? `Previous move: ${prevLabel}` : 'Back to starting position'}
        >
          <NavIcon d="M15 18l-6-6 6-6" />
        </button>
        <button
          type="button"
          className={seg}
          onClick={onStepForward}
          disabled={!next}
          title={nextLabel ?? undefined}
          aria-label={nextLabel ? `Next move: ${nextLabel}` : 'Next move'}
        >
          <NavIcon d="M9 18l6-6-6-6" />
        </button>
        <button
          type="button"
          className={seg}
          onClick={() => onNavigate(end)}
          disabled={end === currentId}
          aria-label="Go to end"
        >
          <NavIcon d="M13 18l6-6-6-6M6 18l6-6-6-6" />
        </button>
      </div>

      <button
        type="button"
        className={`${face} absolute right-0 rounded-md px-1.5`}
        onClick={onRotate}
        aria-label={`Rotate board — view from ${orientation === 'white' ? "Black's" : "White's"} side`}
        title="Rotate board"
      >
        <NavIcon d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
      </button>
      <span className="sr-only" aria-live="polite">
        {currentLabel ?? 'Starting position'}
      </span>
    </div>
  )
}

/**
 * One nav glyph. The arrows are drawn rather than typed: as characters they
 * were a fraction of their font size, so at any size that matched the rotate
 * icon they still looked half of it.
 */
function NavIcon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mx-auto size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}
