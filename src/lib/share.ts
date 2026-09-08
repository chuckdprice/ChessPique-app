/**
 * A game in a link.
 *
 * The whole PGN, gzipped and base64url'd into the URL's fragment. No server, no
 * account on either end, no expiry, and nothing to maintain: the link is the
 * game rather than a pointer to it, so it cannot break when the sender edits or
 * deletes the chapter it came from, and it works from a private or unlisted
 * study that a Lichess link could not be read out of.
 *
 * The fragment specifically, not the query. A fragment is never sent to the
 * server, so a game shared this way never reaches Vercel's logs — and it needs
 * no rewrite rule, which matters for a static site where `/g/abc` would simply
 * 404.
 *
 * Measured with `gzip -9`: a 29-move converted game is 876 characters of
 * base64url and a 43-move one is 1208, both inside the ~2000 where chat clients
 * start mangling links. `CompressionStream` is in every current browser, so
 * this needs no library.
 */

/**
 * Past this, a link is likely to be broken in transit by something between the
 * sender and the reader — mail clients wrap, chat clients truncate. Not a hard
 * limit, because the browser itself will carry far more: the app warns and
 * still hands the link over, since only the sender knows where it is going.
 */
export const SHARE_LINK_WARN_CHARS = 2000

/** The path a shared game is read back out of. */
const SHARE_PREFIX = '#/g/'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function through(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/** The payload half of a share link: gzip, then base64url. */
export async function encodeGame(pgn: string): Promise<string> {
  const source = new Blob([pgn]).stream() as unknown as ReadableStream<Uint8Array>
  return toBase64Url(await through(source.pipeThrough(new CompressionStream('gzip'))))
}

/** The PGN back out of one. Throws on anything that is not a payload we wrote. */
export async function decodeGame(payload: string): Promise<string> {
  const bytes = fromBase64Url(payload)
  const source = new Blob([bytes]).stream() as unknown as ReadableStream<Uint8Array>
  const plain = await through(source.pipeThrough(new DecompressionStream('gzip')))
  return new TextDecoder().decode(plain)
}

/**
 * The payload in a URL's fragment, or null when there is not one.
 *
 * Kept apart from the decoding and from `window` so that the shape of a link is
 * something the tests can pin down without a browser.
 */
export function payloadInHash(hash: string): string | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null
  const payload = hash.slice(SHARE_PREFIX.length).trim()
  // Only the alphabet we write. Anything else is somebody else's fragment, and
  // treating it as ours would mean answering a link that was never a game.
  return payload.length > 0 && /^[A-Za-z0-9_-]+$/.test(payload) ? payload : null
}

/** A whole link, against whatever origin the app is being served from. */
export function shareLink(payload: string, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}${SHARE_PREFIX}${payload}`
}
