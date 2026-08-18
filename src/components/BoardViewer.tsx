import { useMemo, useState } from 'react'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import type { Arrow, PieceRenderObject, SquareHandlerArgs } from 'react-chessboard'
import { PIECE_CODES, pieceSrc } from '../lib/appearance'
import { formatClockDisplay } from '../lib/convert'
import { hasMoveMarker } from '../lib/engine/analysis'
import type { GameAnalysis } from '../lib/engine/analysis'
import { checkedKingSquare, moveTargets } from '../lib/gameModel'
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

/**
 * An arrow this component draws itself, over react-chessboard's own.
 *
 * The library takes one width for every arrow and keys them by their pair of
 * squares, so two arrows along the same squares are one arrow with a duplicate
 * React key. Maia's move and the move actually played are exactly the arrows
 * most likely to land on an engine candidate — and the agreement is worth
 * seeing — so they are drawn here instead: thinner, and on top.
 */
export interface OverlayArrow {
  from: string
  to: string
  color: string
}

/** A score printed at the head of an engine arrow. */
export interface EvalLabel {
  /** The move's destination — where its arrow points. */
  square: string
  text: string
  /** The engine's first choice, which is filled in rather than outlined. */
  best: boolean
  /** The colour of the arrow this belongs to, so the two read as one thing. */
  color: string
}

interface BoardViewerProps {
  tree: MoveTree
  /** The node the board is showing. */
  currentId: string
  orientation: 'white' | 'black'
  analysis: GameAnalysis | null
  arrows: Arrow[]
  /** Drawn over `arrows`, thinner — see OverlayArrow. */
  overlayArrows: OverlayArrow[]
  evalLabels: EvalLabel[]
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

/**
 * The square of the last move played, and of a piece picked up to move.
 *
 * Exported because the hover preview marks its move with the same wash: a
 * second gold that was nearly this one would read as a different kind of mark.
 */
export const HIGHLIGHT = 'rgba(237, 189, 71, 0.5)'
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
/**
 * The king that is in check, lit from underneath.
 *
 * Exported for the same reason as HIGHLIGHT: the hover preview marks a check
 * with it too, and two nearly-identical reds would read as two different marks.
 *
 * A wash over the whole square would read as one more highlighted square —
 * the app already spends a flat fill on the last move and on a selected piece
 * — so this is a glow with a soft edge instead. It fills most of the square and
 * leaves the corners, which is what keeps it a glow rather than a fill.
 *
 * `closest-corner`, so 100% is the distance to the corner rather than to the
 * side. With `closest-side` the strong part of the gradient reached only the
 * middle of each edge, which under a piece drawn nearly square read as a small
 * dot behind a large king. Nothing escapes the square either way: this is a
 * background-image on the square itself, so it is clipped to it.
 */
export const CHECK_GLOW =
  'radial-gradient(circle closest-corner, rgba(226, 74, 74, 0.95) 0 42%, rgba(226, 74, 74, 0.78) 68%, rgba(226, 74, 74, 0) 100%)'

/** Square's column and row on screen, 0-7 from the top-left, given orientation. */
function squareGrid(square: string, orientation: 'white' | 'black') {
  const file = square.charCodeAt(0) - 97 // a=0
  const rank = parseInt(square[1], 10) // 1..8
  return {
    col: orientation === 'white' ? file : 7 - file,
    row: orientation === 'white' ? 8 - rank : rank - 1,
  }
}

/** Top-right-corner position of a square as percentages, given orientation. */
function squareCorner(square: string, orientation: 'white' | 'black') {
  const { col, row } = squareGrid(square, orientation)
  return { left: (col + 1) * 12.5, top: row * 12.5 }
}

/** Centre of a square as percentages, given orientation. */
function squareCenter(square: string, orientation: 'white' | 'black') {
  const { col, row } = squareGrid(square, orientation)
  return { left: (col + 0.5) * 12.5, top: (row + 0.5) * 12.5 }
}

/**
 * The overlay arrows are drawn in a 100x100 viewBox, so a square is 12.5 units
 * and the numbers below are react-chessboard's own defaults expressed in it:
 * the length reduction that stops an arrow short of the target's centre, and
 * the stroke it would have used. Matching them is the point — these arrows have
 * to read as the same kind of mark, only slimmer.
 */
const SQUARE = 12.5
const ARROW_SHORTEN = SQUARE / 8
const ENGINE_ARROW_STROKE = SQUARE / 5
const OVERLAY_ARROW_STROKE = ENGINE_ARROW_STROKE * 0.55

/** An arrow's path, L-shaped for a knight's move exactly as the library draws it. */
function arrowPath(from: string, to: string, orientation: 'white' | 'black'): string {
  const a = squareCenter(from, orientation)
  const b = squareCenter(to, orientation)
  const dx = b.left - a.left
  const dy = b.top - a.top
  const r = Math.hypot(dx, dy)
  if (r === 0) return ''

  if (Math.abs(Math.hypot(1, 2) * SQUARE - r) < 0.001) {
    const verticalFirst = Math.abs(dx) < Math.abs(dy)
    const corner = verticalFirst ? { x: a.left, y: b.top } : { x: b.left, y: a.top }
    const legX = b.left - corner.x
    const legY = b.top - corner.y
    const end = {
      x: corner.x + (legX * (SQUARE - ARROW_SHORTEN)) / SQUARE,
      y: corner.y + (legY * (SQUARE - ARROW_SHORTEN)) / SQUARE,
    }
    return `M${a.left},${a.top} L${corner.x},${corner.y} L${end.x},${end.y}`
  }

  const end = {
    x: a.left + (dx * (r - ARROW_SHORTEN)) / r,
    y: a.top + (dy * (r - ARROW_SHORTEN)) / r,
  }
  return `M${a.left},${a.top} L${end.x},${end.y}`
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
            {formatClockDisplay(plate.clock)}
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
  overlayArrows,
  evalLabels,
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
  const checkedKing = checkedKingSquare(fen)
  if (checkedKing) {
    squareStyles[checkedKing] = { backgroundImage: CHECK_GLOW }
  }
  if (highlight) {
    for (const square of highlight) {
      squareStyles[square] = { ...squareStyles[square], backgroundColor: HIGHLIGHT }
    }
  }
  if (selected) {
    squareStyles[selected] = { ...squareStyles[selected], backgroundColor: HIGHLIGHT }
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
      {/* Between the library's arrows (z-20) and the labels (z-30), so a Maia
          or played-move arrow lies over an engine candidate sharing its
          squares rather than being dropped for it. */}
      {overlayArrows.length > 0 && (
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 z-[25] size-full"
        >
          {(() => {
            // Maia's move and the move actually played are often the same one,
            // and then the second arrow would sit exactly on the first and hide
            // it. Each arrow that repeats a path is drawn narrower than the one
            // before, so it reads as a stripe down the middle of it and both
            // colours stay on screen.
            const drawnPaths = new Map<string, number>()
            return overlayArrows.map((arrow, i) => {
              const d = arrowPath(arrow.from, arrow.to, orientation)
              const repeat = drawnPaths.get(d) ?? 0
              drawnPaths.set(d, repeat + 1)
              // Unique per arrow, not per pair of squares: two arrows along the
              // same squares are exactly the case this overlay exists for.
              const id = `overlay-${i}-${arrow.from}-${arrow.to}`
              return (
                <g key={id}>
                  {/* Marker units are stroke widths, so the head thins with the
                      shaft and the two stay in proportion. */}
                  <marker
                    id={id}
                    markerWidth="2"
                    markerHeight="2.5"
                    refX="1.25"
                    refY="1.25"
                    orient="auto"
                  >
                    <polygon points="0.3 0, 2 1.25, 0.3 2.5" fill={arrow.color} />
                  </marker>
                  <path
                    d={d}
                    fill="none"
                    stroke={arrow.color}
                    strokeWidth={OVERLAY_ARROW_STROKE * (1 - repeat * 0.45)}
                    markerEnd={`url(#${id})`}
                  />
                </g>
              )
            })
          })()}
        </svg>
      )}

      {/* Over the arrow layer, which react-chessboard puts at z-index 20 in
          this same stacking context: below it, the arrowhead a label belongs
          to painted across the label and ate its first two characters. */}
      {evalLabels.map((label) => {
        const at = squareCenter(label.square, orientation)
        return (
          <div
            key={label.square}
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${at.left}%`, top: `${at.top}%` }}
          >
            <span
              className="block rounded font-score font-semibold leading-none tabular-nums shadow-md"
              style={{
                // Sized off the board, not in fixed pixels: a badge wider than
                // its square overlaps the one on the square beside it, and the
                // board runs from 180px on a phone to 560px on a desktop.
                fontSize: 'clamp(8px, calc(var(--board-size) / 34), 15px)',
                padding: '0.2em 0.35em',
                ...(label.best
                  ? { background: label.color, color: '#fff' }
                  : {
                      // Outlined in its arrow's colour rather than filled with
                      // it: two filled badges of the same blue read as two best
                      // moves, and the ranking is the point.
                      background: 'var(--card)',
                      color: 'var(--ink)',
                      boxShadow: `0 0 0 1.5px ${label.color}`,
                    }),
              }}
            >
              {label.text}
              {label.best && <span className="align-super text-[0.7em]">★</span>}
            </span>
          </div>
        )
      })}

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
