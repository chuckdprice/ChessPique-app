import { useEffect, useState } from 'react'

interface PgnActionsProps {
  /** The converted PGN, already rebuilt from the current tag values. */
  pgn: string
  fileName: string
  compact?: boolean
}

/**
 * Lichess accepts a plain form post of a PGN, with `analyse` asking it to queue
 * a computer analysis — the same fields its own import page submits. Posting a
 * form rather than fetching sidesteps CORS and needs no API key or account.
 */
const LICHESS_IMPORT_URL = 'https://lichess.org/import'

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

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

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

  const openLichess = () => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = LICHESS_IMPORT_URL
    form.target = '_blank'
    form.rel = 'noopener'
    form.style.display = 'none'

    // A textarea, not an input: the PGN is multi-line and an input would
    // collapse it to the first line.
    const pgnField = document.createElement('textarea')
    pgnField.name = 'pgn'
    pgnField.value = pgn
    form.appendChild(pgnField)

    const analyse = document.createElement('input')
    analyse.type = 'hidden'
    analyse.name = 'analyse'
    analyse.value = 'on'
    form.appendChild(analyse)

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  const openChessCom = () => {
    const build = (text: string) => `${CHESSCOM_ANALYSIS_URL}?pgn=${encodeURIComponent(text)}`
    let url = build(pgn)
    if (url.length > MAX_URL_CHARS) {
      // Drop the clock comments rather than the game: they are the bulk of the
      // text, and chess.com's analysis board does not surface them anyway.
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
        title="Import to lichess.org in a new tab and request a computer analysis"
        className={button}
      >
        <ExternalIcon />
        Lichess
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
