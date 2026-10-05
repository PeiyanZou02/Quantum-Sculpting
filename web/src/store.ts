// App state: one zustand store mirroring the README "State" section of the design handoff.
// The service holds the real data in memory; this keeps what the page needs to draw it.
import { create } from 'zustand'
import {
  api, ApiError,
  type AtlasJobRow, type Field, type Fill, type GridInfo, type JobView, type KeyStatus, type MeshData,
  type MeshParams, type MeshReport, type Mode, type ModelInfo, type NationsHistory, type ProcMeta, type Tiling, type UpAxis,
  type Values, type VFilter,
} from './api'
import type { Axis, Grid } from './qs/grid'
import type { Camera } from './qs/QCam'

export type Step = -1 | 0 | 1 | 2 | 3
export type View = 'model' | 'voxels' | 'processed' | 'result' | 'scan'
export type MeshTab = 'threshold' | 'push' | 'export'

export const HOME_CAM: Camera = { az: 35, el: 22, dist: 2.4 }

interface Busy { [k: string]: boolean }

export interface LogLine { t: number; text: string; level?: 'info' | 'warn' | 'error' | 'net' }

/** Display overlays and HUD elements over the workspace, each switchable. */
export interface Hud {
  bounds: boolean      // dashed n³ grid box
  floor: boolean       // floor grid
  slice: boolean       // slice plane through the voxel views
  probe: boolean       // hover readout and pins
  axes: boolean        // axis gnomon
  dims: boolean        // size marks
  camera: boolean      // az / el readout
  frame: boolean       // view corners and centre cross
  legend: boolean      // value scale for shaded views
  caption: boolean     // what the view shows
  nav: boolean         // navigation buttons under the gizmo
  tools: boolean       // tool shelf
}
export const HUD_DEFAULT: Hud = { bounds: true, floor: true, slice: false, probe: true, axes: true, dims: false, camera: true, frame: true, legend: true, caption: true, nav: true, tools: true }

export type Tool = 'navigate' | 'probe' | 'annotate' | 'measure' | 'slice'
export type Shading = 'wire' | 'solid' | 'value' | 'entangle'
export type Layer = 'model' | 'voxels' | 'processed' | 'result'
export interface LayerState { visible: boolean; pickable: boolean }

/** Evolve (mode 'nations'): the turn on screen and its territory. The processed grid (procData) is
 *  always the last turn's shape and is what gets meshed; `owner` is the frame of `frameTurn`. */
export interface Evolve {
  /** Turn on screen (0 = founding). Moves at once; `owner` follows when its frame arrives. */
  turn: number
  /** Last turn of the history. */
  turns: number
  playing: boolean
  /** Full n³ frame: owner + 1 per cell (0 = empty), index (x·n + y)·n + z. */
  owner: Uint8Array | null
  /** Turn `owner` belongs to (lags `turn` while a frame loads). */
  frameTurn: number
  n: number
  history: NationsHistory | null
  /** Nations at the founding. */
  k: number
  /** The processing run this history belongs to. */
  procId: number | null
  loading: boolean
}
export const EVOLVE_EMPTY: Evolve = { turn: 0, turns: 0, playing: false, owner: null, frameTurn: -1, n: 0, history: null, k: 0, procId: null, loading: false }
/** The service evolves nations on grids up to this size (server.NATIONS_MAX_GRID). */
export const NATIONS_MAX_GRID = 128
/** Playback speed of the turns. */
export const TURNS_PER_SECOND = 6

interface S {
  step: Step
  meshTab: MeshTab
  view: View
  camera: Camera
  slice: { axis: Axis; index: number }
  showSlice: boolean
  hud: Hud
  tool: Tool
  setTool: (t: Tool) => void
  shading: Shading
  shade: { tables: string; thickness: number; mix: number; light: 'studio' | 'soft' | 'flat' | 'rim'; backdrop: 'plain' | 'dots' | 'lines' | 'gradient' | 'studio' }
  setShading: (s: Shading, opts?: Partial<S['shade']>) => void
  /** Ghost layers drawn with the main view, and which layers the probe reads. */
  layers: Record<Layer, LayerState>
  /** Processing runs this session, newest last (CAPTURES, Quantum panel). */
  runs: { id: number; label: string; mode: string; strength: number; reach: number; t: number }[]
  compose: Record<string, string>
  setCompose: (p: Record<string, string>) => void
  setLayer: (l: Layer, p: Partial<LayerState>) => void
  /** Chosen theme ('system' follows the OS) and the resolved one. */
  themePref: 'system' | 'light' | 'dark'
  theme: 'light' | 'dark'
  setTheme: (t: 'system' | 'light' | 'dark') => void
  setHud: (p: Partial<Hud>) => void
  scan: { z: number; playing: boolean }
  setScan: (p: Partial<S['scan']>) => void
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

  /** Quantum step. k / turns / spread / grooves are Evolve's (spread = growth reach, % of the grid edge). */
  q: { mode: Mode; sigma: number; strength: number; reach: number; style: string; axes: number[]; shots: number | null; run: string; tiling: Tiling; k: number; turns: number; spread: number; grooves: boolean }
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
  process: (opts?: { submit?: boolean; cachedOnly?: boolean }) => Promise<void>

  evolve: Evolve
  /** Show turn t (clamped); frames are fetched once and kept in memory. */
  setTurn: (t: number) => Promise<void>
  /** Play the turns at TURNS_PER_SECOND from here (from 0 when at the end). */
  play: () => void
  pause: () => void
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

// Evolve frames, kept in memory per history (LRU within a byte budget: 128³ frames are 2 MB each)
const FRAME_BUDGET = 192 * 2 ** 20
const frames = new Map<number, Uint8Array>()
const framesLoading = new Map<number, Promise<Uint8Array>>()
let framesFor: number | null = null
let frameBytes = 0
let evolveEpoch = 0
let player: ReturnType<typeof setInterval> | null = null
function keepFrame(turn: number, owner: Uint8Array) {
  if (frames.has(turn)) frameBytes -= frames.get(turn)!.byteLength
  frames.delete(turn)
  frames.set(turn, owner)
  frameBytes += owner.byteLength
  for (const [t, f] of frames) {
    if (frameBytes <= FRAME_BUDGET || frames.size <= 2) break
    frames.delete(t)
    frameBytes -= f.byteLength
  }
}
function dropFrames(procId: number | null) {
  frames.clear()
  framesLoading.clear()
  frameBytes = 0
  framesFor = procId
}
let initing = false
const resuming = () => { try { return sessionStorage.getItem('qs-resume') === '1' } catch { return false } }

// One request in flight per stage; a new request cancels its own stage and everything downstream.
const VOX = 0, PROC = 1, MESH = 2
const inflight: (AbortController | null)[] = [null, null, null]
function flight(stage: number) {
  for (let s = stage; s < inflight.length; s++) inflight[s]?.abort()
  const c = new AbortController()
  inflight[stage] = c
  return c.signal
}

export const useStore = create<S>()((set, get) => {
  const counts: Record<string, number> = {}
  const busy = (k: string, v: boolean) => {
    counts[k] = Math.max(0, (counts[k] ?? 0) + (v ? 1 : -1))
    set((s) => ({ busy: { ...s.busy, [k]: counts[k] > 0 } }))
  }
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.quiet) return       // cancelled or superseded by a newer request
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

  async function adoptModel(info: ModelInfo, chain = true) {
    try { sessionStorage.setItem('qs-resume', '1') } catch { /* private mode: always start fresh */ }
    clearEvolve()
    set({ model: info, up: info.up, grid: null, gridData: null, proc: null, procData: null, report: null, resultMesh: null, exported: null })
    const { mesh } = await api.modelMesh()
    set({ modelMesh: mesh })
    set({ step: 0, view: 'model' })
    get().pushLog(`Model ${info.file} · ${info.faces.toLocaleString()} faces`)
    if (chain) get().voxelize()
  }

  async function adoptProcessed() {
    const { grid, meta } = await api.grid('processed')
    set({ procData: grid, proc: meta.proc ?? get().proc })
  }

  // ── Evolve ──
  function stopPlayer() {
    if (player) clearInterval(player)
    player = null
  }
  /** Forget the history (new model, new grid, another mode's result). */
  function clearEvolve() {
    stopPlayer()
    evolveEpoch++
    dropFrames(null)
    if (get().evolve !== EVOLVE_EMPTY) set({ evolve: EVOLVE_EMPTY })
  }
  /** One frame of the current history, from memory or the service. */
  function frame(turn: number): Promise<Uint8Array> {
    const have = frames.get(turn)
    if (have) {
      keepFrame(turn, have)                                // most recently used
      return Promise.resolve(have)
    }
    const pending = framesLoading.get(turn)
    if (pending) return pending
    const want = framesFor
    const p = api.nationsFrame(turn).then(({ meta, owner }) => {
      if (meta.proc_id !== want) throw new ApiError(409, 'The Evolve history on the service was replaced by a newer run.')
      if (framesFor === want) keepFrame(turn, owner)
      return owner
    }).finally(() => { if (framesLoading.get(turn) === p) framesLoading.delete(turn) })
    framesLoading.set(turn, p)
    return p
  }
  /** After an Evolve run: fetch its history and show the last turn. */
  async function loadEvolve(meta: ProcMeta) {
    stopPlayer()
    const epoch = ++evolveEpoch
    dropFrames(meta.proc_id)
    const turns = meta.nations?.turns ?? 0
    set({ evolve: { ...EVOLVE_EMPTY, turn: turns, turns, k: meta.nations?.k ?? 0, procId: meta.proc_id, loading: true } })
    busy('evolve', true)
    try {
      const history = await api.nationsHistory()
      if (epoch !== evolveEpoch) return
      if (history.proc_id !== meta.proc_id) throw new ApiError(409, 'The Evolve history on the service was replaced by a newer run.', true)
      const last = history.turns.length - 1
      const owner = await frame(last)
      if (epoch !== evolveEpoch) return
      set({ evolve: { turn: last, turns: last, playing: false, owner, frameTurn: last, n: Math.round(Math.cbrt(owner.length)), history, k: history.k, procId: meta.proc_id, loading: false } })
      const alive = history.turns[last].size.filter((v) => v > 0).length
      get().pushLog(`Evolve ${meta.run} · ${history.k} nations · ${last} turns · ${alive} alive at the end`)
    } catch (e) {
      if (epoch !== evolveEpoch) return
      set((s) => ({ evolve: { ...s.evolve, loading: false } }))
      if (e instanceof ApiError && e.status === 404) get().pushLog('The Evolve history is no longer on the service; run Evolve again', 'warn')
      else fail(e)
    } finally {
      busy('evolve', false)
    }
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
            const { grid, meta } = await api.jobPreview(id)
            set({ procData: grid })
            // layer-tiled runs: the scan plane follows the real progress
            if (meta.frontier != null) set({ view: 'scan', scan: { z: meta.frontier, playing: false }, slice: { axis: 'z', index: Math.max(0, meta.frontier - 1) } })
          } catch { /* preview not ready */ }
        }
        if (job.status === 'done') {
          if (job.meta) {
            set({ proc: job.meta })
            clearEvolve()
            await adoptProcessed()
            get().pushLog(`Atlas run ${job.run} done · ${job.tiles_total} tiles · ${job.elapsed}s`)
            get().buildMesh()
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
    showSlice: false,
    hud: (() => {
      try { return { ...HUD_DEFAULT, ...JSON.parse(localStorage.getItem('qs-hud') ?? '{}') } } catch { return HUD_DEFAULT }
    })(),
    setHud: (p) => set((s) => {
      const hud = { ...s.hud, ...p }
      try { localStorage.setItem('qs-hud', JSON.stringify(hud)) } catch { /* per-viewer convenience only */ }
      return { hud }
    }),
    themePref: (() => { try { return (localStorage.getItem('qs-theme') as 'light' | 'dark' | null) ?? 'system' } catch { return 'system' } })(),
    theme: 'light',
    setTheme: (t) => {
      try { if (t === 'system') localStorage.removeItem('qs-theme'); else localStorage.setItem('qs-theme', t) } catch { /* per-viewer */ }
      if (t === 'system') delete document.documentElement.dataset.theme
      else document.documentElement.dataset.theme = t
      const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      set({ themePref: t, theme: dark ? 'dark' : 'light' })
    },
    tool: 'probe',
    setTool: (t) => set({ tool: t }),
    shading: 'value',
    shade: (() => {
      const d = { tables: 'cubic', thickness: 0.9, mix: 1, light: 'studio' as const, backdrop: 'plain' as const }
      try { return { ...d, ...JSON.parse(localStorage.getItem('qs-shade') ?? '{}') } } catch { return d }
    })(),
    setShading: (sh, opts) => set((s) => {
      const shade = { ...s.shade, ...opts }
      try { localStorage.setItem('qs-shade', JSON.stringify(shade)) } catch { /* per-viewer */ }
      return { shading: sh, shade }
    }),
    layers: {
      model: { visible: false, pickable: true }, voxels: { visible: false, pickable: true },
      processed: { visible: false, pickable: true }, result: { visible: false, pickable: true },
    },
    setLayer: (l, p) => set((s) => ({ layers: { ...s.layers, [l]: { ...s.layers[l], ...p } } })),
    runs: [],
    compose: (() => { try { return JSON.parse(localStorage.getItem('qs-compose') ?? 'null') ?? {} } catch { return {} } })(),
    setCompose: (p) => set((s) => {
      const compose = { ...s.compose, ...p }
      try { localStorage.setItem('qs-compose', JSON.stringify(compose)) } catch { /* per-viewer */ }
      return { compose }
    }),
    scan: { z: 0, playing: false },
    setScan: (p) => set((s) => ({ scan: { ...s.scan, ...p } })),
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

    q: { mode: 'emulator', sigma: 1, strength: 0.3, reach: 0, style: 'x', axes: [0, 1, 2], shots: null, run: 'run1', tiling: 'cube', k: 12, turns: 60, spread: 4, grooves: false },
    proc: null,
    procData: null,
    job: null,
    atlasJobs: [],

    m: {
      method: 'threshold', level: 0.5, keep: 'largest', smooth: 5, height: 90, refine: 1, amount: 2,
      field: 'threshold' as Field, vfilter: 'none' as VFilter, vwidth: 1, grow: 0, close: 0,
    },
    report: null,
    resultMesh: null,
    exported: null,

    set: (p) => set(p),
    pushLog: (text, level = 'info') => set((s) => ({ log: [...s.log.slice(-799), { t: Date.now(), text, level }] })),

    init: async () => {
      if (initing) return
      initing = true
      await run('init', async () => {
        const st = await api.state()
        set({ key: st.key })
        get().refreshRecent()
        // A fresh tab starts empty, as on another computer. Only a reload of a tab that was already
        // working (or a run still going on Atlas) picks up the model the service holds.
        if (st.model && (resuming() || st.job)) {
          await adoptModel(st.model, false)
          if (st.grid) {
            set({ grid: st.grid, vox: { n: st.grid.n, fill: st.grid.fill, values: st.grid.values, pad: st.grid.pad } })
            const { grid } = await api.grid('input')
            set({ gridData: grid, step: 1, slice: { axis: 'z', index: Math.floor(grid.n / 2) } })
          }
          if (st.processed) {
            const evolved = st.processed.mode === 'nations'
            // Evolve keeps its growth reach (%) under `reach`; ours is `spread`, and q.reach stays the blur's
            const raw = st.processed.params as Partial<S['q']> & { axes?: number[] | null }
            const pp = evolved
              ? Object.fromEntries(Object.entries({ k: raw.k, turns: raw.turns, spread: raw.reach, grooves: raw.grooves }).filter(([, v]) => v != null))
              : raw
            set((s) => ({
              proc: st.processed,
              q: { ...s.q, ...pp, axes: (evolved ? s.q.axes : raw.axes) ?? [0, 1, 2], mode: st.processed!.mode, run: st.processed!.run, tiling: st.processed!.tiles?.mode ?? s.q.tiling },
            }))
            await adoptProcessed()
            set({ step: 2 })
            if (evolved) loadEvolve(st.processed)
          }
          // run only the steps the service doesn't already have
          if (!st.grid) get().voxelize()
          else if (!st.processed) get().process(get().q.mode === 'atlas' ? { cachedOnly: true } : undefined)
          else get().buildMesh()
        }
        if (st.job) watchJob(st.job.job_id)
      })
      initing = false
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
      if (get().model) debounce('vox', 250, () => get().voxelize())
    },
    voxelize: () => run('vox', async () => {
      const t = ticket('vox')
      const signal = flight(VOX)
      const info = await api.voxelize(get().vox, signal)
      const { grid } = await api.grid('input', signal)
      if (!current('vox', t)) return
      const st = get()
      clearEvolve()
      set({
        grid: info, gridData: grid, proc: null, procData: null, report: null, resultMesh: null,
        slice: { axis: st.slice.axis, index: Math.min(st.slice.index, grid.n - 1) || Math.floor(grid.n / 2) },
      })
      set({ step: Math.max(st.step, 1) as Step })
      get().pushLog(`Voxelised ${info.n}³ · ${info.solid.toLocaleString()} solid cells`)
      // Atlas waits for an explicit submit; it may still find a cached result for these settings
      get().process(get().q.mode === 'atlas' ? { cachedOnly: true } : undefined)
    }),

    setQ: (p) => {
      set((s) => ({ q: { ...s.q, ...p } }))
      const { q, proc } = get()
      // Local modes update live as the dials turn; Atlas waits for an explicit submit
      // Evolve computes a whole history: wait a little longer for the slider to settle
      if (get().grid) debounce('proc', q.mode === 'nations' ? 400 : 120, () => get().process(q.mode === 'atlas' ? { cachedOnly: true } : undefined))
      else if (proc) set({ proc: null })
    },
    process: (opts) => run('proc', async () => {
      const { q, grid } = get()
      if (!grid) return
      const mode = opts?.submit || opts?.cachedOnly ? 'atlas' : q.mode
      if (mode === 'atlas' && !opts?.submit && !opts?.cachedOnly) return
      const t = ticket('proc')
      const signal = mode === 'atlas' && opts?.submit ? undefined : flight(PROC)
      const res = await api.process({ ...q, mode, shots: q.shots || null, cached_only: opts?.cachedOnly }, signal)
      if (!current('proc', t)) return
      if (res.status === 'missing') {
        clearEvolve()
        set({ proc: null, procData: null, resultMesh: null, report: null })
        return
      }
      if ('job_id' in res && res.status === 'running') {
        set({ job: res })
        get().pushLog(`Submitted ${res.run} to Atlas · ${res.tiles_total} tiles`)
        watchJob(res.job_id)
        return
      }
      if (res.status === 'done' && 'meta' in res && res.meta) {
        const mt = res.meta, pp = mt.params as { strength?: number; reach?: number; k?: number; turns?: number }
        const evolved = mt.mode === 'nations'
        set((st) => ({ proc: mt, runs: st.runs.some((r) => r.id === mt.proc_id) ? st.runs : [...st.runs.slice(-39), {
          id: mt.proc_id,
          label: evolved ? `${mt.run} · evolve · ${pp.k} nations · ${mt.nations?.turns ?? pp.turns} turns`
            : `${mt.run} · ${mt.mode === 'emulator' ? 'emulation' : mt.mode}${pp.strength != null ? ` · s ${pp.strength}` : ''}`,
          // Evolve's params.reach is its growth reach in %, not the blur's reach
          mode: mt.mode, strength: evolved ? 0 : pp.strength ?? 0, reach: evolved ? 0 : pp.reach ?? 0, t: Date.now(),
        }] }))
        if (evolved) loadEvolve(mt)
        else clearEvolve()
        await adoptProcessed()
        if (!current('proc', t)) return
        if (get().step < 2) set({ step: 2 })
        if (res.meta.cached) get().pushLog(`Atlas result for ${res.meta.run} read from cache`)
        debounce('mesh', 150, () => get().buildMesh())
      }
    }),
    evolve: EVOLVE_EMPTY,
    setTurn: async (t) => {
      const ev = get().evolve
      if (!ev.history) return
      const turn = Math.max(0, Math.min(ev.turns, Math.round(t)))
      const epoch = evolveEpoch
      if (turn !== ev.turn) set((s) => ({ evolve: { ...s.evolve, turn } }))
      try {
        const owner = await frame(turn)
        // only the latest request lands
        if (epoch !== evolveEpoch || get().evolve.turn !== turn) return
        set((s) => ({ evolve: { ...s.evolve, owner, frameTurn: turn } }))
      } catch (e) {
        if (epoch !== evolveEpoch) return
        get().pause()
        if (e instanceof ApiError && (e.status === 404 || e.status === 409)) get().pushLog('The Evolve history on the service was replaced; run Evolve again to play it', 'warn')
        else fail(e)
      }
    },
    play: () => {
      const ev = get().evolve
      if (!ev.history || ev.turns < 1) return
      stopPlayer()
      if (ev.turn >= ev.turns) get().setTurn(0)
      set((s) => ({ evolve: { ...s.evolve, playing: true } }))
      player = setInterval(() => {
        const e = get().evolve
        if (!e.playing || !e.history) { get().pause(); return }
        if (e.frameTurn !== e.turn) return                  // still waiting for this frame: hold, don't skip
        if (e.turn >= e.turns) { get().pause(); return }
        get().setTurn(e.turn + 1)
        for (let k = 2; k <= 4 && e.turn + k <= e.turns; k++) frame(e.turn + k).catch(() => { /* reported when shown */ })
      }, 1000 / TURNS_PER_SECOND)
    },
    pause: () => {
      stopPlayer()
      if (get().evolve.playing) set((s) => ({ evolve: { ...s.evolve, playing: false } }))
    },

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
      const { report, mesh } = await api.mesh(get().m, flight(MESH))
      if (!current('mesh', t)) return
      set({ report, resultMesh: mesh, step: 3 })
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
