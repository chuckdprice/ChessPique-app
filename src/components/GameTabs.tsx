import { useEffect, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { loadSession, openSignInWindow, saveSession, signIn } from '../lib/lichess/oauth'
import { fetchAccount } from '../lib/lichess/studies'
import type { ConvertOptions } from '../lib/convert'
import type { GameAnalysis, RefinedEval } from '../lib/engine/analysis'
import type { MoveTree } from '../lib/moveTree'
import type { Opening } from '../lib/openings'
import LichessStudyDialog from './LichessStudyDialog'
import MoveTable from './MoveTable'
import PgnActions from './PgnActions'
import PgnExtrasSwitches from './PgnExtrasSwitches'
import type { PgnExtras } from './PgnExtrasSwitches'
import TabPane from './TabPane'
import type { TabDef } from './TabPane'
import TagEditor from './TagEditor'

type Tab = 'moves' | 'headers' | 'source' | 'converted'

/**
 * Lichess's own mark, so this button matches the one the PGN page used to
 * carry. The drawing is Simple Icons' (CC0); the mark is lichess.org's, used
 * here only to point at lichess.org.
 */
const LichessMark = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor">
    <path d="M10.457 6.161a.237.237 0 0 0-.296.165c-.8 2.785 2.819 5.579 5.214 7.428.653.504 1.216.939 1.591 1.292 1.745 1.642 2.564 2.851 2.733 3.178a.24.24 0 0 0 .275.122c.047-.013 4.726-1.3 3.934-4.574a.257.257 0 0 0-.023-.06L18.204 3.407 18.93.295a.24.24 0 0 0-.262-.293c-1.7.201-3.115.435-4.5 1.425-4.844-.323-8.718.9-11.213 3.539C.334 7.737-.246 11.515.085 14.128c.763 5.655 5.191 8.631 9.081 9.532.993.229 1.974.34 2.923.34 3.344 0 6.297-1.381 7.946-3.85a.24.24 0 0 0-.372-.3c-3.411 3.527-9.002 4.134-13.296 1.444-4.485-2.81-6.202-8.41-3.91-12.749C4.741 4.221 8.801 2.362 13.888 3.31c.056.01.115 0 .165-.029l.335-.197c.926-.546 1.961-1.157 2.873-1.279l-.694 1.993a.243.243 0 0 0 .02.202l6.082 10.192c-.193 2.028-1.706 2.506-2.226 2.611-.287-.645-.814-1.364-2.306-2.803-.422-.407-1.21-.941-2.124-1.56-2.364-1.601-5.937-4.02-5.391-5.984a.239.239 0 0 0-.165-.295z" />
  </svg>
)

const TABS: TabDef<Tab>[] = [
  {
    id: 'moves',
    label: 'Move List',
    // A numbered list.
    icon: <path d="M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11" />,
  },
  {
    id: 'headers',
    label: 'PGN Header',
    // A luggage tag.
    icon: (
      <>
        <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z" />
        <circle cx="7.5" cy="7.5" r="1.2" />
      </>
    ),
  },
  {
    id: 'source',
    label: 'Orig PGN',
    // A document with a turned corner.
    icon: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5" />,
  },
  {
    id: 'converted',
    label: 'Converted PGN',
    // The same document, ticked.
    icon: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5" />
        <path d="m9 14 2 2 4-4" />
      </>
    ),
  },
]

interface GameTabsProps {
  tree: MoveTree
  currentId: string
  onNavigate: (nodeId: string) => void
  analysis: GameAnalysis | null
  deeperEvals: Map<string, RefinedEval>
  onPromote: (nodeId: string, toMainline: boolean) => void
  onDemote: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  branch: { atId: string; index: number } | null
  onBranchIndexChange: (index: number) => void
  onBranchChoose: (nodeId: string) => void
  onBranchClose: () => void

  headers: Array<{ name: string; value: string }>
  onHeaderChange: (index: number, value: string) => void
  onHeaderAdd: (name: string) => void
  onHeaderRemove: (index: number) => void
  generatedHeaders: Array<{ name: string; value: string }>
  opening: Opening | null

  /** The PGN as it came in, still editable and still re-convertible. */
  sourceText: string
  onSourceTextChange: (text: string) => void
  sourceFileName: string | null
  onSourceFileNameChange: (name: string | null) => void
  onConvert: (text: string, options: ConvertOptions) => void
  convertError: string | null

  convertedPgn: string | null
  downloadName: string
  extras: PgnExtras
  onExtraChange: (id: keyof PgnExtras, on: boolean) => void
  hasEvals: boolean
  /** The chapter this game came from on Lichess, when it came from one. */
  lichessUrl: string | null
}

/**
 * The pane beside the board: the moves, and the PGN behind them.
 *
 * These four were three different places before — a move list here, a header
 * editor and two text panes on a separate page reached through a step bar. They
 * are all about the one game on the board, so they are one pane, in the same
 * strip-of-icon-tabs shape the chart panes below already use.
 */
export default function GameTabs({
  tree,
  currentId,
  onNavigate,
  analysis,
  deeperEvals,
  onPromote,
  onDemote,
  onDelete,
  branch,
  onBranchIndexChange,
  onBranchChoose,
  onBranchClose,
  headers,
  onHeaderChange,
  onHeaderAdd,
  onHeaderRemove,
  generatedHeaders,
  opening,
  sourceText,
  onSourceTextChange,
  sourceFileName,
  onSourceFileNameChange,
  onConvert,
  convertError,
  convertedPgn,
  downloadName,
  extras,
  onExtraChange,
  hasEvals,
  lichessUrl,
}: GameTabsProps) {
  const [tab, setTab] = useState<Tab>('moves')
  const [sourceCopied, setSourceCopied] = useState(false)
  const [studyOpen, setStudyOpen] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  /** Set when a copied link came out long enough to warn about; cleared on its own. */
  const [longLink, setLongLink] = useState(false)

  // The "Copied" confirmation goes back to reading "Copy" on its own.
  useEffect(() => {
    if (!sourceCopied) return
    const timer = setTimeout(() => setSourceCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [sourceCopied])

  // A failed re-conversion is fixed in the source tab, so the error brings it
  // forward rather than reporting from behind another tab.
  useEffect(() => {
    if (convertError) setTab('source')
  }, [convertError])

  // The warning clears itself, so it does not outlive the link it was about.
  useEffect(() => {
    if (!longLink) return
    const timer = setTimeout(() => setLongLink(false), 8000)
    return () => clearTimeout(timer)
  }, [longLink])

  return (
    <TabPane tabs={TABS} label="Game" tab={tab} onTab={setTab}>
      {tab === 'moves' && (
        <MoveTable
          tree={tree}
          currentId={currentId}
          onNavigate={onNavigate}
          analysis={analysis}
          deeperEvals={deeperEvals}
          onPromote={onPromote}
          onDemote={onDemote}
          onDelete={onDelete}
          branch={branch}
          onBranchIndexChange={onBranchIndexChange}
          onBranchChoose={onBranchChoose}
          onBranchClose={onBranchClose}
          bare
        />
      )}

      {tab === 'headers' && (
        <div className="px-3">
          <TagEditor
            headers={headers}
            onChange={onHeaderChange}
            onAdd={onHeaderAdd}
            onRemove={onHeaderRemove}
            generated={generatedHeaders}
            opening={opening}
          />
        </div>
      )}

      {tab === 'source' && (
        <div className="flex h-full flex-col px-3">
          <p className="mb-1.5 shrink-0 truncate text-xs text-ink-mute">
            {sourceFileName ?? 'Pasted or typed'}
          </p>
          <textarea
            value={sourceText}
            onChange={(e) => {
              onSourceTextChange(e.target.value)
              onSourceFileNameChange(null)
            }}
            spellCheck={false}
            aria-label="Source PGN"
            placeholder="The PGN this game was converted from appears here."
            className="min-h-32 w-full flex-1 resize-none rounded-lg border border-rule bg-buff-soft/60 px-2.5 py-2 font-score text-[11px] leading-relaxed placeholder:text-ink-mute/60"
          />
          {convertError && (
            <p
              role="alert"
              className="mt-2 shrink-0 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger-text"
            >
              {convertError}
            </p>
          )}
          <div className="mt-2 flex shrink-0 items-center justify-end gap-2">
            <SmallButton
              onClick={() => void (async () => {
                if (await copyText(sourceText)) setSourceCopied(true)
              })()}
              disabled={sourceText.trim() === ''}
            >
              {sourceCopied ? 'Copied' : 'Copy'}
            </SmallButton>
            {/* Re-converting replaces the game on the board with whatever this
                box now says — the same door the start page uses, reached from
                beside the board so an edited tag or a fixed clock does not cost
                a trip back to the beginning. */}
            <SmallButton primary onClick={() => onConvert(sourceText, {})} disabled={sourceText.trim() === ''}>
              Re-convert
            </SmallButton>
          </div>
        </div>
      )}

      {tab === 'converted' && (
        <div className="flex h-full flex-col px-3">
          <div className="mb-1.5 shrink-0">
            <PgnExtrasSwitches extras={extras} onChange={onExtraChange} hasEvals={hasEvals} />
          </div>
          <textarea
            readOnly
            value={convertedPgn ?? ''}
            spellCheck={false}
            aria-label="Converted PGN"
            placeholder="Convert a game to see the %clk output here."
            className="min-h-32 w-full flex-1 resize-none rounded-lg border border-rule bg-buff-soft/60 px-2.5 py-2 font-score text-[11px] leading-relaxed placeholder:text-ink-mute/60"
          />
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
            {convertedPgn ? (
              <>
                <PgnActions
                  pgn={convertedPgn}
                  fileName={downloadName}
                  compact
                  onShared={setLongLink}
                />
                {lichessUrl && (
                  <a
                    href={lichessUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-rule px-2.5 py-[3px] text-xs font-medium text-ink transition-colors hover:bg-buff-soft"
                  >
                    View on Lichess
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    // Already signed in: straight to the studies. Otherwise the
                    // Lichess window opens here, in the click itself — a pop-up
                    // asked for any later is one the browser may refuse.
                    if (loadSession()) {
                      setAuthError(null)
                      setStudyOpen(true)
                      return
                    }
                    const opened = openSignInWindow()
                    setAuthBusy(true)
                    void (async () => {
                      try {
                        const { token, expiresAt } = await signIn(opened)
                        const { username } = await fetchAccount(token)
                        saveSession({ token, expiresAt, username })
                        setAuthError(null)
                      } catch (e) {
                        setAuthError(e instanceof Error ? e.message : String(e))
                      } finally {
                        setAuthBusy(false)
                        setStudyOpen(true)
                      }
                    })()
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-felt px-2.5 py-1 text-xs font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep"
                >
                  <LichessMark />
                  {authBusy ? 'Waiting…' : 'Study'}
                </button>
              </>
            ) : (
              <p className="text-xs text-ink-mute">
                Copy, download, the share link and the Lichess and Chess.com links appear once a
                game is converted.
              </p>
            )}
          </div>
          {longLink && (
            <p className="mt-1.5 shrink-0 text-xs text-ink-mute">
              That link is long enough that some chat and mail clients may break it. Sending it
              as an attachment, or through a study, is safer for a game this size.
            </p>
          )}
        </div>
      )}

      {studyOpen && convertedPgn && (
        <LichessStudyDialog
          pgn={convertedPgn}
          defaultChapterName={downloadName.replace(/\.pgn$/i, '')}
          initialError={authError}
          onClose={() => setStudyOpen(false)}
        />
      )}
    </TabPane>
  )
}

function SmallButton({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // py-[3px] on the outlined one, not py-1: its 1px border adds 2px that
      // the filled buttons beside it do not have, and this row has to come out
      // at one height — 24px, the same as every button in the Converted PGN
      // row, which is what makes the two tabs look like one pane.
      className={`rounded-lg px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'bg-felt py-1 text-buff shadow-sm hover:bg-felt-deep'
          : 'border border-rule py-[3px] text-ink hover:bg-buff-soft'
      }`}
    >
      {children}
    </button>
  )
}
