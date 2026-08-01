import { useEffect, useState } from 'react'

interface PgnActionsProps {
  /** The converted PGN, already rebuilt from the current tag values. */
  pgn: string
  fileName: string
  compact?: boolean
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
  className: 'size-4 shrink-0',
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

/** Both external sites open in a new tab, so they share the same affordance. */
const ExternalIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </svg>
)

/** Copy, download, and hand-off-to-an-analysis-site buttons for the PGN. */
export default function PgnActions({ pgn, fileName, compact = false }: PgnActionsProps) {
  const [copied, setCopied] = useState(false)
  const [lichess, setLichess] = useState<'idle' | 'importing' | 'error'>('idle')

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
    try {
      await navigator.clipboard.writeText(pgn)
      setCopied(true)
    } catch {
      // Clipboard API needs a secure context and permission; fall back to a
      // hidden textarea so the button still works on plain http.
      try {
        const area = document.createElement('textarea')
        area.value = pgn
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
        setCopied(true)
      } catch {
        /* leave the button unconfirmed rather than claiming success */
      }
    }
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

  const size = compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5'
  const button = `inline-flex items-center gap-1.5 rounded-lg bg-felt font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep ${size}`

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <button type="button" onClick={copy} title="Copy the PGN to the clipboard" className={button}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        type="button"
        onClick={download}
        title={`Download ${fileName}`}
        className={button}
      >
        <DownloadIcon />
        Download
      </button>
      <button
        type="button"
        onClick={openLichess}
        disabled={lichess === 'importing'}
        title="Import to lichess.org in a new tab, then request its computer analysis from the game page"
        className={`${button} disabled:cursor-not-allowed disabled:opacity-70`}
      >
        <ExternalIcon />
        {lichess === 'importing' ? 'Importing…' : lichess === 'error' ? 'Import failed' : 'Lichess'}
      </button>
      <button
        type="button"
        onClick={openChessCom}
        title="Open on the chess.com analysis board in a new tab"
        className={button}
      >
        <ExternalIcon />
        Chess.com
      </button>
    </div>
  )
}
