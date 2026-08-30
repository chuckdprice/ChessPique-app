import type { RefObject } from 'react'
import { EXPLORER_MODES, EXPLORER_RATINGS, EXPLORER_SPEEDS } from '../lib/settings'
import type { ExplorerMode, ExplorerSettings, ExplorerSpeed } from '../lib/settings'
import SettingsPopover from './SettingsPopover'

interface ExplorerSettingsPanelProps {
  value: ExplorerSettings
  onChange: (next: ExplorerSettings) => void
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  /** Opens the player picker; choosing a player is not a filter. */
  onPickPlayer: () => void
}

/**
 * Lichess's own labels. The API's first band is `0`, which it calls 400 on
 * screen because no rated player sits below that — the label follows Lichess
 * so the two panels agree, and the value follows the spec so the query does.
 */
const RATING_LABEL: Record<number, string> = { 0: '400' }

const MODE_LABEL: Record<ExplorerMode, string> = { casual: 'Casual', rated: 'Rated' }

const SPEED_LABEL: Record<ExplorerSpeed, string> = {
  ultraBullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
}

/** Lichess's speed icons, in its own order: fastest to slowest. */
const SPEED_ICON: Record<ExplorerSpeed, React.ReactNode> = {
  // A dart, then a bullet, then a flame — the three fast ones.
  ultraBullet: <path d="M3 12h12m0-4 5 4-5 4M9 8v8" />,
  bullet: <path d="M4 12h10m0-5 6 5-6 5z" />,
  blitz: <path d="M13 3 5 14h6l-2 7 8-11h-6z" />,
  // A rabbit, a turtle and a paper plane are Lichess's slow three; these are
  // simplified to shapes that survive at 14px.
  rapid: <path d="M7 20a4 4 0 0 1 4-4h1a5 5 0 0 0 5-5V8m0 0-2-4m2 4 3-3" />,
  classical: <path d="M4 15a6 4 0 0 1 12 0zM16 15h4M8 15v3M13 15v3" />,
  correspondence: <path d="m3 11 18-7-7 18-2.5-8.5z" />,
}

/** A row of small toggles, like the two banks in Lichess's own filter. */
function Toggles<T extends string | number>({
  label,
  options,
  selected,
  render,
  title,
  onToggle,
}: {
  label: string
  options: readonly T[]
  selected: readonly T[]
  render: (option: T) => React.ReactNode
  title: (option: T) => string
  onToggle: (next: T[]) => void
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {options.map((option) => {
          const on = selected.includes(option)
          return (
            <button
              key={String(option)}
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={title(option)}
              title={title(option)}
              onClick={() => {
                const next = on ? selected.filter((o) => o !== option) : [...selected, option]
                // Never all off: an empty list asks the endpoint for nothing
                // at all, and Lichess's own panel refuses the last one too.
                if (next.length === 0) return
                onToggle(options.filter((o) => next.includes(o)))
              }}
              className={`flex min-w-9 items-center justify-center rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                on ? 'bg-felt text-buff' : 'bg-buff-soft text-ink-mute hover:text-ink'
              }`}
            >
              {render(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DateRow({
  label,
  type,
  value,
  placeholder,
  onChange,
}: {
  label: string
  type: 'month' | 'number'
  value: string
  placeholder?: string
  onChange: (next: string) => void
}) {
  return (
    <label className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        min={type === 'number' ? 1400 : undefined}
        max={type === 'number' ? 2100 : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-36 rounded-md border border-rule bg-field px-2 py-1 font-score text-xs"
      />
    </label>
  )
}

const DB_TITLE = {
  masters: 'Masters Games',
  lichess: 'Lichess Games',
  player: 'Player Games',
} as const

/**
 * The opening explorer's filters, one panel per database.
 *
 * Which fields show is the database's business, not a preference: masters
 * games have no speed, no rating band and no casual games, and their date
 * range is a year rather than a month; rating bands belong to the Lichess
 * database and rated/casual to the player one. Every set is kept, so moving
 * between databases does not throw away what was set in another.
 */
export default function ExplorerSettingsPanel({
  value,
  onChange,
  onClose,
  anchor,
  onPickPlayer,
}: ExplorerSettingsPanelProps) {
  const masters = value.db === 'masters'
  return (
    <SettingsPopover anchor={anchor} title={DB_TITLE[value.db]} onClose={onClose}>
      <div className="flex gap-1">
        {(['masters', 'lichess', 'player'] as const).map((db) => (
          <button
            key={db}
            type="button"
            role="tab"
            aria-selected={value.db === db}
            onClick={() => onChange({ ...value, db })}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              value.db === db ? 'bg-felt text-buff' : 'bg-buff-soft text-ink-mute hover:text-ink'
            }`}
          >
            {db === 'masters' ? 'Masters' : db === 'lichess' ? 'Lichess' : 'Player'}
          </button>
        ))}
      </div>

      {masters ? (
        <>
          <DateRow
            label="Since"
            type="number"
            value={value.mastersSince}
            placeholder="YYYY"
            onChange={(next) => onChange({ ...value, mastersSince: next })}
          />
          <DateRow
            label="Until"
            type="number"
            value={value.mastersUntil}
            placeholder="YYYY"
            onChange={(next) => onChange({ ...value, mastersUntil: next })}
          />
          <p className="text-xs text-ink-mute">
            Master games carry no speed or rating band to filter on, so the range of years is
            all this database offers.
          </p>
        </>
      ) : (
        <>
          {value.db === 'player' && (
            <div>
              <p className="text-sm font-medium">Player</p>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPickPlayer}
                  className="rounded-md bg-felt px-3 py-1 text-xs font-semibold text-buff transition-colors hover:bg-felt-deep"
                >
                  {value.player || 'Choose a player'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      playerColor: value.playerColor === 'white' ? 'black' : 'white',
                    })
                  }
                  title="Look for their games on the other side"
                  className="flex items-center gap-1 text-xs text-felt-bright hover:underline"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 2l4 4-4 4M3 6h18M7 22l-4-4 4-4M21 18H3" />
                  </svg>
                  as {value.playerColor}
                </button>
              </div>
            </div>
          )}
          <Toggles
            label="Time control"
            options={EXPLORER_SPEEDS}
            selected={value.speeds}
            title={(speed) => SPEED_LABEL[speed]}
            render={(speed) => (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {SPEED_ICON[speed]}
              </svg>
            )}
            onToggle={(speeds) => onChange({ ...value, speeds })}
          />
          {value.db === 'lichess' && (
            <Toggles
              label="Average rating"
              options={EXPLORER_RATINGS}
              selected={value.ratings}
              title={(rating) => `${RATING_LABEL[rating] ?? rating} and up, to the next band`}
              render={(rating) => RATING_LABEL[rating] ?? String(rating)}
              onToggle={(ratings) => onChange({ ...value, ratings })}
            />
          )}
          {/* Only the player database has casual games in it to exclude. */}
          {value.db === 'player' && (
            <Toggles
              label="Mode"
              options={EXPLORER_MODES}
              selected={value.modes}
              title={(mode) => MODE_LABEL[mode]}
              render={(mode) => MODE_LABEL[mode]}
              onToggle={(modes) => onChange({ ...value, modes })}
            />
          )}
          <DateRow
            label="Since"
            type="month"
            value={value.since}
            onChange={(next) => onChange({ ...value, since: next })}
          />
          <DateRow
            label="Until"
            type="month"
            value={value.until}
            onChange={(next) => onChange({ ...value, until: next })}
          />
        </>
      )}
    </SettingsPopover>
  )
}
