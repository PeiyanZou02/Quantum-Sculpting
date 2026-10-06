// The website has no service behind it. Instead it plays back runs recorded from the real one: run the app
// locally with ?record in the address, go through a run (Atlas included), and every answer the service
// gives is saved under web/demo/ (see the recorder in vite.config.ts). `pnpm build:site` ships those files,
// and api.ts answers from them. A request that was never recorded says so instead of failing.
//
// A request is known by its method, path and body, plus the stage it acts on: the model, grid or result
// the service held at that moment. Those come from the service's own ids (model_id, grid_id, proc_id, with
// the X-Boot of that service run), read from the answers as they pass, so a playback walks the same way.

export const DEMO = import.meta.env.VITE_QS_DEMO === '1'
export const RECORD = import.meta.env.DEV && new URLSearchParams(location.search).has('record')

export const DEMO_MISSING = 'This step is not in the recorded demo. To run it yourself, clone the repo and start the app locally (see the README).'

type Stage = 'none' | 'model' | 'grid' | 'proc'
const at: Record<Exclude<Stage, 'none'>, string> = { model: '', grid: '', proc: '' }

function stageOf(method: string, path: string): Stage {
  if (path === '/api/model/mesh' || path === '/api/voxelize') return 'model'
  if (path.startsWith('/api/grid/input') || (method === 'POST' && path === '/api/process')) return 'grid'
  if (path.startsWith('/api/grid/processed') || path === '/api/mesh' || path === '/api/export' || path.startsWith('/api/nations/')) return 'proc'
  return 'none'
}

function bodyOf(init?: RequestInit): string {
  const b = init?.body
  if (b == null) return ''
  if (typeof b === 'string') return b
  if (b instanceof FormData) {
    const f = b.get('file')
    return `${f instanceof File ? `${f.name}:${f.size}` : ''}:${b.get('up') ?? ''}`
  }
  return ''
}

/** FNV-1a, 64 bit, as hex: short file names that are the same in the browser that records and the one that plays. */
function hash(s: string): string {
  let h = 0xcbf29ce484222325n
  const bytes = new TextEncoder().encode(s)
  for (const b of bytes) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n)
  return h.toString(16).padStart(16, '0')
}

export function keyOf(path: string, init?: RequestInit): string {
  const method = init?.method ?? 'GET'
  const stage = stageOf(method, path)
  return hash(`${method} ${path} ${bodyOf(init)} @${stage === 'none' ? '' : at[stage]}`)
}

/** Follow the ids in an answer, so the next request is known by the stage it acts on. */
export async function follow(path: string, method: string, res: Response) {
  if (!(res.headers.get('Content-Type') ?? '').includes('json')) return
  const boot = res.headers.get('X-Boot') ?? ''
  let d: Record<string, unknown>
  try { d = await res.clone().json() } catch { return }
  const meta = d.meta as { proc_id?: number } | undefined
  if (method === 'POST' && path.startsWith('/api/model/') && typeof d.model_id === 'number') {
    at.model = `${boot}:${d.model_id}`
    at.grid = at.proc = ''
  } else if (path === '/api/voxelize' && typeof d.grid_id === 'number') {
    at.grid = `${boot}:${d.grid_id}`
    at.proc = ''
  } else if ((path === '/api/process' || path.startsWith('/api/process/')) && !path.endsWith('/preview')) {
    if (d.status === 'done' && meta?.proc_id != null) at.proc = `${boot}:${meta.proc_id}`
    else if (d.status === 'missing') at.proc = ''
  }
}

// ── recording (local app, ?record) ──────────────────────────────────────────────────────────────────

/** Requests never kept: they hold this computer's key, its model files or its Atlas account. */
const PRIVATE = /^\/api\/(state|key|models|atlas\/|default-composition|download\/|shader\/)/

export async function record(path: string, init: RequestInit | undefined, res: Response) {
  if (PRIVATE.test(path) || !res.ok) return
  const key = keyOf(path, init)
  const headers: Record<string, string> = {}
  for (const h of ['Content-Type', 'X-Meta', 'X-Boot']) {
    const v = res.headers.get(h)
    if (v) headers[h] = v
  }
  const body = await res.clone().arrayBuffer()
  await fetch(`/__demo/record?key=${key}&path=${encodeURIComponent(path)}&headers=${encodeURIComponent(JSON.stringify(headers))}`, { method: 'POST', body })
}

// ── playback (the website) ──────────────────────────────────────────────────────────────────────────

interface Entry { file: string; headers: Record<string, string> }
let index: Promise<Record<string, Entry[]>> | null = null
const seen = new Map<string, number>()
const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })
const NO_KEY = { set: false, source: null, hint: '', base: '', official: true }

/** The recorded answer to a request; one asked again (a job being watched) steps through its answers in order. */
export async function play(path: string, init?: RequestInit): Promise<Response> {
  if (path === '/api/state') return json({ model: null, grid: null, processed: null, key: NO_KEY, job: null })
  if (path === '/api/key' && (init?.method ?? 'GET') === 'GET') return json(NO_KEY)
  if (path === '/api/models') return json([])
  if (path.startsWith('/api/atlas/jobs')) return json({ jobs: [], next_cursor: null })
  index ??= fetch(`${import.meta.env.BASE_URL}demo/index.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  const key = keyOf(path, init)
  const list = (await index)[key]
  if (!list?.length) return json501()
  const i = Math.min(seen.get(key) ?? 0, list.length - 1)
  seen.set(key, i + 1)
  const e = list[i]
  const r = await fetch(`${import.meta.env.BASE_URL}demo/${e.file}`)
  if (!r.ok) return json501()
  return new Response(await r.arrayBuffer(), { status: 200, headers: e.headers })
}
const json501 = () => new Response(JSON.stringify({ error: DEMO_MISSING }), { status: 501, headers: { 'Content-Type': 'application/json' } })

// ── the STL on the website: made in the browser from the mesh on screen ──────────────────────────────

const files = new Map<string, string>()
export const demoFile = (name: string) => files.get(name)
export function keepFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  files.set(name, url)
  return url
}

/** A binary STL of a mesh: 80-byte header, the triangle count, then per triangle its normal and three corners. */
export function stlOf(mesh: { vertices: Float32Array; faces: Uint32Array }): Blob {
  const { vertices: v, faces: f } = mesh
  const n = f.length / 3
  const out = new DataView(new ArrayBuffer(84 + n * 50))
  out.setUint32(80, n, true)
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50
    const [a, b, c] = [f[t * 3] * 3, f[t * 3 + 1] * 3, f[t * 3 + 2] * 3]
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const len = Math.hypot(nx, ny, nz) || 1
    ;[nx / len, ny / len, nz / len].forEach((x, i) => out.setFloat32(o + i * 4, x, true))
    ;[a, b, c].forEach((p, k) => { for (let i = 0; i < 3; i++) out.setFloat32(o + 12 + k * 12 + i * 4, v[p + i], true) })
  }
  return new Blob([out.buffer], { type: 'model/stl' })
}
