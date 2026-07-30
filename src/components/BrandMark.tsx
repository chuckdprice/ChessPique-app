/**
 * App mark: a knight cut out of a rounded gradient tile, with a single
 * highlight bar that echoes the eval bar beside the board.
 */
export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="ChessNoteR"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="brand-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4efe0" />
          <stop offset="100%" stopColor="#cfc6ac" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="9" fill="url(#brand-tile)" />
      {/* Eval-bar sliver down the left edge */}
      <rect x="0" y="0" width="4" height="32" rx="2" fill="#1e5943" />
      <rect x="0" y="0" width="4" height="13" rx="2" fill="#23221e" />
      {/* Knight */}
      <path
        d="M20.6 25.5H11c0-3.6.9-5.6 3.3-7.4l3.4-2.6-2.2-1.3-2 2.2-3.4-1.7 1.1-3.2 2.6-1.2.8-3.3 2 1 1.1-1.9c3.7 1.7 5.9 5 5.9 9.4v10z"
        fill="#23221e"
      />
    </svg>
  )
}
