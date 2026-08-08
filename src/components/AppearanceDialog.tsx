import { useEffect, useRef, useState } from 'react'
import {
  BOARDS,
  PIECE_SETS,
  THEMES,
  boardById,
  pieceSetById,
  pieceSrc,
  themeById,
} from '../lib/appearance'
import type { BoardColors, PieceCode } from '../lib/appearance'
import type { AppearanceSettings } from '../lib/settings'

interface AppearanceDialogProps {
  value: AppearanceSettings
  /** Called on every pick, so the whole app previews the draft. */
  onPreview: (next: AppearanceSettings) => void
  /** Keep the draft. */
  onSave: (next: AppearanceSettings) => void
  /** Put back what was showing when the dialog opened. */
  onCancel: () => void
}

type Tab = 'theme' | 'board' | 'pieces'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'theme', label: 'Theme' },
  { id: 'board', label: 'Board' },
  { id: 'pieces', label: 'Pieces' },
]

/** Three squares of a board, with a piece on two of them. */
function BoardPreview({ board, pieces }: { board: BoardColors; pieces: string }) {
  // Two ranks of three, the way a corner of the real board looks: rank
  // numbers on the left file, black above and white below.
  const rows: Array<{ rank: string; squares: Array<{ light: boolean; piece: PieceCode | null }> }> =
    [
      {
        rank: '8',
        squares: [
          { light: true, piece: 'bB' },
          { light: false, piece: 'bQ' },
          { light: true, piece: 'bP' },
        ],
      },
      {
        rank: '7',
        squares: [
          { light: false, piece: null },
          { light: true, piece: null },
          { light: false, piece: null },
        ],
      },
      {
        rank: '6',
        squares: [
          { light: true, piece: 'wN' },
          { light: false, piece: 'wK' },
          { light: true, piece: 'wR' },
        ],
      },
    ]

  return (
    <div
      className="grid w-full grid-cols-3 overflow-hidden rounded-lg shadow-md"
      role="img"
      aria-label={`Preview: ${board.name} board with the ${pieceSetById(pieces).name} pieces`}
    >
      {rows.map((row) =>
        row.squares.map((square, i) => (
          <div
            key={`${row.rank}${i}`}
            className="relative aspect-square"
            style={{ backgroundColor: square.light ? board.light : board.dark }}
          >
            {i === 0 && (
              <span
                className="absolute left-1 top-0.5 font-score text-xs font-semibold"
                style={{ color: square.light ? board.dark : board.light }}
              >
                {row.rank}
              </span>
            )}
            {square.piece && <PiecePreview set={pieces} code={square.piece} />}
          </div>
        )),
      )}
    </div>
  )
}

/**
 * One piece at whatever size its box is. `classic` is react-chessboard's own
 * drawing and has no file the board loads, but that drawing is Burnett's set,
 * so the preview shows Burnett's files — the same picture, from disk.
 */
function PiecePreview({ set, code }: { set: string; code: PieceCode }) {
  return (
    <img
      src={pieceSrc(set === 'classic' ? 'cburnett' : set, code)}
      alt=""
      draggable={false}
      className="absolute inset-[6%] size-[88%]"
    />
  )
}

export default function AppearanceDialog({
  value,
  onPreview,
  onSave,
  onCancel,
}: AppearanceDialogProps) {
  const [tab, setTab] = useState<Tab>('theme')
  const [draft, setDraft] = useState(value)
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  const pick = (next: Partial<AppearanceSettings>) => {
    const merged = { ...draft, ...next }
    setDraft(merged)
    onPreview(merged)
  }

  useEffect(() => {
    // Focus moves into the dialog so Tab starts here and Escape is heard even
    // before anything inside has been clicked.
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const board = boardById(draft.board)
  const swatch =
    'relative aspect-square overflow-hidden rounded-md border-2 transition-transform hover:scale-105'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Appearance"
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl border border-rule bg-card text-ink shadow-lg sm:rounded-2xl"
      >
        <div className="flex shrink-0 gap-1 border-b border-rule px-3 pt-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-b-2 border-felt-bright text-ink'
                  : 'border-b-2 border-transparent text-ink-mute hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* The picker scrolls; the preview and the buttons stay put. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:flex-row">
          <div className="min-w-0 flex-1">
            {tab === 'theme' && (
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Theme">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={draft.theme === t.id}
                    title={t.name}
                    onClick={() => pick({ theme: t.id })}
                    className={`flex items-center gap-2 rounded-lg border-2 p-2 text-left transition-colors ${
                      draft.theme === t.id ? 'border-felt-bright' : 'border-rule hover:bg-buff-soft'
                    }`}
                  >
                    {/* The palette in miniature: page, card, ink, accent. */}
                    <span
                      className="flex size-9 shrink-0 flex-wrap overflow-hidden rounded-md border border-rule"
                      aria-hidden="true"
                    >
                      {(['--page', '--card', '--ink', '--accent'] as const).map((v) => (
                        <span key={v} className="size-1/2" style={{ background: t.vars[v] }} />
                      ))}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.name}</span>
                      <span className="block text-xs text-ink-mute">
                        {t.base === 'dark' ? 'Dark' : 'Light'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'board' && (
              <div
                className="grid grid-cols-4 gap-2 sm:grid-cols-6"
                role="radiogroup"
                aria-label="Board colours"
              >
                {BOARDS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={draft.board === b.id}
                    aria-label={b.name}
                    title={b.name}
                    onClick={() => pick({ board: b.id })}
                    className={`${swatch} ${
                      draft.board === b.id ? 'border-felt-bright' : 'border-rule'
                    }`}
                  >
                    <span className="grid size-full grid-cols-2">
                      <span style={{ background: b.light }} />
                      <span style={{ background: b.dark }} />
                      <span style={{ background: b.dark }} />
                      <span style={{ background: b.light }} />
                    </span>
                    {draft.board === b.id && <Tick />}
                  </button>
                ))}
              </div>
            )}

            {tab === 'pieces' && (
              <>
                <div
                  className="grid grid-cols-4 gap-2 sm:grid-cols-6"
                  role="radiogroup"
                  aria-label="Piece set"
                >
                  {PIECE_SETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={draft.pieces === p.id}
                      aria-label={p.name}
                      title={`${p.name} — ${p.credit}`}
                      onClick={() => pick({ pieces: p.id })}
                      // On the chosen board's dark square: every swatch shows a
                      // white knight, and a pale set on a pale square is as
                      // hard to read here as it would be on the board.
                      style={{ background: board.dark }}
                      className={`${swatch} ${
                        draft.pieces === p.id ? 'border-felt-bright' : 'border-rule'
                      }`}
                    >
                      <PiecePreview set={p.id} code="wN" />
                      {draft.pieces === p.id && <Tick />}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-ink-mute">
                  {pieceSetById(draft.pieces).name} — {pieceSetById(draft.pieces).credit}. Sets
                  other than Classic come from the Lichess project.
                </p>
              </>
            )}
          </div>

          {/* Stacked under the picker on a phone, so it is sized to be a
              sample rather than to fill the sheet and push Save off it. */}
          <div className="w-36 shrink-0 self-center sm:w-64 sm:self-start">
            <BoardPreview board={board} pieces={draft.pieces} />
            <p className="mt-2 text-center text-xs text-ink-mute">
              {themeById(draft.theme).name} · {board.name}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-rule p-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-rule px-5 py-2 text-sm font-medium transition-colors hover:bg-buff-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-lg bg-felt px-6 py-2 text-sm font-medium text-buff transition-colors hover:bg-felt-deep"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/** The chosen swatch's badge, in the corner so it hides as little as it can. */
function Tick() {
  return (
    <span className="absolute left-1/2 top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-felt-bright text-buff">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  )
}
