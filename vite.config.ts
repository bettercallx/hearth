import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'
import { deepspaceBuild } from 'deepspace/build'

const appDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react(), generouted(), cloudflare({ inspectorPort: false }), deepspaceBuild({ appDir })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  optimizeDeps: {
    // Routes load via import.meta.glob, which the dep scanner can't see; listing them avoids a re-optimize reload on first dev boot.
    entries: ['./index.html', './src/pages/**/*.tsx'],
  },
})
