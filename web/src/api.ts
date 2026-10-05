// Typed client for Peiyan's Flask service (app/server.py). Every route is documented there.
import type { Grid } from './qs/grid'

export type UpAxis = '+z' | '-z' | '+y' | '-y' | '+x' | '-x'
export type Fill = 'holes' | 'capped' | 'none'
export type Values = 'coverage' | 'binary'
export type Mode = 'gaussian' | 'emulator' | 'atlas'
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
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let boot: string | null = null
const bootListeners = new Set<() => void>()
/** Called when the service restarts (its in-memory model and grids are gone). */
export const onRestart = (fn: () => void) => {
  bootListeners.add(fn)
  return () => { bootListeners.delete(fn) }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init)
  const b = res.headers.get('X-Boot')
  if (b) {
    if (boot && b !== boot) bootListeners.forEach((fn) => fn())
    boot = b
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      msg = (await res.json()).error ?? msg
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg)
  }
  return res
}

const post = (data?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data ?? {}),
})
const getJSON = async <T>(path: string) => (await request(path)).json() as Promise<T>
const postJSON = async <T>(path: string, data?: unknown) => (await request(path, post(data))).json() as Promise<T>

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
async function compactGrid<M extends { n: number; box: [number, number][] }>(path: string) {
  const { meta, buffer } = await binary<M>(`${path}?compact=1`)
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

  voxelize: (p: VoxelizeParams) => postJSON<GridInfo>('/api/voxelize', p),
  grid: (which: 'input' | 'processed') =>
    compactGrid<{ n: number; box: [number, number][]; grid_id: number; proc?: ProcMeta }>(`/api/grid/${which}`),

  process: (p: ProcessParams) =>
    postJSON<{ status: 'done'; meta: ProcMeta } | { status: 'missing' } | JobView>('/api/process', p),
  job: (id: string) => getJSON<JobView>(`/api/process/${id}`),
  jobPreview: (id: string) => compactGrid<{ n: number; box: [number, number][]; version: number }>(`/api/process/${id}/preview`),

  atlasJobs: (limit = 50, cursor?: string) =>
    getJSON<{ jobs: AtlasJobRow[]; next_cursor: string | null }>(
      `/api/atlas/jobs?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),

  mesh: async (p: MeshParams) => {
    const { meta, buffer } = await binary<MeshReport>('/api/mesh', post(p))
    return { report: meta, mesh: decodeMesh(buffer) }
  },
  export: (p: MeshParams) => postJSON<{ file: string; folder: string; report: MeshReport }>('/api/export', p),
  downloadUrl: (file: string) => `/api/download/${encodeURIComponent(file)}`,
}
