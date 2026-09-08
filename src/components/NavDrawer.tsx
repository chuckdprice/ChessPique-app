import { useEffect, useRef } from 'react'
import type { Page } from '../lib/pages'

interface NavDrawerProps {
  page: Page
  /** Go to a page. The drawer closes itself afterwards. */
  onNavigate: (page: Page) => void
  onClose: () => void
  /** Start an empty game to build on the board. */
  onNewGame: () => void
  /** Both land on the start page with that choice already open. */
  onUpload: () => void
  onPaste: () => void
  /** Analysis is unreachable until a game has been converted. */
  gameLoaded: boolean
  /** Appearance stays a modal; the nav is only how it is reached now. */
  onAppearance: () => void
  onHelp: () => void
}

/** One nav glyph, drawn to the same weight as the header's buttons. */
function Icon({ d, fills }: { d: string; fills?: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
      {fills}
    </svg>
  )
}

const ICON = {
  newGame: 'M12 5v14M5 12h14',
  pgn: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4',
  analysis: 'M4 20h16M7 20v-6M12 20V8M17 20v-9',
  upload: 'M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  library: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM9 4h9.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H9',
  appearance:
    'M12 3a9 9 0 1 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8Z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 2h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z',
  help: 'M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.4',
} as const

const HELP_EXTRA = (
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
  </>
)

const PALETTE_DOTS = (
  <>
    <circle cx="6.5" cy="11.5" r="0.5" fill="currentColor" />
    <circle cx="9.5" cy="7.5" r="0.5" fill="currentColor" />
    <circle cx="14.5" cy="7.5" r="0.5" fill="currentColor" />
    <circle cx="17.5" cy="11.5" r="0.5" fill="currentColor" />
  </>
)

/**
 * A row of the menu. `current` marks the page being shown; Appearance and Help
 * open something over the page instead and are never it.
 *
 * Every row closes the drawer, so choosing one never leaves it standing over
 * the thing it just went to.
 */
function Item({
  label,
  icon,
  current,
  disabled,
  hint,
  onSelect,
  onClose,
  innerRef,
}: {
  label: string
  icon: React.ReactNode
  current?: boolean
  disabled?: boolean
  hint?: string
  onSelect: () => void
  onClose: () => void
  innerRef?: React.Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={innerRef}
      type="button"
      disabled={disabled}
      aria-current={current ? 'page' : undefined}
      onClick={() => {
        onSelect()
        onClose()
      }}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        current
          ? 'bg-felt font-medium text-buff'
          : disabled
            ? 'cursor-not-allowed text-ink-mute/50'
            : 'text-ink hover:bg-buff-soft'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[11px] text-ink-mute">{hint}</span>}
    </button>
  )
}

/** A heading over a run of menu items. */
function Group({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-ink-mute first:pt-2">
      {children}
    </p>
  )
}

export default function NavDrawer({
  page,
  onNavigate,
  onClose,
  onNewGame,
  onUpload,
  onPaste,
  gameLoaded,
  onAppearance,
  onHelp,
}: NavDrawerProps) {
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Where focus was before the drawer took it, so closing puts it back on the
    // hamburger rather than dropping it to the top of the document.
    const returnTo = document.activeElement as HTMLElement | null
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      returnTo?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        className="nav-drawer flex h-full w-72 max-w-[85vw] flex-col border-r border-rule bg-card shadow-lg"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-rule px-4 py-3">
          <h2 className="font-display text-base font-semibold">Menu</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md px-2 py-0.5 text-lg leading-none text-ink-mute transition-colors hover:bg-buff-soft hover:text-ink"
          >
            ×
          </button>
        </div>

        <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto p-2">
          <Group>Game</Group>
          {/* The same four choices the start page offers, in the same order,
              so the menu and the page never disagree about what the ways in
              are. Game Analysis follows them: it is where all four lead. */}
          <Item
            innerRef={firstRef}
            label="New Analysis"
            icon={<Icon d={ICON.newGame} />}
            hint="empty board"
            onSelect={onNewGame}
            onClose={onClose}
          />
          <Item
            label="Open Study"
            icon={<Icon d={ICON.library} />}
            current={page === 'library'}
            onSelect={() => onNavigate('library')}
            onClose={onClose}
          />
          <Item
            label="Upload PGN"
            icon={<Icon d={ICON.upload} />}
            onSelect={onUpload}
            onClose={onClose}
          />
          <Item
            label="Paste PGN"
            icon={<Icon d={ICON.pgn} />}
            onSelect={onPaste}
            onClose={onClose}
          />
          <Item
            label="Game Analysis"
            icon={<Icon d={ICON.analysis} />}
            current={page === 'analysis'}
            disabled={!gameLoaded}
            hint={gameLoaded ? undefined : 'no game yet'}
            onSelect={() => onNavigate('analysis')}
            onClose={onClose}
          />

          <Group>App</Group>
          <Item
            label="Appearance"
            icon={<Icon d={ICON.appearance} fills={PALETTE_DOTS} />}
            onSelect={onAppearance}
            onClose={onClose}
          />
          <Item
            label="Settings"
            icon={<Icon d={ICON.settings} />}
            current={page === 'settings'}
            onSelect={() => onNavigate('settings')}
            onClose={onClose}
          />
          <Item
            label="Help"
            icon={<Icon d={ICON.help} fills={HELP_EXTRA} />}
            onSelect={onHelp}
            onClose={onClose}
          />
        </nav>
      </div>
    </div>
  )
}

/** The button that opens the drawer, for the header to place top-left. */
export function NavToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open menu"
      aria-haspopup="dialog"
      title="Menu"
      className="shrink-0 rounded-lg border border-buff/30 p-2 text-buff transition-colors hover:bg-buff/10"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  )
}
