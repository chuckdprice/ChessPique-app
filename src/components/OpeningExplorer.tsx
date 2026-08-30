import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import {
  ExplorerAbandonedError,
  ExplorerAuthError,
  ExplorerNeedsPlayerError,
  ExplorerRateLimitError,
  explorer,
  totalGames,
} from '../lib/lichess/explorer'
import type { ExplorerMove, ExplorerResult } from '../lib/lichess/explorer'
import { EXPLORER_MODES, EXPLORER_RATINGS, EXPLORER_SPEEDS, withRecentPlayer } from '../lib/settings'
import type { ExplorerSettings } from '../lib/settings'
import PlayerDialog from './PlayerDialog'
import { loadSession, openSignInWindow, saveSession, signIn } from '../lib/lichess/oauth'
import type { LichessSession } from '../lib/lichess/oauth'
import { fetchAccount } from '../lib/lichess/studies'

/**
 * How long the board has to sit still before this asks Lichess anything.
 *
 * Held down, an arrow key walks a game far faster than this. The client would
 * cope — it queues one request and drops the rest — but the cheapest request is
 * the one never made, and nobody is reading a table that is being replaced
 * every 60ms anyway.
 */
const SETTLE_MS = 350

interface OpeningExplorerProps {
  /** The position on the board. */
  fen: string
  /**
   * Play a move from the table into the game, by SAN.
   *
   * SAN rather than the UCI beside it because the two disagree about
   * castling: the explorer answers with the king-takes-rook form the variant
   * indexer uses internally, so `e1h1` for O-O, and squares that far apart are
   * not a legal king move — every castle silently did nothing. SAN also
   * carries the promotion piece, which the old path had hard-coded to a queen.
   */
  onPlayMove: (san: string) => boolean
  /** Which database, and how its games are filtered. Set by the pane's gear. */
  settings: ExplorerSettings
  onSettingsChange: (next: ExplorerSettings) => void
  /**
   * Whether the player picker is open. Owned by the pane rather than here,
   * because the gear opens it too and clearing the current player to force it
   * would throw away the name it is meant to be changing.
   */
  picking: boolean
  onPickingChange: (open: boolean) => void
  /** The squares of the row under the pointer, for the board's hint arrow. */
  onHoverMove: (move: { from: string; to: string } | null) => void
}

/** A row's three-way split, as whole percentages that add to 100. */
function split(move: Pick<ExplorerMove, 'white' | 'draws' | 'black'>) {
  const total = totalGames(move)
  if (total === 0) return { white: 0, draws: 0, black: 0 }
  const white = Math.round((move.white / total) * 100)
  const draws = Math.round((move.draws / total) * 100)
  // Black takes the remainder rather than its own rounding, so the bar always
  // fills its track exactly instead of leaving a hairline gap at 33/33/33.
  return { white, draws, black: 100 - white - draws }
}

function games(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** The white / draw / black bar, the one thing this table is really for. */
function ResultBar({ move }: { move: Pick<ExplorerMove, 'white' | 'draws' | 'black'> }) {
  const pct = split(move)
  const label = (value: number) => (value >= 12 ? `${value}%` : '')
  return (
    <span className="flex h-4 w-full overflow-hidden rounded-full border border-rule text-[10px] leading-4">
      <span
        className="flex items-center justify-center bg-explorer-white text-explorer-white-ink"
        style={{ width: `${pct.white}%` }}
      >
        {label(pct.white)}
      </span>
      <span
        className="flex items-center justify-center bg-explorer-draw text-explorer-draw-ink"
        style={{ width: `${pct.draws}%` }}
      >
        {label(pct.draws)}
      </span>
      <span
        className="flex items-center justify-center bg-explorer-black text-explorer-black-ink"
        style={{ width: `${pct.black}%` }}
      >
        {label(pct.black)}
      </span>
    </span>
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-ink-mute">{children}</p>
}

/**
 * The Lichess opening explorer for the position on the board.
 *
 * Both of its databases need a Lichess token — see the note on the client —
 * so signed out this asks rather than failing, using the same sign-in the
 * study import uses. Signed in, a row is a move: clicking one plays it into
 * the game, which is what makes this useful for building a repertoire rather
 * than only for reading statistics.
 */
export default function OpeningExplorer({
  fen,
  onPlayMove,
  settings,
  onSettingsChange,
  picking,
  onPickingChange,
  onHoverMove,
}: OpeningExplorerProps) {
  const db = settings.db
  const [session, setSession] = useState<LichessSession | null>(() => loadSession())
  const [result, setResult] = useState<ExplorerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const choosePlayer = useCallback(
    (name: string) => {
      onSettingsChange({
        ...settings,
        db: 'player',
        player: name,
        recentPlayers: withRecentPlayer(settings.recentPlayers, name),
      })
      onPickingChange(false)
    },
    [onPickingChange, onSettingsChange, settings],
  )

  const token = session?.token ?? ''

  /**
   * The filters as the endpoint wants them.
   *
   * A full selection is sent as nothing at all: it means the same to the API
   * and it keeps one cache entry for "unfiltered" rather than two. The date
   * bounds come from whichever pair belongs to this database — a `YYYY-MM`
   * sent to masters would filter nothing and quietly look like a bug.
   */
  const filters = useMemo(() => {
    if (settings.db === 'masters') {
      return { since: settings.mastersSince, until: settings.mastersUntil }
    }
    const shared = {
      speeds: settings.speeds.length === EXPLORER_SPEEDS.length ? undefined : settings.speeds,
      since: settings.since,
      until: settings.until,
    }
    if (settings.db === 'player') {
      return {
        ...shared,
        player: settings.player,
        color: settings.playerColor,
        modes: settings.modes.length === EXPLORER_MODES.length ? undefined : settings.modes,
      }
    }
    return {
      ...shared,
      ratings:
        settings.ratings.length === EXPLORER_RATINGS.length ? undefined : settings.ratings,
    }
  }, [
    settings.db,
    settings.speeds,
    settings.ratings,
    settings.since,
    settings.until,
    settings.mastersSince,
    settings.mastersUntil,
    settings.player,
    settings.playerColor,
    settings.modes,
  ])

  useEffect(() => {
    if (!token) {
      setResult(null)
      setError(null)
      return
    }

    // A position already answered paints at once and queues nothing: walking
    // back up a line you have just walked down should cost no requests. The
    // filters are part of the key, so narrowing them asks again rather than
    // showing the wider answer.
    const query = { db, fen, ...filters }
    const hit = explorer.cached(query)
    if (hit) {
      setResult(hit)
      setError(null)
      setLoading(false)
      return
    }

    setResult(null)
    setError(null)
    setLoading(true)
    let cancelled = false
    const timer = setTimeout(() => {
      explorer
        // The player database streams: each interim answer is a whole result,
        // so the table fills in and then sharpens while Lichess indexes that
        // account, rather than sitting blank for however long that takes.
        .lookup(query, token, (partial) => {
          if (!cancelled) setResult(partial)
        })
        .then((next) => {
          if (cancelled) return
          setResult(next)
          setLoading(false)
        })
        .catch((failure: unknown) => {
          // The board moved on; whatever is on it now has its own request.
          if (cancelled || failure instanceof ExplorerAbandonedError) return
          setLoading(false)
          if (failure instanceof ExplorerRateLimitError) {
            const seconds = Math.ceil(explorer.cooldownRemaining() / 1000)
            setError(
              `Lichess is rate-limiting this browser. Pausing for ${seconds}s — ` +
                'step to another position after that to try again.',
            )
          } else if (failure instanceof ExplorerAuthError) {
            setSession(null)
            setError(null)
          } else if (failure instanceof ExplorerNeedsPlayerError) {
            // Not an error to print: the panel asks for the name instead.
            setError(null)
          } else {
            setError(failure instanceof Error ? failure.message : 'Lichess did not answer')
          }
        })
    }, SETTLE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // filters is rebuilt from settings on every render, so the memo below is
    // what keeps this effect from re-firing on an unrelated state change.
  }, [db, fen, token, filters])

  const onSignIn = useCallback(async () => {
    setSigningIn(true)
    setError(null)
    try {
      // The window is opened in the click, never after an await: a pop-up
      // opened later is a pop-up the browser blocks.
      const { token: fresh, expiresAt } = await signIn(openSignInWindow())
      // The name is not needed here, but the session shape carries it and the
      // study dialog reads the same stored session.
      const { username } = await fetchAccount(fresh)
      const next = { token: fresh, expiresAt, username }
      saveSession(next)
      setSession(next)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-in failed')
    } finally {
      setSigningIn(false)
    }
  }, [])

  // The hint belongs to a position, so leaving one takes it with us. Without
  // this, stepping the board while the pointer sits over a row leaves an arrow
  // on the new position for a move that may not even be legal there.
  useEffect(() => () => onHoverMove(null), [fen, db, onHoverMove])

  /**
   * Every legal move here, by SAN, with the squares its piece actually crosses.
   *
   * One pass over the position answers both questions the table has: whether a
   * row is playable at all, and where to point the hint arrow. Taking the
   * squares from the UCI instead is what put a castling arrow on the rook.
   */
  const legalMoves = useMemo(() => {
    const bySan = new Map<string, { from: string; to: string }>()
    try {
      for (const move of new Chess(fen).moves({ verbose: true })) {
        bySan.set(move.san, { from: move.from, to: move.to })
      }
    } catch {
      /* a position chess.js will not load has no legal moves to offer */
    }
    return bySan
  }, [fen])

  const total = result ? totalGames(result) : 0

  return (
    <div className="flex h-full min-h-0 flex-col px-3">
      <div className="flex items-center gap-2 pb-1">
        <div role="tablist" aria-label="Opening database" className="flex gap-1">
          {(['masters', 'lichess', 'player'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={db === id}
              // Picking the player tab with nobody chosen goes straight to the
              // picker: the tab is useless until it has a name, and making the
              // reader find the gear to supply one is a step for nothing.
              onClick={() => {
                if (id === 'player' && !settings.player) onPickingChange(true)
                onSettingsChange({ ...settings, db: id })
              }}
              className={`rounded-md px-2 py-0.5 text-xs font-semibold transition-colors ${
                db === id ? 'bg-buff-soft text-ink' : 'text-ink-mute hover:text-ink'
              }`}
            >
              {id === 'masters' ? 'Masters' : id === 'lichess' ? 'Lichess' : 'Player'}
            </button>
          ))}
        </div>
        {/* The opening's name is the header on lichess too, and it is the one
            thing here that names what you are looking at. */}
        {/* Whose games, then what the position is called — the opening keeps
            the same place it has on the other two tabs, with the player in
            front of it rather than instead of it. Both halves are the control
            for the thing they name. */}
        <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden text-xs">
          {db === 'player' && settings.player && (
            <>
              <button
                type="button"
                onClick={() => onPickingChange(true)}
                title="Look up a different player"
                className="max-w-32 shrink-0 truncate font-semibold text-ink hover:underline"
              >
                {settings.player}
              </button>
              <button
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    playerColor: settings.playerColor === 'white' ? 'black' : 'white',
                  })
                }
                title="Look for their games on the other side"
                className="shrink-0 text-ink-mute hover:underline"
              >
                ({settings.playerColor})
              </button>
            </>
          )}
          <span className="min-w-0 truncate font-semibold text-felt-bright">
            {result?.opening ? `${result.opening.eco} ${result.opening.name}` : ''}
          </span>
        </span>
        {loading && (
          <span className="shrink-0 text-[10px] text-ink-mute">
            {/* The player database indexes an account on demand, and says how
                many are ahead of it while it waits. Saying so is the
                difference between "slow" and "queued behind four people". */}
            {result?.queuePosition != null && result.queuePosition > 0
              ? `Queued (${result.queuePosition})…`
              : db === 'player'
                ? 'Indexing…'
                : 'Loading…'}
          </span>
        )}
      </div>

      {picking && (
        <PlayerDialog
          recent={settings.recentPlayers}
          current={settings.player}
          onChoose={choosePlayer}
          onClose={() => onPickingChange(false)}
        />
      )}

      {!token ? (
        <Message>
          <span className="block">
            Lichess now requires a sign-in for its opening explorer, so this needs the same
            Lichess account the study export uses. Nothing is uploaded — only the position on
            the board is sent.
          </span>
          <button
            type="button"
            onClick={onSignIn}
            disabled={signingIn}
            className="mt-3 rounded-lg border border-rule px-3 py-1.5 text-xs font-medium transition-colors hover:bg-buff-soft disabled:opacity-40"
          >
            {signingIn ? 'Signing in…' : 'Sign in with Lichess'}
          </button>
          {error && <span className="mt-2 block text-xs text-class-blunder">{error}</span>}
        </Message>
      ) : error ? (
        <Message>{error}</Message>
      ) : db === 'player' && !settings.player ? (
        <Message>
          <span className="block">
            Read one player's games from this position — their repertoire, and how it has
            scored — to prepare for a game against them.
          </span>
          <button
            type="button"
            onClick={() => onPickingChange(true)}
            className="mt-3 rounded-lg border border-rule px-3 py-1.5 text-xs font-medium transition-colors hover:bg-buff-soft"
          >
            Choose a player
          </button>
        </Message>
      ) : result && result.moves.length === 0 && !loading ? (
        // Only once the answer is final. The player database streams, and its
        // first line is often an empty one while indexing starts — saying
        // "no games" there is wrong for as long as it takes to be right.
        <Message>
          {db === 'player'
            ? `${settings.player} has no games as ${settings.playerColor} from this position.`
            : `No games in the ${db === 'masters' ? 'masters' : 'Lichess'} database from this position.`}
        </Message>
      ) : !result ? (
        <Message>Looking this position up on Lichess…</Message>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-ink-mute">
                <th className="px-2 py-0.5 text-left font-medium">Move</th>
                <th className="px-2 py-0.5 text-right font-medium">Games</th>
                <th className="px-2 py-0.5 text-left font-medium">White / Draw / Black</th>
              </tr>
            </thead>
            <tbody>
              {result.moves.map((move) => {
                const count = totalGames(move)
                const squares = legalMoves.get(move.san) ?? null
                return (
                  <tr
                    key={move.uci}
                    className={`border-t border-rule/60 ${
                      squares ? 'cursor-pointer hover:bg-buff-soft' : 'opacity-50'
                    }`}
                    // The whole row, not just the move: it is a wide, thin
                    // target and every part of it is about that one move.
                    onClick={() => squares && onPlayMove(move.san)}
                    onMouseEnter={() => onHoverMove(squares)}
                    onMouseLeave={() => onHoverMove(null)}
                    title={
                      squares
                        ? `Play ${move.san} — average rating ${move.averageRating}`
                        : `${move.san} is not legal in this position`
                    }
                  >
                    <td className="w-14 px-2 py-1 font-score font-semibold">{move.san}</td>
                    <td className="w-20 px-2 py-1 text-right font-score tabular-nums">
                      <span className="text-ink-mute">
                        {total === 0 ? 0 : Math.round((count / total) * 100)}%
                      </span>{' '}
                      {games(count)}
                    </td>
                    <td className="px-2 py-1">
                      <ResultBar move={move} />
                    </td>
                  </tr>
                )
              })}
              {/* The Σ row lichess shows: what the position as a whole scores,
                  which is not the same as any one move on it. */}
              <tr className="border-t-2 border-rule font-semibold">
                <td className="px-2 py-1 font-score">Σ</td>
                <td className="px-2 py-1 text-right font-score tabular-nums">{games(total)}</td>
                <td className="px-2 py-1">
                  <ResultBar move={result} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
