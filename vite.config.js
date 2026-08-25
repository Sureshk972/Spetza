import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// Build stamp for the update prompt. There is no service worker here, so a
// freshly launched app always gets the newest bundle -- the problem is the
// session that never relaunches. A courier can keep the app open for days
// while edge functions change underneath them.
const versionJsonUrl = new URL('./public/version.json', import.meta.url)

const gitSha = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() }
  catch { return 'nogit' }
})()
const BUILD_ID = `${Date.now()}-${gitSha}`

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'spetza-write-version',
      buildStart() {
        fs.writeFileSync(fileURLToPath(versionJsonUrl), JSON.stringify({ buildId: BUILD_ID }))
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: { port: 3000, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    // Edge-function tests are Deno (https: imports, Deno.test) and only
    // run under `deno test` — exclude them from the Node/vitest run.
    exclude: ['**/node_modules/**', '**/dist/**', 'supabase/functions/**'],
  },
})
