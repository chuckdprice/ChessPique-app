/**
 * One PGN file holding several games, which is what a Lichess study is.
 *
 * `splitHeadersAndMovetext` deliberately reads across a blank line when a tag
 * follows it, so that a file whose header block is interrupted still parses;
 * handed a study it would swallow every game into one header list. So the
 * splitting happens here first, and each piece goes to the existing parser
 * whole.
 */

import { headerDict, splitHeadersAndMovetext } from './convert'
import { tagsInPgn } from './tags'

/**
 * A tag line, strictly: a name and a quoted value.
 *
 * Not simply "starts with `[`". Movetext is wrapped at a column, and a comment
 * carrying engine commands — `{[%eval 0.25] [%clk 0:30:00]}` — can be pushed
 * onto a line of its own; `[%clk` would pass a looser test and cut a game in
 * half at one of its own moves.
 */
const TAG_LINE = /^\s*\[[A-Za-z][A-Za-z0-9_]*\s+"/

/**
 * The games in a PGN file, each still a complete PGN with its own tags.
 *
 * A game ends where the next one's tag section begins. Two things say a tag
 * line starts a new game rather than continuing this one: it comes after
 * movetext, or it repeats a tag this game already has. The second is the
 * safety net for a game with no moves at all — a chapter holding only a
 * position — where there is no movetext to have come after, and without it two
 * such chapters in a row would merge into one.
 */
export function splitGames(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const games: string[] = []
  let current: string[] = []
  let seen = new Set<string>()
  let inMovetext = false

  const flush = () => {
    if (current.some((line) => line.trim() !== '')) games.push(current.join('\n').trim())
    current = []
    seen = new Set()
    inMovetext = false
  }

  for (const line of lines) {
    if (TAG_LINE.test(line)) {
      const name = line.trim().slice(1).split(/\s/)[0]
      if (inMovetext || seen.has(name)) flush()
      seen.add(name)
      current.push(line)
      continue
    }
    // A blank line between the tags and the moves is where PGN says the header
    // ends, but a game can also be nothing but tags; only real content here
    // means the movetext has started.
    if (line.trim() !== '') inMovetext = true
    current.push(line)
  }
  flush()

  return games
}

/**
 * Where a chapter's own id hides.
 *
 * There is no endpoint that lists a study's chapters — the only way to learn
 * their ids is to export the study and read them off the `ChapterURL` tag that
 * Lichess stamps onto every chapter on the way out. Everything the app does to
 * one chapter afterwards is addressed by what this returns.
 */
export function chapterIdOf(pgn: string): string | null {
  const url = tagsOf(pgn).get('ChapterURL')
  const match = url ? /\/study\/(\w{8})\/(\w{8})/.exec(url) : null
  return match ? match[2] : null
}

/** The study half of the same tag, for checking a game came from where we think. */
export function studyIdOf(pgn: string): string | null {
  const url = tagsOf(pgn).get('ChapterURL')
  const match = url ? /\/study\/(\w{8})\/(\w{8})/.exec(url) : null
  return match ? match[1] : null
}

/** Every tag of a single game, by name. */
export function tagsOf(pgn: string): Map<string, string> {
  return headerDict(splitHeadersAndMovetext(pgn).headerLines)
}

/** What a game list shows for one game, without re-parsing its moves. */
export interface GameSummary {
  chapterId: string | null
  chapterName: string | null
  white: string | null
  black: string | null
  date: string | null
  result: string | null
  event: string | null
  /** The game's own labels, read from its root comment. */
  tags: string[]
}

/**
 * A game's headline facts.
 *
 * Read from the tags alone: a study of 64 games is listed far more often than
 * it is opened, and parsing every move tree to draw a list would make opening
 * a folder cost what opening every game in it costs.
 */
export function summarize(pgn: string): GameSummary {
  const tags = tagsOf(pgn)
  const get = (name: string) => {
    const value = tags.get(name)
    return value && value !== '?' ? value : null
  }
  return {
    chapterId: chapterIdOf(pgn),
    chapterName: get('ChapterName'),
    white: get('White'),
    black: get('Black'),
    date: get('Date'),
    result: get('Result'),
    event: get('Event'),
    tags: tagsInPgn(pgn),
  }
}
