import { defaultPieces } from 'react-chessboard'
import { pieceSrc } from '../lib/appearance'
import type { PieceCode } from '../lib/appearance'
import { HIGHLIGHT } from './BoardViewer'

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

/** FEN placement letters to the codes both react-chessboard and the files use. */
function codeOf(letter: string): PieceCode {
  const color = letter === letter.toUpperCase() ? 'w' : 'b'
  return `${color}${letter.toUpperCase()}` as PieceCode
}

/** The placement field as 64 letters, rank 8 first, empty squares as null. */
function squaresOf(fen: string): Array<string | null> {
  const out: Array<string | null> = []
  for (const row of fen.split(' ')[0].split('/')) {
    for (const ch of row) {
      const empty = parseInt(ch, 10)
      if (Number.isNaN(empty)) out.push(ch)
      else for (let i = 0; i < empty; i++) out.push(null)
    }
  }
  return out
}

/**
 * A board with nothing on it but the pieces — no drag, no arrows, no coordinates.
 *
 * react-chessboard is not used here on purpose. It measures a square to animate
 * a move and throws when it cannot (see BoardBoundary), and a popup that opens
 * and closes under the mouse is exactly the case that gives it no layout to
 * measure. Drawing eight rows of divs cannot fail, and a preview needs none of
 * what the real board does.
 */
export default function MiniBoard({
  fen,
  orientation,
  pieceSet,
  size,
  move = null,
}: MiniBoardProps) {
  // The square each letter sits on is worked out before the flip, so black's
  // view names the same squares as white's rather than their mirror.
  const cells = squaresOf(fen).map((letter, i) => ({
    letter,
    square: FILES[i % 8] + String(8 - (i >> 3)),
  }))
  const order = orientation === 'white' ? cells : [...cells].reverse()

  return (
    <div
      aria-hidden="true"
      className="grid overflow-hidden rounded"
      // Both axes are named. Implicit rows are auto-sized, and a piece's SVG
      // has an intrinsic size even at width/height 100%, so the ranks holding
      // pieces grew and the empty ones collapsed to a band of card behind the
      // board — a checkerboard with rows of the wrong height and gaps.
      style={{
        width: size,
        height: size,
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
      }}
    >
      {order.map(({ letter, square }, i) => {
        // a8 is light, and the index runs along the ranks, so a row and a
        // column of the same parity share a colour. Reversing the board for
        // black preserves that parity at each screen position, so this reads
        // the display index and not the square.
        const light = ((i >> 3) + (i % 8)) % 2 === 0
        const code = letter ? codeOf(letter) : null
        const Piece = code && pieceSet === 'classic' ? defaultPieces[code] : null
        const marked = move != null && (square === move.from || square === move.to)
        return (
          <div
            key={i}
            className="relative"
            style={{ background: light ? 'var(--board-light)' : 'var(--board-dark)' }}
          >
            {/* Over the square and under the piece, so a piece standing on a
                marked square is not tinted by it. */}
            {marked && <span className="absolute inset-0" style={{ background: HIGHLIGHT }} />}
            {/* Out of flow, so a piece fills its square exactly and can never
                size the track it sits in. */}
            {Piece ? (
              <span className="absolute inset-0">
                <Piece />
              </span>
            ) : (
              code && (
                <img src={pieceSrc(pieceSet, code)} alt="" className="absolute inset-0 size-full" />
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
