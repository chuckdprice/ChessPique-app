import { DEFAULT_ENGINE } from '../lib/settings'
import type { EngineSettings } from '../lib/settings'
import { SliderRow, SwitchRow, MAIA_CAPTION } from './EngineSettings'
import BackupSettings from './BackupSettings'

interface SettingsPageProps {
  engine: EngineSettings
  onEngineChange: (next: EngineSettings) => void
}

function Section({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-rule bg-card p-5 shadow-sm">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-mute">{caption}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/**
 * The app's own settings, as opposed to the game's.
 *
 * The engine controls are the same ones behind the gear on the analysis page,
 * reading and writing the same saved values — that panel is the shortcut while
 * you are looking at a position, this is where they live.
 */
export default function SettingsPage({ engine, onEngineChange }: SettingsPageProps) {
  const threads = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1
  const atDefaults =
    engine.searchTimeSec === DEFAULT_ENGINE.searchTimeSec &&
    engine.multiPv === DEFAULT_ENGINE.multiPv &&
    engine.hashMb === DEFAULT_ENGINE.hashMb &&
    engine.stockfish === DEFAULT_ENGINE.stockfish &&
    engine.arrows === DEFAULT_ENGINE.arrows &&
    engine.arrowEvals === DEFAULT_ENGINE.arrowEvals &&
    engine.maia === DEFAULT_ENGINE.maia &&
    engine.maiaArrows === DEFAULT_ENGINE.maiaArrows &&
    engine.maiaArrowEvals === DEFAULT_ENGINE.maiaArrowEvals &&
    engine.maiaRating === DEFAULT_ENGINE.maiaRating

  return (
    <div className="mx-auto w-full max-w-2xl py-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-semibold">Settings</h2>
        <button
          type="button"
          onClick={() => onEngineChange(DEFAULT_ENGINE)}
          disabled={atDefaults}
          className="rounded-lg border border-rule px-3 py-1.5 text-xs font-medium transition-colors hover:bg-buff-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset to defaults
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <Section
          title="Engine"
          caption="How Stockfish searches while you sit on a position. Saved on this device."
        >
          <SliderRow
            label="Search time"
            display={`${engine.searchTimeSec}s`}
            min={1}
            max={30}
            step={1}
            value={engine.searchTimeSec}
            caption="How long the engine thinks about the position on the board."
            onChange={(v) => onEngineChange({ ...engine, searchTimeSec: v })}
          />
          <SliderRow
            label="Multiple lines"
            display={`${engine.multiPv} / 5`}
            min={1}
            max={5}
            step={1}
            value={engine.multiPv}
            caption="How many candidate moves the engine panel lists."
            onChange={(v) => onEngineChange({ ...engine, multiPv: v })}
          />
          <SliderRow
            label="Memory"
            display={`${engine.hashMb}MB`}
            min={16}
            max={512}
            step={16}
            value={engine.hashMb}
            caption="Hash table size. More helps a long search; it does not speed up a short one."
            onChange={(v) => onEngineChange({ ...engine, hashMb: v })}
          />
          <SliderRow
            label="Threads"
            display={`1 / ${threads}`}
            min={1}
            max={1}
            step={1}
            value={1}
            disabled
            caption="Single-threaded in browser WASM."
          />
        </Section>

        {/* The same split the two menus on the analysis page make: the gear on
            the engine panel is Stockfish, the menu on the board is what the
            board draws. */}
        <Section
          title="Board"
          caption="What is drawn on the board. The board's own menu offers these too."
        >
          <SwitchRow
            label="Stockfish Engine"
            caption="Show the engine's candidate moves in the Move Evals pane beside the board."
            checked={engine.stockfish}
            onChange={(v) => onEngineChange({ ...engine, stockfish: v })}
          />
          <SwitchRow
            label="Display SF Arrows"
            caption="Draw the engine's candidate moves on the board. Separate from the list, because a board carrying five arrows is busy even when the numbers are wanted."
            checked={engine.arrows}
            onChange={(v) => onEngineChange({ ...engine, arrows: v })}
          />
          <SwitchRow
            label="Scores on Arrows"
            caption="Print each candidate move's evaluation at the head of its arrow on the board. The best move's is filled in."
            checked={engine.arrowEvals}
            onChange={(v) => onEngineChange({ ...engine, arrowEvals: v })}
          />
          <SwitchRow
            label="Maia 3: Human Moves"
            caption={MAIA_CAPTION}
            checked={engine.maia}
            onChange={(v) => onEngineChange({ ...engine, maia: v })}
          />
          <SwitchRow
            label="Display Maia Arrows"
            caption="Draw the moves a human of the chosen rating would most likely play on the board."
            checked={engine.maiaArrows}
            onChange={(v) => onEngineChange({ ...engine, maiaArrows: v })}
          />
          <SwitchRow
            label="Maia % on Arrows"
            caption="Print how likely a human is to play the move at the head of its arrow. Maia scores every legal move, so the engine's candidates and the move actually played carry one too."
            checked={engine.maiaArrowEvals}
            onChange={(v) => onEngineChange({ ...engine, maiaArrowEvals: v })}
          />
        </Section>

        <BackupSettings />
      </div>
    </div>
  )
}
