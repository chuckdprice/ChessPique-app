import { useEffect, useState } from 'react'

interface PgnActionsProps {
  /** The converted PGN, already rebuilt from the current tag values. */
  pgn: string
  fileName: string
  compact?: boolean
}

/** Download and clipboard-copy buttons for the converted PGN. */
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

  const size = compact ? 'px-3 py-1.5 text-sm' : 'px-5 py-2.5'

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className={`rounded-lg border border-rule bg-card font-medium text-ink transition-colors hover:bg-buff-soft ${size}`}
      >
        {copied ? 'Copied' : 'Copy PGN'}
      </button>
      <button
        type="button"
        onClick={download}
        className={`rounded-lg bg-felt font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep ${size}`}
      >
        Download PGN
      </button>
    </div>
  )
}
