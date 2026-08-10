/**
 * The game as a tree of moves rather than a list of them.
 *
 * A repertoire is not a game: the same position has several answers worth
 * keeping, and which one is "the" line is a judgement the user changes as they
 * work. So a position's continuations are an ordered list, `children[0]` is
 * the mainline by definition, and promoting a variation is a reordering rather
 * than a rewrite.
 *
 * Everything here is immutable — each operation returns a new tree sharing the
 * nodes it did not touch. React state holds one of these, so an edit has to be
 * a new object to be seen, and the whole-game engine review keys off identity.
 */

import { Chess } from 'chess.js'
import { extractTimingFromComments, formatClockTime, humanComment } from './convert'
import type { Move } from './convert'

export interface MoveNode {
  id: string
  /** SAN of the move that reaches this node; null at the root. */
  san: string | null
  /** Squares the move went between, for the board's highlight; null at root. */
  from: string | null
  to: string | null
  /** "e2e4", "a7a8q" — what the engine wants. Null at the root. */
  uci: string | null
  /** The position this node stands for: after its move, or the start. */
  fen: string
  /** 0 at the root, 1 after White's first move. */
  ply: number
  /** Whose move this was; the root borrows the side to move in its position. */
  color: 'w' | 'b'
  /** Full move number of this move. */
  number: number
  parent: string | null
  /**
   * Continuations in preference order. The first is the mainline; the rest are
   * this position's variations, written in parentheses in that order.
   */
  children: string[]
  comment: string | null
  /** NAGs as they appeared — "$1", "$4" — kept so a round trip does not lose them. */
  nags: string[]
  emtSeconds: number | null
  anchorClockSeconds: number | null
  clkSeconds: number | null
  spentSeconds: number | null
}

export interface MoveTree {
  /** Id of the root, which holds the starting position and no move. */
  root: string
  nodes: Map<string, MoveNode>
  /** "1-0", "*", … as the file gave it. */
  result: string | null
  /** Source of the next node id; carried so ids never repeat within a tree. */
  nextId: number
}

const STARTING_FEN = new Chess().fen()

/** Whose move it is in a position, and the move number they are about to play. */
function sideAndNumber(fen: string): { color: 'w' | 'b'; number: number } {
  const parts = fen.split(' ')
  return {
    color: parts[1] === 'b' ? 'b' : 'w',
    number: parseInt(parts[5] ?? '1', 10) || 1,
  }
}

/** A tree holding nothing but a starting position. */
export function emptyTree(startFen: string = STARTING_FEN): MoveTree {
  const { color, number } = sideAndNumber(startFen)
  const root: MoveNode = {
    id: 'n0',
    san: null,
    from: null,
    to: null,
    uci: null,
    fen: startFen,
    ply: 0,
    color,
    number,
    parent: null,
    children: [],
    comment: null,
    nags: [],
    emtSeconds: null,
    anchorClockSeconds: null,
    clkSeconds: null,
    spentSeconds: null,
  }
  return { root: 'n0', nodes: new Map([['n0', root]]), result: null, nextId: 1 }
}

export function nodeOf(tree: MoveTree, id: string): MoveNode | null {
  return tree.nodes.get(id) ?? null
}

/** The tree with one node replaced, sharing every other node. */
function withNode(tree: MoveTree, node: MoveNode): MoveTree {
  const nodes = new Map(tree.nodes)
  nodes.set(node.id, node)
  return { ...tree, nodes }
}

export interface AddResult {
  tree: MoveTree
  /** The node the move reaches — an existing one when the move was already there. */
  nodeId: string
  /** False when the move was already a continuation of this position. */
  created: boolean
}

/**
 * Play a move onto a position, as a new variation or by walking into the line
 * that already holds it.
 *
 * A move that is already a continuation is not added twice: playing it just
 * moves to the node that has it, which is what makes replaying a known line
 * and branching off it the same gesture. A new move joins the end of the
 * children, so it becomes a variation and never displaces the mainline —
 * promoting is the deliberate act that does that.
 *
 * Returns null when the move is not legal in the position.
 */
export function addMove(
  tree: MoveTree,
  parentId: string,
  from: string,
  to: string,
  promotion = 'q',
): AddResult | null {
  const parent = tree.nodes.get(parentId)
  if (!parent) return null

  const chess = new Chess(parent.fen)
  let played
  try {
    played = chess.move({ from, to, promotion })
  } catch {
    return null
  }
  return attach(tree, parent, played, chess.fen())
}

/** The same, from SAN — what the PGN parser has. Null when it is not legal. */
export function addMoveSan(tree: MoveTree, parentId: string, san: string): AddResult | null {
  const parent = tree.nodes.get(parentId)
  if (!parent) return null

  const chess = new Chess(parent.fen)
  let played
  try {
    played = chess.move(san)
  } catch {
    return null
  }
  return attach(tree, parent, played, chess.fen())
}

/** What chess.js hands back for a played move — only the parts a node keeps. */
interface PlayedMove {
  san: string
  from: string
  to: string
  promotion?: string
}

function attach(tree: MoveTree, parent: MoveNode, played: PlayedMove, fen: string): AddResult {
  const { san, from, to } = played
  const existing = parent.children.find((id) => tree.nodes.get(id)?.san === san)
  if (existing) return { tree, nodeId: existing, created: false }

  const id = `n${tree.nextId}`
  const { color, number } = sideAndNumber(parent.fen)
  const node: MoveNode = {
    id,
    san,
    from,
    to,
    uci: `${from}${to}${played.promotion ?? ''}`,
    fen,
    ply: parent.ply + 1,
    color,
    number,
    parent: parent.id,
    children: [],
    comment: null,
    nags: [],
    emtSeconds: null,
    anchorClockSeconds: null,
    clkSeconds: null,
    spentSeconds: null,
  }
  const nodes = new Map(tree.nodes)
  nodes.set(id, node)
  nodes.set(parent.id, { ...parent, children: [...parent.children, id] })
  return { tree: { ...tree, nodes, nextId: tree.nextId + 1 }, nodeId: id, created: true }
}

/**
 * Remove a move and everything that followed it.
 *
 * The root cannot go — it is the starting position, not a move — so deleting
 * it is refused rather than emptying the tree by accident.
 */
export function deleteFrom(tree: MoveTree, nodeId: string): { tree: MoveTree; selectId: string } {
  const node = tree.nodes.get(nodeId)
  if (!node || node.parent == null) return { tree, selectId: tree.root }

  const nodes = new Map(tree.nodes)
  const drop = (id: string) => {
    const doomed = nodes.get(id)
    if (!doomed) return
    for (const child of doomed.children) drop(child)
    nodes.delete(id)
  }
  drop(nodeId)

  const parent = nodes.get(node.parent)
  if (parent) {
    nodes.set(parent.id, { ...parent, children: parent.children.filter((id) => id !== nodeId) })
  }
  return { tree: { ...tree, nodes }, selectId: node.parent }
}

/** Move a line one place up its siblings; at the front it is already first. */
export function promote(tree: MoveTree, nodeId: string): MoveTree {
  return reorder(tree, nodeId, -1)
}

/** Move a line one place down its siblings; at the back it is already last. */
export function demote(tree: MoveTree, nodeId: string): MoveTree {
  return reorder(tree, nodeId, 1)
}

function reorder(tree: MoveTree, nodeId: string, delta: number): MoveTree {
  const node = tree.nodes.get(nodeId)
  if (!node || node.parent == null) return tree
  const parent = tree.nodes.get(node.parent)
  if (!parent) return tree

  const at = parent.children.indexOf(nodeId)
  const to = at + delta
  if (at < 0 || to < 0 || to >= parent.children.length) return tree

  const children = [...parent.children]
  ;[children[at], children[to]] = [children[to], children[at]]
  return withNode(tree, { ...parent, children })
}

/**
 * Make a line the mainline the whole way back to the root.
 *
 * One promote only wins the argument with its immediate siblings, and a
 * variation three levels down is still a variation after it. This walks the
 * ancestry putting each step at the front, which is what "make this the main
 * line" means to someone reading the file.
 */
export function promoteToMainline(tree: MoveTree, nodeId: string): MoveTree {
  let next = tree
  let id: string | null = nodeId
  while (id) {
    const node: MoveNode | undefined = next.nodes.get(id)
    if (!node || node.parent == null) break
    const parent = next.nodes.get(node.parent)
    if (!parent) break
    if (parent.children[0] !== id) {
      const children = [id, ...parent.children.filter((c) => c !== id)]
      next = withNode(next, { ...parent, children })
    }
    id = node.parent
  }
  return next
}

/**
 * Play a run of SAN moves onto a position as one line.
 *
 * Moves that are already there are walked into rather than repeated, so a line
 * that agrees with the game for a few moves and then diverges joins it at the
 * point it diverges. An unplayable move ends the line and leaves what came
 * before it.
 *
 * This is how the engine's recommendations become part of the tree: they were
 * text under a move, which could be read but not walked.
 */
export function addLine(tree: MoveTree, parentId: string, sans: string[]): MoveTree {
  let next = tree
  let at = parentId
  for (const san of sans) {
    const added = addMoveSan(next, at, san)
    if (!added) break
    next = added.tree
    at = added.nodeId
  }
  return next
}

/** Replace a node's comment, which is edited apart from the move itself. */
export function setComment(tree: MoveTree, nodeId: string, comment: string): MoveTree {
  const node = tree.nodes.get(nodeId)
  if (!node) return tree
  return withNode(tree, { ...node, comment: comment.trim() ? comment : null })
}

/** The nodes from the root's first move down the mainline, in order. */
export function mainline(tree: MoveTree): MoveNode[] {
  const line: MoveNode[] = []
  let id: string | undefined = tree.nodes.get(tree.root)?.children[0]
  while (id) {
    const node: MoveNode | undefined = tree.nodes.get(id)
    if (!node) break
    line.push(node)
    id = node.children[0]
  }
  return line
}

/** The moves that reach a node, root first. Empty for the root itself. */
export function lineTo(tree: MoveTree, nodeId: string): MoveNode[] {
  const line: MoveNode[] = []
  let id: string | null = nodeId
  while (id) {
    const node: MoveNode | undefined = tree.nodes.get(id)
    if (!node || node.parent == null) break
    line.unshift(node)
    id = node.parent
  }
  return line
}

/** True when every step from the root to here is a first child. */
export function isMainline(tree: MoveTree, nodeId: string): boolean {
  let id: string | null = nodeId
  while (id) {
    const node: MoveNode | undefined = tree.nodes.get(id)
    if (!node || node.parent == null) return true
    if (tree.nodes.get(node.parent)?.children[0] !== id) return false
    id = node.parent
  }
  return true
}

/**
 * Stepping about the tree, which is what the arrow keys and the nav buttons do.
 *
 * Back is the move before, forward is this line's own continuation rather than
 * the mainline's: once the board is inside a variation, stepping through it is
 * the whole point, and jumping back out at every press would make a variation
 * unreadable.
 */
export function previousId(tree: MoveTree, nodeId: string): string {
  return tree.nodes.get(nodeId)?.parent ?? tree.root
}

export function nextId(tree: MoveTree, nodeId: string): string | null {
  return tree.nodes.get(nodeId)?.children[0] ?? null
}

/** The last move of the line this node sits on. */
export function lineEndId(tree: MoveTree, nodeId: string): string {
  let id = nodeId
  for (;;) {
    const next = tree.nodes.get(id)?.children[0]
    if (!next) return id
    id = next
  }
}

/** Positions down the mainline; [0] is the start, like ReplayedGame's fens. */
export function mainlineFens(tree: MoveTree): string[] {
  const start = tree.nodes.get(tree.root)?.fen
  return [start ?? STARTING_FEN, ...mainline(tree).map((n) => n.fen)]
}

/** UCI of every mainline move, in order — what the engine review is given. */
export function mainlineUcis(tree: MoveTree): string[] {
  return mainline(tree).map((n) => n.uci ?? '')
}

/** The mainline node at a ply, or the root at 0. Null past the end. */
export function nodeAtMainlinePly(tree: MoveTree, ply: number): MoveNode | null {
  if (ply <= 0) return tree.nodes.get(tree.root) ?? null
  return mainline(tree)[ply - 1] ?? null
}

/**
 * How far down the mainline a node sits.
 *
 * A node in a variation has no ply of its own — nothing in the review or the
 * charts is about it — so it reports the last mainline position it passed
 * through, which is the branch point its line hangs off.
 */
export function mainlinePlyOf(tree: MoveTree, nodeId: string): number {
  let id: string | null = nodeId
  while (id) {
    const node: MoveNode | undefined = tree.nodes.get(id)
    if (!node) return 0
    if (node.parent == null) return 0
    if (isMainline(tree, id)) return node.ply
    id = node.parent
  }
  return 0
}

/**
 * Copy the converter's timings onto the mainline.
 *
 * The clock work happens on a flat list — running clocks only mean anything
 * along one line — so the tree is parsed from the same movetext and then told
 * what that pass worked out. They agree move for move by construction; the
 * length guard is for a file whose mainline the two read differently, where
 * writing timings past that point would attach them to the wrong moves.
 */
export function applyMainlineTiming(tree: MoveTree, moves: Move[]): MoveTree {
  const line = mainline(tree)
  const count = Math.min(line.length, moves.length)
  if (count === 0) return tree

  const nodes = new Map(tree.nodes)
  for (let i = 0; i < count; i++) {
    const node = line[i]
    const move = moves[i]
    nodes.set(node.id, {
      ...node,
      emtSeconds: move.emtSeconds,
      anchorClockSeconds: move.anchorClockSeconds,
      clkSeconds: move.clkSeconds,
      spentSeconds: move.spentSeconds,
    })
  }
  return { ...tree, nodes }
}

/**
 * The mainline in the flat shape the converter and the engine review use.
 *
 * The bridge between the tree and everything written before it: those parts
 * read a game as a list, and the mainline is that list.
 */
export function mainlineMoves(tree: MoveTree): Move[] {
  return mainline(tree).map((node) => ({
    number: node.number,
    color: node.color,
    san: node.san ?? '',
    emtSeconds: node.emtSeconds,
    anchorClockSeconds: node.anchorClockSeconds,
    clkSeconds: node.clkSeconds,
    spentSeconds: node.spentSeconds,
    comment: node.comment,
  }))
}

// ---------------------------------------------------------------------------
// PGN movetext
// ---------------------------------------------------------------------------

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*'])
const MOVE_NUMBER_RE = /^\d+\.(\.\.)?$/
/**
 * Parens are their own tokens here, unlike the flat parser's tokenizer.
 *
 * That one splits on whitespace, so "(1... c5)" arrives as "(1..." and "c5)"
 * and it can only count brackets to know it should skip them. A tree has to
 * know exactly where a variation opens and closes, so they are separated.
 */
const TOKEN_RE = /\{[^}]*\}|[()]|\$\d+|[^\s()]+/g

export interface ParsedTree {
  tree: MoveTree
  /** Moves that would not play, named so the user can find them in the file. */
  warnings: string[]
}

/**
 * Read movetext into a tree, variations and all.
 *
 * Move numbers in the file are ignored: the position knows whose move it is
 * and what number it is, and a file that disagrees with itself is better read
 * by the board than by its own bookkeeping.
 *
 * An illegal move ends the line it is in rather than the whole parse. A
 * repertoire with one bad move in one variation should open with a complaint,
 * not refuse to open.
 */
export function parseMoveTree(movetext: string, startFen: string = STARTING_FEN): ParsedTree {
  let tree = emptyTree(startFen)
  const warnings: string[] = []
  const tokens = movetext.match(TOKEN_RE) ?? []

  let current = tree.root
  // Where to come back to when a variation closes: the move it is an
  // alternative to, so the line resumes from there.
  const resume: string[] = []
  // Comments seen before the variation they belong to has a move to hang on.
  let pending: string[] = []
  // True between "(" and the variation's first move, when there is nothing yet
  // for a comment to annotate — "( {the Sicilian} 1... c5 )" means the note to
  // belong to c5, not to the move the variation departs from.
  let awaitingFirstMove = false
  // Set while a line is being skipped because one of its moves would not play.
  // Counts the parentheses still to close before the position is trusted again.
  let broken = 0

  const flushInto = (nodeId: string) => {
    if (pending.length === 0) return
    const node = tree.nodes.get(nodeId)
    if (node) {
      const { emtSeconds, anchorClockSeconds } = extractTimingFromComments(pending)
      const prose = humanComment(pending)
      tree = withNode(tree, {
        ...node,
        comment: [node.comment, prose].filter(Boolean).join(' ') || null,
        emtSeconds: emtSeconds ?? node.emtSeconds,
        anchorClockSeconds: anchorClockSeconds ?? node.anchorClockSeconds,
      })
    }
    pending = []
  }

  for (const token of tokens) {
    if (token === '(') {
      resume.push(current)
      if (broken > 0) {
        // Already inside a line that failed; keep the nesting balanced but
        // do not try to place anything.
        broken += 1
        continue
      }
      const node = tree.nodes.get(current)
      // A variation is an alternative to the move just played, so it starts
      // from that move's parent. One opening at the root has nowhere to go.
      if (!node || node.parent == null) {
        broken = 1
        continue
      }
      flushInto(current)
      current = node.parent
      awaitingFirstMove = true
      continue
    }

    if (token === ')') {
      if (broken > 0) broken -= 1
      else flushInto(current)
      current = resume.pop() ?? tree.root
      awaitingFirstMove = false
      continue
    }

    if (broken > 0) continue

    if (token.startsWith('{') && token.endsWith('}')) {
      pending.push(token)
      // A comment follows the move it annotates, which is already `current` —
      // or, before any move has been played, the game itself, which is the
      // root. Only a variation's opening comment has to wait.
      if (!awaitingFirstMove) flushInto(current)
      continue
    }

    if (token.startsWith('$')) {
      const node = tree.nodes.get(current)
      if (node && node.parent != null) {
        tree = withNode(tree, { ...node, nags: [...node.nags, token] })
      }
      continue
    }

    if (MOVE_NUMBER_RE.test(token)) continue

    if (RESULT_TOKENS.has(token)) {
      // A result inside parentheses is not the game's; only the outermost one
      // says how it finished.
      if (resume.length === 0) tree = { ...tree, result: token }
      continue
    }

    const added = addMoveSan(tree, current, token)
    if (!added) {
      const { color, number } = sideAndNumber(tree.nodes.get(current)?.fen ?? startFen)
      warnings.push(`Skipped an unplayable move: ${number}${color === 'w' ? '.' : '...'} ${token}`)
      // Abandon this line but keep reading: the parens still have to balance.
      broken = 1
      pending = []
      continue
    }
    tree = added.tree
    current = added.nodeId
    awaitingFirstMove = false
    flushInto(current)
  }

  flushInto(current)
  return { tree, warnings }
}

export interface TreeMovetextOptions {
  /** Carry each move's own comment through to the output. */
  comments?: boolean
  /** Write the [%clk ...] comments. Default true. */
  clocks?: boolean
  /**
   * Write the game's own variations. Default true — they are part of the game,
   * not an annotation of it. Off writes the mainline alone, which is what a
   * reader who only wants the moves as played is asking for.
   */
  variations?: boolean
  /** Formatted %eval values by node id, as produced by formatEvalTag. */
  evals?: Map<string, string>
  /** The engine's verdict on a move, written as a comment of its own. */
  notes?: Map<string, string>
  /** Where to wrap. PGN allows any whitespace; readers expect short lines. */
  columns?: number
}

/**
 * Write a tree back out as movetext, variations in parentheses.
 *
 * The number before a move is not decoration: a reader coming out of a
 * variation has to be told whose move it is again, so Black's moves carry
 * "12..." whenever they are not simply following White's.
 */
export function formatTreeMovetext(
  tree: MoveTree,
  options: TreeMovetextOptions = {},
): string {
  const { nodes } = tree

  const annotated = (node: MoveNode): string => {
    const commands: string[] = []
    const evalText = options.evals?.get(node.id)
    if (evalText) commands.push(`[%eval ${evalText}]`)
    if (options.clocks !== false && node.clkSeconds != null) {
      commands.push(`[%clk ${formatClockTime(node.clkSeconds)}]`)
    }
    // Braces inside a comment would close it early and corrupt the file.
    const prose = options.comments && node.comment ? node.comment.replace(/[{}]/g, '') : ''
    const inner = [commands.join(' '), prose].filter(Boolean).join(' ')

    const parts = [node.san ?? '']
    if (node.nags.length > 0) parts.push(node.nags.join(' '))
    if (inner) parts.push(`{${inner}}`)
    const note = options.notes?.get(node.id)
    if (note) parts.push(`{${note.replace(/[{}]/g, '')}}`)
    return parts.join(' ')
  }

  /**
   * One line and everything hanging off it, as a flat run of tokens.
   *
   * Alternatives are expanded only by the first child, so `A (B) (C)` comes
   * out as three siblings rather than C nested inside B's parentheses.
   */
  const writeLine = (startId: string, startsFresh: boolean): string[] => {
    const out: string[] = []
    let id: string | undefined = startId
    let fresh = startsFresh
    while (id) {
      const node: MoveNode | undefined = nodes.get(id)
      if (!node || node.parent == null) break
      const parent = nodes.get(node.parent)
      if (!parent) break

      if (node.color === 'w') out.push(`${node.number}.`)
      else if (fresh) out.push(`${node.number}...`)
      out.push(annotated(node))
      fresh = false

      if (
        options.variations !== false &&
        parent.children[0] === id &&
        parent.children.length > 1
      ) {
        for (const altId of parent.children.slice(1)) {
          const inner = writeLine(altId, true)
          if (inner.length === 0) continue
          // The brackets ride on the tokens either side rather than standing
          // alone, so a long variation still breaks across lines: pushed whole
          // it would be one unbreakable token, and a repertoire's main line
          // ran to several hundred characters.
          inner[0] = `(${inner[0]}`
          inner[inner.length - 1] = `${inner[inner.length - 1]})`
          out.push(...inner)
        }
        // Whatever follows the parentheses has to name itself again.
        fresh = true
      }

      id = node.children[0]
    }
    return out
  }

  const root = nodes.get(tree.root)
  const first = root?.children[0]
  const tokens = first ? writeLine(first, true) : []
  if (root?.comment && options.comments) tokens.unshift(`{${root.comment.replace(/[{}]/g, '')}}`)
  if (tree.result) tokens.push(tree.result)

  // Greedy wrap: a token is never split, so a long comment simply owns its line.
  const columns = options.columns ?? 80
  const lines: string[] = []
  let line = ''
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > columns) {
      lines.push(line)
      line = token
    } else {
      line = line ? `${line} ${token}` : token
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}
