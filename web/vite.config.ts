import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// One process for development: `pnpm dev` also starts the Flask service (app/server.py) and stops it
// on exit. Set QS_API to use a service that is already running instead.
const PORT = Number(process.env.QS_API_PORT ?? 8770)
const API = process.env.QS_API ?? `http://127.0.0.1:${PORT}`
const ROOT = resolve(import.meta.dirname, '..')

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

// The website's demo (src/demo.ts): with ?record in the address, the local app posts every answer of the
// service here and it is kept in web/demo/ (index.json + one file per answer); `pnpm build:site` copies
// that folder into the site. `rm -rf web/demo` starts a recording afresh.
const DEMO_DIR = resolve(import.meta.dirname, 'demo')
function demo(): Plugin {
  return {
    name: 'quantum-sculpting-demo',
    configureServer(server) {
      server.middlewares.use('/__demo/record', (req, res) => {
        const q = new URL(req.url ?? '', 'http://x').searchParams
        const key = q.get('key') ?? ''
        if (req.method !== 'POST' || !/^[0-9a-f]{16}$/.test(key)) { res.statusCode = 400; res.end(); return }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          mkdirSync(resolve(DEMO_DIR, 'files'), { recursive: true })
          const indexFile = resolve(DEMO_DIR, 'index.json')
          const index: Record<string, { file: string; path: string; headers: Record<string, string> }[]> =
            existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {}
          const list = (index[key] ??= [])
          const file = `files/${key}-${list.length}.bin`
          writeFileSync(resolve(DEMO_DIR, file), Buffer.concat(chunks))
          list.push({ file, path: q.get('path') ?? '', headers: JSON.parse(q.get('headers') ?? '{}') })
          writeFileSync(indexFile, JSON.stringify(index, null, 1))
          res.end()
        })
      })
    },
    writeBundle(opts) {
      if (process.env.QS_SITE && existsSync(DEMO_DIR) && opts.dir) cpSync(DEMO_DIR, resolve(opts.dir, 'demo'), { recursive: true })
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), flask(), demo()],
  // the website plays back recorded runs instead of asking a service (src/demo.ts)
  define: process.env.QS_SITE ? { 'import.meta.env.VITE_QS_DEMO': JSON.stringify('1') } : {},
  // the service serves the build from app/static/studio/ at / (assets under /studio/); a build for the
  // website (QS_SITE=1, `pnpm build:site`) stands alone at the root of its domain, in web/dist
  // (QS_BASE: the site under a path, e.g. /Quantum-Sculpting/ on GitHub Pages)
  base: command === 'build' && !process.env.QS_SITE ? '/studio/' : process.env.QS_BASE ?? '/',
  build: process.env.QS_SITE ? { outDir: 'dist', emptyOutDir: true } : { outDir: '../app/static/studio', emptyOutDir: true },
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
