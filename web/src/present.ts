// The composition over the view: the HUD you compose yourself around the geometry, for work,
// screenshots, recordings and diagrams. It lives in Lab (Properties · Compose and Output). Presets lay
// out a set of pieces at once; in arrange mode you drag pieces around, resize, select and remove them;
// compositions you like are saved by name.
import { create } from 'zustand'
import type { FrameId } from './frames'
import { CURATED, toRemove, type TidyLevel } from './hud/tidy'
import { useStore } from './store'

export interface Shot { az: number; el: number; dist: number }
/** Fractions of the view: the piece's top-left, or its centre when `c` (where a dragged component was dropped). */
export interface Pos { x: number; y: number; c?: boolean; auto?: boolean; z?: number; out?: boolean }
/** How one component is drawn: emphasis tier (1 primary, 2 secondary, 3 tertiary), line weight and dash
 *  spacing as multiples of its own, size (corner and edge pieces), and whether it is hidden. */
export interface Look { tier?: 1 | 2 | 3; weight?: number; dash?: number; size?: number; hidden?: boolean }
export interface TextNote { id: string; text: string }
/** A saved composition: what is on, where it was put, how it looks. Positions are keyed by piece. */
/** Guides drawn in the scene itself: the grid volume's bounding box and the print grid on its floor
 *  (`div` cells a side). */
export interface Guides { box: boolean; floor: boolean; div: number }
/** The slice sweep: the range it covers (fractions of the grid height), layers per step, seconds for one
 *  pass through the range, and whether it goes up and down, only up or only down. */
export interface Sweep { from: number; to: number; step: number; sec: number; mode: 'bounce' | 'up' | 'down' }
export type PanelTab = 'view' | 'layers' | 'library' | 'notes' | 'motion' | 'output'
export interface Saved { id: string; name: string; compose: Record<string, string>; pos: Record<string, Pos>; looks: Record<string, Look>; texts: TextNote[]; guides?: Guides }

interface P {
  /** Present composition: family → variant ids, comma-separated, or 'off'. Empty is clean. */
  compose: Record<string, string>
  setCompose: (c: Record<string, string>) => void
  /** Dragged positions per piece key ("family:variant", "text:<id>" or a chrome key), prefixed by mode. */
  pos: Record<string, Pos>
  setPos: (key: string, p: Pos | null) => void
  /** Lab only: drag the lab readouts around. */
  arrange: boolean
  setArrange: (v: boolean) => void
  /** Present compose mode: pieces can be dragged, selected, deleted, and components dropped in. */
  composing: boolean
  setComposing: (v: boolean) => void
  /** The selected piece (compose mode). */
  sel: string | null
  setSel: (k: string | null) => void
  /** The piece whose layer row is hovered: the others dim so you can see which is which. */
  hl: string | null
  setHl: (k: string | null) => void
  /** A component ("family:variant") shown on the view while its library tile is hovered; not part of the composition. */
  preview: string | null
  setPreview: (k: string | null) => void
  /** The compose panel's page, the library category on show, and the families opened in it. */
  tab: PanelTab
  setTab: (t: PanelTab) => void
  libCat: string
  setLibCat: (c: string) => void
  opened: string[]
  toggleOpened: (family: string) => void
  /** Pieces that found no free room on the view, even scaled down. */
  crowded: number
  setCrowded: (n: number) => void
  /** Pieces the last layout left out of this frame: no room for them at a readable size. */
  leftOut: number
  setLeftOut: (n: number) => void
  /** Bumped by a tidy: the view lays every piece out again for the frame (see hud/tidy.ts). */
  tidyKey: number
  /** Bumped when a layout was asked for (a preset, a tidy, a frame): the object is framed again in the
   *  centre of the room the pieces leave. A layout after a resize keeps the camera where it is. */
  aim: number
  tidyUp: () => void
  /** Tidy at a degree: arrange everything, drop repeats, or keep only the quantum essentials. */
  tidy: (level: TidyLevel) => void
  /** Put a curated preset on the view (replacing the pieces, keeping notes) and lay it out. */
  applyCurated: (id: string) => void
  /** The artboard's shape (frames.ts) and the export size picked for it (index into its sizes). */
  frame: FrameId
  setFrame: (f: FrameId) => void
  outSize: number
  setOutSize: (i: number) => void
  /** Put a component on the view: at a point (centre, fractions of the view) or in its usual place. */
  place: (family: string, id: string, at?: { x: number; y: number }) => void
  /** Take a piece off the view. */
  removePiece: (key: string) => void
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
  /** Seconds per shot in the reel, turntable speed (degrees per second), seconds per saved composition. */
  reelSec: number
  spinSpeed: number
  cycleSec: number
  setMotion: (p: Partial<Pick<P, 'reelSec' | 'spinSpeed' | 'cycleSec'>>) => void
  /** Turntable direction: 1 counter-clockwise seen from above, -1 clockwise. */
  spinDir: 1 | -1
  setSpinDir: (d: 1 | -1) => void
  /** The compose panel at the side. */
  drawer: boolean
  setDrawer: (v: boolean) => void
  /** Step through the saved compositions on their own. */
  cycle: boolean
  setCycle: (v: boolean) => void
  /** Sweep the cutting plane up and down through the grid. */
  sweep: boolean
  setSweep: (v: boolean) => void
  sweepCfg: Sweep
  setSweepCfg: (s: Partial<Sweep>) => void
  recording: boolean
  setRecording: (v: boolean) => void
  /** Per-piece looks, keyed like positions but without the mode. */
  looks: Record<string, Look>
  setLook: (key: string, l: Partial<Look> | null) => void
  /** Free text placed anywhere on the view. */
  texts: TextNote[]
  addText: (at?: { x: number; y: number }) => void
  setText: (id: string, text: string | null) => void
  guides: Guides
  setGuides: (g: Partial<Guides>) => void
  /** Ink of exported PNGs (see savePng). */
  pngInk: 'auto' | 'dark' | 'light'
  setPngInk: (i: 'auto' | 'dark' | 'light') => void
  /** Saved compositions, and the one on screen (null: not saved yet). */
  saved: Saved[]
  current: string | null
  save: (name?: string) => void
  saveNew: (name?: string) => void
  load: (id: string) => void
  rename: (id: string, name: string) => void
  removeSaved: (id: string) => void
  /** Start clean: nothing on the view. */
  clear: () => void
}

const KEY = 'qs-present'
const VERSION = 2   // v2: compositions start clean and are saved by name; the old presets are gone
const read = (): Partial<P> & { v?: number } => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
const raw = read()
const saved: Partial<P> = raw.v === VERSION ? raw : {
  shots: raw.shots, spin: raw.spin, reelSec: raw.reelSec, spinSpeed: raw.spinSpeed,
  cycleSec: raw.cycleSec, drawer: raw.drawer, pngInk: raw.pngInk, spinDir: raw.spinDir,
}
const keep = (s: P) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: VERSION, compose: s.compose, pos: s.pos, shots: s.shots, spin: s.spin, reelSec: s.reelSec, spinSpeed: s.spinSpeed,
      cycleSec: s.cycleSec, drawer: s.drawer, looks: s.looks, frame: s.frame, outSize: s.outSize, spinDir: s.spinDir, texts: s.texts, pngInk: s.pngInk, saved: s.saved, current: s.current, guides: s.guides, sweepCfg: s.sweepCfg, tab: s.tab, libCat: s.libCat, opened: s.opened,
    }))
  } catch { /* per-viewer only */ }
}

const PRE = 'present|'
const variants = (v: string | undefined) => (v ?? 'off').split(',').filter((x) => x && x !== 'off')
const uid = () => Math.random().toString(36).slice(2, 8)
/** Present positions without the mode prefix, and back. */
const strip = (pos: Record<string, Pos>) => Object.fromEntries(Object.entries(pos).filter(([k]) => k.startsWith(PRE)).map(([k, v]) => [k.slice(PRE.length), v]))
const withOthers = (pos: Record<string, Pos>, mine: Record<string, Pos>) => ({
  ...Object.fromEntries(Object.entries(pos).filter(([k]) => !k.startsWith(PRE))),
  ...Object.fromEntries(Object.entries(mine).map(([k, v]) => [PRE + k, v])),
})

export const usePresent = create<P>()((set, get) => {
  const up = (p: Partial<P>) => { set(p); keep(get()) }
  const snap = (): Omit<Saved, 'id' | 'name'> => {
    const s = get()
    return { compose: { ...s.compose }, pos: strip(s.pos), looks: { ...s.looks }, texts: [...s.texts], guides: { ...s.guides } }
  }
  return {
      compose: saved.compose ?? {},
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
    tab: (saved.tab as string) === 'capture' ? 'output' : saved.tab ?? 'view',
    setTab: (t) => up({ tab: t }),
    libCat: saved.libCat ?? 'marks',
    setLibCat: (c) => up({ libCat: c }),
    opened: saved.opened ?? [],
    toggleOpened: (f) => up({ opened: get().opened.includes(f) ? get().opened.filter((x) => x !== f) : [...get().opened, f] }),
    crowded: 0,
    setCrowded: (n) => { if (n !== get().crowded) set({ crowded: n }) },
    leftOut: 0,
    setLeftOut: (n) => { if (n !== get().leftOut) set({ leftOut: n }) },
    tidyKey: 0,
    aim: 0,
    tidyUp: () => set({ tidyKey: get().tidyKey + 1 }),
    tidy: (level) => {
      const s = get()
      const keys = Object.entries(s.compose).flatMap(([f, v]) => variants(v).map((id) => `${f}:${id}`))
      const gone = toRemove(keys, level, useStore.getState().q.mode)
      const compose = { ...s.compose }
      for (const k of gone) {
        const [f, id] = k.split(':')
        const left = variants(compose[f]).filter((v) => v !== id)
        compose[f] = left.length ? left.join(',') : 'off'
      }
      // every piece is laid out afresh: forget where they were put
      up({ compose, pos: withOthers(s.pos, Object.fromEntries(Object.entries(strip(s.pos)).filter(([k]) => k.startsWith('text:')))), sel: null })
      set({ tidyKey: get().tidyKey + 1, aim: get().aim + 1 })
    },
    applyCurated: (id) => {
      const c = CURATED.find((x) => x.id === id)
      if (!c) return
      const s = get()
      up({ compose: { ...c.compose }, pos: withOthers(s.pos, {}), looks: {}, current: null, sel: null })
      set({ tidyKey: get().tidyKey + 1, aim: get().aim + 1 })
    },
    frame: saved.frame ?? 'window',
    setFrame: (f) => { up({ frame: f, outSize: 0 }); setTimeout(() => set({ tidyKey: get().tidyKey + 1, aim: get().aim + 1 }), 80) },
    outSize: saved.outSize ?? 0,
    setOutSize: (i) => up({ outSize: i }),
    composing: false,
    setComposing: (v) => set({ composing: v, sel: v ? get().sel : null }),
    sel: null,
    setSel: (k) => set({ sel: k }),
    hl: null,
    setHl: (k) => set({ hl: k }),
    preview: null,
    setPreview: (k) => set({ preview: k }),
    place: (family, id, at) => {
      const s = get()
      const cur = variants(s.compose[family])
      const compose = cur.includes(id) ? s.compose : { ...s.compose, [family]: [...cur, id].join(',') }
      const pos = { ...s.pos }
      if (at) pos[`${PRE}${family}:${id}`] = { x: at.x, y: at.y, c: true }
      // a drop selects what was dropped and stays where it fell; a click puts it in its usual place (the view
      // moves it to a free spot if that is taken)
      up({ compose, pos, sel: at ? `${family}:${id}` : s.sel })
    },
    removePiece: (key) => {
      const s = get()
      if (key.startsWith('text:')) { s.setText(key.slice(5), null); set({ sel: null }); return }
      const [family, id] = key.split(':')
      const left = variants(s.compose[family]).filter((v) => v !== id)
      const pos = { ...s.pos }
      delete pos[PRE + key]
      const looks = { ...s.looks }
      delete looks[key]
      up({ compose: { ...s.compose, [family]: left.length ? left.join(',') : 'off' }, pos, looks, sel: s.sel === key ? null : s.sel })
    },
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
    spinDir: saved.spinDir ?? 1,
    setSpinDir: (d) => up({ spinDir: d }),
    drawer: saved.drawer ?? true,
    setDrawer: (v) => up(v ? { drawer: v } : { drawer: v, preview: null, hl: null }),
    cycle: false,
    setCycle: (v) => set({ cycle: v }),
    sweep: false,
    setSweep: (v) => set({ sweep: v }),
    sweepCfg: { from: 0, to: 1, step: 1, sec: 6, mode: 'bounce', ...saved.sweepCfg },
    setSweepCfg: (c) => up({ sweepCfg: { ...get().sweepCfg, ...c } }),
    recording: false,
    setRecording: (v) => set({ recording: v }),
    looks: saved.looks ?? {},
    setLook: (key, l) => {
      const looks = { ...get().looks }
      if (l) looks[key] = { ...looks[key], ...l }
      else delete looks[key]
      up({ looks })
    },
    texts: saved.texts ?? [],
    addText: (at) => {
      const id = uid()
      const n = get().texts.length
      up({
        texts: [...get().texts, { id, text: 'Note' }],
        pos: { ...get().pos, [`${PRE}text:${id}`]: at ? { ...at, c: true } : { x: 0.42, y: 0.12 + 0.06 * (n % 8) } },
        sel: `text:${id}`,
      })
    },
    setText: (id, text) => {
      if (text === null) {
        const pos = { ...get().pos }
        delete pos[`${PRE}text:${id}`]
        up({ texts: get().texts.filter((t) => t.id !== id), pos })
      } else up({ texts: get().texts.map((t) => (t.id === id ? { ...t, text } : t)) })
    },
    guides: { box: true, floor: true, div: 4, ...saved.guides },
    setGuides: (g) => up({ guides: { ...get().guides, ...g } }),
    pngInk: saved.pngInk ?? 'auto',
    setPngInk: (i) => up({ pngInk: i }),
    saved: saved.saved ?? [],
    current: saved.current ?? null,
    save: (name) => {
      const s = get()
      const cur = s.saved.find((x) => x.id === s.current)
      if (!cur) return s.saveNew(name)
      up({ saved: s.saved.map((x) => (x.id === cur.id ? { ...x, ...snap(), name: name ?? x.name } : x)) })
    },
    saveNew: (name) => {
      const s = get()
      const id = uid()
      up({ saved: [...s.saved, { id, name: name?.trim() || `Composition ${s.saved.length + 1}`, ...snap() }], current: id })
    },
    load: (id) => {
      const s = get()
      const c = s.saved.find((x) => x.id === id)
      if (!c) return
      up({ compose: { ...c.compose }, pos: withOthers(s.pos, c.pos), looks: { ...c.looks }, texts: [...c.texts], guides: c.guides ?? s.guides, current: id, sel: null })
    },
    rename: (id, name) => up({ saved: get().saved.map((x) => (x.id === id ? { ...x, name } : x)) }),
    removeSaved: (id) => up({ saved: get().saved.filter((x) => x.id !== id), current: get().current === id ? null : get().current }),
    clear: () => up({ compose: {}, pos: withOthers(get().pos, {}), looks: {}, texts: [], guides: { ...get().guides, box: false, floor: false }, current: null, sel: null }),
  }
})

/** Whether what is on the view differs from the saved composition it came from (or anything is on, if none). */
export function isDirty(s: Pick<P, 'saved' | 'current' | 'compose' | 'pos' | 'looks' | 'texts' | 'guides'>): boolean {
  const cur = s.saved.find((x) => x.id === s.current)
  if (!cur) return Object.values(s.compose).some((v) => variants(v).length > 0) || s.texts.length > 0 || s.guides.box || s.guides.floor
  const norm = (o: object) => JSON.stringify(o, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== 'off').sort()) : v))
  return norm({ compose: s.compose, pos: strip(s.pos), looks: s.looks, texts: s.texts, guides: s.guides }) !== norm({ compose: cur.compose, pos: cur.pos, looks: cur.looks, texts: cur.texts, guides: cur.guides ?? s.guides })
}
