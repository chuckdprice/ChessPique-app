/**
 * What the converted PGN optionally carries beyond the moves and their clocks.
 *
 * The opening is not among these: the ECO and Opening tags are always written
 * when the game's opening is known, as the Annotator tag always is.
 */
export interface PgnExtras {
  /** `[%clk ...]` on every move — what the conversion is for. */
  clocks: boolean
  /** `[%eval ...]` on every move, from the engine review. */
  evals: boolean
  /**
   * The annotator's own comments from the source file, and the engine's own
   * verdict on a flagged move.
   */
  comments: boolean
  /** The engine's line after a flagged move, as a PGN variation. */
  variations: boolean
}

interface PgnExtrasSwitchesProps {
  extras: PgnExtras
  /**
   * One switch at a time, rather than a whole new object. Handing back
   * `{ ...extras, [id]: on }` would spread whatever this render was given, and
   * two switches flipped before React re-renders would lose the first.
   */
  onChange: (id: keyof PgnExtras, on: boolean) => void
  /** True once the engine review has finished and evals exist to include. */
  hasEvals: boolean
}

const SWITCHES: Array<{ id: keyof PgnExtras; label: string; hint: string }> = [
  { id: 'clocks', label: 'Clocks', hint: 'Write [%clk] on every move — the converted clock times' },
  { id: 'evals', label: 'Evals', hint: 'Write [%eval] on every move from the engine review' },
  {
    id: 'comments',
    label: 'Comments',
    hint: "Keep the source file's own move comments, and note each inaccuracy, mistake and blunder",
  },
  {
    id: 'variations',
    label: 'Variations',
    hint: "Write the game's own variations, and the engine's line after a flagged move",
  },
]

/** A small labelled switch, sized to sit in a row above the action buttons. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={hint}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        checked ? 'border-felt bg-felt text-buff' : 'border-rule text-ink-mute hover:bg-buff-soft'
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-buff/40' : 'bg-rule'
        }`}
      >
        <span
          className={`absolute top-0.5 size-2.5 rounded-full bg-card shadow transition-[left] ${
            checked ? 'left-[13px]' : 'left-0.5'
          }`}
        />
      </span>
      {label}
    </button>
  )
}

/**
 * What to write into the converted PGN, above the buttons that hand it out.
 *
 * They sit with the output they change rather than with the tag fields: two of
 * the three are nothing to do with tags, and here the effect of a switch is
 * visible in the text directly below it.
 */
export default function PgnExtrasSwitches({
  extras,
  onChange,
  hasEvals,
}: PgnExtrasSwitchesProps) {
  return (
    <div className="shrink-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-ink-mute">Include:</span>
        {SWITCHES.map((s) => (
          <Toggle
            key={s.id}
            label={s.label}
            hint={s.hint}
            checked={extras[s.id]}
            onChange={(checked) => onChange(s.id, checked)}
          />
        ))}
      </div>
      {/* Said plainly rather than left as a silently empty result: the review
          runs for a minute or so and the evals appear only when it lands. */}
      {extras.evals && !hasEvals && (
        <p className="mt-1.5 text-xs text-ink-mute">
          Evals are added once the engine review finishes.
        </p>
      )}
    </div>
  )
}
