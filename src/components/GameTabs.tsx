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
import GameTags from './GameTags'

type Tab = 'moves' | 'headers' | 'source' | 'converted'

/**
 * The one action-button face in this pane, matching PgnActions' compact size.
 *
 * Both tabs end in a row of buttons and they have to read as the same row in
 * two places; three near-identical class strings had already started to drift.
 */
const ACTION =
  'inline-flex items-center gap-1.5 rounded-lg bg-felt px-2.5 py-1 text-xs font-medium text-buff shadow-sm transition-colors hover:bg-felt-deep disabled:cursor-not-allowed disabled:opacity-40'

/** Line icons for the two study buttons, drawn to match PgnActions' set. */
const Stroked = ({ children }: { children: React.ReactNode }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="size-3.5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

/**
 * A floppy disk, for saving into a study.
 *
 * It replaced Lichess's own mark, which said *where* the game was going and not
 * what the button did — and the button beside it now goes to Lichess too, so
 * the mark had stopped distinguishing anything.
 */
const SaveIcon = () => (
  <Stroked>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Stroked>
)

/** The copy glyph PgnActions uses, so the two Copy buttons match. */
const CopyIcon = () => (
  <Stroked>
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    <rect x="9" y="7" width="12" height="14" rx="2" />
  </Stroked>
)

const CheckIcon = () => (
  <Stroked>
    <path d="M20 6 9 17l-5-5" />
  </Stroked>
)

/**
 * The bar chart the left-nav uses for Game Analysis, because this button does
 * the same thing from a different door.
 */
const AnalyzeIcon = () => (
  <Stroked>
    <path d="M4 20h16M7 20v-6M12 20V8M17 20v-9" />
  </Stroked>
)

/** An eye, for looking at the chapter this game came from. */
const EyeIcon = () => (
  <Stroked>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Stroked>
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
    label: 'Original PGN',
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
  /** The game's own labels, and every label already in use. */
  gameTags: string[]
  onGameTagsChange: (tags: string[]) => void
  knownTags: string[]
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
  gameTags,
  onGameTagsChange,
  knownTags,
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
        <div className="space-y-4 px-3">
          {/* Above the PGN tags, because these are the ones a reader chooses
              and the ones below are mostly the game's own record. */}
          <GameTags tags={gameTags} onChange={onGameTagsChange} known={knownTags} />
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
          {/* The file's name is the one thing here that says *which* game this
              is, so it is given the weight of a heading. "Pasted or typed" is
              not a name and stays quiet — bolding it would make the absence of
              a file look like the presence of one. */}
          <p
            className={`mb-1.5 shrink-0 truncate ${
              sourceFileName ? 'text-sm font-semibold text-ink' : 'text-xs text-ink-mute'
            }`}
            title={sourceFileName ?? undefined}
          >
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
          {/* Left, like the Converted PGN row: the two rows are the same row in
              two tabs, and one of them drifting to the right made switching
              between them feel like moving between two different panes. */}
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void (async () => {
                if (await copyText(sourceText)) setSourceCopied(true)
              })()}
              disabled={sourceText.trim() === ''}
              title={sourceCopied ? 'Copied' : 'Copy the original PGN to the clipboard'}
              aria-label={sourceCopied ? 'Copied' : 'Copy the original PGN to the clipboard'}
              className={ACTION}
            >
              {sourceCopied ? <CheckIcon /> : <CopyIcon />}
              PGN
            </button>
            {/* Reading this box again replaces the game on the board — the same
                door the start page uses, reached from beside the board so an
                edited tag or a fixed clock does not cost a trip back to the
                beginning. */}
            <button
              type="button"
              onClick={() => onConvert(sourceText, {})}
              disabled={sourceText.trim() === ''}
              title="Convert the clocks and review this PGN again, replacing the game on the board"
              className={ACTION}
            >
              <AnalyzeIcon />
              Analyze PGN
            </button>
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
                    title="Open this game's chapter on Lichess in a new tab"
                    className={ACTION}
                  >
                    <EyeIcon />
                    View in Study
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
                  title="Save this game to one of your Lichess studies as a new chapter"
                  aria-label="Save this game to one of your Lichess studies as a new chapter"
                  className={ACTION}
                >
                  <SaveIcon />
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
