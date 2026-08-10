import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_SYMBOL,
  hasMoveMarker,
  NEEDS_ADVICE,
} from '../lib/engine/analysis'
import type { GameAnalysis, MoveAnalysis, RefinedEval } from '../lib/engine/analysis'
import { formatScore } from '../lib/engine/uci'
import type { Score } from '../lib/engine/uci'
import { mainline } from '../lib/moveTree'
import type { MoveNode, MoveTree } from '../lib/moveTree'
import BranchChooser from './BranchChooser'
import { classColor } from './ClassBadge'
import MoveMenu from './MoveMenu'

interface MoveTableProps {
  tree: MoveTree
  /** The node the board is showing. */
  currentId: string
  onNavigate: (nodeId: string) => void
  analysis: GameAnalysis | null
  /** Evals the live engine has searched deeper than the review did, by node. */
  deeperEvals: Map<string, RefinedEval>
  onPromote: (nodeId: string, toMainline: boolean) => void
  onDemote: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  /** Open when stepping forward has more than one continuation to offer. */
  branch: { atId: string; index: number } | null
  onBranchIndexChange: (index: number) => void
  onBranchChoose: (nodeId: string) => void
  onBranchClose: () => void
}

interface Row {
  number: number
  white: MoveNode | null
  black: MoveNode | null
}

export default function MoveTable({
  tree,
  currentId,
  onNavigate,
  analysis,
  deeperEvals,
  onPromote,
  onDemote,
  onDelete,
  branch,
  onBranchIndexChange,
  onBranchChoose,
  onBranchClose,
}: MoveTableProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)
  /** The move whose menu is open, and where to draw it. */
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  /** Where to hang the branch chooser: under the move the board is on. */
  const [branchAnchor, setBranchAnchor] = useState<{ left: number; bottom: number } | null>(null)

  /** Rows of the game kept visible above the current move. */
  const CONTEXT_ROWS = 2

  /**
   * Keep the current move in view by scrolling the list itself.
   *
   * scrollIntoView would be shorter, but it scrolls whichever ancestor happens
   * to be scrollable — on a phone that is the page, so stepping through the
   * game dragged the board off the top of the screen. Setting scrollTop can
   * only ever move this list, and does nothing when it is not scrollable.
   */
  useEffect(() => {
    const list = listRef.current
    const current = currentRef.current
    if (!list || !current) return

    // Rects, not offsetTop: the move sits inside a table cell, so its
    // offsetParent is that cell rather than this list and offsetTop measures
    // from the wrong origin.
    const listBox = list.getBoundingClientRect()
    const moveBox = current.getBoundingClientRect()

    // Park the move near the top with a couple of rows of the game still above
    // it, rather than only nudging it barely into view. Stepping forward then
    // advances the list a row at a time and what comes next is already on
    // screen. Clamping is left to the browser: at the start of the game there
    // is nothing above to show, and at the end nothing below.
    const target = list.scrollTop + (moveBox.top - listBox.top) - CONTEXT_ROWS * moveBox.height
    list.scrollTop = Math.max(0, target)
  }, [currentId])

  // Measured when the chooser opens rather than at render: the move is a
  // button inside a table cell, so only its rect gives a usable position.
  const branchAt = branch?.atId ?? null
  useLayoutEffect(() => {
    if (!branchAt) {
      setBranchAnchor(null)
      return
    }
    // At the starting position there is no move to hang it on, so it goes
    // under the top of the list instead.
    const box = (currentRef.current ?? listRef.current)?.getBoundingClientRect()
    setBranchAnchor(box ? { left: box.left, bottom: box.bottom + 2 } : null)
  }, [branchAt])

  const line = mainline(tree)
  const rows: Row[] = []
  for (const node of line) {
    let row = rows[rows.length - 1]
    if (!row || row.number !== node.number || (node.color === 'w' && row.white)) {
      row = { number: node.number, white: null, black: null }
      rows.push(row)
    }
    if (node.color === 'w') row.white = node
    else row.black = node
  }

  /**
   * Only the mainline was reviewed, so only it has a grade or an evaluation.
   *
   * The guard belongs here rather than at each call: the review is indexed by
   * ply, and a variation move has a ply too — it would quietly borrow the
   * verdict on whatever the mainline played at the same depth.
   */
  const analysisFor = (node: MoveNode | null): MoveAnalysis | null =>
    node && isOnMainline(tree, node) ? (analysis?.moves[node.ply - 1] ?? null) : null

  /**
   * The evaluation to print after a move, and the depth behind it.
   *
   * The live engine's number wins where it has one: standing on a position with
   * the engine on out-searches the review's fixed depth within seconds, and
   * leaving the shallower number here would have the move list contradicting
   * the engine panel directly above it.
   */
  const evalFor = (node: MoveNode | null): { score: Score; depth: number | null } | null => {
    if (!node) return null
    const deeper = deeperEvals.get(node.id)
    const reviewed = analysisFor(node)
    const score = deeper?.score ?? reviewed?.scoreAfter
    if (!score) return null
    // Infinity marks a terminal position, which was never searched at all.
    const depth = deeper?.depth ?? (reviewed ? analysis?.evalDepths[node.ply] : undefined)
    return { score, depth: depth != null && Number.isFinite(depth) ? depth : null }
  }

  /**
   * Hover text carried by *both* halves of a move — the move itself and its
   * number — so a number that changes under you can explain itself.
   */
  const evalTitle = (node: MoveNode | null): string | undefined => {
    const shown = evalFor(node)
    if (!shown || shown.depth == null) return undefined
    return `depth ${shown.depth}`
  }

  /** Right-click, or a long press, opens the menu over the move it names. */
  const menuHandlers = (nodeId: string) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      setMenu({ nodeId, x: e.clientX, y: e.clientY })
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const { clientX: x, clientY: y } = e
      const timer = window.setTimeout(() => setMenu({ nodeId, x, y }), 500)
      const cancel = () => {
        clearTimeout(timer)
        window.removeEventListener('pointerup', cancel)
        window.removeEventListener('pointermove', cancel)
      }
      window.addEventListener('pointerup', cancel)
      window.addEventListener('pointermove', cancel)
    },
  })

  const moveButton = (node: MoveNode, small = false) => {
    const current = node.id === currentId
    const info = analysisFor(node)
    // Only a classification that earns a marker earns a colour. Good and
    // Excellent cover most of a game between them, and colouring those left
    // the few moves worth finding competing with a wall of green.
    const color =
      info && hasMoveMarker(info.classification) ? classColor(info.classification) : undefined
    return (
      <button
        type="button"
        ref={current ? currentRef : undefined}
        onClick={() => onNavigate(node.id)}
        aria-current={current ? 'true' : undefined}
        title={evalTitle(node)}
        {...menuHandlers(node.id)}
        className={`rounded font-score transition-colors ${
          small ? 'px-1 py-0 text-xs' : 'w-full px-2 py-0.5 text-left text-sm'
        } ${current ? 'bg-felt text-buff' : 'hover:bg-buff-soft'}`}
        style={current ? undefined : { color }}
      >
        {node.san}
        {info && hasMoveMarker(info.classification) && (
          <span className="ml-1 text-[10px] font-bold" aria-hidden="true">
            {CLASSIFICATION_SYMBOL[info.classification]}
          </span>
        )}
      </button>
    )
  }

  const moveCell = (node: MoveNode | null) => {
    if (!node) return <td className="px-2 text-ink-mute">…</td>
    return <td className="py-0.5 pr-1">{moveButton(node)}</td>
  }

  /** Evaluation after the move, in one muted colour regardless of value. */
  const evalCell = (node: MoveNode | null) => {
    const shown = evalFor(node)
    return (
      <td
        title={evalTitle(node)}
        className="py-0.5 pr-2 text-right font-score text-xs text-ink-mute tabular-nums"
      >
        {shown ? formatScore(shown.score) : ''}
      </td>
    )
  }

  /**
   * A variation as running text, the way a book prints one.
   *
   * Not a table of its own: a line three levels deep would need three nested
   * tables to keep its columns, and what a reader wants from a variation is to
   * read it, not to compare its evaluations column by column.
   */
  const variationLine = (startId: string): React.ReactNode => {
    const out: React.ReactNode[] = []
    let id: string | undefined = startId
    let fresh = true
    while (id) {
      const node: MoveNode | undefined = tree.nodes.get(id)
      if (!node || node.parent == null) break
      const parent = tree.nodes.get(node.parent)
      if (!parent) break

      if (node.color === 'w') {
        out.push(
          <span key={`${node.id}-n`} className="text-ink-mute">
            {node.number}.
          </span>,
        )
      } else if (fresh) {
        out.push(
          <span key={`${node.id}-n`} className="text-ink-mute">
            {node.number}…
          </span>,
        )
      }
      out.push(<Fragment key={node.id}>{moveButton(node, true)}</Fragment>)
      fresh = false

      if (parent.children[0] === id && parent.children.length > 1) {
        for (const altId of parent.children.slice(1)) {
          out.push(
            <span key={`${altId}-alt`} className="text-ink-mute">
              ({variationLine(altId)})
            </span>,
          )
        }
        fresh = true
      }

      if (node.comment) {
        out.push(
          <span key={`${node.id}-c`} className="italic text-ink-mute">
            {node.comment}
          </span>,
        )
        fresh = true
      }

      id = node.children[0]
    }
    return <span className="inline-flex flex-wrap items-baseline gap-x-1">{out}</span>
  }

  /** The alternatives to a mainline move, each on its own indented line. */
  const variationRows = (node: MoveNode | null) => {
    if (!node?.parent) return []
    const parent = tree.nodes.get(node.parent)
    if (!parent || parent.children[0] !== node.id || parent.children.length < 2) return []
    return parent.children.slice(1).map((altId) => (
      <tr key={`var-${altId}`}>
        <td />
        <td colSpan={4} className="pb-1 pr-2">
          <div className="rounded-r border-l-[3px] border-accent-bright/50 bg-accent-bright/5 px-2 py-0.5 text-[11px] leading-relaxed">
            {variationLine(altId)}
          </div>
        </td>
      </tr>
    ))
  }

  /** The annotator's own words for a move, shown under it. */
  const commentRow = (node: MoveNode) => (
    <tr key={`comment-${node.id}`}>
      <td />
      <td colSpan={4} className="pb-1 pr-2">
        <button
          type="button"
          onClick={() => onNavigate(node.id)}
          className="block w-full rounded-r border-l-[3px] border-rule bg-buff-soft/40 px-2 py-0.5 text-left text-[11px] italic text-ink-mute transition-opacity hover:opacity-80"
        >
          {node.comment}
        </button>
      </td>
    </tr>
  )

  /**
   * "Inaccuracy. c4 was best." beneath a flagged move.
   *
   * The line the engine had in mind used to be printed under this as text.
   * It is a variation of the move now, so it appears with the others below —
   * saying it twice, once unwalkable, helped nobody.
   */
  const adviceRow = (node: MoveNode, info: MoveAnalysis) => {
    const color = classColor(info.classification)
    return (
      <tr key={`advice-${node.id}`}>
        <td />
        <td colSpan={4} className="pb-1 pr-2">
          <button
            type="button"
            onClick={() => onNavigate(node.id)}
            className="block w-full rounded-r border-l-[3px] px-2 py-0.5 text-left text-[11px] transition-opacity hover:opacity-80"
            style={{
              borderColor: color,
              color,
              backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
            }}
          >
            {CLASSIFICATION_LABEL[info.classification]}.
            {info.bestMoveSan ? (
              <>
                {' '}
                <span className="font-score font-semibold">{info.bestMoveSan}</span> was best.
              </>
            ) : null}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <section
      aria-label="Moves"
      className="flex max-h-80 min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-rule bg-card shadow-sm sm:max-h-none"
    >
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-1 pt-2">
        <table className="w-full border-collapse">
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-12" />
            <col />
            <col className="w-12" />
          </colgroup>
          <tbody>
            {rows.map((row) => {
              const under: React.ReactNode[] = []
              // For each half of the row: the annotator's words, then the
              // engine's verdict on the same move, then the alternatives to
              // it. Whoever wrote the note said it about the move, not about
              // the engine's opinion of it.
              for (const node of [row.white, row.black]) {
                if (!node) continue
                if (node.comment) under.push(commentRow(node))
                const info = analysisFor(node)
                if (info && NEEDS_ADVICE.includes(info.classification)) {
                  under.push(adviceRow(node, info))
                }
                under.push(...variationRows(node))
              }
              return (
                <Fragment key={row.white?.id ?? row.black?.id ?? row.number}>
                  <tr className="border-t border-rule/60">
                    <td className="px-1 py-0.5 text-right font-score text-xs text-ink-mute">
                      {row.number}.
                    </td>
                    {moveCell(row.white)}
                    {evalCell(row.white)}
                    {moveCell(row.black)}
                    {evalCell(row.black)}
                  </tr>
                  {under}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {tree.result && (
          <p className="border-t border-rule/60 px-2 py-2 text-center font-score text-sm font-semibold">
            {tree.result}
          </p>
        )}
      </div>

      {branch && (
        <BranchChooser
          tree={tree}
          atId={branch.atId}
          index={branch.index}
          onIndexChange={onBranchIndexChange}
          onChoose={onBranchChoose}
          onClose={onBranchClose}
          anchor={branchAnchor}
        />
      )}

      {menu && (
        <MoveMenu
          tree={tree}
          nodeId={menu.nodeId}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onPromote={onPromote}
          onDemote={onDemote}
          onDelete={onDelete}
        />
      )}
    </section>
  )
}

/** Whether a node is on the mainline, without walking the tree twice per move. */
function isOnMainline(tree: MoveTree, node: MoveNode): boolean {
  let id: string | null = node.id
  while (id) {
    const at: MoveNode | undefined = tree.nodes.get(id)
    if (!at || at.parent == null) return true
    if (tree.nodes.get(at.parent)?.children[0] !== id) return false
    id = at.parent
  }
  return true
}
