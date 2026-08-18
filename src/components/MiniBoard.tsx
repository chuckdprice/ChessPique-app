import { useRef } from 'react'
import { defaultPieces } from 'react-chessboard'
import { pieceSrc } from '../lib/appearance'
import type { PieceCode } from '../lib/appearance'
import { carryPieceIdentities, checkedKingSquare } from '../lib/gameModel'
import type { PlacedPiece } from '../lib/gameModel'
import { CHECK_GLOW, HIGHLIGHT } from './BoardViewer'

interface MiniBoardProps {
  /** The position to draw; only the placement field is read. */
  fen: string
  orientation: 'white' | 'black'
  /** Piece set id from the appearance settings. */
  pieceSet: string
  /** Board edge in pixels. */
  size: number
  /**
   * The move that reached this position, washed in the same gold the real
   * board uses. Without it a reader has to find the difference between two
   * positions themselves, which is the whole thing the preview is for.
   */
  move?: { from: string; to: string } | null
}

const FILES = 'abcdefgh'

/** Matches the real board's, so a move looks the same wherever it is shown. */
const SLIDE_MS = 150

/** FEN placement letters to the codes both react-chessboard and the files use. */
function codeOf(letter: string): PieceCode {
  const color = letter === letter.toUpperCase() ? 'w' : 'b'
  return `${color}${letter.toUpperCase()}` as PieceCode
}

/** Where a square sits on screen, in whole squares from the top-left. */
function place(square: string, orientation: 'white' | 'black') {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1]) - 1
  return orientation === 'white'
    ? { col: file, row: 7 - rank }
    : { col: 7 - file, row: rank }
}

/**
 * A board with nothing on it but the pieces — no drag, no arrows, no coordinates.
 *
 * react-chessboard is not used here on purpose. It measures a square to animate
 * a move and throws when it cannot (see BoardBoundary), and a popup that opens
 * and closes under the mouse is exactly the case that gives it no layout to
 * measure. Drawing eight rows of divs cannot fail, and a preview needs none of
 * what the real board does.
 *
 * The squares and the pieces are separate layers. Pieces are placed by
 * transform rather than living inside a square, because a piece that is a
 * child of its square has to be destroyed and rebuilt to move — which is a
 * pop — while one that keeps its element can be transitioned to its new
 * square instead.
 */
export default function MiniBoard({
  fen,
  orientation,
  pieceSet,
  size,
  move = null,
}: MiniBoardProps) {
  // Derived from the previous render rather than held in state: this is a
  // drawing detail, and a state update here would render the board twice for
  // every position it is asked to show.
  const shown = useRef<{ fen: string; pieces: PlacedPiece[] } | null>(null)
  if (!shown.current || shown.current.fen !== fen) {
    shown.current = { fen, pieces: carryPieceIdentities(shown.current?.pieces ?? [], fen, move) }
  }
  const pieces = shown.current.pieces

  const checked = checkedKingSquare(fen)
  const squares = Array.from({ length: 64 }, (_, i) => FILES[i % 8] + String(8 - (i >> 3)))
  const order = orientation === 'white' ? squares : [...squares].reverse()

  return (
    <div aria-hidden="true" className="relative overflow-hidden rounded" style={{ width: size, height: size }}>
      <div
        className="grid size-full"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}
      >
        {order.map((square, i) => {
          // a8 is light, and the index runs along the ranks, so a row and a
          // column of the same parity share a colour. Reversing the board for
          // black preserves that parity at each screen position, so this reads
          // the display index and not the square.
          const light = ((i >> 3) + (i % 8)) % 2 === 0
          const marked = move != null && (square === move.from || square === move.to)
          return (
            <div
              key={square}
              style={{
                background: light ? 'var(--board-light)' : 'var(--board-dark)',
                backgroundImage: square === checked ? CHECK_GLOW : undefined,
              }}
            >
              {/* Under the glow and under the piece, so neither is tinted. */}
              {marked && square !== checked && (
                <span className="block size-full" style={{ background: HIGHLIGHT }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Drawn in a stable order rather than in board order, because for
          absolutely-positioned siblings the DOM order *is* the paint order. By
          square, a piece changes its place among its siblings as it moves, so
          it can pass beneath a neighbour it was in front of a moment earlier —
          which reads as a stutter rather than as a slide. An id that never
          changes keeps the stack still, and the piece that is actually moving
          is lifted above the rest for as long as it takes to arrive. */}
      {[...pieces].sort((a, b) => a.id - b.id).map((piece) => {
        const { col, row } = place(piece.square, orientation)
        const code = codeOf(piece.letter)
        const Piece = pieceSet === 'classic' ? defaultPieces[code] : null
        return (
          <div
            key={piece.id}
            className="absolute left-0 top-0"
            style={{
              width: '12.5%',
              height: '12.5%',
              // Over everything it crosses on the way. Only the piece that
              // moved needs it, and only while it is moving — which is exactly
              // as long as it is the move's destination.
              zIndex: piece.square === move?.to ? 1 : undefined,
              // Percentages here are of the piece's own box, which is exactly
              // one square — so a whole number of squares moves it a whole
              // number of squares, whatever the board's pixel size.
              transform: `translate(${col * 100}%, ${row * 100}%)`,
              transition: `transform ${SLIDE_MS}ms ease-out`,
            }}
          >
            {Piece ? (
              <Piece />
            ) : (
              <img src={pieceSrc(pieceSet, code)} alt="" className="size-full" />
            )}
          </div>
        )
      })}
    </div>
  )
}
