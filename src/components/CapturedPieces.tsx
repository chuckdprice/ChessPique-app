import { defaultPieces } from 'react-chessboard'
import type { CapturedKind } from '../lib/gameModel'

interface CapturedPiecesProps {
  /** The pieces this player is up, pawns first. */
  pieces: CapturedKind[]
  /** Colour of those pieces — the opponent's, since they were taken from them. */
  color: 'w' | 'b'
  /** Material lead in pawns, ready to print, on the leading player's row only. */
  lead: string | null
}

/**
 * The material one player is up, in a row beside their name.
 *
 * Only the difference is drawn: a piece each side has lost in equal number is
 * cancelled out, so four pawns apiece show nothing and five against four show
 * one pawn (see `capturedMaterial`). That keeps this to a piece or two in most
 * positions, which is what lets it sit on the name row at all.
 *
 * The pieces overlap slightly. A rare position can leave one side up most of an
 * army, and shoulder to shoulder that would push the clock off the end of the
 * row; overlapping lets the row hold twice as many in the same space.
 */
export default function CapturedPieces({ pieces, color, lead }: CapturedPiecesProps) {
  if (pieces.length === 0 && !lead) return null

  return (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {pieces.map((kind, i) => {
        const Piece = defaultPieces[`${color}${kind.toUpperCase()}`]
        return (
          <span
            key={i}
            className="block size-[18px] shrink-0"
            style={{
              // Black pieces are near-invisible on the dark page without an
              // outline, and the piece SVGs hard-code their own stroke.
              filter: 'drop-shadow(0 0 0.75px var(--ink-mute))',
              marginLeft: i === 0 ? undefined : '-5px',
            }}
          >
            <Piece />
          </span>
        )
      })}
      {lead && (
        <span className="ml-1 font-score text-[11px] font-semibold leading-none text-ink">
          {lead}
        </span>
      )}
    </span>
  )
}
