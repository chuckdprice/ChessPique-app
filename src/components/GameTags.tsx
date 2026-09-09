import { useState } from 'react'
import { cleanTag, suggestTags, TAG_MAX, withoutTag, withTag } from '../lib/tags'

interface GameTagsProps {
  tags: string[]
  onChange: (tags: string[]) => void
  /** Every tag already in use, for the suggestions. */
  known: string[]
}

/**
 * The game's own labels — `#karpov`, `#dcc-2026`, `#rook-endgame`.
 *
 * They live in the chapter's root comment rather than in a PGN tag, because
 * Lichess discards every header outside its own roster and every `[%...]`
 * command it does not maintain; prose is the only thing that survives a
 * chapter. That is why they are edited here, beside the tags that do not
 * survive, rather than in a place of their own: they are annotation.
 *
 * The suggestions are the point of the box. Left to free text, `#karpov` and
 * `#kaprov` both exist inside a month, and offering what is already in use is
 * most of what stops that for almost no code.
 */
export default function GameTags({ tags, onChange, known }: GameTagsProps) {
  const [draft, setDraft] = useState('')
  const suggestions = suggestTags(
    known.filter((tag) => !tags.includes(tag)),
    draft,
  ).slice(0, 8)

  const add = (value: string) => {
    const next = withTag(tags, value)
    if (next !== tags) onChange(next)
    setDraft('')
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Tags</h3>
        <span className="text-[11px] text-ink-mute">lowercase, digits, hyphens</span>
      </div>

      <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <li key={tag}>
            <span className="inline-flex items-center gap-1 rounded-lg border border-rule bg-buff-soft/60 py-[3px] pl-2 pr-1 text-xs font-medium">
              #{tag}
              <button
                type="button"
                onClick={() => onChange(withoutTag(tags, tag))}
                aria-label={`Remove #${tag}`}
                title={`Remove #${tag}`}
                className="rounded px-1 text-ink-mute transition-colors hover:bg-buff-soft hover:text-ink"
              >
                ×
              </button>
            </span>
          </li>
        ))}
        <li>
          <input
            list="chesspique-known-tags"
            value={draft}
            maxLength={TAG_MAX + 1}
            placeholder="#add-a-tag"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Space commits too: a tag cannot contain one, so a reader typing
              // several in a row never has to reach for Enter between them.
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                add(draft)
              }
              if (e.key === 'Escape') setDraft('')
              // Backspace on an empty box takes the last tag back, which is how
              // every other chip input behaves.
              if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
                onChange(tags.slice(0, -1))
              }
            }}
            onBlur={() => add(draft)}
            className="w-32 rounded-md border border-rule bg-card px-2 py-[3px] text-xs"
          />
          <datalist id="chesspique-known-tags">
            {suggestions.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </li>
      </ul>

      {draft.trim() !== '' && cleanTag(draft) == null && (
        <p className="mt-1 text-[11px] text-rose">
          Lowercase letters, digits and hyphens only — no spaces.
        </p>
      )}
    </div>
  )
}
