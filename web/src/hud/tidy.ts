// Auto-compose for Present: what each piece shows (so duplicates can be found), which are the quantum
// essentials, curated presets, and a layout that puts every piece on a grid around the object for the
// frame's shape (landscape, square, portrait, story, poster…).
//
// Tidy has three degrees:
//   arrange    keep every piece, lay them out
//   dedupe     where several pieces show the same data in different forms, keep the most expressive
//   essential  keep only what explains the quantum step (or Evolve, in Evolve mode), then dedupe
import type { Rect } from './types'

export type TidyLevel = 'arrange' | 'dedupe' | 'essential'
export const TIDY_LEVELS: { id: TidyLevel; t: string; d: string }[] = [
  { id: 'arrange', t: 'All pieces', d: 'Keep every piece; lay them out again on a grid around the object for this frame.' },
  { id: 'dedupe', t: 'No repeats', d: 'Where pieces show the same data in different forms, keep the most expressive one, then arrange.' },
  { id: 'essential', t: 'Essentials', d: 'Keep only what explains the quantum step (Evolve in Evolve mode), without repeats, then arrange.' },
]

/** What a piece shows (topics) and how expressive it is (higher wins among pieces that show the same). */
const INFO: Record<string, [string[], number]> = {
  'frame:v1': [['frame'], 3], 'frame:v2': [['frame'], 2], 'frame:v3': [['frame'], 2], 'frame:v4': [['frame'], 1],
  'meta:v1': [['history'], 2], 'meta:v2': [['scene'], 2], 'meta:v3': [['history', 'scene'], 3], 'meta:v4': [['qsettings', 'strength', 'gatestyle'], 3], 'meta:v5': [['title'], 3],
  'steps:v1': [['pipeline'], 2], 'steps:v2': [['pipeline'], 3], 'steps:v3': [['pipeline'], 1], 'steps:v4': [['pipeline'], 1],
  'bars:v1': [['pipeline'], 2], 'bars:v2': [['pipeline', 'progress'], 2], 'bars:v3': [['pipeline'], 3],
  'indexes:v1': [['pipeline'], 1], 'indexes:v2': [['pipeline'], 1],
  'timeline:v1': [['pipeline', 'timing'], 2], 'timeline:v2': [['timing', 'tiles'], 3], 'runtime:v2': [['timing'], 1], 'tiles:v1': [['tiles'], 2],
  'orbit:v1': [['orbit'], 3], 'orbit:v2': [['orbit'], 2], 'orbit:v3': [['orbit'], 2], 'orbit:v4': [['orbit'], 1], 'orbit:v5': [['camera'], 1],
  'camera:c1': [['camera'], 2], 'camera:c2': [['camera'], 2], 'camera:c3': [['camera'], 1], 'camera:c4': [['camera'], 3], 'camera:c5': [['camera'], 2], 'camera:c6': [['camera'], 1],
  'dial:o1': [['camera'], 1], 'dial:o2': [['camera'], 2], 'dial:o3': [['camera'], 1], 'dial:o4': [['camera'], 2],
  'viewcam:v1': [['camera'], 2], 'viewcam:v2': [['camera'], 2], 'viewcam:v3': [['camera'], 1],
  'bounds:v1': [['bounds'], 2], 'bounds:v2': [['bounds'], 3], 'bounds:v3': [['bounds'], 2], 'bounds:v4': [['bounds'], 1],
  'focus:v1': [['focus'], 1], 'focus:v2': [['focus'], 2], 'focus:v3': [['focus'], 1], 'focus:v4': [['focus'], 1],
  'selection:v1': [['selection'], 2], 'selection:v2': [['selection'], 1], 'selection:v3': [['selection'], 3], 'selection:v4': [['selection'], 2],
  'callout:v1': [['callout'], 1], 'callout:v2': [['callout'], 2], 'callout:v3': [['callout'], 3], 'callout:v4': [['callout'], 1],
  'scan:v1': [['scanfx'], 1], 'scan:v2': [['slice'], 2], 'scan:v3': [['slice'], 2], 'scan:v4': [['scanfx'], 1],
  'captures:v1': [['runs'], 1], 'captures:v2': [['runs'], 1], 'captures:v3': [['runs'], 2], 'captures:v4': [['runs'], 3], 'runtime:v4': [['runs'], 2],
  'slicecard:v1': [['slice'], 2], 'slicecard:v2': [['slice'], 3], 'slicecard:v3': [['density'], 2], 'density:v1': [['density'], 3],
  'cards:v1': [['result'], 3], 'cards:v2': [['print'], 3], 'cards:v3': [['model'], 2], 'cards:v4': [['grid'], 2], 'cards:v5': [['result', 'print'], 3],
  'stages:v1': [['stages'], 3], 'stages:v2': [['stages'], 2], 'stages:v3': [['stages'], 2], 'stages:v4': [['stages'], 2],
  'backend:v1': [['backend'], 2], 'backend:v2': [['backend'], 1], 'processing:v1': [['engine'], 2],
  'register:v1': [['register'], 3],
  'rotation:v1': [['qweights'], 2], 'blur:v2': [['qweights'], 3], 'pulse:v1': [['qweights'], 2], 'pulse:v2': [['qweights'], 2],
  'blur:v1': [['qsettings', 'strength', 'gatestyle'], 2], 'blur:v3': [['pairing'], 3], 'blur:v4': [['explain'], 2],
  'shots:v1': [['shots'], 2], 'shots:v2': [['bitstrings'], 3], 'dials:v5': [['shots'], 1], 'numbers:v2': [['shots'], 1],
  'usage:v1': [['usage'], 2], 'usage:v2': [['tilesize'], 2], 'usage:v3': [['rate'], 1],
  'figures:v1': [['level'], 2], 'figures:v2': [['kept'], 2], 'figures:v3': [['level', 'kept'], 1], 'figures:v4': [['level', 'kept'], 3],
  'dials:v1': [['level'], 2], 'dials:v2': [['strength'], 2], 'dials:v3': [['level'], 2], 'dials:v4': [['gatestyle'], 1], 'dials:v6': [['level'], 1],
  'numbers:v1': [['level'], 2], 'numbers:v3': [['push'], 2], 'numbers:v4': [['thicken'], 2], 'numbers:v5': [['pushfield'], 1], 'numbers:v6': [['level', 'kept'], 2],
  'levels:v1': [['kept', 'levelsweep'], 3], 'runtime:v1': [['history'], 1], 'runtime:v3': [['log'], 2],
  'field:v1': [['field'], 2], 'values:v1': [['values'], 2], 'values:v2': [['values'], 1],
  'evolve:v1': [['ev-nations'], 3], 'evolve:v2': [['ev-territory'], 3], 'evolve:v3': [['ev-chronicle'], 3], 'evolve:v4': [['ev-relations'], 3], 'evolve:v5': [['ev-record'], 3],
  'evolve:v6': [['ev-log'], 2], 'evolve:v7': [['ev-nation'], 3], 'runtime:v5': [['jobs'], 2],
}
const infoOf = (k: string): [string[], number] => INFO[k] ?? [[k], 1]

/** Topics that explain the quantum step, per mode. The frame and the provenance stay with them. */
const ESSENTIAL_BLUR = new Set(['frame', 'title', 'history', 'scene', 'qsettings', 'strength', 'qweights', 'register', 'pairing', 'bitstrings', 'shots', 'engine', 'backend', 'result', 'density', 'explain'])
const ESSENTIAL_EVOLVE = new Set(['frame', 'title', 'history', 'scene', 'result', 'ev-nations', 'ev-territory', 'ev-chronicle', 'ev-relations', 'ev-record', 'ev-log', 'ev-nation'])

/** The piece keys to take off for a tidy level. Text notes are always kept. */
export function toRemove(keys: string[], level: TidyLevel, mode: string): string[] {
  if (level === 'arrange') return []
  const pieces = keys.filter((k) => !k.startsWith('text:'))
  const want = mode === 'nations' ? ESSENTIAL_EVOLVE : ESSENTIAL_BLUR
  const out = new Set<string>()
  if (level === 'essential') for (const k of pieces) if (!infoOf(k)[0].some((t) => want.has(t))) out.add(k)
  // most expressive first; among equals the one covering more; a piece whose topics are all covered goes
  const order = pieces.filter((k) => !out.has(k)).sort((a, b) => infoOf(b)[1] - infoOf(a)[1] || infoOf(b)[0].length - infoOf(a)[0].length)
  const covered = new Set<string>()
  for (const k of order) {
    const [topics] = infoOf(k)
    if (topics.every((t) => covered.has(t))) { out.add(k); continue }
    topics.forEach((t) => covered.add(t))
  }
  return [...out]
}

// ── presets ──────────────────────────────────────────────────────────────────────────────────────
// One per category of the library, each with one piece from every family in it (the most telling
// variant), on top of the scene's guides; and Composite, the most telling pieces of every category
// together. Evolve and the quantum glyphs read their own runs; Composite picks by the engine in use.
export interface Curated { id: string; title: string; desc: string; mode?: 'nations' | 'blur'; compose: Record<string, string> | ((mode: string) => Record<string, string>) }
export const CURATED: Curated[] = [
  {
    id: 'marks', title: 'Marks', desc: 'Frame, orbit, camera, dial, bounds, focus, selection, callouts, slice.',
    compose: { frame: 'v1', orbit: 'v1', camera: 'c4', dial: 'o1', bounds: 'v2', focus: 'v2', selection: 'v3', callout: 'v3', scan: 'v2' },
  },
  {
    id: 'navigation', title: 'Navigation', desc: 'Steps, run timeline, progress, index and captures.',
    compose: { frame: 'v2', steps: 'v2', timeline: 'v1', bars: 'v2', indexes: 'v1', captures: 'v3' },
  },
  {
    id: 'evolve', title: 'Evolve', mode: 'nations', desc: 'Record, roster, territory, chronicle, relations, log, one nation.',
    compose: { frame: 'v3', meta: 'v5', evolve: 'v5,v1,v2,v3,v4,v6,v7' },
  },
  {
    id: 'glyphs', title: 'Glyphs', mode: 'blur', desc: 'Backend, register, rotation, shots, engine, qubits, pulses, usage.',
    compose: { frame: 'v2', backend: 'v1', register: 'v1', rotation: 'v1', shots: 'v1', processing: 'v1', blur: 'v2', pulse: 'v2', usage: 'v1' },
  },
  {
    id: 'data', title: 'Data', desc: 'Readouts, the result card, level against kept, the slice and the stages.',
    compose: { frame: 'v2', meta: 'v3', cards: 'v1', figures: 'v4', slicecard: 'v1', stages: 'v1' },
  },
  {
    id: 'composite', title: 'Composite', desc: 'The most telling piece of every category, together.',
    compose: (mode): Record<string, string> => mode === 'nations'
      ? { frame: 'v2', meta: 'v5', bounds: 'v2', steps: 'v2', evolve: 'v2,v7', param: 'turn' }
      : { frame: 'v2', meta: 'v5', bounds: 'v2', steps: 'v2', blur: 'v2', cards: 'v1', param: 'level' },
  },
]

/** A preset's pieces for the engine in use. */
export const presetCompose = (c: Curated, mode: string) => (typeof c.compose === 'function' ? c.compose(mode) : c.compose)

// ── layout ───────────────────────────────────────────────────────────────────────────────────────
// A plate: one margin all round (inside the frame marks), one gutter between pieces, one scale for
// every piece so a role reads the same size everywhere on the plate, and the object in the room left.
// The frame's shape picks the grid:
//   wide    a column either side of the object, bands above and below it between the columns
//   square  a band across the top, a column on the right, a band under the object
//   tall    a band across the top and one across the bottom
// The scale follows the frame's area (the same plate at any window size) and comes down until every
// piece fits and the object keeps its room; when even the smallest readable scale is too large, the
// piece that matters least is left out of this frame.
export type Slot = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right'
export interface Box { k: string; w: number; h: number; slot: Slot }
/** Top-left (view px) and scale of a piece; `out`: left out of this frame for want of room. */
export interface Placed { k: string; x: number; y: number; z: number; out?: boolean }
/** Room the object's own marks need around it (extents and their labels), view px. */
export interface Pad { l: number; r: number; t: number; b: number }

const MIN_Z = 0.5   // the smallest a piece is drawn: in a small view the whole plate scales down rather than lose pieces
const MAX_Z = 1     // pieces never grow past their own size
const REF = 1150     // √(frame area) at which pieces sit at their natural size
/** Where the frame marks are drawn (frame.tsx): the margin starts a gutter inside them. */
export const FRAME_INSET = 28

/** How much a piece matters when a frame cannot hold everything: the lowest is left out first. */
const KEEP: Record<string, number> = {
  'meta:v5': 10,
  'evolve:v1': 9, 'evolve:v2': 8, 'evolve:v5': 7, 'evolve:v3': 6, 'evolve:v4': 5,
  'pulse:v2': 9, 'blur:v2': 8, 'cards:v1': 8, 'register:v1': 7, 'blur:v3': 6,
  'cards:v2': 8, 'stages:v1': 7, 'figures:v4': 6, 'meta:v3': 5, 'meta:v1': 5, 'meta:v4': 5,
}
const keepOf = (k: string) => (k.startsWith('text:') ? 99 : KEEP[k] ?? infoOf(k)[1])

type Reg = 'T' | 'B' | 'L' | 'R'
type Shape = 'wide' | 'square' | 'tall'
const shapeOf = (r: number): Shape => (r >= 1.3 ? 'wide' : r > 0.84 ? 'square' : 'tall')
/** Where a piece from each slot may go, in order of preference. */
const ROUTE: Record<Shape, Record<Slot, Reg[]>> = {
  wide: {
    tl: ['L', 'R', 'T', 'B'], left: ['L', 'R', 'B'], bl: ['L', 'R', 'B'], top: ['T', 'B', 'L', 'R'],
    tr: ['R', 'L', 'T', 'B'], right: ['R', 'L', 'B'], br: ['R', 'L', 'B'], bottom: ['B', 'T', 'L', 'R'],
  },
  // the object keeps the centre, so the room a column takes on one side is kept on the other anyway:
  // square and tall frames use both columns after their bands
  square: {
    tl: ['T', 'L', 'B', 'R'], left: ['L', 'T', 'B', 'R'], top: ['T', 'B', 'L', 'R'], bl: ['L', 'B', 'R', 'T'],
    tr: ['R', 'T', 'B', 'L'], right: ['R', 'B', 'T', 'L'], br: ['R', 'B', 'L', 'T'], bottom: ['B', 'T', 'L', 'R'],
  },
  tall: {
    tl: ['T', 'B', 'L', 'R'], tr: ['T', 'B', 'R', 'L'], top: ['T', 'B', 'L', 'R'], left: ['T', 'B', 'L', 'R'],
    bl: ['B', 'T', 'L', 'R'], br: ['B', 'T', 'R', 'L'], bottom: ['B', 'T', 'L', 'R'], right: ['B', 'T', 'R', 'L'],
  },
}
/** The least room the object keeps, as fractions of the frame (width, height). */
const HERO: Record<Shape, [number, number]> = { wide: [0.3, 0.4], square: [0.32, 0.3], tall: [0.46, 0.28] }

interface Sized { k: string; w: number; h: number; slot: Slot }
interface Grid { W: number; H: number; m: number; gut: number; gap: number; shape: Shape }

function gridOf(W: number, H: number): Grid {
  const gut = Math.round(Math.min(40, Math.max(14, Math.min(W, H) * 0.03)))
  return { W, H, m: FRAME_INSET + gut, gut, gap: Math.round(gut * 1.5), shape: shapeOf(W / H) }
}

/** A band's pieces in reading order, each as high and as far left as it goes (bottom-left skyline):
 *  short pieces stack under one another beside a tall one, and edges line up with edges. */
function pack(items: Sized[], width: number, gut: number): { at: { x: number; y: number }[]; h: number } {
  const done: { x: number; y: number; w: number; h: number }[] = []
  for (const b of items) {
    let best: { x: number; y: number } | null = null
    for (const x of [0, ...done.map((p) => p.x + p.w + gut)]) {
      if (x + b.w > width + 0.5) continue
      const y = done.filter((p) => p.x < x + b.w && x < p.x + p.w).reduce((a, p) => Math.max(a, p.y + p.h + gut), 0)
      if (!best || y < best.y - 0.5 || (Math.abs(y - best.y) <= 0.5 && x < best.x)) best = { x, y }
    }
    best ??= { x: 0, y: done.reduce((a, p) => Math.max(a, p.y + p.h + gut), 0) }
    done.push({ ...best, w: b.w, h: b.h })
  }
  return { at: done, h: done.reduce((a, p) => Math.max(a, p.y + p.h), 0) }
}
const colH = (items: Sized[], gut: number) => items.reduce((a, b) => a + b.h, 0) + gut * Math.max(0, items.length - 1)
const widest = (items: Sized[]) => items.reduce((a, b) => Math.max(a, b.w), 0)

/** Every piece at scale z on the frame's grid; `ok` when all fit and the object keeps its room. */
function plan(boxes: Box[], g: Grid, z: number, pad: Pad): { placed: Placed[]; hero: Rect; ok: boolean } {
  const { W, H, m, gut, gap, shape } = g
  const fill: Record<Reg, Sized[]> = { T: [], B: [], L: [], R: [] }
  const colCap = (W - 2 * m) * (shape === 'wide' ? 0.3 : 0.4)
  const bandCap = (H - 2 * m) * (shape === 'tall' ? 0.4 : 0.32)
  const geo = () => {
    // the object stays in the centre: a column on one side keeps the same room free on the other, and
    // so does a band above or below
    const wL = widest(fill.L), wR = widest(fill.R), wC = Math.max(wL, wR)
    const midL = m + (wC ? wC + gap : 0), midR = W - m - (wC ? wC + gap : 0)
    const tW = shape === 'square' ? W - 2 * m : midR - midL, bW = midR - midL
    const tP = pack(fill.T, tW, gut), bP = pack(fill.B, bW, gut)
    const hT = tP.h, hB = bP.h, hC = Math.max(hT, hB)
    const colTop = shape === 'square' && hT ? m + hT + gap : m
    const hero: Rect = {
      l: midL + pad.l, r: midR - pad.r,
      t: (hC ? m + hC + gap : m) + pad.t, b: H - m - (hC ? hC + gap : 0) - pad.b,
    }
    return { wL, wR, midL, midR, tW, bW, tP, bP, hT, hB, colTop, hero }
  }
  const fits = () => {
    const q = geo()
    const [hw, hh] = HERO[shape]
    return colH(fill.L, gut) <= H - m - q.colTop && colH(fill.R, gut) <= H - m - q.colTop && q.wL <= colCap && q.wR <= colCap
      && fill.T.every((b) => b.w <= q.tW) && fill.B.every((b) => b.w <= q.bW) && q.hT <= bandCap && q.hB <= bandCap
      && q.hero.r - q.hero.l >= hw * W - 1 && q.hero.b - q.hero.t >= hh * H - 1
  }
  let ok = true
  for (const b of boxes) {
    const s: Sized = { k: b.k, slot: b.slot, w: b.w * z, h: b.h * z }
    const route = ROUTE[shape][b.slot]
    const at = route.find((r) => { fill[r].push(s); const f = fits(); fill[r].pop(); return f })
    if (!at) ok = false
    fill[at ?? route[0]].push(s)
  }
  const q = geo()
  const placed: Placed[] = []
  // columns: flush left; corner pieces from the bottom slots hang from the foot of the column
  for (const r of ['L', 'R'] as const) {
    const items = fill[r]
    if (!items.length) continue
    const x = r === 'L' ? m : W - m - q.wR
    const lower = items.filter((b) => b.slot === 'bl' || b.slot === 'br')
    const upper = items.filter((b) => !lower.includes(b))
    let y = q.colTop
    for (const b of upper) { placed.push({ k: b.k, x, y, z }); y += b.h + gut }
    let yb = Math.max(y, H - m - colH(lower, gut))
    for (const b of lower) { placed.push({ k: b.k, x, y: yb, z }); yb += b.h + gut }
  }
  // bands: packed from their top-left (pieces side by side share a top edge, so their head rules line
  // up); the bottom band sits on the bottom margin. When the band is nearly full its columns spread to
  // span it edge to edge, so the last one lines up with the column or margin beside it.
  const band = (items: Sized[], p: { at: { x: number; y: number }[] }, x0: number, y0: number, width: number) => {
    const xs = [...new Set(p.at.map((a) => Math.round(a.x)))].sort((a, b) => a - b)
    const right = items.reduce((a, b, i) => Math.max(a, p.at[i].x + b.w), 0)
    const free = width - right
    const step = xs.length > 1 && free > 0 && free < width * 0.4 ? free / (xs.length - 1) : 0
    items.forEach((b, i) => placed.push({ k: b.k, x: x0 + p.at[i].x + step * xs.indexOf(Math.round(p.at[i].x)), y: y0 + p.at[i].y, z }))
  }
  band(fill.T, q.tP, shape === 'square' ? m : q.midL, m, q.tW)
  band(fill.B, q.bP, q.midL, H - m - q.hB, q.bW)
  return { placed, hero: q.hero, ok }
}

const NOPAD: Pad = { l: 0, r: 0, t: 0, b: 0 }

/** Lays out boxes (natural sizes, CSS px) over a w × h view. `reserve` keeps room at the bottom (the
 *  present bar); `pad` is room the object's own marks need. Returns top-left positions and scales, and
 *  the hero: the room left for the object. */
export function layout(boxes: Box[], W0: number, H0: number, reserve = 0, pad: Pad = NOPAD, inset: Pad = NOPAD): { placed: Placed[]; hero: Rect } {
  // the view's own controls (tool shelf, navigation) keep their strips: the plate is laid out beside them
  const W = W0 - inset.l - inset.r, H = H0 - inset.t - inset.b
  const r = inner(boxes, W, H, reserve, pad)
  return {
    placed: r.placed.map((q) => ({ ...q, x: q.x + inset.l, y: q.y + inset.t })),
    hero: { l: r.hero.l + inset.l, r: r.hero.r + inset.l, t: r.hero.t + inset.t, b: r.hero.b + inset.t },
  }
}
function inner(boxes: Box[], W: number, H: number, reserve: number, pad: Pad): { placed: Placed[]; hero: Rect } {
  const g = gridOf(W, H - reserve)
  const z0 = Math.min(MAX_Z, Math.max(MIN_Z, Math.sqrt(W * (H - reserve)) / REF))
  let live = boxes.map((b, i) => ({ b, i })).sort((a, c) => rank(a.b.slot) - rank(c.b.slot) || a.i - c.i).map((x) => x.b)
  const out: Placed[] = []
  for (;;) {
    for (let z = z0; ; z = Math.max(MIN_Z, z * 0.96)) {
      const p = plan(live, g, z, pad)
      if (p.ok) return { placed: [...p.placed, ...out], hero: p.hero }
      if (z <= MIN_Z) break
    }
    // too much for this frame even at the smallest readable scale: leave out what matters least
    const drop = live.filter((b) => !b.k.startsWith('text:')).sort((a, c) => keepOf(a.k) - keepOf(c.k))[0]
    if (!drop || live.length <= 1) {
      const p = plan(live, g, MIN_Z, pad)
      return { placed: [...p.placed, ...out], hero: p.hero }
    }
    live = live.filter((b) => b !== drop)
    out.push({ k: drop.k, x: 0, y: 0, z: 1, out: true })
  }
}
const rank = (s: Slot) => ({ tl: 0, tr: 0, top: 1, left: 2, right: 2, bottom: 3, bl: 4, br: 4 })[s]
