import { useRef, useState } from 'react'
import type { EngineSettings } from '../lib/settings'
import { saveEngineSettings } from '../lib/settings'
import { MAIA_CAPTION, SwitchRow } from './EngineSettings'
import SettingsPopover from './SettingsPopover'

interface BoardMenuProps {
  value: EngineSettings
  onChange: (next: EngineSettings) => void
  /** Shared with the nav buttons beside it so the row reads as one control. */
  className?: string
}

/**
 * The board's own menu: what is drawn on the board.
 *
 * These three used to live behind the engine panel's gear, under a heading
 * carrying Stockfish's name, which is the wrong place for two of them — the
 * percentages are Maia's and the arrows are the board's. They are here, at the
 * end of the nav row, beside the thing they change.
 */
export default function BoardMenu({ value, onChange, className = '' }: BoardMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const set = (next: EngineSettings) => {
    onChange(next)
    saveEngineSettings(next)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Board menu — what is drawn on the board"
        title="Board menu"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <SettingsPopover anchor={buttonRef} title="Board Menu" onClose={() => setOpen(false)}>
          <SwitchRow
            label="Scores on arrows"
            caption="Print each candidate's evaluation at the head of its arrow."
            checked={value.arrowEvals}
            onChange={(v) => set({ ...value, arrowEvals: v })}
          />
          <SwitchRow
            label="Human moves (Maia 3)"
            caption={MAIA_CAPTION}
            checked={value.maia}
            onChange={(v) => set({ ...value, maia: v })}
          />
          {/* Only while Maia is on: a switch for a number that cannot appear is
              a switch that does nothing. */}
          {value.maia && (
            <SwitchRow
              label="Maia % on arrows"
              caption="Print how likely a human is to play the move at the head of its arrow."
              checked={value.maiaArrowEvals}
              onChange={(v) => set({ ...value, maiaArrowEvals: v })}
            />
          )}
        </SettingsPopover>
      )}
    </>
  )
}
