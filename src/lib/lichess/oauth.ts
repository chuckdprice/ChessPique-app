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

/** Identifies this app on the Lichess authorization screen. */
const CLIENT_ID = 'https://chessnoter.vercel.app/'

/**
 * Everything the Studies API offers: reading private studies and creating or
 * changing them. Nothing else — no games, no messages, no preferences.
 */
export const SCOPES = 'study:read study:write'

const AUTHORIZE_URL = 'https://lichess.org/oauth'
const TOKEN_URL = 'https://lichess.org/api/token'
const STORAGE_KEY = 'chessnoter.lichess'
/** Marks the popup's message so a stray postMessage cannot be mistaken for it. */
const MESSAGE_TYPE = 'lichess-oauth'

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

/** Where Lichess sends the popup back to: this app, with no path of its own. */
function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export function loadSession(): LichessSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
 * Whether this document is the sign-in popup coming back from Lichess.
 *
 * Called before React mounts: the popup should hand its code to the opener and
 * close, not boot a second copy of the app.
 */
export function isOAuthPopup(): boolean {
  const params = new URLSearchParams(window.location.search)
  return window.opener != null && (params.has('code') || params.has('error'))
}

/** Pass the result back to the window that opened this one, then close. */
export function completeOAuthPopup(): void {
  const params = new URLSearchParams(window.location.search)
  window.opener?.postMessage(
    {
      type: MESSAGE_TYPE,
      code: params.get('code'),
      state: params.get('state'),
      error: params.get('error_description') ?? params.get('error'),
    },
    window.location.origin,
  )
  window.close()
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

/** Wait for the popup to report back, or for the user to give up on it. */
function awaitPopup(popup: Window, state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const finish = (fn: () => void) => {
      window.removeEventListener('message', onMessage)
      clearInterval(closedTimer)
      clearTimeout(deadline)
      fn()
    }

    const onMessage = (event: MessageEvent) => {
      // Only this app's own popup may speak here.
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; code?: string; state?: string; error?: string }
      if (data?.type !== MESSAGE_TYPE) return
      if (data.state !== state) {
        finish(() => reject(new LichessAuthError('Sign-in came back with the wrong state.')))
        return
      }
      if (data.error || !data.code) {
        finish(() => reject(new LichessAuthError(data.error || 'Lichess did not send a code.')))
        return
      }
      const code = data.code
      finish(() => resolve(code))
    }

    const closedTimer = setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new LichessAuthError('The Lichess sign-in window was closed.')))
      }
    }, 500)

    const deadline = setTimeout(
      () => finish(() => reject(new LichessAuthError('Signing in to Lichess timed out.'))),
      5 * 60 * 1000,
    )

    window.addEventListener('message', onMessage)
  })
}

/**
 * Run the whole sign-in and return the token.
 *
 * The popup is opened before anything is awaited — a browser only allows one
 * in direct response to a click, and hashing the verifier first would put an
 * await in between and get it blocked.
 */
export async function signIn(): Promise<{ token: string; expiresAt: number }> {
  const popup = window.open('about:blank', 'lichess-login', 'width=520,height=720')
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
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', redirectUri())
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('code_challenge', await codeChallenge(verifier))
    url.searchParams.set('state', state)
    popup.location.href = url.toString()

    const code = await awaitPopup(popup, state)

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri(),
        client_id: CLIENT_ID,
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
    if (!popup.closed) popup.close()
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
