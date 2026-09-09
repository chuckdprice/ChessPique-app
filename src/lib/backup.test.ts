import { describe, expect, it } from 'vitest'
import {
  applyBackup,
  BACKED_UP_KEYS,
  BACKUP_VERSION,
  BackupError,
  backupFileName,
  buildBackup,
  describeBackup,
  parseBackup,
  serializeBackup,
} from './backup'
import type { Backup } from './backup'

/** A localStorage stand-in that starts with something under every key. */
function store(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    read: (key: string) => map.get(key) ?? null,
    write: (key: string, value: string) => void map.set(key, value),
  }
}

const AT = new Date('2026-09-09T10:20:30.000Z')

describe('buildBackup', () => {
  it('carries the keys on the list', () => {
    const s = store({
      'chesspique.folders': JSON.stringify({ names: ['Openings'], of: { a: 'Openings' } }),
      'chesspique.recent-games': JSON.stringify([{ studyId: 'a', chapterId: 'b' }]),
    })
    const backup = buildBackup(s.read, AT)

    expect(backup.app).toBe('chesspique-backup')
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.savedAt).toBe('2026-09-09T10:20:30.000Z')
    expect(backup.data['chesspique.folders']).toEqual({
      names: ['Openings'],
      of: { a: 'Openings' },
    })
  })

  it('never carries the Lichess token', () => {
    // The whole reason the list is an allowlist. A backup is a file people
    // mail to themselves, and this key holds a live bearer token.
    const s = store({
      'chesspique.lichess': JSON.stringify({ token: 'secret', username: 'chuck' }),
      'chesspique.appearance': JSON.stringify({ theme: 'dark' }),
    })
    const backup = buildBackup(s.read, AT)

    expect(Object.keys(backup.data)).toEqual(['chesspique.appearance'])
    expect(serializeBackup(backup)).not.toContain('secret')
  })

  it('never carries the OAuth handshake keys either', () => {
    const s = store({
      'chesspique.lichess-oauth': 'x',
      'chesspique.lichess-oauth-pending': 'y',
      'chesspique.lichess-oauth-result': 'z',
    })
    expect(Object.keys(buildBackup(s.read, AT).data)).toEqual([])
  })

  it('leaves out a value that is not JSON rather than carrying a broken one', () => {
    const s = store({ 'chesspique.folders': '{not json' })
    expect(buildBackup(s.read, AT).data).toEqual({})
  })

  it('is empty when nothing has been stored', () => {
    expect(buildBackup(store().read, AT).data).toEqual({})
  })
})

describe('backupFileName', () => {
  it('is dated, so several can sit in one folder', () => {
    expect(backupFileName(AT)).toBe('chesspique-backup-2026-09-09.json')
  })
})

describe('parseBackup', () => {
  const good = serializeBackup({
    app: 'chesspique-backup',
    version: BACKUP_VERSION,
    savedAt: AT.toISOString(),
    data: { 'chesspique.appearance': { theme: 'dark' } },
  })

  it('reads one this app wrote', () => {
    expect(parseBackup(good).data).toEqual({ 'chesspique.appearance': { theme: 'dark' } })
  })

  it('round-trips what buildBackup produced', () => {
    const s = store({ 'chesspique.engine': JSON.stringify({ multiPv: 4 }) })
    const backup = buildBackup(s.read, AT)
    expect(parseBackup(serializeBackup(backup))).toEqual(backup)
  })

  it('refuses a file that is not JSON', () => {
    expect(() => parseBackup('not json at all')).toThrow(BackupError)
  })

  it('refuses JSON that is not one of ours', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(BackupError)
    expect(() => parseBackup('[1,2,3]')).toThrow(BackupError)
    expect(() => parseBackup('null')).toThrow(BackupError)
  })

  it('refuses one written by a newer version than this', () => {
    const future = good.replace(`"version": ${BACKUP_VERSION}`, `"version": ${BACKUP_VERSION + 1}`)
    expect(() => parseBackup(future)).toThrow(/newer version/)
  })

  it('refuses one with no data at all', () => {
    expect(() => parseBackup('{"app":"chesspique-backup","version":1}')).toThrow(BackupError)
  })
})

describe('applyBackup', () => {
  const backup = (data: Record<string, unknown>): Backup => ({
    app: 'chesspique-backup',
    version: BACKUP_VERSION,
    savedAt: AT.toISOString(),
    data,
  })

  it('writes the keys it recognises, as the strings localStorage holds', () => {
    const s = store()
    const result = applyBackup(backup({ 'chesspique.folders': { names: ['A'], of: {} } }), s.write)

    expect(s.map.get('chesspique.folders')).toBe('{"names":["A"],"of":{}}')
    expect(result.restored).toEqual(['chesspique.folders'])
  })

  it('refuses to write a key outside the list, however the file asks', () => {
    // The same allowlist guards the way back in: a hand-edited or hostile
    // backup must not be able to plant a token under a name the app trusts.
    const s = store()
    const result = applyBackup(
      backup({
        'chesspique.lichess': { token: 'planted' },
        'chesspique.appearance': { theme: 'dark' },
        'something.else': 1,
      }),
      s.write,
    )

    expect(s.map.has('chesspique.lichess')).toBe(false)
    expect(result.restored).toEqual(['chesspique.appearance'])
    expect(result.ignored.sort()).toEqual(['chesspique.lichess', 'something.else'])
  })

  it('leaves a key the file does not mention alone', () => {
    // A backup is something to restore from, not a statement about everything
    // that should exist.
    const s = store({ 'chesspique.engine': JSON.stringify({ multiPv: 5 }) })
    const result = applyBackup(backup({ 'chesspique.appearance': { theme: 'dark' } }), s.write)

    expect(s.map.get('chesspique.engine')).toBe('{"multiPv":5}')
    expect(result.missing).toContain('chesspique.engine')
  })

  it('survives a full round trip through a file', () => {
    const source = store({
      'chesspique.appearance': JSON.stringify({ theme: 'dark', accent: 'blue' }),
      'chesspique.folders': JSON.stringify({ names: ['Openings'], of: { a: 'Openings' } }),
      'chesspique.recent-studies': JSON.stringify([{ studyId: 'a', studyName: 'A', openedAt: 1 }]),
      'chesspique.lichess': JSON.stringify({ token: 'secret' }),
    })
    const file = serializeBackup(buildBackup(source.read, AT))

    const target = store()
    applyBackup(parseBackup(file), target.write)

    for (const key of ['chesspique.appearance', 'chesspique.folders', 'chesspique.recent-studies']) {
      expect(target.map.get(key)).toBe(source.map.get(key))
    }
    expect(target.map.has('chesspique.lichess')).toBe(false)
  })
})

describe('describeBackup', () => {
  const backup = (keys: string[]): Backup => ({
    app: 'chesspique-backup',
    version: BACKUP_VERSION,
    savedAt: '',
    data: Object.fromEntries(keys.map((k) => [k, {}])),
  })

  it('names what is in the file, in English', () => {
    expect(describeBackup(backup(['chesspique.folders']))).toBe('folders')
    expect(describeBackup(backup(['chesspique.folders', 'chesspique.recent-games']))).toBe(
      'folders and recent games',
    )
    expect(
      describeBackup(
        backup(['chesspique.appearance', 'chesspique.folders', 'chesspique.recent-games']),
      ),
    ).toBe('appearance, folders and recent games')
  })

  it('says so when there is nothing it knows about', () => {
    expect(describeBackup(backup([]))).toBe('nothing this version recognises')
  })

  it('has a name for every key on the list', () => {
    // A key added to the list without a name would show up as its raw
    // localStorage key in a sentence meant for a person.
    const described = describeBackup(backup([...BACKED_UP_KEYS]))
    expect(described).not.toContain('chesspique.')
  })
})
