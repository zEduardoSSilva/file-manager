import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    hmr: {
      // This is necessary for HMR to work in a containerized/proxied environment
      // like Google Cloud Workstations. It tells the HMR client to connect to the
      // standard HTTPS port, which the proxy will then route correctly.
      clientPort: 443,
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  
  optimizeDeps: {
    include: ['xlsx', '@tanstack/react-virtual'],
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
  },
  logLevel: 'info',
})