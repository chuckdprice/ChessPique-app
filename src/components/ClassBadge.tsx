import { CLASSIFICATION_LABEL, CLASSIFICATION_SYMBOL } from '../lib/engine/analysis'
import type { Classification } from '../lib/engine/analysis'

export function classColor(classification: Classification): string {
  return `var(--class-${classification})`
}

/** The shape both badges share: a filled circle with a bold glyph in it. */
function Badge({
  symbol,
  label,
  size,
  background,
  color,
}: {
  symbol: string
  label: string
  size: number
  background: string
  color: string
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold shadow-sm"
      style={{
        backgroundColor: background,
        color,
        width: size,
        height: size,
        // Two characters have to be set smaller to fit the same circle.
        fontSize: size * (symbol.length > 1 ? 0.5 : 0.62),
        lineHeight: 1,
      }}
    >
      {symbol}
    </span>
  )
}

/** Small circular classification icon (★ ! ⊙ ?! ? ??). */
export default function ClassBadge({
  classification,
  size = 18,
}: {
  classification: Classification
  size?: number
}) {
  return (
    <Badge
      symbol={CLASSIFICATION_SYMBOL[classification]}
      label={CLASSIFICATION_LABEL[classification]}
      size={size}
      background={classColor(classification)}
      color="#fff"
    />
  )
}

/**
 * The same badge for a mated king, in ink rather than a class colour.
 *
 * It is deliberately not one of the classification colours: those grade the
 * move that was played, and this sits on the *losing* king, where green for a
 * brilliant mate or red for a blunder would both read as a verdict on the wrong
 * player. Ink and card flip together with the theme, so the glyph stays legible
 * in both.
 */
export function MateBadge({ size = 18 }: { size?: number }) {
  return (
    <Badge symbol="#" label="Checkmate" size={size} background="var(--ink)" color="var(--card)" />
  )
}
