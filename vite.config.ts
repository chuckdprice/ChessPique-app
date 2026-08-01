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
// ignored. The build number is the commit count, so it moves on its own with
// every commit and tells you which push a running app was built from.
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }
const [major = '0', minor = '0'] = version.split('.')
const build = git('rev-list', '--count', 'HEAD') ?? '0'
const appVersion = `${major}.${minor}.${build}`

// The commit is the unambiguous answer to "is my latest push live?" — the count
// can repeat across branches, and a shallow CI clone undercounts. Vercel hands
// the SHA over in the environment; locally, ask git.
const commit =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? git('rev-parse', '--short', 'HEAD') ?? 'dev'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(commit),
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
