import { defaultPieces } from 'react-chessboard'
import { capturedMaterial } from '../lib/gameModel'
import type { CapturedKind } from '../lib/gameModel'

interface CapturedStripProps {
  fen: string
  orientation: 'white' | 'black'
}

/**
 * Room the gaps between pieces may use: one half of the board, less the badge's
 * line and the first piece (which is always drawn at full size).
 */
const GAP_ROOM = 'calc(var(--board-size) / 2 - 1.25rem - var(--captured-size))'

function Stack({
  pieces,
  color,
  badge,
  /** 'up' grows from the centre toward the top of the board, 'down' the other way. */
  direction,
}: {
  pieces: CapturedKind[]
  color: 'w' | 'b'
  badge: string | null
  direction: 'up' | 'down'
}) {
  // Pieces sit shoulder to shoulder until the stack would outgrow its half of
  // the board, then overlap by exactly as much as it takes to fit.
  const gaps = Math.max(1, pieces.length - 1)
  const pitch = `min(var(--captured-size), calc((${GAP_ROOM}) / ${gaps}))`
  const overlap = `calc(${pitch} - var(--captured-size))`
  // In a reversed column the first child sits at the bottom — against the
  // centre line — and later children stack above it, so the badge appended
  // last lands at the outer end of both stacks.
  const pull = direction === 'up' ? 'marginBottom' : 'marginTop'

  return (
    <div
      className={`flex min-h-0 flex-1 items-center overflow-hidden ${
        direction === 'up' ? 'flex-col-reverse' : 'flex-col'
      }`}
    >
      {pieces.map((kind, i) => {
        const Piece = defaultPieces[`${color}${kind.toUpperCase()}`]
        return (
          <span
            key={i}
            aria-hidden="true"
            className="block shrink-0"
            style={{
              width: 'var(--captured-size)',
              height: 'var(--captured-size)',
              // Black pieces are near-invisible on the dark page without an
              // outline, and the piece SVGs hard-code their own stroke.
              filter: 'drop-shadow(0 0 0.75px var(--ink-mute))',
              [pull]: i === 0 ? undefined : overlap,
            }}
          >
            <Piece />
          </span>
        )
      })}
      {badge && (
        <span
          aria-hidden="true"
          className="shrink-0 pt-0.5 font-score text-xs font-semibold leading-none text-ink"
        >
          {badge}
        </span>
      )}
    </div>
  )
}

/**
 * Captured pieces in a narrow column beside the board: each side's losses stack
 * outward from the board's centre line — pawns nearest the middle — on the side
 * of the player who took them, with the material lead marked at the far end of
 * the leading player's haul.
 */
export default function CapturedStrip({ fen, orientation }: CapturedStripProps) {
  const captured = capturedMaterial(fen)
  const whiteOnBottom = orientation === 'white'
  const lead = Math.abs(captured.diff)
  const badge = lead > 0 ? `+${lead}` : null

  // The bottom player's captures hang below the centre, so the lower stack
  // holds the pieces of whichever colour sits at the top of the board.
  const lower = {
    pieces: whiteOnBottom ? captured.black : captured.white,
    color: whiteOnBottom ? ('b' as const) : ('w' as const),
  }
  const upper = {
    pieces: whiteOnBottom ? captured.white : captured.black,
    color: whiteOnBottom ? ('w' as const) : ('b' as const),
  }
  // The badge belongs to the leading side's own haul — the stack of pieces it
  // captured, which is the one showing the opposite colour.
  const badgeOnLower = captured.diff > 0 === whiteOnBottom

  const label =
    lead === 0
      ? 'Material: even'
      : `Material: ${captured.diff > 0 ? 'White' : 'Black'} ahead by ${lead}`

  return (
    <div
      aria-label={label}
      className="flex h-(--board-size) flex-col"
      style={
        {
          '--captured-size': 'clamp(18px, calc(var(--board-size) / 17), 28px)',
          width: 'calc(var(--captured-size) + 0.5rem)',
        } as React.CSSProperties
      }
    >
      <Stack
        pieces={upper.pieces}
        color={upper.color}
        badge={badgeOnLower ? null : badge}
        direction="up"
      />
      <Stack
        pieces={lower.pieces}
        color={lower.color}
        badge={badgeOnLower ? badge : null}
        direction="down"
      />
    </div>
  )
}
