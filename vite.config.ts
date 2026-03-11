
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      external: [
        'crypto',
        'events',
        'fs',
        'fs/promises',
        'http',
        'https',
        'net',
        'os',
        'path',
        'stream',
        'url',
        'util',
        'zlib',
        'node:async_hooks',
        'node:buffer',
        'node:crypto',
        'node:events',
        'node:fs',
        'node:http',
        'node:https',
        'node:net',
        'node:os',
        'node:path',
        'node:perf_hooks',
        'node:stream',
        'node:url',
        'node:util',
        'node:zlib',
      ]
    }
  }
})
