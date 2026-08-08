import { useRef, useState } from 'react'
import { MAX_PANE_PX, MIN_PANE_PX } from '../lib/settings'
import type { PaneId } from '../lib/settings'

interface PgnPaneProps {
  paneId: PaneId
  /** Height this pane was last dragged to, or null if it never has been. */
  height: number | null
  onHeightChange: (px: number) => void
  label: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
}

/**
 * One of the two PGN boxes, with a corner handle for setting its height.
 *
 * The handle is drawn rather than left to the browser: `resize` on a textarea
 * does nothing on iOS, which is where the boxes were unusable in the first
 * place. Dragging it is pointer events, so it works the same under a finger and
 * a mouse; `touch-action: none` stops the drag from scrolling the page instead.
 *
 * A box that has been dragged has an explicit height. One that has not still
 * grows to fill its column, with a floor that is a share of the viewport — so
 * a desktop window is filled as before and a phone still gets a usable box,
 * and a height dragged on one device does not decide the other until it is.
 */
export default function PgnPane({
  paneId,
  height,
  onHeightChange,
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: PgnPaneProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)
  // Live height during a drag; committed to the caller on release, so the
  // stored value is not rewritten on every pointer move.
  const [dragging, setDragging] = useState<number | null>(null)

  const shown = dragging ?? height
  const clamp = (px: number) => Math.min(MAX_PANE_PX, Math.max(MIN_PANE_PX, Math.round(px)))

  const nudge = (delta: number) => {
    const from = boxRef.current?.getBoundingClientRect().height ?? MIN_PANE_PX
    onHeightChange(clamp(from + delta))
  }

  return (
    <div
      ref={boxRef}
      style={shown ? { height: `${shown}px` } : undefined}
      className={`relative flex min-h-0 flex-col ${shown ? '' : 'pgn-pane-fill'}`}
    >
      <textarea
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        className="size-full resize-none rounded-lg border border-rule bg-buff-soft/60 px-3 py-2 font-score text-[12px] leading-relaxed placeholder:text-ink-mute/60"
      />
      <button
        type="button"
        aria-label={`Resize the ${label.toLowerCase()} box`}
        title="Drag to resize"
        onPointerDown={(e) => {
          e.preventDefault()
          const startHeight = boxRef.current?.getBoundingClientRect().height ?? MIN_PANE_PX
          drag.current = { startY: e.clientY, startHeight }
          setDragging(clamp(startHeight))
          // The move and release listeners go on the window rather than on the
          // handle: a finger or a mouse that outruns a 28px target must not
          // drop the drag, and pointer capture cannot be relied on to prevent
          // that everywhere.
          let latest = clamp(startHeight)
          const onMove = (move: PointerEvent) => {
            if (!drag.current) return
            latest = clamp(drag.current.startHeight + (move.clientY - drag.current.startY))
            setDragging(latest)
          }
          const end = () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', end)
            window.removeEventListener('pointercancel', end)
            drag.current = null
            setDragging(null)
            onHeightChange(latest)
          }
          window.addEventListener('pointermove', onMove)
          window.addEventListener('pointerup', end)
          window.addEventListener('pointercancel', end)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') nudge(24)
          else if (e.key === 'ArrowUp') nudge(-24)
          else return
          e.preventDefault()
        }}
        data-pane={paneId}
        // A finger's target, not a mouse's: 36px square, and it carries its own
        // background because on a phone there is no hover to reveal it with.
        className="absolute bottom-1 right-1 flex size-9 cursor-ns-resize touch-none items-center justify-center rounded-md border border-rule bg-card/85 text-ink-mute shadow-sm transition-colors hover:bg-buff-soft hover:text-ink"
      >
        {/* Two strokes across the corner: the convention for a resize grip. */}
        <svg aria-hidden="true" viewBox="0 0 12 12" className="size-4" fill="currentColor">
          <path d="M11 4 4 11h2.2L11 6.2zM11 8.4 8.4 11H11z" />
        </svg>
      </button>
    </div>
  )
}
