import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    // Edge-function tests are Deno (https: imports, Deno.test) and only
    // run under `deno test` — exclude them from the Node/vitest run.
    exclude: ['**/node_modules/**', '**/dist/**', 'supabase/functions/**'],
  },
})
