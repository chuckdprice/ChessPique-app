/**
 * Signing in to Lichess from the browser, with OAuth 2 PKCE.
 *
 * There is no server in this app and there never will be, so there is nowhere
 * to keep a client secret. PKCE is the flow for exactly that case: the app
 * invents a random secret per attempt, sends only its hash to Lichess, and
 * proves ownership when redeeming the code. Lichess needs no registration for
 * a public client — the client_id is just a name for the app.
 *
 * The sign-in happens in a popup rather than by navigating this page. A
 * top-level redirect would reload the app and throw away the converted game
 * and its engine review, which is the very thing the user is trying to save.
 */

import { readStored } from '../storage'

/**
 * Identifies this app on the Lichess authorization screen.
 *
 * Whatever origin the app is being served from, rather than a domain written
 * down here: lila does not tie the client id to the redirect at all — its own
 * error text for a missing one reads "client_id required (choose any)" — it is
 * only a label on the consent screen and a value that has to stay the same
 * between the two calls of one sign-in. Deriving it means the screen names the
 * site you are actually on, and that a domain rename cannot leave it lying.
 */
function clientId(): string {
  return redirectUri()
}

/**
 * Everything the Studies API offers: reading private studies and creating or
 * changing them. Nothing else — no games, no messages, no preferences.
 */
export const SCOPES = 'study:read study:write'

const AUTHORIZE_URL = 'https://lichess.org/oauth'
const TOKEN_URL = 'https://lichess.org/api/token'
const STORAGE_KEY = 'chesspique.lichess'
/**
 * How the pop-up hands its result back: a BroadcastChannel, with localStorage
 * as the fallback (writing fires a `storage` event in every other window).
 *
 * Not window.opener/postMessage. In practice the browser can sever the opener
 * link during the trip out to Lichess and back — at which point the opener
 * sees `popup.closed === true` while the window is plainly open, and the
 * returning pop-up finds `window.opener` null and has no one to report to.
 * Both were observed in the field. These two channels only need the windows
 * to share an origin, which they always do.
 */
const RESULT_CHANNEL = 'chesspique.lichess-oauth'
const RESULT_KEY = 'chesspique.lichess-oauth-result'
/**
 * The state of a sign-in currently in flight, written before the pop-up is
 * sent to Lichess. It is what tells the returning document that it is a
 * pop-up: no marker can be carried on the URL, because Lichess *replaces* the
 * redirect URI's query with `code` and `state` rather than adding to it
 * (lila, Protocol.scala: `value.withQuery(s"code=...&state=...")`).
 */
const PENDING_KEY = 'chesspique.lichess-oauth-pending'
/** A sign-in older than this was abandoned; its code is no longer expected. */
const PENDING_TTL_MS = 10 * 60 * 1000

interface AuthResult {
  code: string | null
  state: string | null
  error: string | null
}

export interface LichessSession {
  token: string
  /** Epoch ms, from the token's expires_in. */
  expiresAt: number
  username: string
}

export class LichessAuthError extends Error {}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(48)))
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/**
 * Where Lichess sends the pop-up back to: this app, and nothing else. Anything
 * added here would be discarded — Lichess overwrites the query — and the token
 * request has to repeat this string exactly.
 */
function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/**
 * The state of a sign-in in flight, or null when none is.
 *
 * `undefined` means storage could not be read at all, which the caller treats
 * as "cannot rule it out" rather than as "no".
 */
function pendingState(): string | null | undefined {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as { state?: string; at?: number }
    if (!pending.state || Date.now() - (pending.at ?? 0) > PENDING_TTL_MS) return null
    return pending.state
  } catch {
    return undefined
  }
}

function setPendingState(state: string | null): void {
  try {
    if (state) localStorage.setItem(PENDING_KEY, JSON.stringify({ state, at: Date.now() }))
    else localStorage.removeItem(PENDING_KEY)
  } catch {
    // Detection falls back to the parameters alone; see isOAuthReturn.
  }
}

export function loadSession(): LichessSession | null {
  try {
    // The one stored value a rename must not lose: signing out everybody who
    // had signed in would be the whole cost of the new name. See storage.ts.
    const raw = readStored(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as LichessSession
    if (!session.token || session.expiresAt < Date.now()) return null
    return session
  } catch {
    return null
  }
}

export function saveSession(session: LichessSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // A browser refusing storage still gets a working session for this tab.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; the caller drops the token either way.
  }
}

/**
 * Whether this document is the sign-in pop-up coming back from Lichess.
 *
 * Called before React mounts: the pop-up should hand its result over and
 * close, not boot a second copy of the app.
 */
export function isOAuthReturn(): boolean {
  const params = new URLSearchParams(window.location.search)
  const state = params.get('state')
  if (!state || (!params.has('code') && !params.has('error'))) return false
  const pending = pendingState()
  // No sign-in in flight means this is an old link someone kept, not a
  // pop-up: boot the app rather than trying to close their window. When
  // storage cannot be read the parameters are taken at face value.
  return pending === undefined || pending === state
}

/** Broadcast the result to the app's other windows, then close this one. */
export function completeOAuthReturn(): void {
  const params = new URLSearchParams(window.location.search)
  const result: AuthResult = {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error_description') ?? params.get('error'),
  }
  try {
    const channel = new BroadcastChannel(RESULT_CHANNEL)
    channel.postMessage(result)
    channel.close()
  } catch {
    // Fall through to storage, which every supported browser has.
  }
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(result))
  } catch {
    // With both channels unavailable the waiter's timeout will explain.
  }
  window.close()
  // A pop-up the browser refuses to close should say why it is still here.
  document.body.textContent = 'Signed in — you can close this window.'
}

/**
 * Remove any OAuth parameters from this window's address bar.
 *
 * Only the popup can do anything with a code, so one that arrives here is
 * spent. Left in place it would sit in the address bar, the history, and any
 * referrer this page sends.
 */
export function stripOAuthParams(): void {
  const url = new URL(window.location.href)
  const spent = ['code', 'state', 'error', 'error_description']
  if (!spent.some((key) => url.searchParams.has(key))) return
  for (const key of spent) url.searchParams.delete(key)
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

/**
 * Wait for the pop-up to report back.
 *
 * There is deliberately no watch on `popup.closed`: the browser can sever the
 * two windows during the round trip to Lichess, after which `closed` reads
 * true while the window is open on screen, and acting on it cancelled live
 * sign-ins. Lichess redirects back on denial as well as success, so the only
 * silent case is the user closing the window by hand — covered by the timeout.
 *
 * A result whose state is not this attempt's is ignored, not fatal: it is a
 * straggler from an earlier attempt, and this waiter's own answer may still
 * be coming.
 */
function awaitAuthorization(state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let channel: BroadcastChannel | null = null
    const finish = (fn: () => void) => {
      channel?.close()
      window.removeEventListener('storage', onStorage)
      clearTimeout(deadline)
      fn()
    }

    const onResult = (result: AuthResult) => {
      if (result.state !== state) return
      if (result.error || !result.code) {
        finish(() => reject(new LichessAuthError(result.error || 'Lichess did not send a code.')))
        return
      }
      const code = result.code
      finish(() => resolve(code))
    }

    try {
      channel = new BroadcastChannel(RESULT_CHANNEL)
      channel.onmessage = (event) => onResult(event.data as AuthResult)
    } catch {
      channel = null
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== RESULT_KEY || !event.newValue) return
      try {
        onResult(JSON.parse(event.newValue) as AuthResult)
      } catch {
        // Not this feature's write; ignore.
      }
    }
    window.addEventListener('storage', onStorage)

    const deadline = setTimeout(
      () => finish(() => reject(new LichessAuthError('Signing in to Lichess timed out.'))),
      5 * 60 * 1000,
    )
  })
}

/**
 * Open the sign-in window, blank for now.
 *
 * Separate from the sign-in itself so a caller can open it in the click that
 * asked for it. A browser only allows a pop-up while it can still see the
 * gesture that caused it, and everything else here — hashing the verifier,
 * waiting on Lichess — happens after an await.
 */
export function openSignInWindow(): Window | null {
  return window.open('about:blank', 'lichess-login', 'width=520,height=720')
}

/**
 * Run the whole sign-in and return the token.
 *
 * @param opened A window already opened by the click that started this. When
 *   absent one is opened here, which is safe only if this call is itself
 *   synchronous within that click.
 */
export async function signIn(
  opened?: Window | null,
): Promise<{ token: string; expiresAt: number }> {
  const popup = opened ?? openSignInWindow()
  if (!popup) {
    throw new LichessAuthError(
      'The Lichess sign-in window was blocked. Allow pop-ups for this site and try again.',
    )
  }

  try {
    const verifier = randomString()
    const state = randomString()
    const url = new URL(AUTHORIZE_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId())
    url.searchParams.set('redirect_uri', redirectUri())
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('code_challenge', await codeChallenge(verifier))
    url.searchParams.set('state', state)
    // Recorded before the pop-up leaves, because it is what the returning
    // document checks itself against.
    setPendingState(state)
    // Listen before navigating, so no window exists in which the pop-up could
    // answer into silence.
    const answer = awaitAuthorization(state)
    popup.location.href = url.toString()

    const code = await answer

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri(),
        client_id: clientId(),
      }),
    })
    if (!response.ok) {
      throw new LichessAuthError(`Lichess refused the sign-in (HTTP ${response.status}).`)
    }
    const token = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!token.access_token) throw new LichessAuthError('Lichess sent no access token.')
    return {
      token: token.access_token,
      expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    }
  } finally {
    setPendingState(null)
    // Best effort: after a severing this handle cannot reach the window, and
    // the pop-up closes itself on return anyway.
    try {
      if (!popup.closed) popup.close()
    } catch {
      // Unreachable handle; nothing to clean up from here.
    }
  }
}

/** Revoke the token at Lichess, then forget it here. */
export async function signOut(token: string): Promise<void> {
  try {
    await fetch(TOKEN_URL, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  } catch {
    // Losing the network does not stop us dropping our copy of the token.
  }
  clearSession()
}
