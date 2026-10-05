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
  { id: 'arrange', t: 'Arrange', d: 'Keep every piece; put them on a grid around the object for this frame.' },
  { id: 'dedupe', t: 'No repeats', d: 'Where pieces show the same data in different forms, keep the most expressive one, then arrange.' },
  { id: 'essential', t: 'Quantum only', d: 'Keep only what explains the quantum step (Evolve in Evolve mode), without repeats, then arrange.' },
]

/** What a piece shows (topics) and how expressive it is (higher wins among pieces that show the same). */
const INFO: Record<string, [string[], number]> = {
  'frame:v1': [['frame'], 3], 'frame:v2': [['frame'], 2], 'frame:v3': [['frame'], 2], 'frame:v4': [['frame'], 1],
  'meta:v1': [['history'], 2], 'meta:v2': [['scene'], 2], 'meta:v3': [['history', 'scene'], 3], 'meta:v4': [['qsettings', 'strength', 'gatestyle'], 3],
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
}
const infoOf = (k: string): [string[], number] => INFO[k] ?? [[k], 1]

/** Topics that explain the quantum step, per mode. The frame and the provenance stay with them. */
const ESSENTIAL_BLUR = new Set(['frame', 'history', 'scene', 'qsettings', 'strength', 'qweights', 'register', 'pairing', 'bitstrings', 'shots', 'engine', 'backend', 'result', 'density', 'explain'])
const ESSENTIAL_EVOLVE = new Set(['frame', 'history', 'scene', 'result', 'ev-nations', 'ev-territory', 'ev-chronicle', 'ev-relations', 'ev-record'])

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

// ── curated presets ──────────────────────────────────────────────────────────────────────────────
export interface Curated { id: string; title: string; desc: string; mode?: 'nations' | 'blur'; compose: Record<string, string> }
export const CURATED: Curated[] = [
  {
    id: 'evolve', title: 'Evolve · nations', mode: 'nations',
    desc: 'The history as a field report: the record, the roster, territory over every turn, the chronicle and the relations.',
    compose: { frame: 'v3', meta: 'v3', evolve: 'v1,v2,v3,v4,v5' },
  },
  {
    id: 'circuit', title: 'Quantum · circuit', mode: 'blur',
    desc: 'The blur as a circuit: settings, per-qubit weights, the probed cell’s register, measured shots and the result.',
    compose: { frame: 'v1', meta: 'v4', blur: 'v2', register: 'v1', shots: 'v2', backend: 'v1', cards: 'v1', selection: 'v3', callout: 'v3' },
  },
  {
    id: 'specimen', title: 'Specimen · print sheet',
    desc: 'The object as a printed specimen: extents, provenance, the four stages, level against kept volume and the print check.',
    compose: { frame: 'v2', meta: 'v3', bounds: 'v2', cards: 'v2', figures: 'v4', stages: 'v1' },
  },
  {
    id: 'plate', title: 'Plate · object only',
    desc: 'A plate for a poster: the object, its extents and one line of provenance. Nothing else.',
    compose: { frame: 'v3', meta: 'v1', bounds: 'v2' },
  },
]

// ── layout ───────────────────────────────────────────────────────────────────────────────────────
export type Slot = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right'
export interface Box { k: string; w: number; h: number; slot: Slot }
export interface Placed { k: string; x: number; y: number; z: number }
interface Region { id: string; x: number; y: number; w: number; h: number; flow: 'column' | 'row'; align: 'start' | 'end'; from: 'top' | 'bottom' }

const MIN_Z = 0.7   // below this 11px text stops being readable

/** The frame's shape decides the grid: portrait frames stack bands above and below the object;
 *  landscape and square frames put columns either side, with bands between them. */
function regions(W: number, H: number, reserve: number): { list: Region[]; route: (s: Slot) => string[]; m: number } {
  const r = W / H
  const m = Math.round(Math.min(72, Math.max(24, Math.min(W, H) * 0.05)))
  const top = m, bottom = H - m - reserve
  if (r <= 0.85) {
    const band = (bottom - top) * (r <= 0.6 ? 0.3 : 0.32)
    const list: Region[] = [
      { id: 'top', x: m, y: top, w: W - 2 * m, h: band, flow: 'row', align: 'start', from: 'top' },
      { id: 'bottom', x: m, y: bottom - band, w: W - 2 * m, h: band, flow: 'row', align: 'start', from: 'bottom' },
    ]
    const route = (s: Slot) => (s === 'tl' || s === 'tr' || s === 'top' || s === 'left' ? ['top', 'bottom'] : ['bottom', 'top'])
    return { list, route, m }
  }
  const col = Math.round(Math.min(400, Math.max(220, W * (r >= 1.2 ? 0.24 : 0.28))))
  const g = 32
  const inner = { l: m + col + g, r: W - m - col - g }
  const list: Region[] = [
    { id: 'left', x: m, y: top, w: col, h: bottom - top, flow: 'column', align: 'start', from: 'top' },
    { id: 'right', x: W - m - col, y: top, w: col, h: bottom - top, flow: 'column', align: 'end', from: 'top' },
    { id: 'top', x: inner.l, y: top, w: inner.r - inner.l, h: Math.round((bottom - top) * 0.14), flow: 'row', align: 'start', from: 'top' },
    { id: 'bottom', x: inner.l, y: bottom - Math.round((bottom - top) * 0.28), w: inner.r - inner.l, h: Math.round((bottom - top) * 0.28), flow: 'row', align: 'start', from: 'bottom' },
  ]
  const route = (s: Slot): string[] => {
    if (s === 'tl' || s === 'left' || s === 'bl') return ['left', 'right', 'bottom', 'top']
    if (s === 'tr' || s === 'right' || s === 'br') return ['right', 'left', 'bottom', 'top']
    if (s === 'top') return ['top', 'bottom', 'left', 'right']
    return ['bottom', 'top', 'left', 'right']
  }
  return { list, route, m }
}

/** How much of a region a list of boxes needs, packed the region's way. */
function need(reg: Region, boxes: Box[], gap: number): number {
  if (reg.flow === 'column') return boxes.reduce((a, b) => a + b.h, 0) + gap * Math.max(0, boxes.length - 1)
  let rowW = 0, rowH = 0, total = 0
  for (const b of boxes) {
    if (rowW && rowW + gap + b.w > reg.w) { total += rowH + gap; rowW = 0; rowH = 0 }
    rowW += (rowW ? gap : 0) + b.w
    rowH = Math.max(rowH, b.h)
  }
  return total + rowH
}

/** Lays out boxes (natural sizes, CSS px) over a w × h view. `reserve` keeps room at the bottom (the
 *  present bar). Returns top-left positions and scales, and the hero: the room left for the object. */
export function layout(boxes: Box[], W: number, H: number, reserve = 0): { placed: Placed[]; hero: Rect } {
  const { list, route, m } = regions(W, H, reserve)
  const gap = Math.round(Math.max(16, Math.min(W, H) * 0.024))
  const byId = new Map(list.map((r) => [r.id, r]))
  const fill = new Map<string, Box[]>(list.map((r) => [r.id, []]))
  const order = [...boxes].sort((a, b) => rank(a.slot) - rank(b.slot))
  for (const b of order) {
    const options = route(b.slot).map((id) => byId.get(id)!).filter(Boolean)
    const scaled = (reg: Region) => { const z = Math.min(1, reg.w / b.w); return { ...b, w: b.w * z, h: b.h * z } }
    // its own region if it fits at full size, else the first that does, else the first where it fits at half
    const reg = options.find((o) => need(o, [...fill.get(o.id)!, scaled(o)], gap) <= o.h)
      ?? options.find((o) => need(o, [...fill.get(o.id)!, scaled(o)], gap) * MIN_Z <= o.h) ?? options[0]
    fill.get(reg.id)!.push(b)
  }
  const placed: Placed[] = []
  const used: Record<string, { w: number; h: number }> = {}
  for (const reg of list) {
    const items = fill.get(reg.id)!
    if (!items.length) continue
    let z = Math.min(1, ...items.map((b) => reg.w / b.w))
    for (let i = 0; i < 6; i++) {
      const n = need(reg, items.map((b) => ({ ...b, w: b.w * z, h: b.h * z })), gap)
      if (n <= reg.h || z <= MIN_Z) break
      z = Math.max(MIN_Z, z * Math.max(0.7, reg.h / n))
    }
    if (reg.flow === 'column') {
      const lower = items.filter((b) => b.slot === 'bl' || b.slot === 'br')
      const upper = items.filter((b) => !lower.includes(b))
      const at = (b: Box) => (reg.align === 'end' ? reg.x + reg.w - b.w * z : reg.x)
      let y = reg.y
      for (const b of upper) { placed.push({ k: b.k, x: at(b), y, z }); y += b.h * z + gap }
      // the lower set hangs from the bottom of the column, unless the upper set already reaches it
      const lowH = lower.reduce((a, b) => a + b.h * z, 0) + gap * Math.max(0, lower.length - 1)
      let yb = Math.max(y, reg.y + reg.h - lowH)
      for (const b of lower) { placed.push({ k: b.k, x: at(b), y: yb, z }); yb += b.h * z + gap }
      used[reg.id] = { w: Math.max(...items.map((b) => b.w * z)), h: Math.max(y, yb) - reg.y }
    } else {
      const rows: Box[][] = [[]]
      let rowW = 0
      for (const b of items) {
        if (rowW && rowW + gap + b.w * z > reg.w) { rows.push([]); rowW = 0 }
        rows[rows.length - 1].push(b)
        rowW += (rowW ? gap : 0) + b.w * z
      }
      const heights = rows.map((row) => Math.max(...row.map((b) => b.h * z)))
      const total = heights.reduce((a, h) => a + h, 0) + gap * (rows.length - 1)
      let y = reg.from === 'bottom' ? reg.y + reg.h - total : reg.y
      rows.forEach((row, i) => {
        let x = reg.x
        for (const b of row) {
          placed.push({ k: b.k, x, y: y + (reg.from === 'bottom' ? heights[i] - b.h * z : 0), z })
          x += b.w * z + gap
        }
        y += heights[i] + gap
      })
      used[reg.id] = { w: reg.w, h: total }
    }
  }
  // the object takes the room the pieces leave, inset by a gap
  const bottom = H - m - reserve
  const hero: Rect = {
    l: used.left ? m + used.left.w + gap * 2 : m,
    r: used.right ? W - m - used.right.w - gap * 2 : W - m,
    t: used.top ? m + used.top.h + gap * 2 : m + gap,
    b: used.bottom ? bottom - used.bottom.h - gap * 2 : bottom - gap,
  }
  return { placed, hero }
}
const rank = (s: Slot) => ({ tl: 0, tr: 0, top: 1, left: 2, right: 2, bottom: 3, bl: 4, br: 4 })[s]
