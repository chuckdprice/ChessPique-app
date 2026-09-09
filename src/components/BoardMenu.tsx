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
 * The board's own menu: which engines run, and what they draw.
 *
 * These used to live behind the engine panel's gear, under a heading carrying
 * Stockfish's name, which is the wrong place for most of them — the percentages
 * are Maia's and the arrows are the board's. They are here, at the end of the
 * nav row, beside the thing they change.
 *
 * Two groups with the same shape, one per engine: the engine's own switch, and
 * under it what that engine is allowed to draw. The nesting is drawn as well as
 * meant — a rule down the left and an indent — because five switches in a flat
 * column gave no hint that three of them belonged to one of the other two.
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
        aria-label="Board menu — which engines run and what they draw"
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
          <div>
            <SwitchRow
              label="Stockfish Engine"
              caption="Show the engine's candidate moves in the Move Evals pane."
              checked={value.stockfish}
              onChange={(v) => set({ ...value, stockfish: v })}
            />
            {/* Only while the engine is on: a switch for something that cannot
                be drawn is a switch that does nothing. */}
            {value.stockfish && (
              <Nested>
                <SwitchRow
                  label="Display SF Arrows"
                  caption="Draw the engine's candidate moves on the board."
                  checked={value.arrows}
                  onChange={(v) => set({ ...value, arrows: v })}
                />
                <SwitchRow
                  label="Scores on Arrows"
                  caption="Print each candidate's evaluation at the head of its arrow."
                  checked={value.arrowEvals}
                  onChange={(v) => set({ ...value, arrowEvals: v })}
                />
              </Nested>
            )}
          </div>

          <div className="border-t border-rule pt-4">
            <SwitchRow
              label="Maia 3: Human Moves"
              caption={MAIA_CAPTION}
              checked={value.maia}
              onChange={(v) => set({ ...value, maia: v })}
            />
            {value.maia && (
              <Nested>
                <SwitchRow
                  label="Display Maia Arrows"
                  caption="Draw the moves a human would most likely play on the board."
                  checked={value.maiaArrows}
                  onChange={(v) => set({ ...value, maiaArrows: v })}
                />
                <SwitchRow
                  label="Maia % on Arrows"
                  caption="Print how likely a human is to play the move at the head of its arrow."
                  checked={value.maiaArrowEvals}
                  onChange={(v) => set({ ...value, maiaArrowEvals: v })}
                />
              </Nested>
            )}
          </div>
        </SettingsPopover>
      )}
    </>
  )
}

/** What an engine draws, shown as belonging to the engine's own switch. */
function Nested({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 space-y-3 border-l-2 border-rule pl-3 ms-1.5">{children}</div>
  )
}
