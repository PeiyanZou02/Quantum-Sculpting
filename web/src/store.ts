// App state: one zustand store mirroring the README "State" section of the design handoff.
// The service holds the real data in memory; this keeps what the page needs to draw it.
import { create } from 'zustand'
import {
  api, ApiError,
  type AtlasJobRow, type Field, type Fill, type GridInfo, type JobView, type KeyStatus, type MeshData,
  type MeshParams, type MeshReport, type Mode, type ModelInfo, type ProcMeta, type Tiling, type UpAxis,
  type Values, type VFilter,
} from './api'
import type { Axis, Grid } from './qs/grid'
import type { Camera } from './qs/QCam'

export type Step = -1 | 0 | 1 | 2 | 3
export type View = 'model' | 'voxels' | 'processed' | 'result'
export type MeshTab = 'threshold' | 'push' | 'export'

export const HOME_CAM: Camera = { az: 35, el: 22, dist: 2.4 }

interface Busy { [k: string]: boolean }

export interface LogLine { t: number; text: string; level?: 'info' | 'warn' | 'error' }

interface S {
  step: Step
  meshTab: MeshTab
  view: View
  camera: Camera
  slice: { axis: Axis; index: number }
  busy: Busy
  error: string | null
  log: LogLine[]

  key: KeyStatus | null
  keyOpen: boolean
  recent: { name: string; mb: number }[]

  model: ModelInfo | null
  modelMesh: MeshData | null
  up: UpAxis

  vox: { n: number; fill: Fill; values: Values; pad: number }
  grid: GridInfo | null
  gridData: Grid | null

  q: { mode: Mode; sigma: number; strength: number; reach: number; style: string; axes: number[]; shots: number | null; run: string; tiling: Tiling }
  proc: ProcMeta | null
  procData: Grid | null
  job: JobView | null
  atlasJobs: AtlasJobRow[]

  m: MeshParams
  report: MeshReport | null
  resultMesh: MeshData | null
  exported: { file: string; folder: string; report: MeshReport } | null

  // actions
  init: () => Promise<void>
  set: (p: Partial<S>) => void
  goStep: (s: Step) => void
  setView: (v: View) => void
  setCamera: (c: Camera) => void
  setSlice: (p: Partial<S['slice']>) => void
  pushLog: (text: string, level?: LogLine['level']) => void

  refreshRecent: () => Promise<void>
  useTestCup: () => Promise<void>
  openRecent: (name: string) => Promise<void>
  upload: (f: File) => Promise<void>
  setUp: (up: UpAxis) => Promise<void>

  setVox: (p: Partial<S['vox']>) => void
  voxelize: () => Promise<void>

  setQ: (p: Partial<S['q']>) => void
  process: (opts?: { submit?: boolean }) => Promise<void>
  cancelWatch: () => void
  refreshAtlasJobs: () => Promise<void>

  setM: (p: Partial<MeshParams>) => void
  buildMesh: () => Promise<void>
  exportStl: () => Promise<void>

  saveKey: (k: string) => Promise<void>
  testKey: () => Promise<boolean>
  clearKey: () => Promise<void>
}

const timers: Record<string, ReturnType<typeof setTimeout>> = {}
const debounce = (key: string, ms: number, fn: () => void) => {
  clearTimeout(timers[key])
  timers[key] = setTimeout(fn, ms)
}
// Drop responses that arrive after a newer request of the same kind
const seq: Record<string, number> = {}
const ticket = (k: string) => (seq[k] = (seq[k] ?? 0) + 1)
const current = (k: string, t: number) => seq[k] === t

let watching: ReturnType<typeof setTimeout> | null = null

export const useStore = create<S>()((set, get) => {
  const busy = (k: string, v: boolean) => set((s) => ({ busy: { ...s.busy, [k]: v } }))
  const fail = (e: unknown) => {
    const msg = e instanceof ApiError || e instanceof Error ? e.message : String(e)
    set({ error: msg })
    get().pushLog(msg, 'error')
  }
  async function run<T>(k: string, fn: () => Promise<T>): Promise<T | undefined> {
    busy(k, true)
    set({ error: null })
    try {
      return await fn()
    } catch (e) {
      fail(e)
    } finally {
      busy(k, false)
    }
  }

  async function adoptModel(info: ModelInfo) {
    set({ model: info, up: info.up, grid: null, gridData: null, proc: null, procData: null, report: null, resultMesh: null, exported: null })
    const { mesh } = await api.modelMesh()
    set({ modelMesh: mesh })
    if (get().step < 0) set({ step: 0, view: 'model' })
    get().pushLog(`Model ${info.file} · ${info.faces.toLocaleString()} faces`)
  }

  async function adoptProcessed() {
    const { grid, meta } = await api.grid('processed')
    set({ procData: grid, proc: meta.proc ?? get().proc })
  }

  function watchJob(id: string) {
    get().cancelWatch()
    let version = -1
    const tick = async () => {
      try {
        const job = await api.job(id)
        set({ job })
        if (job.version !== version && job.status === 'running') {
          version = job.version
          try {
            const { grid } = await api.jobPreview(id)
            set({ procData: grid })
          } catch { /* preview not ready */ }
        }
        if (job.status === 'done') {
          if (job.meta) {
            set({ proc: job.meta })
            await adoptProcessed()
            get().pushLog(`Atlas run ${job.run} done · ${job.tiles_total} tiles · ${job.elapsed}s`)
            if (get().step === 3) get().buildMesh()
          }
          if (job.stale) get().pushLog('Grid changed during the run; result cached but not applied', 'warn')
          watching = null
          get().refreshAtlasJobs()
          return
        }
        if (job.status === 'failed') {
          get().pushLog(job.error ?? 'Atlas run failed', 'error')
          set({ error: job.error })
          watching = null
          return
        }
        if (job.note) get().pushLog(job.note, 'warn')
      } catch (e) {
        fail(e)
      }
      watching = setTimeout(tick, 2000)
    }
    tick()
  }

  return {
    step: -1,
    meshTab: 'threshold',
    view: 'model',
    camera: HOME_CAM,
    slice: { axis: 'z', index: 16 },
    busy: {},
    error: null,
    log: [],

    key: null,
    keyOpen: false,
    recent: [],

    model: null,
    modelMesh: null,
    up: '+z',

    vox: { n: 32, fill: 'holes', values: 'coverage', pad: 2 },
    grid: null,
    gridData: null,

    q: { mode: 'emulator', sigma: 1, strength: 0.3, reach: 0, style: 'x', axes: [0, 1, 2], shots: null, run: 'run1', tiling: 'cube' },
    proc: null,
    procData: null,
    job: null,
    atlasJobs: [],

    m: {
      method: 'threshold', level: 0.5, keep: 'largest', smooth: 0, height: 90, refine: 1, amount: 2,
      field: 'threshold' as Field, vfilter: 'none' as VFilter, vwidth: 1, grow: 0, close: 0,
    },
    report: null,
    resultMesh: null,
    exported: null,

    set: (p) => set(p),
    pushLog: (text, level = 'info') => set((s) => ({ log: [...s.log.slice(-199), { t: Date.now(), text, level }] })),

    init: async () => {
      await run('init', async () => {
        const st = await api.state()
        set({ key: st.key })
        get().refreshRecent()
        if (st.model) {
          await adoptModel(st.model)
          if (st.grid) {
            set({ grid: st.grid, vox: { n: st.grid.n, fill: st.grid.fill, values: st.grid.values, pad: st.grid.pad } })
            const { grid } = await api.grid('input')
            set({ gridData: grid, step: 1, view: 'voxels', slice: { axis: 'z', index: Math.floor(grid.n / 2) } })
          }
          if (st.processed) {
            set({ proc: st.processed })
            await adoptProcessed()
            set({ step: 2, view: 'processed' })
          }
        }
        if (st.job) watchJob(st.job.job_id)
      })
    },

    goStep: (s) => {
      const st = get()
      if (s >= 1 && !st.model) return
      if (s >= 2 && !st.grid) return
      if (s >= 3 && !st.proc) return
      set({ step: s, view: (['model', 'model', 'voxels', 'processed', 'result'] as View[])[s + 1] })
      if (s === 3 && !st.resultMesh) get().buildMesh()
    },
    setView: (v) => set({ view: v }),
    setCamera: (c) => set({ camera: c }),
    setSlice: (p) => set((s) => ({ slice: { ...s.slice, ...p } })),

    refreshRecent: async () => {
      try {
        set({ recent: await api.models() })
      } catch { /* list is optional */ }
    },
    useTestCup: () => run('model', async () => adoptModel(await api.testCup())),
    openRecent: (name) => run('model', async () => adoptModel(await api.openModel(name, get().up))),
    upload: (f) => run('model', async () => {
      await adoptModel(await api.upload(f, get().up))
      get().refreshRecent()
    }),
    setUp: (up) => run('model', async () => {
      set({ up })
      if (get().model) await adoptModel(await api.orient(up))
    }),

    setVox: (p) => {
      set((s) => ({ vox: { ...s.vox, ...p } }))
      if (get().grid) debounce('vox', 250, () => get().voxelize())
    },
    voxelize: () => run('vox', async () => {
      const t = ticket('vox')
      const info = await api.voxelize(get().vox)
      const { grid } = await api.grid('input')
      if (!current('vox', t)) return
      const st = get()
      set({
        grid: info, gridData: grid, proc: null, procData: null, report: null, resultMesh: null,
        slice: { axis: st.slice.axis, index: Math.min(st.slice.index, grid.n - 1) || Math.floor(grid.n / 2) },
      })
      if (st.step < 1) set({ step: 1, view: 'voxels' })
      get().pushLog(`Voxelised ${info.n}³ · ${info.solid.toLocaleString()} solid cells`)
    }),

    setQ: (p) => {
      set((s) => ({ q: { ...s.q, ...p } }))
      const { q, proc } = get()
      // Local modes update live as the dials turn; Atlas waits for an explicit submit
      if (q.mode !== 'atlas' && (proc || get().step >= 2)) debounce('proc', 120, () => get().process())
    },
    process: (opts) => run('proc', async () => {
      const { q, grid } = get()
      if (!grid) return
      const mode = opts?.submit ? 'atlas' : q.mode
      if (mode === 'atlas' && !opts?.submit) return
      const t = ticket('proc')
      const res = await api.process({ ...q, mode, shots: q.shots || null })
      if (!current('proc', t)) return
      if ('job_id' in res && res.status === 'running') {
        set({ job: res })
        get().pushLog(`Submitted ${res.run} to Atlas · ${res.tiles_total} tiles`)
        watchJob(res.job_id)
        return
      }
      if (res.status === 'done' && 'meta' in res && res.meta) {
        set({ proc: res.meta })
        await adoptProcessed()
        if (!current('proc', t)) return
        if (get().step < 2) set({ step: 2, view: 'processed' })
        if (res.meta.cached) get().pushLog(`Atlas result for ${res.meta.run} read from cache`)
        if (get().resultMesh) debounce('mesh', 150, () => get().buildMesh())
      }
    }),
    cancelWatch: () => {
      if (watching) clearTimeout(watching)
      watching = null
    },
    refreshAtlasJobs: async () => {
      if (!get().key?.set) return
      try {
        set({ atlasJobs: (await api.atlasJobs(30)).jobs })
      } catch { /* the panel is optional */ }
    },

    setM: (p) => {
      set((s) => ({ m: { ...s.m, ...p } }))
      debounce('mesh', 200, () => get().buildMesh())
    },
    buildMesh: () => run('mesh', async () => {
      if (!get().proc) return
      const t = ticket('mesh')
      const { report, mesh } = await api.mesh(get().m)
      if (!current('mesh', t)) return
      set({ report, resultMesh: mesh })
    }),
    exportStl: () => run('export', async () => {
      const res = await api.export(get().m)
      set({ exported: res })
      get().pushLog(`Exported ${res.folder}/${res.file}`)
    }),

    saveKey: (k) => run('key', async () => {
      set({ key: await api.setKey(k) })
      get().pushLog('API key saved')
    }),
    testKey: async () => {
      const ok = await run('keytest', async () => (await api.testKey()).ok)
      return !!ok
    },
    clearKey: () => run('key', async () => set({ key: await api.clearKey() })),
  }
})
