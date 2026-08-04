import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudyMetadata } from '../lib/lichess/studies'

export type StudySort = 'recent' | 'created' | 'name'
export type StudyView = 'grid' | 'list'

interface LichessStudyPickerProps {
  studies: StudyMetadata[]
  /** True while the stream is still delivering; drives the skeletons. */
  loading: boolean
  selectedId: string
  onSelect: (id: string) => void
}

/**
 * How far back each bucket reaches. The only dimension the study list carries
 * besides its name is time, so time is what the sidebar filters on.
 */
const BUCKETS = [
  { id: 'today', label: 'Today', within: 24 * 60 * 60 * 1000 },
  { id: 'week', label: 'This week', within: 7 * 24 * 60 * 60 * 1000 },
  { id: 'month', label: 'This month', within: 31 * 24 * 60 * 60 * 1000 },
  { id: 'older', label: 'Older', within: Infinity },
] as const

type BucketId = (typeof BUCKETS)[number]['id']

/** How many cards are rendered before scrolling asks for more. */
const PAGE = 48

function bucketOf(updatedAt: number, now: number): BucketId {
  const age = now - updatedAt
  for (const bucket of BUCKETS) if (age < bucket.within) return bucket.id
  return 'older'
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

function timeAgo(at: number, now: number): string {
  const elapsed = at - now
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return RELATIVE.format(Math.round(elapsed / ms), unit)
  }
  return RELATIVE.format(0, 'minute')
}

function LichessLink({ id }: { id: string }) {
  return (
    <a
      href={`https://lichess.org/study/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      title="View on Lichess"
      aria-label="View on Lichess"
      // Stops the card's own selection firing from a click meant for the link.
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 rounded p-1 text-ink-mute transition-colors hover:bg-buff-soft hover:text-ink"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </a>
  )
}

function Skeleton({ view }: { view: StudyView }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg border border-rule bg-buff-soft/30 ${
        view === 'grid' ? 'h-[4.5rem]' : 'h-9'
      }`}
    />
  )
}

/**
 * The study chooser: a filter rail and a list that fills in as Lichess sends it.
 *
 * Everything below the fetch is local — search, sort, bucket, paging — so an
 * account with hundreds of studies stays instant and costs one request.
 */
export default function LichessStudyPicker({
  studies,
  loading,
  selectedId,
  onSelect,
}: LichessStudyPickerProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<StudySort>('recent')
  const [view, setView] = useState<StudyView>('grid')
  const [buckets, setBuckets] = useState<Set<BucketId>>(new Set())
  const [shown, setShown] = useState(PAGE)
  const scroller = useRef<HTMLDivElement>(null)

  // Fixed for the life of the dialog: buckets that re-bucketed mid-scroll
  // would shuffle the list under the pointer.
  const [now] = useState(() => Date.now())

  const counts = useMemo(() => {
    const tally = new Map<BucketId, number>()
    for (const study of studies) {
      const id = bucketOf(study.updatedAt, now)
      tally.set(id, (tally.get(id) ?? 0) + 1)
    }
    return tally
  }, [studies, now])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = studies.filter((study) => {
      if (needle && !study.name.toLowerCase().includes(needle)) return false
      // No bucket ticked means no bucket filter, which is the usual case.
      if (buckets.size > 0 && !buckets.has(bucketOf(study.updatedAt, now))) return false
      return true
    })
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'created') return b.createdAt - a.createdAt
      return b.updatedAt - a.updatedAt
    })
  }, [studies, search, buckets, sort, now])

  // Narrowing the list starts the paging over, so a filter never lands the
  // user halfway down a list they have not seen the top of.
  useEffect(() => setShown(PAGE), [search, sort, buckets])

  /**
   * Grow the rendered slice as the end is approached.
   *
   * Measured from the scroll position rather than watched with an
   * IntersectionObserver: the observer is the tidier tool but it reports
   * nothing at all in some contexts, and a list that silently stops growing
   * is worse than a scroll handler.
   */
  const growIfNearEnd = () => {
    const el = scroller.current
    if (!el) return
    const roomLeft = el.scrollHeight - el.scrollTop - el.clientHeight
    // Also true when the page does not fill the box, which is how the first
    // slice tops itself up.
    if (roomLeft < 300) setShown((current) => Math.min(current + PAGE, visible.length))
  }

  // Top up whenever what is rendered might not reach the bottom of the box:
  // more studies arriving, a filter widening, or the slice just grown.
  useEffect(growIfNearEnd, [shown, visible.length])

  const page = visible.slice(0, shown)
  const toggleBucket = (id: BucketId) =>
    setBuckets((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-rule px-4 py-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search studies…"
          aria-label="Search studies"
          className="min-w-40 flex-1 rounded-md border border-rule bg-buff-soft/50 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-ink-mute">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as StudySort)}
            className="rounded-md border border-rule bg-card px-2 py-1.5 text-sm text-ink"
          >
            <option value="recent">Recent</option>
            <option value="created">Created</option>
            <option value="name">Name</option>
          </select>
        </label>
        <div className="flex overflow-hidden rounded-md border border-rule" role="group" aria-label="View">
          {(['grid', 'list'] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === id ? 'bg-felt text-buff' : 'text-ink-mute hover:bg-buff-soft'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-40 shrink-0 overflow-y-auto border-r border-rule px-3 py-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-mute">
            Updated
          </p>
          <div className="space-y-1">
            {BUCKETS.map((bucket) => (
              <label key={bucket.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={buckets.has(bucket.id)}
                  onChange={() => toggleBucket(bucket.id)}
                  className="size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{bucket.label}</span>
                <span className="shrink-0 font-score text-xs text-ink-mute">
                  {counts.get(bucket.id) ?? 0}
                </span>
              </label>
            ))}
          </div>
          {/*
            Said once, here, rather than leaving an empty Topics heading to be
            puzzled over: the study list carries a name and two dates and
            nothing else, so there is nothing else to filter on.
          */}
          <p className="mt-4 text-[11px] leading-snug text-ink-mute">
            Lichess's study list carries only names and dates — no topics or
            chapter counts to filter by.
          </p>
        </aside>

        <div
          ref={scroller}
          onScroll={growIfNearEnd}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {studies.length === 0 && loading && (
            <div className={view === 'grid' ? 'grid gap-2 sm:grid-cols-2' : 'space-y-1.5'}>
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} view={view} />
              ))}
            </div>
          )}

          {studies.length > 0 && visible.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-mute">
              No studies match that search.
            </p>
          )}

          {visible.length > 0 && (
            <div className={view === 'grid' ? 'grid gap-2 sm:grid-cols-2' : 'space-y-1'}>
              {page.map((study) => {
                const selected = study.id === selectedId
                return (
                  <div
                    key={study.id}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={0}
                    onClick={() => onSelect(study.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(study.id)
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 text-left transition-colors ${
                      view === 'grid' ? 'min-h-[4.5rem] py-2' : 'py-1.5'
                    } ${
                      selected
                        ? 'border-felt bg-felt/10 ring-1 ring-felt'
                        : 'border-rule hover:bg-buff-soft/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{study.name}</p>
                      <p className="truncate text-xs text-ink-mute">
                        updated {timeAgo(study.updatedAt, now)}
                        {view === 'grid' && ` · created ${timeAgo(study.createdAt, now)}`}
                      </p>
                    </div>
                    <LichessLink id={study.id} />
                  </div>
                )
              })}
            </div>
          )}

          {loading && studies.length > 0 && (
            <p className="py-2 text-center text-xs text-ink-mute">
              Loading more studies… {studies.length} so far
            </p>
          )}
          {!loading && visible.length > 0 && (
            <p className="py-2 text-center text-xs text-ink-mute">
              {shown < visible.length
                ? `${shown} of ${visible.length} shown`
                : `${visible.length} stud${visible.length === 1 ? 'y' : 'ies'}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
