import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
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
