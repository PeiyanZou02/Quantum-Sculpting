// Lab / Present. Lab is the research workspace (parameters, algorithms, panels). Present is the
// display: the geometry full-window inside a composed HUD, for screenshots and recordings, with no
// parameters. Present keeps its own composition, the positions you drag HUD pieces to, and a reel
// of camera shots.
import { create } from 'zustand'

export type Mode = 'lab' | 'present'
export interface Shot { az: number; el: number; dist: number }
export interface Pos { x: number; y: number }   // fractions of the view, top-left of the piece
/** How one mark is drawn: emphasis tier (1 primary, 2 secondary, 3 tertiary), line weight and dash
 *  spacing as multiples of its own, and size (corner and edge pieces). */
export interface Look { tier?: 1 | 2 | 3; weight?: number; dash?: number; size?: number }
export interface TextNote { id: string; text: string }

interface P {
  mode: Mode
  setMode: (m: Mode) => void
  /** Present-mode composition: family → variant id or 'off'. */
  compose: Record<string, string>
  setCompose: (c: Record<string, string>) => void
  /** Dragged positions per HUD piece key ("family:variant" or a chrome key), per mode. */
  pos: Record<string, Pos>
  setPos: (key: string, p: Pos | null) => void
  arrange: boolean
  setArrange: (v: boolean) => void
  /** Hide every control (H) for clean screenshots. */
  bare: boolean
  setBare: (v: boolean) => void
  shots: Shot[]
  shot: number
  /** Bumped when the user steps to a shot (not when one is saved), so only stepping flies the camera. */
  fly: number
  addShot: (s: Shot) => void
  removeShot: (i: number) => void
  setShot: (i: number) => void
  /** Turntable and shot reel motion. */
  spin: boolean
  setSpin: (v: boolean) => void
  reel: boolean
  setReel: (v: boolean) => void
  /** Seconds per shot in the reel, and turntable speed (degrees per second). */
  reelSec: number
  spinSpeed: number
  setMotion: (p: Partial<Pick<P, 'reelSec' | 'spinSpeed' | 'cycleSec'>>) => void
  /** The compose drawer at the side, and a composition shown while hovering a choice. */
  drawer: boolean
  setDrawer: (v: boolean) => void
  preview: Record<string, string> | null
  setPreview: (c: Record<string, string> | null) => void
  /** Cycle the present compositions automatically. */
  cycle: boolean
  cycleSec: number
  setCycle: (v: boolean) => void
  /** Sweep the cutting plane up and down through the grid. */
  sweep: boolean
  setSweep: (v: boolean) => void
  recording: boolean
  setRecording: (v: boolean) => void
  /** Per-mark looks, keyed "family:variant". */
  looks: Record<string, Look>
  setLook: (key: string, l: Partial<Look> | null) => void
  /** The mark whose layer row is hovered: the others dim so you can see which is which. */
  hl: string | null
  setHl: (k: string | null) => void
  /** Turntable direction: 1 counter-clockwise seen from above, -1 clockwise. */
  spinDir: 1 | -1
  setSpinDir: (d: 1 | -1) => void
  /** Free text placed anywhere on the view (titles, captions). Positions live in `pos` under text:<id>. */
  texts: TextNote[]
  /** Ink of exported PNGs (see savePng). */
  pngInk: 'auto' | 'dark' | 'light'
  setPngInk: (i: 'auto' | 'dark' | 'light') => void
  addText: () => void
  setText: (id: string, text: string | null) => void
}

const KEY = 'qs-present'
const load = (): Partial<P> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const saved = load()
const keep = (s: P) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode: s.mode, compose: s.compose, pos: s.pos, shots: s.shots, spin: s.spin, reelSec: s.reelSec, spinSpeed: s.spinSpeed, cycleSec: s.cycleSec, drawer: s.drawer, looks: s.looks, spinDir: s.spinDir, texts: s.texts, pngInk: s.pngInk }))
  } catch { /* per-viewer only */ }
}

export const PRESENT_DEFAULT: Record<string, string> = {
  frame: 'v1', meta: 'v3', steps: 'off', orbit: 'v1', camera: 'off', dial: 'off', bounds: 'off',
  focus: 'off', selection: 'off', callout: 'off', scan: 'off', captures: 'v1', slicecard: 'off', cards: 'v1',
}

export const usePresent = create<P>()((set, get) => {
  const up = (p: Partial<P>) => { set(p); keep(get()) }
  return {
    mode: (saved.mode as Mode) ?? 'lab',
    setMode: (m) => up({ mode: m, arrange: false, bare: false }),
    compose: { ...PRESENT_DEFAULT, ...(saved.compose ?? {}) },
    setCompose: (c) => up({ compose: { ...get().compose, ...c } }),
    pos: saved.pos ?? {},
    setPos: (key, p) => {
      const pos = { ...get().pos }
      if (p) pos[key] = p
      else delete pos[key]
      up({ pos })
    },
    arrange: false,
    setArrange: (v) => set({ arrange: v }),
    bare: false,
    setBare: (v) => set({ bare: v }),
    shots: saved.shots ?? [],
    shot: 0,
    fly: 0,
    addShot: (s) => up({ shots: [...get().shots, s].slice(-10), shot: Math.min(9, get().shots.length) }),
    removeShot: (i) => up({ shots: get().shots.filter((_, j) => j !== i), shot: 0 }),
    setShot: (i) => set({ shot: i, fly: get().fly + 1 }),
    spin: saved.spin ?? false,
    setSpin: (v) => up({ spin: v }),
    reel: false,
    setReel: (v) => set({ reel: v }),
    reelSec: saved.reelSec ?? 5,
    spinSpeed: saved.spinSpeed ?? 8,
    cycleSec: saved.cycleSec ?? 6,
    setMotion: (p) => up(p),
    drawer: saved.drawer ?? true,
    setDrawer: (v) => up({ drawer: v }),
    preview: null,
    setPreview: (c) => set({ preview: c }),
    cycle: false,
    setCycle: (v) => set({ cycle: v }),
    sweep: false,
    setSweep: (v) => set({ sweep: v }),
    recording: false,
    setRecording: (v) => set({ recording: v }),
    looks: saved.looks ?? {},
    setLook: (key, l) => {
      const looks = { ...get().looks }
      if (l) looks[key] = { ...looks[key], ...l }
      else delete looks[key]
      up({ looks })
    },
    hl: null,
    setHl: (k) => set({ hl: k }),
    spinDir: saved.spinDir ?? 1,
    setSpinDir: (d) => up({ spinDir: d }),
    texts: saved.texts ?? [],
    pngInk: saved.pngInk ?? 'auto',
    setPngInk: (i) => up({ pngInk: i }),
    addText: () => {
      const id = Math.random().toString(36).slice(2, 8)
      const n = get().texts.length
      up({ texts: [...get().texts, { id, text: 'Note' }], pos: { ...get().pos, [`present|text:${id}`]: { x: 0.42, y: 0.12 + 0.06 * (n % 8) } } })
    },
    setText: (id, text) => {
      if (text === null) {
        const pos = { ...get().pos }
        delete pos[`present|text:${id}`]
        up({ texts: get().texts.filter((t) => t.id !== id), pos })
      } else up({ texts: get().texts.map((t) => (t.id === id ? { ...t, text } : t)) })
    },
  }
})
