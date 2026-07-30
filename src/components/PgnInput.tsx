import { useRef, useState } from 'react'
import type { ConvertOptions } from '../lib/convert'

interface PgnInputProps {
  onConvert: (text: string, options: ConvertOptions) => void
  error: string | null
  /** Whole section open/closed (collapsed automatically after a conversion). */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Open the time-control override fields (set when auto-detection fails). */
  overridesOpen: boolean
  onOverridesOpenChange: (open: boolean) => void
}

type OverrideMode = 'auto' | 'none' | 'delay' | 'increment'

export default function PgnInput({
  onConvert,
  error,
  open,
  onOpenChange,
  overridesOpen,
  onOverridesOpenChange,
}: PgnInputProps) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [startMinutes, setStartMinutes] = useState('')
  const [mode, setMode] = useState<OverrideMode>('auto')
  const [amount, setAmount] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const buildOptions = (): ConvertOptions => {
    const options: ConvertOptions = {}
    const minutes = parseInt(startMinutes, 10)
    if (!Number.isNaN(minutes) && minutes > 0) options.startMinutes = minutes
    const amountSeconds = parseInt(amount, 10)
    if (mode === 'delay') options.delay = Number.isNaN(amountSeconds) ? 0 : amountSeconds
    if (mode === 'increment')
      options.increment = Number.isNaN(amountSeconds) ? 0 : amountSeconds
    return options
  }

  const convert = (pgnText: string) => {
    onConvert(pgnText, buildOptions())
  }

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const contents = String(reader.result ?? '')
      setText(contents)
      setFileName(file.name)
      onConvert(contents, buildOptions())
    }
    reader.readAsText(file)
  }

  return (
    <section className="rounded-xl border border-rule bg-card shadow-sm">
      <details
        open={open}
        onToggle={(e) => {
          if (e.target === e.currentTarget) onOpenChange(e.currentTarget.open)
        }}
        className="group"
      >
        <summary className="cursor-pointer select-none px-6 py-4 group-open:border-b group-open:border-rule">
          <span className="font-display text-lg font-semibold">Your game</span>
          <span className="mt-0.5 block text-sm text-ink-mute">
            Paste the PGN from your ChessNoteR, or upload the .pgn file it created.
          </span>
        </summary>

        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <label className="block">
          <span className="sr-only">PGN text</span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFileName(null)
            }}
            spellCheck={false}
            rows={10}
            placeholder={'[Event "..."]\n[TimeControl "G70/d10"]\n\n1. d4 {[%emt 0:00:00]} d5 {[%emt 0:00:05]} ...'}
            className="w-full resize-y rounded-lg border border-rule bg-buff-soft/60 px-4 py-3 font-score text-[13px] leading-relaxed placeholder:text-ink-mute/60"
          />
        </label>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) loadFile(file)
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver
                ? 'border-felt-bright bg-buff-soft'
                : 'border-rule bg-buff-soft/40 hover:border-felt-bright/60'
            }`}
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              ♞
            </span>
            <span className="text-sm font-medium">Upload a .pgn file</span>
            <span className="text-xs text-ink-mute">
              {fileName ?? 'or drop it here — converts right away'}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pgn,.txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) loadFile(file)
              e.target.value = ''
            }}
          />

          <button
            type="button"
            onClick={() => convert(text)}
            disabled={text.trim() === ''}
            className="rounded-lg bg-felt px-5 py-3 font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            Convert to %clk
          </button>
        </div>
      </div>

      <details
        open={overridesOpen}
        onToggle={(e) => onOverridesOpenChange(e.currentTarget.open)}
        className="border-t border-rule px-6 py-3"
      >
        <summary className="cursor-pointer select-none text-sm font-medium text-ink-mute hover:text-ink">
          Time control override
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-4 pb-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-mute">Starting time (minutes)</span>
            <input
              type="number"
              min={1}
              value={startMinutes}
              onChange={(e) => setStartMinutes(e.target.value)}
              placeholder="auto"
              className="w-32 rounded-md border border-rule bg-card px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-mute">Delay or increment</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as OverrideMode)}
              className="w-36 rounded-md border border-rule bg-card px-3 py-1.5"
            >
              <option value="auto">Auto-detect</option>
              <option value="none">None</option>
              <option value="delay">Delay</option>
              <option value="increment">Increment</option>
            </select>
          </label>
          {(mode === 'delay' || mode === 'increment') && (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-ink-mute">Seconds per move</span>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10"
                className="w-28 rounded-md border border-rule bg-card px-3 py-1.5"
              />
            </label>
          )}
          <p className="basis-full text-xs text-ink-mute">
            Normally the TimeControl tag (like G70/d10) is read from the PGN. Fill these in
            only when that tag is missing or wrong, then convert again.
          </p>
        </div>
      </details>

      {error && (
        <div role="alert" className="border-t border-rule px-6 py-4">
          <p className="rounded-lg bg-danger-bg px-4 py-3 text-sm text-danger-text">{error}</p>
        </div>
      )}
      </details>
    </section>
  )
}
