import type { ReactNode } from 'react'

/**
 * Gold, and the ink that reads on it — fixed rather than themed, like the
 * engine's blue arrows. Every theme in the app is quiet by design, so nothing
 * in the palette is loud enough to say "something is running" on its own; this
 * is the one badge on the page meant to be noticed rather than read.
 */
export const RUNNING_BG = '#f2b705'
export const RUNNING_INK = '#3d2f00'
export const RUNNING_TRACK = 'rgba(61, 47, 0, 0.22)'

// The arc is the circle itself, dashed: one dash the length of the whole
// circumference, pulled back by however much of it should not be drawn.
const R = 6
const C = 2 * Math.PI * R

interface BusyRingProps {
  /** 0-100, or null when there is no total to count towards. */
  pct: number | null
  title: string
  ariaLabel: string
  /** Printed beside the ring; omit for a ring on its own. */
  children?: ReactNode
}

/**
 * The "something is running" badge, in the one size that fits a header row.
 *
 * Two things use it and they are not the same job: the whole-game review counts
 * towards a known total, and the constrained search that colours Maia's moves
 * has nothing to count — so `pct` is null there and a quarter of the ring spins
 * instead of standing at zero looking stalled.
 */
export default function BusyRing({ pct, title, ariaLabel, children }: BusyRingProps) {
  const known = pct != null
  return (
    <span
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? Math.round(pct) : undefined}
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5"
      style={{ background: RUNNING_BG, color: RUNNING_INK }}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className={`size-4 ${known ? '-rotate-90' : 'animate-spin'}`}
      >
        <circle cx="8" cy="8" r={R} fill="none" strokeWidth="2.5" stroke={RUNNING_TRACK} />
        <circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={C}
          strokeDashoffset={known ? C * (1 - pct / 100) : C * 0.75}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      {children}
    </span>
  )
}
