import { useEffect, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { encodeGame, shareLink, SHARE_LINK_WARN_CHARS } from '../lib/share'

interface PgnActionsProps {
  /** The converted PGN, already rebuilt from the current tag values. */
  pgn: string
  fileName: string
  compact?: boolean
  /**
   * Told when a share link has been copied, and whether it came out long
   * enough that something between here and the reader may break it. The caller
   * owns the note, because it belongs under this row rather than in it.
   */
  onShared?: (long: boolean) => void
}

/**
 * Lichess's API import endpoint, not the /import the web form posts to: that
 * one rejects cross-origin posts with "Cross origin request forbidden". This
 * one sets permissive CORS and takes an anonymous post, so no key or account
 * is needed. It answers with JSON only when asked to.
 *
 * It has no equivalent of the web form's `analyse` checkbox — passing one is
 * accepted and then ignored, and there is no public endpoint to request an
 * analysis afterwards, so that stays a click on the game page.
 */
const LICHESS_IMPORT_API = 'https://lichess.org/api/import'

/**
 * Lichess only understands increment time controls. Handed a delay one like
 * `4200d10` it gives up on the whole header — the game arrives with
 * `TimeControl "-"` and every %clk comment stripped, which is the one thing
 * this app exists to produce.
 *
 * Rewriting the tag to `4200+0` keeps the clocks. The delay is not lost in any
 * meaningful sense: it was already spent when the clock values were computed,
 * and Lichess has no way to represent it regardless.
 */
function forLichess(pgn: string): string {
  return pgn.replace(/^\[TimeControl "(\d+)d\d+"\]$/m, '[TimeControl "$1+0"]')
}

/**
 * Chess.com's analysis board reads the game from a `pgn` query parameter. A
 * full 70-move game with clock comments lands around 6.5 kB of URL, which it
 * handles; the guard below covers marathon games that would push past what
 * browsers and proxies reliably accept.
 */
const CHESSCOM_ANALYSIS_URL = 'https://www.chess.com/analysis'
const MAX_URL_CHARS = 8000

const ICON_PROPS = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  className: 'size-3.5 shrink-0',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const CopyIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </svg>
)

const CheckIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const DownloadIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
)

/*
 * The two sites' own marks, so a button says where it goes before its label is
 * read. Both are the Simple Icons drawings (CC0); the marks themselves are the
 * sites' trademarks, used here only to point at those sites. They are solid
 * shapes rather than strokes, so they take fill and not the stroke the icons
 * above are drawn with.
 */
const BRAND_ICON_PROPS = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  className: 'size-3.5 shrink-0',
  fill: 'currentColor',
}

const LichessIcon = () => (
  <svg {...BRAND_ICON_PROPS}>
    <path d="M10.457 6.161a.237.237 0 0 0-.296.165c-.8 2.785 2.819 5.579 5.214 7.428.653.504 1.216.939 1.591 1.292 1.745 1.642 2.564 2.851 2.733 3.178a.24.24 0 0 0 .275.122c.047-.013 4.726-1.3 3.934-4.574a.257.257 0 0 0-.023-.06L18.204 3.407 18.93.295a.24.24 0 0 0-.262-.293c-1.7.201-3.115.435-4.5 1.425-4.844-.323-8.718.9-11.213 3.539C.334 7.737-.246 11.515.085 14.128c.763 5.655 5.191 8.631 9.081 9.532.993.229 1.974.34 2.923.34 3.344 0 6.297-1.381 7.946-3.85a.24.24 0 0 0-.372-.3c-3.411 3.527-9.002 4.134-13.296 1.444-4.485-2.81-6.202-8.41-3.91-12.749C4.741 4.221 8.801 2.362 13.888 3.31c.056.01.115 0 .165-.029l.335-.197c.926-.546 1.961-1.157 2.873-1.279l-.694 1.993a.243.243 0 0 0 .02.202l6.082 10.192c-.193 2.028-1.706 2.506-2.226 2.611-.287-.645-.814-1.364-2.306-2.803-.422-.407-1.21-.941-2.124-1.56-2.364-1.601-5.937-4.02-5.391-5.984a.239.239 0 0 0-.165-.295z" />
  </svg>
)

const ChessComIcon = () => (
  <svg {...BRAND_ICON_PROPS}>
    <path d="M12 0a3.85 3.85 0 0 0-3.875 3.846A3.84 3.84 0 0 0 9.73 6.969l-2.79 1.85c0 .622.144 1.114.434 1.649H9.83c-.014.245-.014.549-.014.925 0 .025.003.048.006.071-.064 1.353-.507 3.472-3.62 5.842-.816.625-1.423 1.495-1.806 2.533a.33.33 0 0 0-.045.084 8.124 8.124 0 0 0-.39 2.516c0 .1.216 1.561 8.038 1.561s8.038-1.46 8.038-1.561c0-2.227-.824-4.048-2.24-5.133-4.034-3.08-3.586-5.74-3.644-6.838h2.458c.29-.535.434-1.027.434-1.649l-2.79-1.836a3.86 3.86 0 0 0 1.604-3.123A3.873 3.873 0 0 0 13.445.275c-.004-.002-.01.004-.015.004A3.76 3.76 0 0 0 12 0Z" />
  </svg>
)

/** Copy, download, and hand-off-to-an-analysis-site buttons for the PGN. */
export default function PgnActions({
  pgn,
  fileName,
  compact = false,
  onShared,
}: PgnActionsProps) {
  const [copied, setCopied] = useState(false)
  const [lichess, setLichess] = useState<'idle' | 'importing' | 'error'>('idle')
  const [share, setShare] = useState<'idle' | 'working' | 'done' | 'error'>('idle')

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (lichess !== 'error') return
    const timer = setTimeout(() => setLichess('idle'), 4000)
    return () => clearTimeout(timer)
  }, [lichess])


  // The share confirmation goes back to reading "Share" on its own, the way
  // Copy's tick does.
  useEffect(() => {
    if (share !== 'done' && share !== 'error') return
    const timer = setTimeout(() => setShare('idle'), 4000)
    return () => clearTimeout(timer)
  }, [share])
  const download = () => {
    const blob = new Blob([pgn], { type: 'application/x-chess-pgn' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    if (await copyText(pgn)) setCopied(true)
  }

  const openLichess = async () => {
    if (lichess === 'importing') return

    // The tab has to be opened synchronously inside the click. Opening it after
    // the request resolves puts it outside the user gesture and popup blockers
    // stop it. Dropping `opener` keeps lichess.org from reaching back here.
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    setLichess('importing')

    try {
      const res = await fetch(LICHESS_IMPORT_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Without this the endpoint answers with its HTML page instead.
          Accept: 'application/json',
        },
        body: new URLSearchParams({ pgn: forLichess(pgn) }),
      })
      if (!res.ok) throw new Error(`Lichess returned ${res.status}`)
      const game = (await res.json()) as { url?: string }
      if (!game.url) throw new Error('No game URL in the response')

      if (tab) tab.location.href = game.url
      else window.open(game.url, '_blank', 'noopener,noreferrer')
      setLichess('idle')
    } catch {
      // Leaving a blank tab open would look like the import worked.
      tab?.close()
      setLichess('error')
    }
  }

  const openChessCom = () => {
    const build = (text: string) => `${CHESSCOM_ANALYSIS_URL}?pgn=${encodeURIComponent(text)}`
    let url = build(pgn)
    if (url.length > MAX_URL_CHARS) {
      // Last resort for a marathon game: the comments are the bulk of the text,
      // so dropping them is the difference between a usable board and a URL the
      // browser refuses. It is a real loss though — chess.com reads these and
      // shows a per-move time beside each move — so it only happens up here at
      // the limit, never on a normal game.
      url = build(pgn.replace(/\s*\{\[%clk[^}]*\}/g, ''))
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Compact is the size inside the game pane's tabs, where every control in
  // the row — Copy, Download, the two analysis links and Lichess Study — has to
  // agree on one height or the row reads as three different rows.
  /**
   * Put a link carrying the whole game on the clipboard.
   *
   * It belongs in this row rather than beside it: these are the ways out of the
   * app with this PGN, and a share link is one of them. What travels is what
   * the Include switches say — evals included, which a game sent through a
   * Lichess study loses, since Lichess strips every command it does not
   * maintain itself.
   */
  const shareGame = async () => {
    setShare('working')
    try {
      const link = shareLink(await encodeGame(pgn), window.location)
      if (!(await copyText(link))) throw new Error('clipboard refused')
      setShare('done')
      onShared?.(link.length > SHARE_LINK_WARN_CHARS)
    } catch {
      setShare('error')
    }
  }

  const size = compact ? 'px-2.5 py-1 text-xs' : 'px-4 py-2.5'
  const face =
    'inline-flex items-center rounded-lg bg-felt font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep'
  const button = `${face} gap-1.5 ${size}`
  // Square, so a lone icon is centred rather than sitting in a label's slot.
  const iconOnly = `${face} justify-center ${compact ? 'size-6' : 'size-11'}`

  return (
    /* No shrink-0: it stopped the row being squeezed to the available width,
       so flex-wrap never engaged and the last button ran off a phone screen. */
    <div className="flex flex-wrap items-center gap-2">
      {/* Copy and Download carry their icon alone: the pair is a convention
          anyone reads at a glance, and the words were the widest part of a row
          that has to wrap onto a phone. Their labels live in the tooltip and
          in the screen-reader name. */}
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied' : 'Copy the PGN to the clipboard'}
        aria-label={copied ? 'Copied' : 'Copy the PGN to the clipboard'}
        className={iconOnly}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <button
        type="button"
        onClick={download}
        title={`Download ${fileName}`}
        aria-label={`Download ${fileName}`}
        className={iconOnly}
      >
        <DownloadIcon />
      </button>
      {/* Before the two analysis links: those hand the game to another site,
          this hands it to a person, and the copy-shaped pair above it are the
          other two ways of taking it away yourself. */}
      <button
        type="button"
        onClick={() => void shareGame()}
        disabled={share === 'working'}
        title="Copy a link that opens this game in ChessPique"
        className={`${button} disabled:cursor-not-allowed disabled:opacity-70`}
      >
        {share === 'done' ? <CheckIcon /> : <CopyIcon />}
        {share === 'working'
          ? 'Linking…'
          : share === 'done'
            ? 'Link copied'
            : share === 'error'
              ? 'Copy failed'
              : 'Share link'}
      </button>
      <button
        type="button"
        onClick={openChessCom}
        title="Open on the chess.com analysis board in a new tab"
        className={button}
      >
        <ChessComIcon />
        Analysis
      </button>
      <button
        type="button"
        onClick={openLichess}
        disabled={lichess === 'importing'}
        title="Import to lichess.org in a new tab, then request its computer analysis from the game page"
        className={`${button} disabled:cursor-not-allowed disabled:opacity-70`}
      >
        <LichessIcon />
        {lichess === 'importing' ? 'Importing…' : lichess === 'error' ? 'Import failed' : 'Analysis'}
      </button>
    </div>
  )
}
