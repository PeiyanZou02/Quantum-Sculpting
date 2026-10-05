// Typed client for Peiyan's Flask service (app/server.py). Every route is documented there.
import type { Grid } from './qs/grid'
import { en } from './i18n'

export type UpAxis = '+z' | '-z' | '+y' | '-y' | '+x' | '-x'
export type Fill = 'holes' | 'capped' | 'none'
export type Values = 'coverage' | 'binary'
/** 'nations' is Evolve (app/nations.py): regions of the model as nations, one qubit each. */
export type Mode = 'gaussian' | 'emulator' | 'atlas' | 'nations'
export type Tiling = 'cube' | 'layers'
export type Field = 'threshold' | 'difference' | 'gradient'
export type VFilter = 'none' | 'gaussian' | 'mean' | 'median' | 'curvature'

export interface ModelInfo {
  name: string
  file: string
  builtin: boolean
  up: UpAxis
  model_id: number
  faces: number
  vertices: number
  extents: [number, number, number]
  watertight: boolean
  lying: 'X' | 'Y' | null
}

export interface TileSummary { jobs: number; shape: [number, number, number]; total: number }

export interface GridInfo {
  grid_id: number
  n: number
  solid: number
  total: number
  transform: number[][]
  voxel_size: number
  tiles: Record<Tiling, TileSummary>
  pad: number
  fill: Fill
  values: Values
}

export interface ProcMeta {
  mode: Mode
  run: string
  params: Record<string, unknown>
  cached: boolean
  job_id: string | null
  tiles: { mode: Tiling; shape?: number[]; jobs: number; cached?: number; total?: number } | null
  seconds?: number
  proc_id: number
  grid_id: number
  min: number
  max: number
  /** Evolve only: what happened over the whole history. */
  nations?: NationsSummary
}

export interface KeyStatus { set: boolean; source: 'saved' | 'env' | null; hint: string; base: string; official: boolean }

export interface JobView {
  job_id: string
  status: 'running' | 'done' | 'failed'
  atlas_status: string
  run: string
  params: Record<string, unknown>
  tiling: Tiling
  elapsed: number
  error: string | null
  meta: ProcMeta | null
  stale: boolean
  note: string | null
  tiles_total: number
  tiles_done: number
  tiles_cached: number
  tile_shape: number[]
  version: number
  /** Layer-tiled runs: height up to which every slab has come back. */
  frontier: number | null
}

export interface MeshReport {
  extents: [number, number, number]
  watertight: boolean
  faces: number
  parts: number
  voxel_mm: number
  volume_cm3?: number
  total_parts: number
  level: number
  keep: 'largest' | 'all'
  smooth: number
  height: number
  method: 'threshold' | 'advect'
  refine: number
  amount: number
  field: Field
  vfilter: VFilter
  vwidth: number
  grow: number
  close: number
  proc_id: number
  fine_voxel_mm: number
}

export interface MeshData { vertices: Float32Array; faces: Uint32Array }

export interface AtlasJobRow {
  job_id: string
  engine: string
  status: string
  created_at: string
  updated_at: string
  mine: boolean | null
  progress: string | null
  local: { run: string; tile: number[]; shape: number[]; params: Record<string, unknown>; seconds: number } | null
}

export class ApiError extends Error {
  status: number
  /** Nothing to tell the user: cancelled by a newer request from this page, or superseded on the service. */
  quiet: boolean
  constructor(status: number, message: string, quiet = false) {
    super(message)
    this.status = status
    this.quiet = quiet
  }
}

/** One id per tab: the service stops a computation when the same page sends a newer request for that stage. */
const CLIENT = (() => {
  const fresh = Math.random().toString(36).slice(2, 12)
  try {
    const kept = sessionStorage.getItem('quantum-sculptor-client') ?? fresh
    sessionStorage.setItem('quantum-sculptor-client', kept)
    return kept
  } catch {
    return fresh
  }
})()

export interface NetEvent { method: string; path: string; status: number; ms: number; quiet?: boolean }
const netListeners = new Set<(e: NetEvent) => void>()
/** Every request, for the runtime terminal. */
export const onNet = (fn: (e: NetEvent) => void) => {
  netListeners.add(fn)
  return () => { netListeners.delete(fn) }
}

let boot: string | null = null
const bootListeners = new Set<() => void>()
/** Called when the service restarts (its in-memory model and grids are gone). */
export const onRestart = (fn: () => void) => {
  bootListeners.add(fn)
  return () => { bootListeners.delete(fn) }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const t0 = performance.now()
  const method = init?.method ?? 'GET'
  let res: Response
  try {
    res = await fetch(path, { ...init, headers: { ...(init?.headers as Record<string, string>), 'X-Client': CLIENT } })
  } catch (e) {
    const cancelled = e instanceof DOMException && e.name === 'AbortError'
    netListeners.forEach((fn) => fn({ method, path, status: 0, ms: performance.now() - t0, quiet: cancelled }))
    throw new ApiError(0, cancelled ? 'Cancelled.' : 'Cannot reach the local service. Check that it is running, then reload.', cancelled)
  }
  netListeners.forEach((fn) => fn({ method, path, status: res.status, ms: performance.now() - t0 }))
  const b = res.headers.get('X-Boot')
  if (b) {
    if (boot && b !== boot) bootListeners.forEach((fn) => fn())
    boot = b
  }
  if (!res.ok) {
    let msg = res.statusText, superseded = false
    try {
      const data = await res.json()
      msg = data.error ?? msg
      superseded = !!data.superseded
    } catch { /* not JSON */ }
    throw new ApiError(res.status, superseded ? 'Superseded by a newer request.' : en(msg), superseded)
  }
  return res
}

const post = (data?: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data ?? {}),
  signal,
})
const getJSON = async <T>(path: string, signal?: AbortSignal) => (await request(path, signal ? { signal } : undefined)).json() as Promise<T>
const postJSON = async <T>(path: string, data?: unknown, signal?: AbortSignal) => (await request(path, post(data, signal))).json() as Promise<T>

async function binary<M>(path: string, init?: RequestInit) {
  const res = await request(path, init)
  return { meta: JSON.parse(res.headers.get('X-Meta') || '{}') as M, buffer: await res.arrayBuffer() }
}

function decodeMesh(buffer: ArrayBuffer): MeshData {
  const head = new DataView(buffer)
  const nv = head.getUint32(0, true), nf = head.getUint32(4, true)
  return {
    vertices: new Float32Array(buffer, 8, nv * 3),
    faces: new Uint32Array(buffer, 8 + nv * 12, nf * 3),
  }
}

/** The service sends only the occupied box, one byte per cell; expand back to n³. */
async function compactGrid<M extends { n: number; box: [number, number][] }>(path: string, signal?: AbortSignal) {
  const { meta, buffer } = await binary<M>(`${path}?compact=1`, { signal })
  const n = meta.n, n2 = n * n
  const data = new Float32Array(n * n2)
  const bytes = new Uint8Array(buffer)
  const [[x0, x1], [y0, y1], [z0, z1]] = meta.box
  let i = 0
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++) {
      const row = x * n2 + y * n
      for (let z = z0; z < z1; z++) data[row + z] = bytes[i++] / 255
    }
  return { grid: { n, data } as Grid, meta }
}

export interface VoxelizeParams { n: number; pad: number; fill: Fill; values: Values }
export interface ProcessParams {
  mode: Mode
  run: string
  tiling: Tiling
  sigma?: number
  strength: number
  style: string
  reach: number
  axes: number[]
  shots: number | null
  cached_only?: boolean
  /** Evolve: nations at the start (2–16), turns (1–300), growth reach in % of the grid edge (0–10), grooves on the final borders. */
  k?: number
  turns?: number
  spread?: number
  grooves?: boolean
}
export interface MeshParams {
  method: 'threshold' | 'advect'
  level: number
  keep: 'largest' | 'all'
  smooth: number
  height: number
  refine: number
  amount: number
  field: Field
  vfilter: VFilter
  vwidth: number
  grow: number
  close: number
}

export const api = {
  state: () =>
    getJSON<{ model: ModelInfo | null; grid: GridInfo | null; processed: ProcMeta | null; key: KeyStatus; job: JobView | null }>('/api/state'),

  key: () => getJSON<KeyStatus>('/api/key'),
  setKey: (key: string) => postJSON<KeyStatus>('/api/key', { key }),
  clearKey: async () => (await request('/api/key', { method: 'DELETE' })).json() as Promise<KeyStatus>,
  testKey: () => postJSON<{ ok: true }>('/api/key/test'),

  models: () => getJSON<{ name: string; mb: number }[]>('/api/models'),
  testCup: () => postJSON<ModelInfo>('/api/model/test-cup'),
  openModel: (name: string, up: UpAxis) => postJSON<ModelInfo>('/api/model/open', { name, up }),
  orient: (up: UpAxis) => postJSON<ModelInfo>('/api/model/orient', { up }),
  upload: async (file: File, up: UpAxis) => {
    const form = new FormData()
    form.append('file', file)
    form.append('up', up)
    return (await request('/api/model/upload', { method: 'POST', body: form })).json() as Promise<ModelInfo>
  },
  modelMesh: async () => {
    const { meta, buffer } = await binary<{ model_id: number }>('/api/model/mesh')
    return { meta, mesh: decodeMesh(buffer) }
  },

  voxelize: (p: VoxelizeParams, signal?: AbortSignal) => postJSON<GridInfo>('/api/voxelize', p, signal),
  grid: (which: 'input' | 'processed', signal?: AbortSignal) =>
    compactGrid<{ n: number; box: [number, number][]; grid_id: number; proc?: ProcMeta }>(`/api/grid/${which}`, signal),

  process: (p: ProcessParams, signal?: AbortSignal) =>
    postJSON<{ status: 'done'; meta: ProcMeta } | { status: 'missing' } | JobView>('/api/process', p, signal),
  job: async (id: string) => {
    const j = await getJSON<JobView>(`/api/process/${id}`)
    return { ...j, error: j.error && en(j.error), note: j.note && en(j.note) }
  },
  jobPreview: (id: string) => compactGrid<{ n: number; box: [number, number][]; version: number; frontier: number | null }>(`/api/process/${id}/preview`),

  atlasJobs: (limit = 50, cursor?: string) =>
    getJSON<{ jobs: AtlasJobRow[]; next_cursor: string | null }>(
      `/api/atlas/jobs?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),

  mesh: async (p: MeshParams, signal?: AbortSignal) => {
    const { meta, buffer } = await binary<MeshReport>('/api/mesh', post(p, signal))
    return { report: meta, mesh: decodeMesh(buffer) }
  },
  export: (p: MeshParams) => postJSON<{ file: string; folder: string; report: MeshReport }>('/api/export', p),
  downloadUrl: (file: string) => `/api/download/${encodeURIComponent(file)}`,

  /** Evolve: the territory at the end of `turn` (0 = founding), expanded to n³ bytes of owner + 1 (0 = empty). */
  nationsFrame: async (turn: number, signal?: AbortSignal) => {
    const { meta, buffer } = await binary<NationsFrameMeta>(`/api/nations/frame/${turn}`, { signal })
    return { meta, owner: expandOwners(meta, new Uint8Array(buffer)) }
  },
  /** Evolve: the whole history, one record per turn (record 0 is the founding). */
  nationsHistory: (signal?: AbortSignal) => getJSON<NationsHistory>('/api/nations/history', signal),
}

// ── Evolve (app/nations.py, /api/nations/*) ──────────────────────────────────────────────────────

export type NationAsk = 'attack' | 'defend' | 'explore'
/** What a nation did: yes → attack / fortify / grow, no → flee / split / wither; waver = could not split. */
export type NationAction = 'attack' | 'fortify' | 'grow' | 'flee' | 'split' | 'wither' | 'waver'
export type DeathCause = 'conquered' | 'withered' | 'war' | 'fled' | 'gone'

/** Events in a turn. Numbers are nation ids (0-based). */
export type NationEvent =
  | { type: 'war'; who: number; whom: number }                  // attacked each other: both fronts gone, a crack
  | { type: 'breach'; who: number[]; whom: number }             // two or more broke a defending nation
  | { type: 'annex'; who: number; whom: number }                // whom had too little left and was taken whole
  | { type: 'split'; who: number; whom: number }                // whom (new) broke away from who
  | { type: 'death'; who: number; cause: DeathCause; by: number[] | null }
  | { type: 'exile'; who: number }                              // fled out of contact: left the continent
  | { type: 'ally'; who: number; whom: number }                 // tie rose to 0.5 or more
  | { type: 'rift'; who: number; whom: number }                 // tie fell below 0.5

/** One turn. Per-nation arrays are indexed by nation id and are as long as the nations that exist by
 *  then (it grows when nations split); null where the nation was not alive this turn. */
export interface NationTurn {
  turn: number
  /** Voxels held at the end of the turn (0 = gone). */
  size: number[]
  /** Not on the founding record (turn 0). */
  asked?: (NationAsk | null)[]
  /** Chance of answering yes before the measurement. */
  odds?: (number | null)[]
  said?: (boolean | null)[]
  action: (NationAction | null)[]
  /** Length of the nation's own Bloch vector: below 1 it is entangled with others. */
  certainty?: (number | null)[]
  /** [attacker, target] this turn. */
  attacks: [number, number][]
  /** [i, j, strength 0..1] between living nations; 0.5 and above is an alliance. */
  ties: [number, number, number][]
  /** [i, j] pairs that share a border at the end of the turn. */
  borders: [number, number][]
  /** Centre of each nation in box coordinates, null once gone. */
  home: ([number, number, number] | null)[]
  /** Nations that have left the continent (so far). */
  exiled: number[]
  events: NationEvent[]
  wars?: [number, number][]
  broken?: number[]
}

export interface NationsHistory {
  proc_id: number
  /** Nations at the founding. */
  k: number
  /** Nations over the whole history. */
  total: number
  /** Which nation each one broke away from; null for the founders. */
  parent: (number | null)[]
  /** Shape of the world box the frames cover. */
  shape: [number, number, number]
  turns: NationTurn[]
}

export interface NationsFrameMeta { n: number; k: number; box: [number, number][]; turn: number; turns: number; proc_id: number }

export interface NationsSummary {
  k: number
  turns: number
  total: number
  alive: number
  wars: number
  annexed: number
  died: number
  split: number
  exiled: number
  grown: number
  carved: number
  start: number
  end: number
}

/** Frames cover only the world box; expand back to n³. */
function expandOwners(meta: NationsFrameMeta, bytes: Uint8Array) {
  const n = meta.n, n2 = n * n
  const owner = new Uint8Array(n * n2)
  const [[x0, x1], [y0, y1], [z0, z1]] = meta.box
  const sz = z1 - z0
  let i = 0
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++, i += sz) owner.set(bytes.subarray(i, i + sz), x * n2 + y * n + z0)
  return owner
}
