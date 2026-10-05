import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Flask service (app/server.py) rejects cross-origin requests, so the dev proxy
// rewrites Origin to the API's own host.
const API = process.env.QS_API ?? 'http://localhost:8770'

export default defineConfig({
  plugins: [react()],
  base: '/studio/',
  build: { outDir: '../app/static/studio', emptyOutDir: true },
  server: {
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            if (req.getHeader('origin')) req.setHeader('origin', API)
          })
        },
      },
    },
  },
})
