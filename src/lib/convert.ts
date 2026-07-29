/**
 * Convert ChessNoteR PGN timing comments to PGN %clk comments.
 *
 * TypeScript port of chessnoter_clk_convert.py (the reference implementation).
 *
 * Input PGNs from ChessNoteR often contain elapsed-move-time comments like
 * {[%emt 0:01:23]} and sometimes a bare clock reading such as {1:07:00} or
 * {56:00}. This module produces a PGN with one {[%clk h:mm:ss]} comment after
 * every move, removes %emt comments, treats bare clock comments as
 * authoritative anchors, and updates the TimeControl header to standard PGN
 * notation.
 */

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*'])

const HEADER_RE = /^\[(\w+)\s+"(.*)"\]\s*$/
const MOVE_NUMBER_RE = /^(\d+)\.(\.\.)?$/
const TOKEN_RE = /\{[^}]*\}|\S+/g
const EMT_RE = /%emt\s+([0-9]+:[0-9]{1,2}:[0-9]{1,2})/
const CLK_RE = /%clk\s+([0-9]+(?::[0-9]{1,2}){1,2})/
const BARE_CLOCK_RE = /^\s*([0-9]+(?::[0-9]{1,2}){1,2})\s*$/

export interface Move {
  number: number
  color: 'w' | 'b'
  san: string
  emtSeconds: number | null
  anchorClockSeconds: number | null
  clkSeconds: number | null
}

export type TimeControlMode = 'delay' | 'increment' | 'none'

export interface TimeControl {
  startSeconds: number
  mode: TimeControlMode
  amountSeconds: number
}

export interface ConvertOptions {
  startSeconds?: number
  startMinutes?: number
  delay?: number
  increment?: number
  timecontrol?: string
}

export interface ConvertResult {
  pgn: string
  /** Header tags in original file order, TimeControl updated/inserted. */
  headers: Array<{ name: string; value: string }>
  moves: Move[]
  result: string | null
  timeControl: TimeControl
  warnings: string[]
}

export class ConvertError extends Error {}

export function parseClockTime(value: string, bare = false): number {
  const parts = value.trim().split(':').map(Number)
  let hours: number, minutes: number, seconds: number
  if (parts.length === 3) {
    ;[hours, minutes, seconds] = parts
  } else if (parts.length === 2) {
    if (bare) {
      hours = 0
      ;[minutes, seconds] = parts
    } else {
      hours = 0
      minutes = parts[0]
      seconds = parts[1]
    }
  } else {
    throw new ConvertError(`Invalid clock time: ${JSON.stringify(value)}`)
  }
  if (parts.some(Number.isNaN) || minutes >= 60 || seconds >= 60) {
    throw new ConvertError(`Invalid clock time: ${JSON.stringify(value)}`)
  }
  return hours * 3600 + minutes * 60 + seconds
}

export function formatClockTime(totalSeconds: number): string {
  const s = Math.max(0, Math.trunc(totalSeconds))
  const hours = Math.trunc(s / 3600)
  const minutes = Math.trunc((s % 3600) / 60)
  const secs = s % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function splitHeadersAndMovetext(text: string): {
  headerLines: string[]
  movetext: string
} {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const headerLines: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.startsWith('[') && line.endsWith(']')) {
      headerLines.push(line)
      i += 1
    } else if (line === '') {
      i += 1
      // Continue across blank lines before movetext.
      if (i < lines.length && lines[i].trimStart().startsWith('[')) {
        continue
      }
      break
    } else {
      break
    }
  }
  const movetext = lines.slice(i).join('\n').trim()
  return { headerLines, movetext }
}

export function headerDict(headerLines: string[]): Map<string, string> {
  const headers = new Map<string, string>()
  for (const line of headerLines) {
    const match = HEADER_RE.exec(line.trim())
    if (match) {
      headers.set(match[1], match[2])
    }
  }
  return headers
}

export function parseTimecontrolHeader(value: string): TimeControl | null {
  const raw = value.trim().replace(/ /g, '')

  // ChessNoteR-style examples: G70/d10, G90+30
  let match = /^G(\d+)(?:\/?d(\d+)|\+(\d+))?$/i.exec(raw)
  if (match) {
    const startSeconds = parseInt(match[1], 10) * 60
    if (match[2]) {
      return { startSeconds, mode: 'delay', amountSeconds: parseInt(match[2], 10) }
    }
    if (match[3]) {
      return { startSeconds, mode: 'increment', amountSeconds: parseInt(match[3], 10) }
    }
    return { startSeconds, mode: 'none', amountSeconds: 0 }
  }

  // Standard delay notation: 4200d10
  match = /^(\d+)d(\d+)$/i.exec(raw)
  if (match) {
    return {
      startSeconds: parseInt(match[1], 10),
      mode: 'delay',
      amountSeconds: parseInt(match[2], 10),
    }
  }

  // Standard increment notation: 5400+30
  match = /^(\d+)\+(\d+)$/.exec(raw)
  if (match) {
    return {
      startSeconds: parseInt(match[1], 10),
      mode: 'increment',
      amountSeconds: parseInt(match[2], 10),
    }
  }

  // Plain sudden-death seconds.
  if (/^\d+$/.test(raw)) {
    return { startSeconds: parseInt(raw, 10), mode: 'none', amountSeconds: 0 }
  }

  return null
}

export function timeControlHeaderValue(tc: TimeControl): string {
  if (tc.mode === 'delay' && tc.amountSeconds) {
    return `${tc.startSeconds}d${tc.amountSeconds}`
  }
  if (tc.mode === 'increment' && tc.amountSeconds) {
    return `${tc.startSeconds}+${tc.amountSeconds}`
  }
  return String(tc.startSeconds)
}

function resolveTimecontrol(
  headers: Map<string, string>,
  options: ConvertOptions,
): TimeControl {
  const headerValue = headers.get('TimeControl')
  const detected = headerValue ? parseTimecontrolHeader(headerValue) : null

  let startSeconds: number | null = null
  if (options.startSeconds != null) {
    startSeconds = options.startSeconds
  } else if (options.startMinutes != null) {
    startSeconds = options.startMinutes * 60
  } else if (detected) {
    startSeconds = detected.startSeconds
  }

  if (startSeconds == null) {
    throw new ConvertError(
      'Could not determine the starting clock time from the TimeControl header. ' +
        'Enter the time control manually below.',
    )
  }

  if (options.delay != null && options.increment != null) {
    throw new ConvertError('Use either a delay or an increment, not both.')
  }

  if (options.delay != null) {
    return { startSeconds, mode: 'delay', amountSeconds: options.delay }
  }
  if (options.increment != null) {
    return { startSeconds, mode: 'increment', amountSeconds: options.increment }
  }
  if (detected) {
    return { startSeconds, mode: detected.mode, amountSeconds: detected.amountSeconds }
  }
  return { startSeconds, mode: 'none', amountSeconds: 0 }
}

function commentText(token: string): string {
  return token.slice(1, -1).trim()
}

function isComment(token: string): boolean {
  return token.startsWith('{') && token.endsWith('}')
}

function isMoveNumber(token: string): { moveNo: number; side: 'w' | 'b' } | null {
  const match = MOVE_NUMBER_RE.exec(token)
  if (!match) return null
  return { moveNo: parseInt(match[1], 10), side: match[2] ? 'b' : 'w' }
}

function extractTimingFromComments(commentTokens: string[]): {
  emtSeconds: number | null
  anchorClockSeconds: number | null
} {
  // Bare comments like {56:00} and existing [%clk ...] comments are treated
  // as authoritative clock anchors. If both an elapsed time and an anchor
  // appear after the same SAN move, the anchor wins for the final clock value.
  let emtSeconds: number | null = null
  let anchorClockSeconds: number | null = null

  for (const token of commentTokens) {
    const text = commentText(token)

    const emtMatch = EMT_RE.exec(text)
    if (emtMatch) {
      emtSeconds = parseClockTime(emtMatch[1])
    }

    const clkMatch = CLK_RE.exec(text)
    if (clkMatch) {
      anchorClockSeconds = parseClockTime(clkMatch[1], true)
    }

    const bareMatch = BARE_CLOCK_RE.exec(text)
    if (bareMatch) {
      anchorClockSeconds = parseClockTime(bareMatch[1], true)
    }
  }

  return { emtSeconds, anchorClockSeconds }
}

export function parseMoves(movetext: string): {
  moves: Move[]
  result: string | null
} {
  const tokens = movetext.match(TOKEN_RE) ?? []
  const moves: Move[] = []
  let result: string | null = null

  let currentNumber = 1
  let sideToMove: 'w' | 'b' = 'w'
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]

    if (isComment(token)) {
      // A standalone comment that was not attached to a SAN move.
      i += 1
      continue
    }

    if (RESULT_TOKENS.has(token)) {
      result = token
      i += 1
      continue
    }

    const moveNumber = isMoveNumber(token)
    if (moveNumber) {
      currentNumber = moveNumber.moveNo
      sideToMove = moveNumber.side
      i += 1
      continue
    }

    // Skip NAGs, game annotations, or variation parens if they appear.
    if (token.startsWith('$') || token === '(' || token === ')') {
      i += 1
      continue
    }

    const san = token
    const commentTokens: string[] = []
    i += 1
    while (i < tokens.length && isComment(tokens[i])) {
      commentTokens.push(tokens[i])
      i += 1
    }

    const { emtSeconds, anchorClockSeconds } = extractTimingFromComments(commentTokens)
    moves.push({
      number: currentNumber,
      color: sideToMove,
      san,
      emtSeconds,
      anchorClockSeconds,
      clkSeconds: null,
    })

    if (sideToMove === 'w') {
      sideToMove = 'b'
    } else {
      sideToMove = 'w'
      currentNumber += 1
    }
  }

  return { moves, result }
}

export function applyTimeRule(
  previousClock: number,
  emtSeconds: number,
  tc: TimeControl,
): number {
  // Delay mode: if elapsed time is within the delay, clock is unchanged;
  // otherwise subtract the full elapsed time.
  if (tc.mode === 'delay' && tc.amountSeconds) {
    if (emtSeconds <= tc.amountSeconds) {
      return previousClock
    }
    return previousClock - emtSeconds
  }

  // Increment mode: if elapsed time is within the increment, add the unused
  // increment; otherwise subtract the full elapsed time.
  if (tc.mode === 'increment' && tc.amountSeconds) {
    if (emtSeconds <= tc.amountSeconds) {
      return previousClock + (tc.amountSeconds - emtSeconds)
    }
    return previousClock - emtSeconds
  }

  return previousClock - emtSeconds
}

export function calculateClocks(moves: Move[], tc: TimeControl): string[] {
  const clocks: Record<'w' | 'b', number> = { w: tc.startSeconds, b: tc.startSeconds }
  const warnings: string[] = []

  for (const move of moves) {
    if (move.anchorClockSeconds != null) {
      move.clkSeconds = move.anchorClockSeconds
    } else if (move.emtSeconds != null) {
      move.clkSeconds = applyTimeRule(clocks[move.color], move.emtSeconds, tc)
    } else {
      move.clkSeconds = clocks[move.color]
      warnings.push(
        `Move ${move.number}${move.color === 'w' ? '.' : '...'} ${move.san} ` +
          'had no %emt or clock anchor; reused previous clock.',
      )
    }

    clocks[move.color] = Math.max(0, move.clkSeconds)
    move.clkSeconds = clocks[move.color]
  }

  return warnings
}

function updateTimecontrolHeader(headerLines: string[], value: string): string[] {
  const updated: string[] = []
  let replaced = false
  for (const line of headerLines) {
    if (line.startsWith('[TimeControl ')) {
      updated.push(`[TimeControl "${value}"]`)
      replaced = true
    } else {
      updated.push(line)
    }
  }
  if (!replaced) {
    // Put TimeControl near the normal PGN event metadata if it was absent.
    const insertAt = Math.min(5, updated.length)
    updated.splice(insertAt, 0, `[TimeControl "${value}"]`)
  }
  return updated
}

export function formatMovetext(moves: Move[], result: string | null): string {
  const rows: string[] = []
  let i = 0
  while (i < moves.length) {
    const move = moves[i]
    let row: string
    if (move.color === 'w') {
      row = `${move.number}. ${move.san} {[%clk ${formatClockTime(move.clkSeconds ?? 0)}]}`
      const next = moves[i + 1]
      if (next && next.number === move.number && next.color === 'b') {
        row += ` ${next.san} {[%clk ${formatClockTime(next.clkSeconds ?? 0)}]}`
        i += 2
      } else {
        i += 1
      }
    } else {
      row = `${move.number}... ${move.san} {[%clk ${formatClockTime(move.clkSeconds ?? 0)}]}`
      i += 1
    }
    rows.push(row)
  }

  if (result) {
    if (rows.length > 0) {
      rows[rows.length - 1] += ` ${result}`
    } else {
      rows.push(result)
    }
  }

  return rows.join('\n')
}

/** Rebuild a full PGN from (possibly edited) headers and converted moves. */
export function buildPgn(
  headers: Array<{ name: string; value: string }>,
  moves: Move[],
  result: string | null,
): string {
  const headerLines = headers.map((h) => `[${h.name} "${h.value}"]`)
  return headerLines.join('\n') + '\n\n' + formatMovetext(moves, result) + '\n'
}

export function convertPgn(text: string, options: ConvertOptions = {}): ConvertResult {
  const { headerLines, movetext } = splitHeadersAndMovetext(text)
  const headers = headerDict(headerLines)
  const tc = resolveTimecontrol(headers, options)
  const { moves, result: parsedResult } = parseMoves(movetext)

  if (moves.length === 0) {
    throw new ConvertError('No moves found in the PGN. Check the input format.')
  }

  const warnings = calculateClocks(moves, tc)
  const result = parsedResult ?? headers.get('Result') ?? null

  const tcValue = options.timecontrol || timeControlHeaderValue(tc)
  const updatedHeaderLines = updateTimecontrolHeader(headerLines, tcValue)

  const orderedHeaders: Array<{ name: string; value: string }> = []
  for (const line of updatedHeaderLines) {
    const match = HEADER_RE.exec(line.trim())
    if (match) {
      orderedHeaders.push({ name: match[1], value: match[2] })
    }
  }

  const pgn = buildPgn(orderedHeaders, moves, result)
  return { pgn, headers: orderedHeaders, moves, result, timeControl: tc, warnings }
}
