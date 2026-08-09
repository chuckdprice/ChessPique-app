import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isMainline } from '../lib/moveTree'
import type { MoveTree } from '../lib/moveTree'

interface MoveMenuProps {
  tree: MoveTree
  /** The move the menu is about. */
  nodeId: string
  /** Where the press landed, in client coordinates. */
  x: number
  y: number
  onClose: () => void
  onPromote: (nodeId: string, toMainline: boolean) => void
  onDemote: (nodeId: string) => void
  onDelete: (nodeId: string) => void
}

/**
 * What can be done to a line, at the move it is asked about.
 *
 * Positioned where the press landed rather than anchored to the move: the move
 * list scrolls, and a menu pinned to a row that scrolls under it is worse than
 * one that simply sits where the pointer is.
 */
export default function MoveMenu({
  tree,
  nodeId,
  x,
  y,
  onClose,
  onPromote,
  onDemote,
  onDelete,
}: MoveMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ x, y })

  // Nudge back inside the window once the size is known. Measured after layout
  // and before paint, so the menu is never seen hanging off the edge.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setAt({
      x: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
    })
  }, [x, y])

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const node = tree.nodes.get(nodeId)
  if (!node || node.parent == null) return null
  const parent = tree.nodes.get(node.parent)
  const siblings = parent?.children ?? []
  const index = siblings.indexOf(nodeId)
  const onTheMainline = isMainline(tree, nodeId)

  const item =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

  const run = (action: () => void) => () => {
    action()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        aria-label={`Line at ${node.number}${node.color === 'w' ? '.' : '…'} ${node.san}`}
        style={{ left: at.x, top: at.y }}
        className="absolute w-52 rounded-lg border border-rule bg-card p-1 shadow-lg outline-none"
      >
        <p className="px-2 py-1 font-score text-xs text-ink-mute">
          {node.number}
          {node.color === 'w' ? '.' : '…'} {node.san}
        </p>

        <button
          type="button"
          role="menuitem"
          className={item}
          disabled={index <= 0}
          onClick={run(() => onPromote(nodeId, false))}
        >
          Promote
          <span className="ml-auto text-[11px] text-ink-mute">up one</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={item}
          disabled={onTheMainline}
          onClick={run(() => onPromote(nodeId, true))}
        >
          Promote to mainline
        </button>
        <button
          type="button"
          role="menuitem"
          className={item}
          disabled={index < 0 || index >= siblings.length - 1}
          onClick={run(() => onDemote(nodeId))}
        >
          Demote
          <span className="ml-auto text-[11px] text-ink-mute">down one</span>
        </button>

        <div className="my-1 border-t border-rule" />

        <button
          type="button"
          role="menuitem"
          className={`${item} text-[color:var(--accent-bright)]`}
          onClick={run(() => onDelete(nodeId))}
        >
          Delete from here
          <span className="ml-auto text-[11px] text-ink-mute">and after</span>
        </button>
      </div>
    </div>
  )
}
