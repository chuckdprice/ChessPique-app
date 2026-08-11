import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import AppearanceDialog from './components/AppearanceDialog'
import BrandMark from './components/BrandMark'
import ConfirmDialog from './components/ConfirmDialog'
import HelpDialog from './components/HelpDialog'
import NavDrawer, { NavToggle } from './components/NavDrawer'
import PgnFilePage from './components/PgnFilePage'
import SettingsPage from './components/SettingsPage'
import StepNav from './components/StepNav'
import type { EvalLabel } from './components/BoardViewer'
import type { EngineArrow } from './components/EnginePanel'
import type { Page } from './lib/pages'
import type { PgnExtras } from './components/PgnExtrasSwitches'
import {
  convertPgn,
  pgnWithMovetext,
  splitHeadersAndMovetext,
  withExtraTags,
  withTag,
} from './lib/convert'
import type { ConvertOptions, ConvertResult } from './lib/convert'
import { findOpening } from './lib/openings'
import type { Opening } from './lib/openings'
import {
  analyzeGame,
  moveNote,
  NEEDS_ADVICE,
  PLAYED_LIKE_MAE,
  REVIEW_DEPTH,
  withDeeperEval,
} from './lib/engine/analysis'
import type { GameAnalysis, RefinedEval, ReviewedPosition } from './lib/engine/analysis'
import { formatEvalTag, formatScore } from './lib/engine/uci'
import type { Score } from './lib/engine/uci'
import { buildChartRows } from './lib/gameModel'
import {
  addLine,
  addMove,
  applyMainlineTiming,
  deleteFrom,
  demote,
  emptyTree,
  formatTreeMovetext,
  isMainline,
  lineEndId,
  mainline,
  mainlineFens,
  mainlineMoves,
  mainlinePlyOf,
  mainlineUcis,
  nextId,
  nodeAtMainlinePly,
  previousId,
  parseMoveTree,
  promote,
  promoteToMainline,
  setComment,
} from './lib/moveTree'
import type { MoveTree } from './lib/moveTree'
import {
  applyAppearance,
  loadAppearance,
  loadEngineSettings,
  saveAppearance,
  saveEngineSettings,
} from './lib/settings'
import type { AppearanceSettings, EngineSettings } from './lib/settings'

// The analysis page owns every heavy dependency in the app — recharts for the
// eval and clock charts, react-chessboard for the board — and none of it is
// reachable from the upload page. Loading it on demand keeps those out of the
// first download; the effect below warms the chunk so the page is already in
// memory by the time a conversion finishes.
const loadAnalysisPage = () => import('./components/AnalysisPage')
const AnalysisPage = lazy(loadAnalysisPage)

interface LoadedGame {
  /** What the conversion worked out: time control, warnings, the source result. */
  result: ConvertResult
  /** The game itself, variations and all. Edits replace this whole object. */
  tree: MoveTree
}

function findHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((h) => h.name === name)?.value
}

/**
 * Arrow colours. Blue for the engine's candidate moves (it reads clearly on
 * both the cream and green squares, which the old green did not) fading from
 * best to worst, and warm orange for the move actually played next — the two
 * are directly comparable because both belong to the side to move.
 */
const ENGINE_ARROW_ALPHA = [0.95, 0.7, 0.52, 0.4, 0.3]
const ENGINE_ARROW_RGB = '38, 122, 255'
const NEXT_MOVE_ARROW = 'rgba(244, 130, 32, 0.95)'

/** Credited in every converted PGN, so a shared file says where it came from. */
const ANNOTATOR_URL = 'https://chessnoter.vercel.app/'

/**
 * The Seven Tag Roster a game started here begins with.
 *
 * PGN wants all seven present and spells unknown as "?", so a file built here
 * is valid the moment it has a move — and the tag editor has something to edit
 * rather than an empty list and a picker to work through.
 */
function newGameHeaders(): Array<{ name: string; value: string }> {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('.')
  return [
    { name: 'Event', value: '?' },
    { name: 'Site', value: '?' },
    { name: 'Date', value: date },
    { name: 'Round', value: '?' },
    { name: 'White', value: '?' },
    { name: 'Black', value: '?' },
    { name: 'Result', value: '*' },
  ]
}

/**
 * The tree with the engine's recommendations played into it as variations.
 *
 * The review already worked out, for every move it faulted, the line it would
 * rather have seen. That used to be text under the move: readable, but not
 * walkable. As real nodes it is reachable with the same arrow keys, the same
 * branch chooser and the same right-click menu as any other line — and it
 * exports as an ordinary variation rather than as something written specially.
 *
 * Only faulted moves get one. Every move has a best line, and adding all of
 * them would bury the game in the engine's opinion of it.
 */
function withEngineLines(tree: MoveTree, analysis: GameAnalysis): MoveTree {
  const line = mainline(tree)
  let next = tree
  analysis.moves.forEach((info, i) => {
    if (!NEEDS_ADVICE.includes(info.classification) || info.bestLineSan.length === 0) return
    // The line replaces the move, so it branches from the position before it.
    const parent = line[i]?.parent
    if (parent) next = addLine(next, parent, info.bestLineSan)
  })
  return next
}

/** Nothing conversion worked out, for a game that was not converted at all. */
const NO_CONVERSION: ConvertResult = {
  pgn: '',
  headers: [],
  moves: [],
  result: null,
  timeControl: null,
  warnings: [],
}

/** The game's opening, once the book has loaded; null until then and if unnamed. */
function useOpening(fens: string[] | null): Opening | null {
  const [opening, setOpening] = useState<Opening | null>(null)

  useEffect(() => {
    setOpening(null)
    if (!fens) return
    let current = true
    findOpening(fens).then((found) => {
      if (current) setOpening(found)
    })
    return () => {
      current = false
    }
  }, [fens])

  return opening
}

export default function App() {
  const [game, setGame] = useState<LoadedGame | null>(null)
  const [headers, setHeaders] = useState<Array<{ name: string; value: string }>>([])
  /**
   * Where the board is: a node of the tree, not a number.
   *
   * A ply only names a position while the game is one line. Once a position
   * can have several continuations, the only thing that says which of them you
   * are looking at is the node itself.
   */
  const [currentId, setCurrentId] = useState<string>('n0')
  const [page, setPage] = useState<Page>('pgn')
  // Source PGN lives here, not in PgnFilePage, so switching pages does not lose it.
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  // Asking before a new game throws the current one away.
  const [confirmNew, setConfirmNew] = useState(false)
  // Warnings are per file, so a new one starts them showing again.
  const [warningsDismissed, setWarningsDismissed] = useState(false)
  /**
   * The choice offered when stepping forward has more than one way to go.
   *
   * Carries the move it was opened at, so moving the board by any other route
   * — a click in the list, an arrow back — leaves it behind without anything
   * having to close it.
   */
  const [branch, setBranch] = useState<{ atId: string; index: number } | null>(null)
  /**
   * Bumped whenever a game is loaded, so the review runs for it even when its
   * moves happen to match the game before — the key below is the moves alone,
   * and two different files can hold the same ones.
   */
  const [gameEpoch, setGameEpoch] = useState(0)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  // What the app is currently wearing. While the dialog is open this holds the
  // draft, so a pick is seen on the page behind it; only Save writes it down.
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance)
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(loadEngineSettings)
  const [engineOn, setEngineOn] = useState(false)
  const [liveScore, setLiveScore] = useState<Score | null>(null)
  const [engineMoves, setEngineMoves] = useState<EngineArrow[]>([])
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  // Positions the live engine has out-searched the review on, by node.
  const [deeperEvals, setDeeperEvals] = useState<Map<string, RefinedEval>>(new Map())
  // What the converted PGN carries beyond the moves and clocks. On by default:
  // the switches are there to leave things out, and a file is more useful with
  // them in.
  const [pgnExtras, setPgnExtras] = useState<PgnExtras>({
    clocks: true,
    evals: true,
    comments: true,
    variations: true,
  })
  const analysisSignal = useRef<{ cancelled: boolean } | null>(null)
  /**
   * Positions the review has already searched, kept for the life of the tab.
   *
   * An evaluation is about a position, not about the game it turned up in, so
   * this is never cleared — a game built move by move re-uses everything it
   * worked out for the move before.
   */
  const reviewCache = useRef(new Map<string, ReviewedPosition>())

  // What was showing when the dialog opened, to go back to on Cancel.
  const savedAppearance = useRef(appearance)
  useEffect(() => applyAppearance(appearance), [appearance])

  // Fetch the analysis chunk once the browser is idle, while the user is still
  // pasting or picking a PGN, so Convert never waits on a network round trip.
  useEffect(() => {
    const warm = () => void loadAnalysisPage()
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(warm)
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(warm, 1000)
    return () => clearTimeout(id)
  }, [])

  const handleConvert = (text: string, options: ConvertOptions) => {
    try {
      const result = convertPgn(text, options)
      // The conversion works the clocks out along one line, because a running
      // clock only means anything along one. The tree is read from the same
      // movetext — keeping the variations that pass throws away — and then
      // told what that pass worked out.
      const { movetext } = splitHeadersAndMovetext(text)
      const parsed = parseMoveTree(movetext)
      const tree = applyMainlineTiming(parsed.tree, result.moves)
      // Clear stale analysis in the same render batch as the new game, so no
      // render ever pairs the old analysis with the new move list.
      if (analysisSignal.current) analysisSignal.current.cancelled = true
      setAnalysis(null)
      setAnalysisProgress(null)
      setAnalysisError(null)
      setLiveScore(null)
      setEngineMoves([])
      // The parser's warnings lead: a dropped line is lost work, where a
      // reused clock is only an approximation the file did not give.
      setGame({
        result: { ...result, warnings: [...parsed.warnings, ...result.warnings] },
        tree,
      })
      setWarningsDismissed(false)
      setHeaders(result.headers)
      setCurrentId(tree.root)
      setError(null)
      setPage('analysis')
    } catch (e) {
      setGame(null)
      // The tags belonged to the game that just went away, and the tag pane is
      // now always on screen — left alone they would sit there looking editable
      // while feeding a converted PGN that no longer exists.
      setHeaders([])
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      setPage('pgn')
    }
  }

  // The engine and the board handlers report against whatever is current at the
  // moment they fire; read through refs so the handlers themselves never
  // change, and the panel's search is not restarted by a new callback identity.
  const currentIdRef = useRef(currentId)
  currentIdRef.current = currentId
  const branchRef = useRef(branch)
  branchRef.current = branch
  const analysisRef = useRef(analysis)
  analysisRef.current = analysis
  const gameRef = useRef(game)
  gameRef.current = game

  /**
   * The mainline as a string, which is what the review is actually about.
   *
   * The review must restart when the moves change and must not when anything
   * else does — and everything now lives in one tree object, so its identity
   * cannot be the trigger: a comment keystroke would replace it and throw away
   * a minute of Stockfish. A string of the moves changes only when the moves
   * do, and React compares dependencies by value.
   */
  const mainlineKey = useMemo(
    () => (game ? mainlineUcis(game.tree).join(' ') : ''),
    [game],
  )

  // Full-game Stockfish analysis: kicks off automatically for each new game,
  // and again when the mainline itself changes — promoting a variation makes a
  // different game, and the old evaluations are not about it.
  useEffect(() => {
    if (analysisSignal.current) analysisSignal.current.cancelled = true
    setAnalysis(null)
    setAnalysisProgress(null)
    setAnalysisError(null)
    setLiveScore(null)
    setDeeperEvals(new Map())
    const tree = gameRef.current?.tree
    if (!tree || mainlineKey === '') return

    const signal = { cancelled: false }
    analysisSignal.current = signal
    analyzeGame(mainlineFens(tree), mainlineMoves(tree), mainlineUcis(tree), {
      signal,
      cache: reviewCache.current,
      onProgress: (done, total) => {
        if (!signal.cancelled) setAnalysisProgress({ done, total })
      },
    })
      .then((result) => {
        if (signal.cancelled || !result) return
        setAnalysis(result)
        // Adding these touches no mainline move, so mainlineKey is unchanged
        // and this cannot set the review going again.
        setGame((prev) => (prev ? { ...prev, tree: withEngineLines(prev.tree, result) } : prev))
      })
      .catch((e) => {
        if (!signal.cancelled) {
          setAnalysisError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!signal.cancelled) setAnalysisProgress(null)
      })

    return () => {
      signal.cancelled = true
    }
  }, [mainlineKey, gameEpoch])

  const handleHeaderAdd = useCallback((name: string) => {
    setHeaders((prev) => withTag(prev, name))
  }, [])

  const handleHeaderRemove = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleHeaderChange = useCallback((index: number, value: string) => {
    setHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, value } : h)))
  }, [])

  const handleTopScore = useCallback((score: Score | null, depth: number) => {
    setLiveScore(score)
    const tree = gameRef.current?.tree
    const at = currentIdRef.current
    // A score for a position in a variation is not the mainline's, and the
    // review only covers the mainline — recording it would quietly rewrite an
    // evaluation that is about a different move.
    if (!score || !tree || !isMainline(tree, at)) return
    // Terminal positions carry Infinity and are never beaten; a position the
    // review has not reached yet is assumed to have had its full depth, which
    // is the conservative guess.
    const ply = mainlinePlyOf(tree, at)
    const reviewDepth = analysisRef.current?.evalDepths[ply] ?? REVIEW_DEPTH
    setDeeperEvals((prev) => withDeeperEval(prev, at, { score, depth }, reviewDepth))
  }, [])
  const handleEngineMoves = useCallback((lines: EngineArrow[]) => setEngineMoves(lines), [])

  /** Move the board to a node. Navigation never changes the game. */
  const handleNavigate = useCallback((nodeId: string) => setCurrentId(nodeId), [])

  /**
   * Forward one move — or, where the position has several continuations, an
   * offer of which. Taking the mainline silently would leave a variation
   * reachable only by finding it in the list.
   */
  const handleStepForward = useCallback(() => {
    const tree = gameRef.current?.tree
    if (!tree) return
    const at = currentIdRef.current
    const node = tree.nodes.get(at)
    if (!node) return
    if (node.children.length > 1) {
      setBranch({ atId: at, index: 0 })
      return
    }
    if (node.children[0]) setCurrentId(node.children[0])
  }, [])

  const handleBranchChoose = useCallback((nodeId: string) => {
    setCurrentId(nodeId)
    setBranch(null)
  }, [])

  /**
   * Start a game with no moves in it, to be built on the board.
   *
   * The tree has always been able to start empty; this is the way to ask for
   * one. Everything downstream already copes — the review has nothing to review
   * until there is a move, and the converted PGN grows as the game does.
   */
  const startNewGame = useCallback(() => {
    // "*" — game in progress. PGN requires a termination marker, so without
    // one the file a new game exports is invalid from its first move.
    const tree = { ...emptyTree(), result: '*' }
    if (analysisSignal.current) analysisSignal.current.cancelled = true
    setAnalysis(null)
    setAnalysisProgress(null)
    setAnalysisError(null)
    setLiveScore(null)
    setEngineMoves([])
    setGameEpoch((n) => n + 1)
    setGame({ result: NO_CONVERSION, tree })
    setWarningsDismissed(false)
    setHeaders(newGameHeaders())
    setCurrentId(tree.root)
    setError(null)
    setPage('analysis')
  }, [])

  /**
   * A new game throws the current one away, so it asks first — but only when
   * there is something to lose. A game with no moves is not worth a dialog.
   */
  const handleNewGame = useCallback(() => {
    if (game && mainline(game.tree).length > 0) setConfirmNew(true)
    else startNewGame()
  }, [game, startNewGame])

  /**
   * The charts and the tabs still speak in plies, because they are about the
   * mainline and nothing else. This is the one place that translates.
   */
  const handlePlyChange = useCallback((ply: number) => {
    const tree = gameRef.current?.tree
    if (!tree) return
    const node = nodeAtMainlinePly(tree, ply)
    if (node) setCurrentId(node.id)
  }, [])

  /**
   * Play a move on the board, which now writes it into the game.
   *
   * There is no separate scratch line any more: a move at a position that
   * already has one becomes a variation of it, which is the thing the old
   * "trying a line" bar could only pretend to do. Moving onto a move that is
   * already there just follows it.
   */
  const handlePieceMove = useCallback((from: string, to: string) => {
    const current = gameRef.current
    if (!current) return false
    const added = addMove(current.tree, currentIdRef.current, from, to)
    if (!added) return false
    setGame({ ...current, tree: added.tree })
    setCurrentId(added.nodeId)
    return true
  }, [])

  const handlePromote = useCallback((nodeId: string, toMainline: boolean) => {
    setGame((prev) =>
      prev
        ? { ...prev, tree: (toMainline ? promoteToMainline : promote)(prev.tree, nodeId) }
        : prev,
    )
  }, [])

  const handleDemote = useCallback((nodeId: string) => {
    setGame((prev) => (prev ? { ...prev, tree: demote(prev.tree, nodeId) } : prev))
  }, [])

  const handleDelete = useCallback((nodeId: string) => {
    setGame((prev) => {
      if (!prev) return prev
      const { tree, selectId } = deleteFrom(prev.tree, nodeId)
      // The board cannot stay on a move that no longer exists, and the move
      // before it is where the user was working.
      setCurrentId((at) => (tree.nodes.has(at) ? at : selectId))
      return { ...prev, tree }
    })
  }, [])

  // Opening the dialog records what to go back to on Cancel, so every route
  // into it — the nav today, anything else later — restores the same way.
  const handleAppearanceOpen = useCallback(() => {
    savedAppearance.current = appearance
    setAppearanceOpen(true)
  }, [appearance])

  // The gear on the analysis page saves for itself; the Settings page is the
  // other way in, so it persists here rather than leaving it to the page.
  const handleEngineSettingsSave = useCallback((next: EngineSettings) => {
    setEngineSettings(next)
    saveEngineSettings(next)
  }, [])

  /**
   * Comments now live on the node they are about, rather than in a map beside
   * the game.
   *
   * They used to be kept apart because the review keyed off the game object and
   * a keystroke would have restarted a minute of Stockfish. It keys off the
   * mainline's moves instead, so a comment can go where it belongs — including
   * on a move in a variation, which the old ply-numbered map could not name.
   */
  const handleCommentChange = useCallback((nodeId: string, comment: string) => {
    setGame((prev) => (prev ? { ...prev, tree: setComment(prev.tree, nodeId, comment) } : prev))
  }, [])

  const handleExtraChange = useCallback(
    (id: keyof PgnExtras, on: boolean) => setPgnExtras((prev) => ({ ...prev, [id]: on })),
    [],
  )

  // Arrow-key navigation on the analysis page, except while typing in a field
  // or while something is open over it — an arrow key belongs to whatever has
  // the user's attention, not to the board behind it.
  useEffect(() => {
    if (!game || page !== 'analysis' || helpOpen || navOpen || appearanceOpen) return
    const { tree } = game
    // Forward follows the line the board is on rather than the mainline, so
    // arrowing through a variation stays in it.
    const step = (to: (at: string) => string | null) =>
      setCurrentId((at) => to(at) ?? at)
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }
      // While the branch chooser is up it owns the arrows: it was opened by
      // one and the whole point is to answer it with the same hand.
      const open =
        branchRef.current && branchRef.current.atId === currentIdRef.current
          ? branchRef.current
          : null
      if (open) {
        const count = tree.nodes.get(open.atId)?.children.length ?? 0
        const move = (by: number) => {
          e.preventDefault()
          // Wrapping, because a list this short is quicker to go round than
          // to run to the end of.
          setBranch({ atId: open.atId, index: (open.index + by + count) % count })
        }
        if (e.key === 'ArrowDown') return move(1)
        if (e.key === 'ArrowUp') return move(-1)
        if (e.key === 'ArrowRight' || e.key === 'Enter') {
          e.preventDefault()
          const to = tree.nodes.get(open.atId)?.children[open.index]
          if (to) handleBranchChoose(to)
          return
        }
        if (e.key === 'Escape' || e.key === 'ArrowLeft') {
          e.preventDefault()
          setBranch(null)
          return
        }
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step((at) => previousId(tree, at))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleStepForward()
      } else if (e.key === 'Home') {
        e.preventDefault()
        step(() => tree.root)
      } else if (e.key === 'End') {
        e.preventDefault()
        step((at) => lineEndId(tree, at))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [game, page, helpOpen, navOpen, appearanceOpen, handleStepForward, handleBranchChoose])

  /**
   * The mainline as a flat list, which is what the charts, the clocks and the
   * opening book all want: each is about the game as one line of play.
   */
  const moves = useMemo(() => (game ? mainlineMoves(game.tree) : []), [game])
  const chartRows = useMemo(() => buildChartRows(moves), [moves])
  // Keyed on the moves rather than the tree: the book lookup is asynchronous
  // and clears the name while it runs, so recomputing this for a comment edit
  // would blink the opening out of the header on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mainlineFenList = useMemo(() => (game ? mainlineFens(game.tree) : null), [mainlineKey])
  const opening = useOpening(mainlineFenList)

  const openBranch = branch && branch.atId === currentId ? branch : null

  /** How the position the board is on sits in the game. */
  const onMainline = game ? isMainline(game.tree, currentId) : true
  const currentPly = game ? mainlinePlyOf(game.tree, currentId) : 0

  /**
   * The tags the app adds itself: the opening whenever the book knows it, and
   * where the file came from. They go into the converted PGN and are shown
   * read-only in the tag editor, which is the only place they appear at all
   * when the source file carried no tags of its own.
   */
  const generatedHeaders = useMemo(
    () =>
      game
        ? [
            ...(opening
              ? [
                  { name: 'ECO', value: opening.eco },
                  { name: 'Opening', value: opening.name },
                ]
              : []),
            { name: 'Annotator', value: ANNOTATOR_URL },
          ]
        : [],
    [game, opening],
  )

  const convertedPgn = useMemo(() => {
    if (!game) return null

    // Everything the review knows is about the mainline and is keyed by ply, so
    // it is turned into per-node maps here — the writer walks a tree and has no
    // ply to look anything up by.
    const line = mainline(game.tree)
    const evals = new Map<string, string>()
    const notes = new Map<string, string>()

    if (analysis) {
      line.forEach((node, i) => {
        // evals[i] is the position *after* ply i, so move i takes evals[i + 1]
        // — the evaluation of what it led to, which is where a reader expects
        // it. The live engine's deeper answers win, as in the move list.
        if (pgnExtras.evals) {
          const score = deeperEvals.get(node.id)?.score ?? analysis.evals[i + 1]
          if (score) evals.set(node.id, formatEvalTag(score))
        }
        const info = analysis.moves[i]
        if (!info) return
        if (pgnExtras.comments) {
          const note = moveNote(info)
          if (note) notes.set(node.id, note)
        }
      })
    }

    const movetext = formatTreeMovetext(game.tree, {
      clocks: pgnExtras.clocks,
      comments: pgnExtras.comments,
      variations: pgnExtras.variations,
      evals,
      notes,
    })
    return pgnWithMovetext(withExtraTags(headers, generatedHeaders), movetext)
  }, [game, headers, generatedHeaders, analysis, deeperEvals, pgnExtras])

  const downloadName = useMemo(() => {
    // "?" is how PGN spells an unfilled tag, and a game started here begins
    // with a roster full of them. Left alone they were stripped as illegal
    // filename characters and the download came out " vs  2026-08-09.pgn".
    const named = (name: string, fallback: string) => {
      const value = findHeader(headers, name)
      return !value || value === '?' ? fallback : value
    }
    const white = named('White', 'White')
    const black = named('Black', 'Black')
    const date = named('Date', '')
    const stem = `${white} vs ${black}${date ? ` ${date.replaceAll('.', '-')}` : ''}`
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
    return `${stem || 'converted'}.pgn`
  }, [headers])

  const whiteName = (game && findHeader(headers, 'White')) || 'White'
  const blackName = (game && findHeader(headers, 'Black')) || 'Black'

  // "?" is what a PGN writes for a rating it does not know, and "-" for a
  // player who has none — both mean there is nothing to print.
  const ratingTag = (name: string) => {
    const value = (game && findHeader(headers, name))?.trim()
    return value && value !== '?' && value !== '-' ? value : null
  }
  const whiteElo = ratingTag('WhiteElo')
  const blackElo = ratingTag('BlackElo')

  // The bar shows the same number as the move list does for this position, so
  // a deepened eval has to reach both or the two would disagree on screen. A
  // position in a variation was never reviewed, so only the live engine can
  // say anything about it.
  const evalScore: Score | null =
    !onMainline || !analysis
      ? liveScore
      : (deeperEvals.get(currentId)?.score ?? analysis.evals[currentPly] ?? null)

  // Read out of the settings object here so the memo below depends on the flag
  // itself: the object is replaced by any engine setting changing, and the
  // arrows have no business being rebuilt because the hash size moved.
  const showArrowEvals = engineSettings.arrowEvals

  // Engine candidates fade best→worst, then the game's own next move is drawn
  // on top. The move already on the board gets no arrow — the highlighted
  // squares already show it, and it belongs to the other side.
  const { arrows, evalLabels } = useMemo<{ arrows: Arrow[]; evalLabels: EvalLabel[] }>(() => {
    if (!engineOn || !game) return { arrows: [], evalLabels: [] }
    // The continuation of the line the board is on, which is by the same side
    // the engine is thinking for. It follows the board into a variation now,
    // where before there was no next move to draw at all.
    const next = nextId(game.tree, currentId)
    const nextNode = next ? game.tree.nodes.get(next) : null
    const nextMove =
      nextNode?.from && nextNode.to ? ([nextNode.from, nextNode.to] as const) : null
    const nextKey = nextMove ? `${nextMove[0]}${nextMove[1]}` : null

    // The board keys arrows by from-to, so every square pair may appear once.
    // Mid-search the engine can list the same first move under two multipv
    // slots, and the played move often *is* the engine's pick — in both cases
    // the duplicate is dropped and the orange next-move arrow wins.
    const seen = new Set<string>()
    if (nextKey) seen.add(nextKey)
    // Arrows are keyed by the pair of squares, but a label sits on the head
    // alone, and two candidates arriving on one square — two pieces that can
    // both take it — would print one number on top of the other. The better
    // line's is the one worth reading, so it is the one that gets there.
    const labelled = new Set<string>()

    const list: Arrow[] = []
    const labels: EvalLabel[] = []
    engineMoves.slice(0, ENGINE_ARROW_ALPHA.length).forEach((line, i) => {
      // A line the engine has not given a move for yet holds its place, so the
      // arrows below it keep the rank — and the shade — of their own line.
      if (!line.uci) return
      const from = line.uci.slice(0, 2)
      const to = line.uci.slice(2, 4)
      const key = `${from}${to}`
      if (seen.has(key)) return
      seen.add(key)
      const color = `rgba(${ENGINE_ARROW_RGB}, ${ENGINE_ARROW_ALPHA[i]})`
      list.push({ startSquare: from, endSquare: to, color })
      // Labels are built here rather than beside the board so that a candidate
      // dropped for drawing the same arrow twice cannot leave a number behind
      // pointing at nothing. The badge takes the strong shade whatever its own
      // rank: a faded number is a number you have to squint at.
      if (showArrowEvals && line.score && !labelled.has(to)) {
        labelled.add(to)
        labels.push({
          square: to,
          text: formatScore(line.score),
          best: i === 0,
          color: `rgba(${ENGINE_ARROW_RGB}, 0.95)`,
        })
      }
    })

    if (nextMove) {
      list.push({
        startSquare: nextMove[0],
        endSquare: nextMove[1],
        color: NEXT_MOVE_ARROW,
      })
    }
    return { arrows: list, evalLabels: labels }
  }, [engineOn, engineMoves, game, currentId, showArrowEvals])

  const playedLikeTooltip =
    `Estimated "played like" rating for this game.\n\n` +
    `Estimated from average win-% lost per move in undecided positions, calibrated against ` +
    `rated Lichess rapid games, so it sits on the Lichess rapid scale — which runs higher ` +
    `than USCF or FIDE OTB ratings.\n\n` +
    `One game is a weak signal: typical error is around ±${PLAYED_LIKE_MAE} points, ` +
    `so treat it as a rough indicator rather than a measurement.`

  return (
    // Phones scroll: the analysis page stacks taller than any handset, and
    // pinning it to the viewport just clipped the parts you could not reach.
    // From lg up the original fixed-height, no-scroll layout is kept.
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="app-header shrink-0 bg-felt text-buff">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5 sm:px-6">
          <NavToggle onOpen={() => setNavOpen(true)} />
          <BrandMark />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
              {/* Only the device's name links out; "Game Analysis" is this app. */}
              <a
                href="https://chessnoter.com/"
                target="_blank"
                rel="noopener noreferrer"
                title="ChessNoteR — chessnoter.com"
                className="underline-offset-4 hover:underline"
              >
                ChessNoteR
              </a>{' '}
              Game Analysis
            </h1>
            <p className="text-[11px] leading-tight text-buff/70">
              <span className="font-score">v{__APP_VERSION__}</span>
              <span aria-hidden="true" className="mx-1.5 text-buff/40">
                |
              </span>
              (c) 2026{' '}
              {/*
                Underlined at rest rather than only on hover: this is the only
                route for bug reports, so it has to read as a link before anyone
                thinks to hover over it.
              */}
              <a
                href="https://lichess.org/@/DragonBeard"
                target="_blank"
                rel="noopener noreferrer"
                title="Chuck Price on Lichess — message me with bugs or suggestions"
                className="text-buff underline decoration-buff/40 underline-offset-2 transition-colors hover:decoration-buff"
              >
                Chuck Price
              </a>
            </p>
          </div>

          {/* Appearance used to sit here too; it lives on the left-nav now.
              Help stays: it is the one control worth reaching without opening
              anything first. */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="How to use this app"
              title="Help"
              className="rounded-lg border border-buff/30 p-2 text-buff transition-colors hover:bg-buff/10"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.4" />
                <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="app-steps mx-auto w-full max-w-[1600px] shrink-0 px-4 pt-2 sm:px-6">
        <StepNav page={page} onPageChange={setPage} gameLoaded={!!game} />
      </div>

      {/* --board-size lives in index.css: a short viewport needs a different
          height budget, and a media query cannot reach an inline style. */}
      <main className="app-main mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col px-4 py-2 sm:px-6">
        {page === 'pgn' && (
          <PgnFilePage
            onConvert={handleConvert}
            error={error}
            text={sourceText}
            onTextChange={setSourceText}
            sourceFileName={sourceFileName}
            onSourceFileNameChange={setSourceFileName}
            convertedPgn={convertedPgn}
            downloadName={downloadName}
            headers={headers}
            onHeaderChange={handleHeaderChange}
            onHeaderAdd={handleHeaderAdd}
            onHeaderRemove={handleHeaderRemove}
            generatedHeaders={generatedHeaders}
            extras={pgnExtras}
            onExtraChange={handleExtraChange}
            opening={opening}
            hasEvals={analysis != null}
          />
        )}

        {page === 'settings' && (
          <SettingsPage engine={engineSettings} onEngineChange={handleEngineSettingsSave} />
        )}

        {page === 'analysis' && game && (
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                className="flex flex-1 items-center justify-center text-sm text-ink-mute"
              >
                Loading the analysis board…
              </div>
            }
          >
            <AnalysisPage
              result={game.result}
              tree={game.tree}
              currentId={currentId}
              onNavigate={handleNavigate}
              moves={moves}
              ply={currentPly}
              onPlyChange={handlePlyChange}
              analysis={analysis}
              deeperEvals={deeperEvals}
              opening={opening}
              onPieceMove={handlePieceMove}
              onPromote={handlePromote}
              onDemote={handleDemote}
              onDelete={handleDelete}
              onStepForward={handleStepForward}
              branch={openBranch}
              onBranchIndexChange={(index) =>
                setBranch((prev) => (prev ? { ...prev, index } : prev))
              }
              onBranchChoose={handleBranchChoose}
              onBranchClose={() => setBranch(null)}
              warnings={warningsDismissed ? [] : game.result.warnings}
              onDismissWarnings={() => setWarningsDismissed(true)}
              analysisProgress={analysisProgress}
              analysisError={analysisError}
              chartRows={chartRows}
              whiteName={whiteName}
              blackName={blackName}
              whiteElo={whiteElo}
              blackElo={blackElo}
              playedLikeTooltip={playedLikeTooltip}
              evalScore={evalScore}
              engineOn={engineOn}
              onEngineOnChange={setEngineOn}
              engineSettings={engineSettings}
              onEngineSettingsChange={setEngineSettings}
              onTopScore={handleTopScore}
              onEngineMoves={handleEngineMoves}
              onCommentChange={handleCommentChange}
              arrows={arrows}
              evalLabels={evalLabels}
              pieceSet={appearance.pieces}
            />
          </Suspense>
        )}
      </main>

      {navOpen && (
        <NavDrawer
          page={page}
          onNavigate={setPage}
          onClose={() => setNavOpen(false)}
          onNewGame={handleNewGame}
          gameLoaded={!!game}
          onAppearance={handleAppearanceOpen}
          onHelp={() => setHelpOpen(true)}
        />
      )}

      {appearanceOpen && (
        <AppearanceDialog
          value={appearance}
          onPreview={setAppearance}
          onSave={(next) => {
            setAppearance(next)
            saveAppearance(next)
            savedAppearance.current = next
            setAppearanceOpen(false)
          }}
          onCancel={() => {
            setAppearance(savedAppearance.current)
            setAppearanceOpen(false)
          }}
        />
      )}

      {confirmNew && (
        <ConfirmDialog
          title="Start a new game?"
          body={
            <>
              The game on the board will be replaced, along with any variations and notes you
              have added to it. If it came from a PGN, that text is still on the{' '}
              <span className="font-medium text-ink">PGN File</span> page and can be converted
              again — anything built here by hand cannot.
            </>
          }
          confirmLabel="Start new game"
          onConfirm={() => {
            setConfirmNew(false)
            startNewGame()
          }}
          onCancel={() => setConfirmNew(false)}
        />
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
