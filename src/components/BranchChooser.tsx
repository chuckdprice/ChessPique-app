import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MoveNode, MoveTree } from '../lib/moveTree'

interface BranchChooserProps {
  tree: MoveTree
  /** The move whose continuations are being chosen between. */
  atId: string
  /** Which of them is highlighted. */
  index: number
  onIndexChange: (index: number) => void
  onChoose: (nodeId: string) => void
  onClose: () => void
  /** Where the move sits on screen, so the list can open beneath it. */
  anchor: { left: number; bottom: number } | null
}

/**
 * Which way to go, when the position has more than one continuation.
 *
 * Stepping forward is otherwise a guess on the app's part — it would take the
 * mainline and the variations would only be reachable by clicking them in the
 * list. This asks instead, and the keys that opened it also work it: up and
 * down to move through the answers, right to take one.
 *
 * The first entry is the mainline, so pressing right twice is the same as
 * pressing it once used to be.
 */
export default function BranchChooser({
  tree,
  atId,
  index,
  onIndexChange,
  onChoose,
  onClose,
  anchor,
}: BranchChooserProps) {
  const ref = useRef<HTMLDivElement>(null)
  /**
   * The clamped position, once this has been measured.
   *
   * It has to be allowed to render at the raw anchor first: gating the render
   * on a measured position deadlocked — nothing was drawn, so there was
   * nothing to measure, so nothing was ever drawn.
   */
  const [clamped, setClamped] = useState<{ left: number; top: number } | null>(null)

  // Nudge back inside the window once the size is known, before it is painted.
  useLayoutEffect(() => {
    if (!anchor) {
      setClamped(null)
      return
    }
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setClamped({
      left: Math.max(4, Math.min(anchor.left, window.innerWidth - box.width - 4)),
      top: Math.min(anchor.bottom, window.innerHeight - box.height - 4),
    })
  }, [anchor])

  // A click anywhere else means the user is doing something else.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const node = tree.nodes.get(atId)
  const at = clamped ?? (anchor ? { left: anchor.left, top: anchor.bottom } : null)
  if (!node || node.children.length < 2 || !at) return null

  const options = node.children
    .map((id) => tree.nodes.get(id))
    .filter((child): child is MoveNode => child != null)

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label="Choose a continuation"
      style={{ left: at.left, top: at.top }}
      className="fixed z-40 min-w-28 rounded-lg border border-rule bg-card py-1 shadow-lg"
    >
      {options.map((child, i) => {
        const chosen = i === index
        return (
          <button
            key={child.id}
            type="button"
            role="option"
            aria-selected={chosen}
            onMouseEnter={() => onIndexChange(i)}
            onClick={() => onChoose(child.id)}
            className={`flex w-full items-center gap-1.5 px-2.5 py-1 text-left font-score text-sm transition-colors ${
              chosen ? 'bg-buff-soft text-ink' : 'text-ink-mute hover:bg-buff-soft/60'
            }`}
          >
            <span aria-hidden="true" className={chosen ? 'opacity-100' : 'opacity-0'}>
              →
            </span>
            <span className="min-w-0 flex-1 truncate">{child.san}</span>
            {/* The first is the game's own line; the rest are its variations. */}
            {i === 0 && <span className="shrink-0 text-[10px] text-ink-mute">main</span>}
          </button>
        )
      })}
    </div>
  )
}
