import type { Page } from '../lib/pages'

/** The two-stage workflow. Other pages reach the app through the left-nav. */
type Step = Extract<Page, 'pgn' | 'analysis'>

interface StepNavProps {
  /** The app's page; on one that is not a step, neither reads as current. */
  page: Page
  onPageChange: (page: Step) => void
  /** Analysis is unreachable until a game has been converted. */
  gameLoaded: boolean
  /** 0-100 while the engine review runs; null when idle or finished. */
  analysisPercent: number | null
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'pgn', label: 'PGN File' },
  { id: 'analysis', label: 'Game Analysis' },
]

// Chevron notch depth. The first step is flat on its left edge, the last flat
// on its right, so the bar reads as one continuous arrow.
const NOTCH = '14px'

function clipFor(index: number, count: number): string {
  const first = index === 0
  const last = index === count - 1
  const leftIn = first ? '0' : NOTCH
  return [
    `polygon(0 0`,
    last ? `100% 0, 100% 100%` : `calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%`,
    `0 100%`,
    first ? `)` : `${leftIn} 50%)`,
  ].join(', ')
}

export default function StepNav({
  page,
  onPageChange,
  gameLoaded,
  analysisPercent,
}: StepNavProps) {
  return (
    <nav aria-label="Steps" className="flex select-none">
      {STEPS.map((step, i) => {
        const active = page === step.id
        const disabled = step.id === 'analysis' && !gameLoaded
        return (
          <button
            key={step.id}
            type="button"
            disabled={disabled}
            aria-current={active ? 'step' : undefined}
            onClick={() => onPageChange(step.id)}
            style={{
              clipPath: clipFor(i, STEPS.length),
              paddingLeft: i === 0 ? undefined : `calc(${NOTCH} + 1rem)`,
              marginLeft: i === 0 ? undefined : `-${NOTCH}`,
            }}
            className={`relative flex-1 py-2.5 pr-5 pl-4 text-sm font-medium transition-colors ${
              active
                ? 'bg-felt text-buff'
                : disabled
                  ? 'bg-buff-soft text-ink-mute/50'
                  : 'bg-buff-soft text-ink-mute hover:bg-rule hover:text-ink'
            } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="mr-2 font-score text-xs opacity-70">{i + 1}</span>
            {step.label}
            {step.id === 'analysis' && analysisPercent != null && (
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 font-score text-[10px] ${
                  active ? 'bg-buff/25 text-buff' : 'bg-felt/15 text-ink-mute'
                }`}
              >
                {analysisPercent}%
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
