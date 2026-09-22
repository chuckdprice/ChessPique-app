import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

/** Ask git something, or null when git or the history is unavailable. */
function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

// Major and minor are set by hand in package.json; the patch field there is
// ignored.
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }
const [major = '0', minor = '0'] = version.split('.')

/**
 * Build number: minutes elapsed at the commit this build came from.
 *
 * The commit count was the obvious choice and it was wrong in production.
 * Vercel clones shallowly — about a dozen commits — so `rev-list --count`
 * counted only what it had been given and the deployed app reported build 12
 * against a real count of 30, silently, which is the one thing a build number
 * must never do.
 *
 * A commit's own timestamp is always present, shallow clone or not. It rises
 * with every commit, never repeats, and is identical wherever it is computed.
 */
const BUILD_EPOCH = Date.UTC(2026, 0, 1) / 1000
const committedAt = Number(git('log', '-1', '--format=%ct', 'HEAD'))
const build = Number.isFinite(committedAt)
  ? String(Math.floor((committedAt - BUILD_EPOCH) / 60))
  : '0'
const appVersion = `${major}.${minor}.${build}`

/**
 * Cross-origin isolation, which is the whole of what this gives the page:
 * `SharedArrayBuffer`, and therefore the ability to run Stockfish on more than
 * one thread. Nothing uses it yet — that is deliberate, so this can be shipped
 * and reverted on its own.
 *
 * Production gets these from `vercel.json`. Dev and `vite preview` need them
 * here too, or every local check is made against a page that cannot do the
 * thing being checked — the same shape of mistake as the Maia model download,
 * which no local test could reach.
 */
const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: ISOLATION },
  preview: { headers: ISOLATION },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    rollupOptions: {
      output: {
        // recharts and its d3 packages are ~340 kB on their own — half the
        // build, and only the eval and clock charts touch them. Keeping them
        // in a chunk of their own means the analysis bundle stays small and
        // this one stays cached across releases, since it only changes when
        // the dependency does.
        //
        // React has to be claimed first. recharts pulls in React's CommonJS
        // build, and if that copy is left unassigned it gets swept into the
        // chart chunk — which the entry then has to import eagerly for its own
        // React, downloading all 400 kB on the upload page. Giving React a
        // chunk of its own leaves both sides sharing one copy.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'react'
          }
          if (
            /node_modules\/(recharts|victory-vendor|d3-[a-z-]+|decimal\.js-light|internmap)\//.test(
              id,
            )
          ) {
            return 'charts'
          }
        },
      },
    },
  },
})
