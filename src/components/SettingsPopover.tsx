import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
    top: number
    maxHeight?: number
  }>()

  /**
   * Where it fits, measured rather than guessed.
   *
   * The old rule compared the room below the button against a constant and
   * flipped above when it lost. That works only while every panel is about the
   * same height: the board menu grew to six switches in two groups, cleared the
   * constant with room to spare, and still ran off the bottom of the window —
   * which is exactly what a rule that never looks at the panel cannot see. So
   * the panel is rendered hidden first, its real height read off it, and the
   * placement worked out from that: below if it fits, above if that fits
   * better, and otherwise pushed up the window as far as it needs to go.
   */
  const measure = useCallback(() => {
    const put = (next: { left: number; top: number; maxHeight?: number }) =>
      setPlace((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      )

    const rect = anchor.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!rect || !panel) return
    // A viewport of no size is a pane that has stopped painting, not a small
    // one; with nothing to clamp against, the button's own edge is the honest
    // answer. The same guard as showPreview, for the same reason.
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const left =
      vw > 0
        ? Math.max(PANEL_GAP, Math.min(rect.right - PANEL_WIDTH, vw - PANEL_WIDTH - PANEL_GAP))
        : rect.right - PANEL_WIDTH

    if (vh <= 0) {
      put({ left, top: rect.bottom + PANEL_GAP })
      return
    }

    // scrollHeight, not offsetHeight: a previous placement may have capped this
    // panel with a maxHeight, and measuring the capped box would make the cap
    // permanent.
    const height = panel.scrollHeight
    const below = vh - rect.bottom - PANEL_GAP
    const above = rect.top - PANEL_GAP

    if (height <= below) {
      put({ left, top: rect.bottom + PANEL_GAP })
      return
    }
    if (height <= above) {
      put({ left, top: rect.top - PANEL_GAP - height })
      return
    }
    // Taller than either side: sit it as low as it can go while still ending
    // inside the window, and only then allow it to scroll.
    const maxHeight = vh - PANEL_GAP * 2
    put({
      left,
      top: Math.max(
        PANEL_GAP,
        Math.min(rect.bottom + PANEL_GAP, vh - PANEL_GAP - Math.min(height, maxHeight)),
      ),
      maxHeight,
    })
  }, [anchor])

  /**
   * Re-measure when the panel's own height changes.
   *
   * Which it does while it is open: a switch turned off takes the two nested
   * under it away, and a panel placed for the taller version then floats. A
   * dependency on `children` would do this too and would also re-run on every
   * render of the parent — placing, re-rendering, placing again.
   */
  useLayoutEffect(() => {
    measure()
    const panel = panelRef.current
    if (!panel || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(panel)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

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

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      style={{
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        width: PANEL_WIDTH,
        maxHeight: place?.maxHeight,
        // The measuring pass: laid out at full height so it can be measured,
        // and kept off the screen until there is somewhere to put it.
        visibility: place ? undefined : 'hidden',
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
