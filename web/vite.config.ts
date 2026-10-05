import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// One process for development: `pnpm dev` also starts the Flask service (app/server.py) and stops it
// on exit. Set QS_API to use a service that is already running instead.
const PORT = Number(process.env.QS_API_PORT ?? 8770)
const API = process.env.QS_API ?? `http://localhost:${PORT}`
const ROOT = resolve(__dirname, '..')

function flask(): Plugin {
  let child: ChildProcess | null = null
  return {
    name: 'quantum-sculpting-service',
    apply: 'serve',
    configureServer(server) {
      if (process.env.QS_API) return
      const py = [resolve(ROOT, '.venv/bin/python'), resolve(ROOT, '.venv/Scripts/python.exe')].find(existsSync) ?? 'python3'
      child = spawn(py, [resolve(ROOT, 'app/server.py'), '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] })
      child.on('exit', (code) => code && server.config.logger.error(`[service] exited with ${code}`))
      const stop = () => { child?.kill(); child = null }
      server.httpServer?.on('close', stop)
      process.on('exit', stop)
      process.on('SIGINT', () => { stop(); process.exit() })
      process.on('SIGTERM', () => { stop(); process.exit() })
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), flask()],
  // the service serves the build from app/static/studio/ at / (assets under /studio/)
  base: command === 'build' ? '/studio/' : '/',
  build: { outDir: '../app/static/studio', emptyOutDir: true },
  server: {
    proxy: {
      // the service rejects cross-origin requests, so the proxy rewrites Origin to its own host
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
}))
