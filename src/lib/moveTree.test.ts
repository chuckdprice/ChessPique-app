import { describe, expect, it } from 'vitest'
import {
  addLine,
  addMove,
  addMoveSan,
  applyMainlineTiming,
  deleteFrom,
  demote,
  emptyTree,
  formatTreeMovetext,
  isMainline,
  lineEndId,
  lineTo,
  mainline,
  mainlineFens,
  mainlineMoves,
  mainlineUcis,
  mainlinePlyOf,
  nextId,
  nodeAtMainlinePly,
  nodeOf,
  parseMoveTree,
  previousId,
  promote,
  promoteToMainline,
  setComment,
} from './moveTree'
import type { MoveTree } from './moveTree'

/** Play SAN moves down one line, returning the tree and the last node. */
function play(tree: MoveTree, sans: string[], fromId?: string) {
  let id = fromId ?? tree.root
  let next = tree
  for (const san of sans) {
    const added = addMoveSan(next, id, san)
    if (!added) throw new Error(`illegal in test: ${san}`)
    next = added.tree
    id = added.nodeId
  }
  return { tree: next, id }
}

/** SANs of the mainline, which is what most of these assertions are about. */
const sans = (tree: MoveTree) => mainline(tree).map((n) => n.san)

/** The movetext for a tree on one line, so assertions can be whole strings. */
const text = (tree: MoveTree) => formatTreeMovetext(tree, { comments: true, columns: 200 })

describe('building a tree by hand', () => {
  it('starts with nothing but a position', () => {
    const tree = emptyTree()
    expect(mainline(tree)).toEqual([])
    expect(nodeOf(tree, tree.root)?.ply).toBe(0)
    expect(nodeOf(tree, tree.root)?.fen).toContain('w KQkq')
  })

  it('plays a move from squares and records where it went', () => {
    const added = addMove(emptyTree(), 'n0', 'e2', 'e4')
    const node = nodeOf(added!.tree, added!.nodeId)
    expect(node?.san).toBe('e4')
    expect(node?.from).toBe('e2')
    expect(node?.to).toBe('e4')
    expect(node?.ply).toBe(1)
    expect(node?.color).toBe('w')
    expect(node?.number).toBe(1)
    expect(added!.created).toBe(true)
  })

  it('numbers Black’s moves with the move they answer', () => {
    const { tree } = play(emptyTree(), ['e4', 'e5', 'Nf3'])
    expect(mainline(tree).map((n) => `${n.number}${n.color}`)).toEqual(['1w', '1b', '2w'])
  })

  it('refuses a move that is not legal', () => {
    expect(addMove(emptyTree(), 'n0', 'e2', 'e5')).toBeNull()
    expect(addMoveSan(emptyTree(), 'n0', 'Qh5xh7')).toBeNull()
  })

  it('promotes a pawn to a queen without being asked', () => {
    const tree = emptyTree('8/P7/8/4k3/8/8/8/4K3 w - - 0 1')
    const added = addMove(tree, tree.root, 'a7', 'a8')
    expect(nodeOf(added!.tree, added!.nodeId)?.san).toBe('a8=Q')
  })
})

describe('a second answer to a position', () => {
  it('becomes a variation rather than replacing the move there', () => {
    const first = play(emptyTree(), ['e4', 'e5'])
    const alt = addMoveSan(first.tree, 'n1', 'c5')!
    const root = nodeOf(alt.tree, 'n1')!
    expect(root.children.length).toBe(2)
    expect(sans(alt.tree)).toEqual(['e4', 'e5'])
    expect(nodeOf(alt.tree, alt.nodeId)?.san).toBe('c5')
    expect(isMainline(alt.tree, alt.nodeId)).toBe(false)
  })

  it('walks into the line that already holds the move instead of doubling it', () => {
    const first = play(emptyTree(), ['e4', 'e5'])
    const again = addMoveSan(first.tree, 'n1', 'e5')!
    expect(again.created).toBe(false)
    expect(again.nodeId).toBe('n2')
    expect(nodeOf(again.tree, 'n1')?.children).toEqual(['n2'])
  })

  it('keeps the tree it was given when nothing was added', () => {
    const first = play(emptyTree(), ['e4', 'e5'])
    const again = addMoveSan(first.tree, 'n1', 'e5')!
    expect(again.tree).toBe(first.tree)
  })
})

describe('promoting and demoting', () => {
  /** 1. e4 with two answers: e5 the mainline, c5 the variation. */
  const twoAnswers = () => {
    const first = play(emptyTree(), ['e4', 'e5'])
    const alt = addMoveSan(first.tree, 'n1', 'c5')!
    return { tree: alt.tree, mainId: 'n2', altId: alt.nodeId }
  }

  it('swaps a variation with the line above it', () => {
    const { tree, altId } = twoAnswers()
    const promoted = promote(tree, altId)
    expect(sans(promoted)).toEqual(['e4', 'c5'])
    expect(isMainline(promoted, altId)).toBe(true)
  })

  it('puts a promoted line back with demote', () => {
    const { tree, altId, mainId } = twoAnswers()
    const back = demote(promote(tree, altId), altId)
    expect(sans(back)).toEqual(['e4', 'e5'])
    expect(isMainline(back, mainId)).toBe(true)
  })

  it('leaves a line alone at the ends of its siblings', () => {
    const { tree, mainId, altId } = twoAnswers()
    expect(promote(tree, mainId)).toBe(tree)
    expect(demote(tree, altId)).toBe(tree)
  })

  it('lifts a line the whole way to the mainline, not just one level', () => {
    // 1. e4 e5 2. Nf3, with 2. Bc4 Nf6 as a variation two levels deep.
    const base = play(emptyTree(), ['e4', 'e5', 'Nf3'])
    const branch = play(base.tree, ['Bc4', 'Nf6'], 'n2')
    const deep = branch.id

    // One promote only wins its own argument: Bc4 is still not the mainline.
    const once = promote(branch.tree, deep)
    expect(sans(once)).toEqual(['e4', 'e5', 'Nf3'])

    const all = promoteToMainline(branch.tree, deep)
    expect(sans(all)).toEqual(['e4', 'e5', 'Bc4', 'Nf6'])
    expect(isMainline(all, deep)).toBe(true)
  })

  it('does nothing to a line that is already the mainline throughout', () => {
    const { tree } = play(emptyTree(), ['e4', 'e5', 'Nf3'])
    expect(promoteToMainline(tree, 'n3')).toBe(tree)
  })
})

describe('adding a whole line', () => {
  it('plays it on as a variation of the move it replaces', () => {
    const { tree } = parseMoveTree('1. e4 e5 2. Nf3 *')
    const [, e5] = mainline(tree)
    // The engine would rather have had 1... c5, and expects 2. Nf3 d6.
    const with_ = addLine(tree, e5.parent!, ['c5', 'Nf3', 'd6'])
    expect(sans(with_)).toEqual(['e4', 'e5', 'Nf3'])
    expect(text(with_)).toBe('1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *')
  })

  it('joins a line that already exists rather than repeating it', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *')
    const [, e5] = mainline(tree)
    const with_ = addLine(tree, e5.parent!, ['c5', 'Nf3', 'd6'])
    // One Sicilian, now three moves long — not a second one beside it.
    expect(nodeOf(with_, e5.parent!)?.children).toHaveLength(2)
    expect(text(with_)).toBe('1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *')
  })

  it('stops at a move it cannot play and keeps what came before', () => {
    const { tree } = parseMoveTree('1. e4 e5 *')
    const [, e5] = mainline(tree)
    const with_ = addLine(tree, e5.parent!, ['c5', 'Qh4', 'd6'])
    expect(text(with_)).toBe('1. e4 e5 (1... c5) *')
  })

  it('does nothing with an empty line', () => {
    const { tree } = parseMoveTree('1. e4 e5 *')
    expect(addLine(tree, tree.root, [])).toBe(tree)
  })
})

describe('deleting', () => {
  it('takes the move and everything after it, and selects what came before', () => {
    const { tree } = play(emptyTree(), ['e4', 'e5', 'Nf3', 'Nc6'])
    const { tree: cut, selectId } = deleteFrom(tree, 'n3')
    expect(sans(cut)).toEqual(['e4', 'e5'])
    expect(selectId).toBe('n2')
    expect(nodeOf(cut, 'n4')).toBeNull()
  })

  it('takes only the variation it was asked for', () => {
    const first = play(emptyTree(), ['e4', 'e5'])
    const alt = addMoveSan(first.tree, 'n1', 'c5')!
    const { tree: cut } = deleteFrom(alt.tree, alt.nodeId)
    expect(sans(cut)).toEqual(['e4', 'e5'])
    expect(nodeOf(cut, 'n1')?.children).toEqual(['n2'])
  })

  it('refuses to delete the starting position', () => {
    const { tree } = play(emptyTree(), ['e4'])
    const { tree: same, selectId } = deleteFrom(tree, tree.root)
    expect(same).toBe(tree)
    expect(selectId).toBe(tree.root)
  })
})

describe('reading movetext', () => {
  it('reads a plain game', () => {
    const { tree, warnings } = parseMoveTree('1. e4 e5 2. Nf3 Nc6 1/2-1/2')
    expect(sans(tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(tree.result).toBe('1/2-1/2')
    expect(warnings).toEqual([])
  })

  it('keeps a variation instead of throwing it away', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3')
    expect(sans(tree)).toEqual(['e4', 'e5', 'Nf3'])
    const alternatives = nodeOf(tree, 'n1')!.children.map((id) => nodeOf(tree, id)?.san)
    expect(alternatives).toEqual(['e5', 'c5'])
    const sicilian = nodeOf(tree, 'n1')!.children[1]
    expect(lineTo(tree, sicilian).map((n) => n.san)).toEqual(['e4', 'c5'])
  })

  it('reads variations nested inside variations', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6) d6) 2. Nf3')
    const sicilian = nodeOf(tree, 'n1')!.children[1]
    const afterC5 = nodeOf(tree, sicilian)!.children.map((id) => nodeOf(tree, id)?.san)
    expect(afterC5).toEqual(['Nf3', 'Nc3'])
  })

  it('reads several alternatives to the same move as siblings, not nested', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5) (1... e6) 2. Nf3')
    const answers = nodeOf(tree, 'n1')!.children.map((id) => nodeOf(tree, id)?.san)
    expect(answers).toEqual(['e5', 'c5', 'e6'])
  })

  it('gives a comment to the move it follows', () => {
    const { tree } = parseMoveTree('1. e4 {best by test} e5')
    expect(nodeOf(tree, 'n1')?.comment).toBe('best by test')
    expect(nodeOf(tree, 'n2')?.comment).toBeNull()
  })

  it("gives a variation's opening comment to that variation, not to the move it leaves", () => {
    const { tree } = parseMoveTree('1. e4 e5 ({the Sicilian} 1... c5) 2. Nf3')
    const sicilian = nodeOf(tree, 'n1')!.children[1]
    expect(nodeOf(tree, sicilian)?.comment).toBe('the Sicilian')
    expect(nodeOf(tree, 'n2')?.comment).toBeNull()
  })

  it('keeps clock and elapsed times off the comments', () => {
    const { tree } = parseMoveTree('1. e4 {[%emt 0:00:12]} e5 {[%clk 1:29:48]}')
    expect(nodeOf(tree, 'n1')?.emtSeconds).toBe(12)
    expect(nodeOf(tree, 'n2')?.anchorClockSeconds).toBe(5388)
    expect(nodeOf(tree, 'n1')?.comment).toBeNull()
  })

  it('keeps NAGs', () => {
    const { tree } = parseMoveTree('1. e4 $1 e5 $2')
    expect(nodeOf(tree, 'n1')?.nags).toEqual(['$1'])
    expect(nodeOf(tree, 'n2')?.nags).toEqual(['$2'])
  })

  it('ignores the file’s own move numbers, trusting the position', () => {
    const { tree } = parseMoveTree('7. e4 12... e5')
    expect(mainline(tree).map((n) => n.number)).toEqual([1, 1])
  })

  it('takes only the outermost result, not one inside a variation', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 1-0) 2. Nf3 *')
    expect(tree.result).toBe('*')
  })

  it('abandons an unplayable line but keeps reading the game', () => {
    const { tree, warnings } = parseMoveTree('1. e4 e5 (1... Qh4 2. Nf3) 2. Nf3 Nc6')
    expect(sans(tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('Qh4')
    expect(nodeOf(tree, 'n1')?.children).toHaveLength(1)
  })

  it('keeps the parentheses balanced when the bad line has its own variation', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... Qh4 (2. Nf3 d6) 2. c4) 2. Nf3 Nc6')
    expect(sans(tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('reads an empty movetext as an empty game', () => {
    const { tree } = parseMoveTree('')
    expect(mainline(tree)).toEqual([])
    expect(tree.result).toBeNull()
  })
})

describe('writing movetext', () => {
  it('writes a plain game', () => {
    const { tree } = parseMoveTree('1. e4 e5 2. Nf3 Nc6 *')
    expect(text(tree)).toBe('1. e4 e5 2. Nf3 Nc6 *')
  })

  it('writes a variation in parentheses', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *')
    expect(text(tree)).toBe('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *')
  })

  it('names the side again after a variation closes', () => {
    // Black's move after the parentheses has to say "2..." or a reader loses
    // track of whose turn it is.
    const { tree } = parseMoveTree('1. e4 e5 2. Nf3 (2. Bc4) Nc6 *')
    expect(text(tree)).toBe('1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 *')
  })

  it('writes alternatives side by side rather than nested', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5) (1... e6) 2. Nf3 *')
    expect(text(tree)).toBe('1. e4 e5 (1... c5) (1... e6) 2. Nf3 *')
  })

  it('writes comments and NAGs back', () => {
    const { tree } = parseMoveTree('1. e4 $1 {a good start} e5 *')
    expect(text(tree)).toBe('1. e4 $1 {a good start} e5 *')
  })

  it('leaves comments out when they are not wanted', () => {
    const { tree } = parseMoveTree('1. e4 {a good start} e5 *')
    expect(formatTreeMovetext(tree, { comments: false })).toBe('1. e4 e5 *')
  })

  it('writes clocks from the nodes', () => {
    let { tree } = parseMoveTree('1. e4 e5 *')
    const node = tree.nodes.get('n1')!
    tree = { ...tree, nodes: new Map(tree.nodes).set('n1', { ...node, clkSeconds: 5388 }) }
    expect(text(tree)).toBe('1. e4 {[%clk 1:29:48]} e5 *')
  })

  it('writes an eval passed in for a node', () => {
    const { tree } = parseMoveTree('1. e4 e5 *')
    const out = formatTreeMovetext(
      tree,
      { evals: new Map([['n1', '0.25']]), columns: 200 },
      
    )
    expect(out).toBe('1. e4 {[%eval 0.25]} e5 *')
  })

  it('wraps long games instead of writing one endless line', () => {
    const { tree } = parseMoveTree(
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O *',
    )
    const out = formatTreeMovetext(tree, { columns: 40 })
    expect(out).toContain('\n')
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(40)
  })

  it('leaves the variations out when they are not wanted', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 2. Nf3) (1... e6) 2. Nf3 *')
    expect(formatTreeMovetext(tree, { variations: false })).toBe('1. e4 e5 2. Nf3 *')
  })

  it('does not number a move twice for a variation it did not write', () => {
    // The "2..." only exists to reorient a reader coming out of brackets. With
    // no brackets there is nothing to come out of.
    const { tree } = parseMoveTree('1. e4 e5 2. Nf3 (2. Bc4) Nc6 *')
    expect(formatTreeMovetext(tree, { variations: false })).toBe('1. e4 e5 2. Nf3 Nc6 *')
  })

  it('wraps inside a long variation, not only around it', () => {
    // A variation written as one token cannot break, and a repertoire whose
    // first line holds a twenty-move variation came out hundreds of
    // characters wide. The brackets ride on the moves either side instead.
    const { tree } = parseMoveTree(
      '1. e4 e5 (1... c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3) 2. Nf3 *',
    )
    const out = formatTreeMovetext(tree, { columns: 40 })
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(40)
    expect(text(parseMoveTree(out).tree)).toBe(text(tree))
  })

  it('protects the file from braces inside a comment', () => {
    let { tree } = parseMoveTree('1. e4 e5 *')
    tree = setComment(tree, 'n1', 'careful {here} now')
    expect(text(tree)).toBe('1. e4 {careful here now} e5 *')
  })
})

describe('a round trip through PGN', () => {
  const cases = [
    '1. e4 e5 2. Nf3 Nc6 *',
    '1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 *',
    '1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6) 2... d6) (1... e6 2. d4) 2. Nf3 *',
    '1. d4 $1 {a repertoire note} d5 (1... Nf6 {the Indian defences} 2. c4 e6) 2. c4 1-0',
    '1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6 3. Bb5 *',
  ]

  for (const pgn of cases) {
    it(`survives: ${pgn.slice(0, 46)}…`, () => {
      const once = parseMoveTree(pgn)
      const written = text(once.tree)
      expect(written).toBe(pgn)
      // And again, so a second pass cannot drift from the first.
      expect(text(parseMoveTree(written).tree)).toBe(pgn)
    })
  }

  it('adds the number a sloppy file left out, and then holds still', () => {
    // The move after a variation must name its side. A file that omits it is
    // read fine and written back correct, so the second pass is the fixed one.
    const loose = '1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6) d6) 2. Nf3 *'
    const fixed = '1. e4 e5 (1... c5 2. Nf3 (2. Nc3 Nc6) 2... d6) 2. Nf3 *'
    const once = text(parseMoveTree(loose).tree)
    expect(once).toBe(fixed)
    expect(text(parseMoveTree(once).tree)).toBe(fixed)
  })

  it('carries an opening repertoire through unchanged', () => {
    const repertoire =
      '1. e4 {my repertoire as White} c5 (1... e5 2. Nf3 Nc6 3. Bb5 {the Ruy Lopez}) ' +
      '(1... e6 {the French} 2. d4 d5 3. Nc3 (3. Nd2 {the Tarrasch}) 3... Bb4) ' +
      '2. Nf3 d6 (2... Nc6 3. d4) 3. d4 cxd4 4. Nxd4 *'
    const { tree, warnings } = parseMoveTree(repertoire)
    expect(warnings).toEqual([])
    expect(text(tree)).toBe(repertoire)
  })
})

describe('stepping about', () => {
  /** 1. e4 e5 2. Nf3 with 1... c5 2. Nc3 as a variation. */
  const withBranch = () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 2. Nc3) 2. Nf3 *')
    const [e4, e5, nf3] = mainline(tree)
    const sicilian = nodeOf(tree, e4.id)!.children[1]
    return { tree, e4, e5, nf3, sicilian, nc3: nodeOf(tree, sicilian)!.children[0] }
  }

  it('steps back to the move before, and stops at the start', () => {
    const { tree, e4, e5, nf3 } = withBranch()
    expect(previousId(tree, nf3.id)).toBe(e5.id)
    expect(previousId(tree, e4.id)).toBe(tree.root)
    expect(previousId(tree, tree.root)).toBe(tree.root)
  })

  it('steps back out of a variation to the move it branched from', () => {
    const { tree, e4, sicilian } = withBranch()
    expect(previousId(tree, sicilian)).toBe(e4.id)
  })

  it('steps forward down the line it is on, not back onto the mainline', () => {
    const { tree, sicilian, nc3 } = withBranch()
    expect(nextId(tree, sicilian)).toBe(nc3)
    expect(nextId(tree, nc3)).toBeNull()
  })

  it('runs to the end of the line it is on', () => {
    const { tree, sicilian, nc3, nf3 } = withBranch()
    expect(lineEndId(tree, sicilian)).toBe(nc3)
    expect(lineEndId(tree, tree.root)).toBe(nf3.id)
  })
})

describe('the bridge to the ply-numbered parts of the app', () => {
  it('gives the mainline positions with the start at the front', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5) 2. Nf3 *')
    const fens = mainlineFens(tree)
    expect(fens).toHaveLength(4)
    expect(fens[0]).toBe(nodeOf(tree, tree.root)?.fen)
    expect(fens[3]).toBe(mainline(tree)[2].fen)
  })

  it('gives the engine a UCI per mainline move, promotions included', () => {
    const { tree } = parseMoveTree('1. e4 e5 2. Nf3 *')
    expect(mainlineUcis(tree)).toEqual(['e2e4', 'e7e5', 'g1f3'])
    const promo = emptyTree('8/P7/8/4k3/8/8/8/4K3 w - - 0 1')
    const added = addMove(promo, promo.root, 'a7', 'a8')!
    expect(nodeOf(added.tree, added.nodeId)?.uci).toBe('a7a8q')
  })

  it('finds the mainline node at a ply, and the root at nought', () => {
    const { tree } = parseMoveTree('1. e4 e5 2. Nf3 *')
    expect(nodeAtMainlinePly(tree, 0)?.id).toBe(tree.root)
    expect(nodeAtMainlinePly(tree, 2)?.san).toBe('e5')
    expect(nodeAtMainlinePly(tree, 9)).toBeNull()
  })

  it('reports a variation at the ply of the branch it hangs off', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *')
    const sicilian = nodeOf(tree, 'n1')!.children[1]
    const deep = nodeOf(tree, sicilian)!.children[0]
    // e4 is ply 1 and on the mainline; c5 and everything after it is not.
    expect(mainlinePlyOf(tree, 'n1')).toBe(1)
    expect(mainlinePlyOf(tree, sicilian)).toBe(1)
    expect(mainlinePlyOf(tree, deep)).toBe(1)
  })

  it('puts the converter’s clocks on the mainline and leaves variations alone', () => {
    const { tree } = parseMoveTree('1. e4 e5 (1... c5) 2. Nf3 *')
    const timed = applyMainlineTiming(tree, [
      { number: 1, color: 'w', san: 'e4', emtSeconds: 5, anchorClockSeconds: null, clkSeconds: 3595, spentSeconds: 5, comment: null },
      { number: 1, color: 'b', san: 'e5', emtSeconds: 7, anchorClockSeconds: null, clkSeconds: 3593, spentSeconds: 7, comment: null },
    ])
    expect(mainline(timed)[0].clkSeconds).toBe(3595)
    expect(mainline(timed)[1].spentSeconds).toBe(7)
    // The third mainline move had no timing to receive, and nor did the Sicilian.
    expect(mainline(timed)[2].clkSeconds).toBeNull()
    const sicilian = nodeOf(timed, 'n1')!.children[1]
    expect(nodeOf(timed, sicilian)?.clkSeconds).toBeNull()
  })

  it('writes the clocks it was given back into the movetext', () => {
    const { tree } = parseMoveTree('1. e4 e5 *')
    const timed = applyMainlineTiming(tree, [
      { number: 1, color: 'w', san: 'e4', emtSeconds: null, anchorClockSeconds: null, clkSeconds: 5388, spentSeconds: null, comment: null },
    ])
    expect(text(timed)).toBe('1. e4 {[%clk 1:29:48]} e5 *')
  })
})

describe('the flat view the rest of the app reads', () => {
  it('hands over the mainline in the old shape', () => {
    const { tree } = parseMoveTree('1. e4 {a note} e5 (1... c5) 2. Nf3 *')
    expect(mainlineMoves(tree)).toEqual([
      {
        number: 1,
        color: 'w',
        san: 'e4',
        comment: 'a note',
        emtSeconds: null,
        anchorClockSeconds: null,
        clkSeconds: null,
        spentSeconds: null,
      },
      {
        number: 1,
        color: 'b',
        san: 'e5',
        comment: null,
        emtSeconds: null,
        anchorClockSeconds: null,
        clkSeconds: null,
        spentSeconds: null,
      },
      {
        number: 2,
        color: 'w',
        san: 'Nf3',
        comment: null,
        emtSeconds: null,
        anchorClockSeconds: null,
        clkSeconds: null,
        spentSeconds: null,
      },
    ])
  })

  it('follows the mainline after a promotion, not the moves as they were typed', () => {
    const first = play(emptyTree(), ['e4', 'e5'])
    const alt = addMoveSan(first.tree, 'n1', 'c5')!
    const promoted = promoteToMainline(alt.tree, alt.nodeId)
    expect(mainlineMoves(promoted).map((m) => m.san)).toEqual(['e4', 'c5'])
  })
})
