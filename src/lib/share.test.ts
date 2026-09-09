import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  decodeGame,
  encodeGame,
  payloadInHash,
  shareLink,
  SHARE_LINK_WARN_CHARS,
} from './share'

const converted = readFileSync(join(__dirname, '__fixtures__', 'converted_game.pgn'), 'utf8')

describe('encode and decode', () => {
  it('round-trips a real converted game byte for byte', async () => {
    expect(await decodeGame(await encodeGame(converted))).toBe(converted)
  })

  it('round-trips the awkward characters a PGN carries', async () => {
    // Braces, quotes, newlines and the en dash the app writes into chapter
    // names all have to survive the trip through base64url.
    const pgn = '[Event "A \\"quoted\\" one"]\n\n1. e4 {[%clk 0:29:50] Karpov – Fischer} e5 *\n'
    expect(await decodeGame(await encodeGame(pgn))).toBe(pgn)
  })

  it('writes a payload that is URL-safe', async () => {
    const payload = await encodeGame(converted)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('is small enough to be a link', async () => {
    // The measured figure this design rests on: a 29-move converted game came
    // out at 876 characters. Guarding the order of magnitude, not the digit.
    const payload = await encodeGame(converted)
    expect(payload.length).toBeLessThan(SHARE_LINK_WARN_CHARS)
  })

  it('refuses a payload that is not one of ours', async () => {
    await expect(decodeGame('bm90LWd6aXA')).rejects.toBeTruthy()
  })
})

describe('payloadInHash', () => {
  it('reads the payload out of a share link', () => {
    expect(payloadInHash('#/g/H4sIAAAA')).toBe('H4sIAAAA')
  })

  it('ignores a fragment that is not a shared game', () => {
    expect(payloadInHash('')).toBeNull()
    expect(payloadInHash('#')).toBeNull()
    expect(payloadInHash('#/settings')).toBeNull()
    expect(payloadInHash('#access_token=abc')).toBeNull()
  })

  it('ignores an empty payload', () => {
    expect(payloadInHash('#/g/')).toBeNull()
    expect(payloadInHash('#/g/   ')).toBeNull()
  })

  it('ignores a payload outside the alphabet we write', () => {
    // Somebody else's fragment that happens to start the same way is not a
    // game, and answering it would be answering a link we never made.
    expect(payloadInHash('#/g/has spaces')).toBeNull()
    expect(payloadInHash('#/g/has/slash')).toBeNull()
    expect(payloadInHash('#/g/plus+slash=')).toBeNull()
  })
})

describe('shareLink', () => {
  it('builds against whatever origin the app is served from', () => {
    expect(shareLink('ABC', { origin: 'https://chesspique.vercel.app', pathname: '/' })).toBe(
      'https://chesspique.vercel.app/#/g/ABC',
    )
  })

  it('keeps a path, so a preview deployment shares its own build', () => {
    expect(shareLink('ABC', { origin: 'http://localhost:5173', pathname: '/app/' })).toBe(
      'http://localhost:5173/app/#/g/ABC',
    )
  })

  it('round-trips through payloadInHash', async () => {
    const payload = await encodeGame(converted)
    const link = shareLink(payload, { origin: 'https://x.test', pathname: '/' })
    expect(payloadInHash(link.slice(link.indexOf('#')))).toBe(payload)
  })
})
