/**
 * Labels on a game — `#karpov`, `#dcc-2026`, `#rook-endgame` — kept in the
 * chapter's own root comment.
 *
 * That location is forced, and it is worth knowing why before moving them.
 * Lichess strips every `[%...]` command it does not itself maintain
 * (`metaReg` in lila's tree.scala) and discards every PGN tag outside a fixed
 * roster (`StudyPgnTags.filterRelevant`), so neither a custom command nor a
 * custom header survives a chapter. Prose does. The root comment is the one
 * place a label can live and still be there when the game comes back.
 *
 * Being prose has consequences that are features: the tags travel with a shared
 * link, they survive a browser wipe because they are not stored here at all,
 * and they are visible and editable on lichess.org. It also means they are
 * public on a public study, which the UI says once.
 *
 * The grammar is fixed and cannot be loosened later without orphaning every tag
 * already written into somebody's study: lowercase letters, digits and hyphens.
 * No spaces — a tag has to be one token to be found again by reading.
 */

/** One tag, without its `#`. */
const BODY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Longest a tag may be, so a line of them stays readable. */
export const TAG_MAX = 32

/**
 * What the user typed, as it will be stored, or null if it is not a tag.
 *
 * Case is folded rather than rejected: typing `#Karpov` means `#karpov`, and
 * refusing it would be pedantry about a difference the grammar does not keep.
 * Spaces are not folded — `#rook endgame` is two ideas, and guessing which was
 * meant is worse than saying no.
 */
export function cleanTag(input: string): string | null {
  const body = input.trim().replace(/^#+/, '').toLowerCase()
  return body.length > 0 && body.length <= TAG_MAX && BODY.test(body) ? body : null
}

/**
 * The tags and the prose in a root comment, kept apart.
 *
 * Tags are the run of `#token`s at the *end* of the comment, however much
 * whitespace separates them from the prose. They are written on a line of their
 * own, and the line is deliberately not what this looks for: `humanComment` in
 * the converter collapses every run of whitespace to a single space, so a
 * comment that goes out with a newline before its tags comes back with a space
 * — and a rule that needed the line lost every tag on the first re-read.
 * Anything else handling the PGN may reflow it too.
 *
 * Each token has to carry its `#`. Testing only that each is a legal tag body
 * is not enough: "played", "well" and "approved" all are, so a sentence read as
 * a row of tags and the note lost its last line.
 */
export function parseTags(comment: string | null): { tags: string[]; prose: string } {
  const text = (comment ?? '').replace(/\r\n?/g, '\n').trim()
  if (text === '') return { tags: [], prose: '' }

  const words = text.split(/\s+/)
  let first = words.length
  while (first > 0) {
    const word = words[first - 1]
    if (!word.startsWith('#') || cleanTag(word) == null) break
    first -= 1
  }
  if (first === words.length) return { tags: [], prose: text }

  const tags = dedupe(words.slice(first).map((word) => cleanTag(word)!))
  // Sliced off the original text rather than rejoined from `words`, so prose
  // keeps its own line breaks and spacing where they survived.
  const prose = text.slice(0, text.length - words.slice(first).join(' ').length).trim()
  return { tags, prose }
}

/**
 * A root comment carrying both.
 *
 * The tags go last on a line of their own, which is what `parseTags` looks for
 * and what keeps a note and its labels from running together when a person
 * reads the chapter on Lichess.
 */
export function writeTags(prose: string, tags: string[]): string {
  const clean = dedupe(tags.map(cleanTag).filter((tag) => tag != null))
  const line = clean.map((tag) => `#${tag}`).join(' ')
  const body = prose.trim()
  if (!line) return body
  return body ? `${body}\n${line}` : line
}

/** The same tag twice is one tag, and the first spelling wins the order. */
function dedupe(tags: string[]): string[] {
  return [...new Set(tags)]
}

export function withTag(tags: string[], tag: string): string[] {
  const clean = cleanTag(tag)
  return clean && !tags.includes(clean) ? [...tags, clean] : tags
}

export function withoutTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t !== tag)
}

/**
 * Every tag in a chapter's PGN, without replaying its moves.
 *
 * A study of sixty-four games is filtered far more often than it is opened, and
 * building a move tree per game to read a comment that sits before the first
 * move would make listing a folder cost what opening every game in it costs.
 * The root comment is the first braced block in the movetext, which is exactly
 * where lila puts `initialPosition.comments` on the way out.
 */
export function tagsInPgn(pgn: string): string[] {
  const movetext = pgn.replace(/\r\n?/g, '\n').split(/\n\s*\n/).slice(1).join('\n\n')
  const match = /^\s*\{([^}]*)\}/.exec(movetext)
  return match ? parseTags(match[1]).tags : []
}

/** Every tag in use, in the order a reader would look for them. */
export function allTags(games: Array<{ tags: string[] }>): string[] {
  return [...new Set(games.flatMap((game) => game.tags))].sort()
}

/**
 * Whether a game matches what was typed in the tag box.
 *
 * Every word has to match, so two tags narrow rather than widen — the question
 * "which of my games are both a rook endgame and from the club" is the one this
 * is for. A partial word matches the start of a tag, so `#rook` finds
 * `#rook-endgame` while it is still being typed.
 */
export function matchesTagQuery(tags: string[], query: string): boolean {
  const wanted = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^#+/, ''))
    .filter((word) => word.length > 0)
  if (wanted.length === 0) return true
  return wanted.every((word) => tags.some((tag) => tag.startsWith(word)))
}

/** Tags that begin with what is being typed, for the suggestion list. */
export function suggestTags(known: string[], typed: string): string[] {
  const body = typed.trim().replace(/^#+/, '').toLowerCase()
  if (body === '') return known
  return known.filter((tag) => tag.startsWith(body) && tag !== body)
}
