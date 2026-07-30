import { CLASSIFICATION_LABEL, CLASSIFICATION_SYMBOL } from '../lib/engine/analysis'
import type { Classification } from '../lib/engine/analysis'

export function classColor(classification: Classification): string {
  return `var(--class-${classification})`
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
    <span
      role="img"
      aria-label={CLASSIFICATION_LABEL[classification]}
      title={CLASSIFICATION_LABEL[classification]}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm"
      style={{
        backgroundColor: classColor(classification),
        width: size,
        height: size,
        fontSize: size * (CLASSIFICATION_SYMBOL[classification].length > 1 ? 0.5 : 0.62),
        lineHeight: 1,
      }}
    >
      {CLASSIFICATION_SYMBOL[classification]}
    </span>
  )
}
