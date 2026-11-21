/** Unit tests only. Separate from vite.config.ts because Vitest can't load the Cloudflare plugin; Playwright specs in tests/ run via `deepspace test run`. */

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { appIdDefine } from 'deepspace/build'

const appDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  define: appIdDefine({ appDir }),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
