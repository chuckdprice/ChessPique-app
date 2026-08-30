import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'

interface SettingsPopoverProps {
  /** The button this hangs off, which is what it is positioned against. */
  anchor: RefObject<HTMLElement | null>
  title: string
  onClose: () => void
  children: ReactNode
}

const PANEL_WIDTH = 288
const PANEL_GAP = 8
/** Below this, hanging downwards is worse than flipping above the button. */
const MIN_PANEL_HEIGHT = 260

/**
 * A settings panel hung off a button in the page chrome.
 *
 * Drawn through the body rather than as a child of the button. As an
 * absolutely-positioned child it was clipped by the side column, which is
 * overflow-hidden from sm up: the last rows simply could not be reached, and
 * adding a sixth made that obvious. Same escape the hover preview takes.
 *
 * Shared by the two menus so that they agree on placement and on how they are
 * dismissed — which is by clicking anywhere else, the thing every other menu on
 * the web does and the reason this was pulled out of the engine panel.
 */
export default function SettingsPopover({
  anchor,
  title,
  onClose,
  children,
}: SettingsPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{
    left: number
    top?: number
    bottom?: number
    maxHeight?: number
  }>()

  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    // A viewport of no size is a pane that has stopped painting, not a small
    // one; with nothing to clamp against, the button's own edge is the honest
    // answer. The same guard as showPreview, for the same reason.
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const left =
      vw > 0
        ? Math.max(PANEL_GAP, Math.min(rect.right - PANEL_WIDTH, vw - PANEL_WIDTH - PANEL_GAP))
        : rect.right - PANEL_WIDTH

    // Below the button unless there is more room above it. The chart pane's
    // gear sits at the bottom of the page, where hanging downwards left the
    // panel 160px tall and scrolling — the same panel opens upward there with
    // the whole page to use.
    const below = vh > 0 ? vh - rect.bottom - PANEL_GAP : Infinity
    const above = rect.top - PANEL_GAP
    if (vh > 0 && below < MIN_PANEL_HEIGHT && above > below) {
      setPlace({ left, bottom: vh - rect.top + PANEL_GAP, maxHeight: Math.max(120, above) })
      return
    }
    setPlace({
      left,
      top: rect.bottom + PANEL_GAP,
      maxHeight: vh > 0 ? Math.max(MIN_PANEL_HEIGHT, below) : undefined,
    })
  }, [anchor])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target || panelRef.current?.contains(target)) return
      // The button that opened it is not "off the menu": its own click toggles
      // the panel shut, and closing here as well would close and immediately
      // reopen, so a second press on the gear would look like it did nothing.
      if (anchor.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  if (!place) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      style={{
        left: place.left,
        top: place.top,
        bottom: place.bottom,
        width: PANEL_WIDTH,
        maxHeight: place.maxHeight,
      }}
      className="fixed z-50 overflow-y-auto rounded-xl border border-rule bg-card p-4 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {/* Kept beside the click-away: on a phone the panel can cover most of
            the screen, and a button that is unmistakably "close" is worth its
            corner. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="rounded-md px-2 py-0.5 text-ink-mute hover:bg-buff-soft hover:text-ink"
        >
          ×
        </button>
      </div>
      <div className="mt-3 space-y-4">{children}</div>
    </div>,
    document.body,
  )
}
