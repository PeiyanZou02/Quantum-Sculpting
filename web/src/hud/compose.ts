// The composer's model, apart from its components: compositions and presets, which modules they turn
// on, where pieces sit (settle) and saving a piece as a PNG.
import type { Family, HudModule, Rect } from './types'
import { FAMILIES } from './registry'
import { usePresent } from '../present'
import { layout, type Slot } from './tidy'

export type Composition = Partial<Record<Family, string>>   // variant ids, comma-separated, or 'off'

/** The variants of a family that are on. */
export const variantsOf = (c: Record<string, string | undefined>, f: string): string[] => (c[f] ?? 'off').split(',').filter((v) => v && v !== 'off')
/** The family's value with `id` toggled on or off (others in the family stay). */
export function toggleVariant(c: Record<string, string | undefined>, f: string, id: string): string {
  const cur = variantsOf(c, f)
  const next = cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]
  return next.length ? next.join(',') : 'off'
}
/** How many variants of these families are on. */
export const countOn = (compose: Record<string, string>, fams: readonly string[]) => fams.reduce((n, f) => n + variantsOf(compose, f).length, 0)
const same = (a: string | undefined, b: string | undefined) => variantsOf({ x: a }, 'x').sort().join() === variantsOf({ x: b }, 'x').sort().join()

const pick = (f: Family, i: number) => FAMILIES.find((x) => x.id === f)?.modules[i]?.id ?? 'off'
export const PRESETS: { id: string; title: string; desc: string; set: () => Composition }[] = [
  {
    id: 'lab', title: 'Lab', desc: 'Registration frame, readouts, steps, orbit ring, captures',
    set: () => ({ frame: pick('frame', 0), meta: pick('meta', 2), steps: pick('steps', 1), orbit: pick('orbit', 0), bounds: pick('bounds', 0), focus: 'off', selection: pick('selection', 2), callout: pick('callout', 1), scan: 'off', captures: pick('captures', 0), camera: 'off', dial: 'off' }),
  },
  {
    id: 'camera', title: 'Camera', desc: 'Stations, the az/el chart and a tick ring',
    set: () => ({ frame: pick('frame', 1), meta: pick('meta', 1), steps: 'off', orbit: pick('orbit', 2), camera: pick('camera', 3), dial: pick('dial', 0), bounds: 'off', focus: pick('focus', 0), selection: 'off', callout: 'off', scan: 'off', captures: 'off' }),
  },
  {
    id: 'measure', title: 'Measure', desc: 'Extents, numbered callouts and a safe area',
    set: () => ({ frame: pick('frame', 3), meta: pick('meta', 0), steps: 'off', orbit: 'off', camera: 'off', dial: pick('dial', 2), bounds: pick('bounds', 1), focus: pick('focus', 0), selection: pick('selection', 0), callout: pick('callout', 2), scan: 'off', captures: 'off' }),
  },
  {
    id: 'quantum', title: 'Quantum', desc: 'Quantum readouts, the slice index and run history',
    set: () => ({ frame: pick('frame', 0), meta: pick('meta', 3), steps: pick('steps', 1), orbit: 'off', camera: 'off', dial: 'off', bounds: pick('bounds', 2), focus: 'off', selection: pick('selection', 3), callout: pick('callout', 3), scan: pick('scan', 1), captures: pick('captures', 3) }),
  },
  {
    id: 'clean', title: 'Clean', desc: 'Only the steps; nothing over the object',
    set: () => ({ frame: 'off', meta: 'off', steps: pick('steps', 1), orbit: 'off', camera: 'off', dial: 'off', bounds: 'off', focus: 'off', selection: pick('selection', 2), callout: pick('callout', 1), scan: 'off', captures: 'off' }),
  },
]

/** Every family set: the preset's choices, everything else off. */
export function full(c: Composition): Record<string, string> {
  return Object.fromEntries(FAMILIES.map((f) => [f.id, c[f.id] ?? 'off']))
}

export const DEFAULT_COMPOSITION = (): Composition => PRESETS[0].set()

/** Which preset a composition equals, or null (custom). */
export function presetOf(c: Composition): string | null {
  for (const p of PRESETS) {
    const want = p.set()
    if (FAMILIES.every((f) => same(want[f.id], c[f.id]))) return p.id
  }
  return null
}

/** Where a piece was put, as fractions of the view: top-left, or its centre when `c`. `auto`: placed by the
 *  view to keep pieces apart (it may move it again); without it, the user put it there. */
export interface Placement { x: number; y: number; c?: boolean; auto?: boolean; /** auto only: scaled down to fit */ z?: number }
export const TIER_OPACITY = { 1: 1, 2: 0.58, 3: 0.3 } as const

export const keyOf = (m: HudModule) => `${m.family}:${m.id}`
/** Every module a composition turns on, in family order. */
export function chosenOf(compose: Record<string, string | undefined>): HudModule[] {
  return FAMILIES.flatMap((f) => variantsOf(compose, f.id).map((v) => f.modules.find((m) => m.id === v)).filter((m): m is HudModule => !!m))
}

const PAD = 10, EDGE = 24, STEP = 12
/** The visible box of a piece (its body, which carries the size). */
export const boxOf = (p: Element) => (p.querySelector(':scope > .hud-piece__body') ?? p).getBoundingClientRect()
const hits = (x: number, y: number, w: number, h: number, r: DOMRect) => x < r.right + PAD && x + w > r.left - PAD && y < r.bottom + PAD && y + h > r.top - PAD
/** The nearest place on the view where a piece of this size covers nothing in `blockers` and stays inside the
 *  margins, preferring not to cover the model. Top-left as fractions of the view, or null if nothing fits. */
function freeSpot(view: DOMRect, me: DOMRect, blockers: DOMRect[], model: Rect | null): Placement | null {
  const w = me.width, h = me.height
  let best: Placement | null = null, score = Infinity
  for (let y = view.top + EDGE; y + h <= view.bottom - EDGE; y += STEP) {
    for (let x = view.left + EDGE; x + w <= view.right - EDGE; x += STEP) {
      if (blockers.some((r) => hits(x, y, w, h, r))) continue
      let cover = 0
      if (model) {
        const ox = Math.max(0, Math.min(x - view.left + w, model.r) - Math.max(x - view.left, model.l))
        const oy = Math.max(0, Math.min(y - view.top + h, model.b) - Math.max(y - view.top, model.t))
        cover = (ox * oy) / (w * h)
      }
      const sc = Math.hypot(x - me.left, y - me.top) + cover * 700
      if (sc < score) { score = sc; best = { x: (x - view.left) / view.width, y: (y - view.top) / view.height } }
    }
  }
  return best
}
/** Things on screen pieces must not land on: the present bar. */
const fixedBlockers = () => [...document.querySelectorAll('.present-bar')].map((e) => e.getBoundingClientRect())

/** Settles the pieces on the view so none overlaps another or the bar, or runs off it: pieces in `fixed` (and the host's
 *  own controls) stay put and go first; the rest, in reading order, keep their place if it is free or
 *  move to the nearest free spot. Moves are marked `auto` so a later pass may move them again. Returns
 *  how many moved. */
export function settle(root: HTMLElement, model: Rect | null, onMove: (k: string, p: Placement) => void, fixed: (k: string) => boolean, scaleOf: (k: string) => number = () => 1, skip: string | null = null) {
  const view = root.getBoundingClientRect()
  const pieces = [...root.querySelectorAll<HTMLElement>('.hud-piece[data-hud]')]
    .filter((p) => !p.parentElement?.closest('.hud-piece'))
    .map((p) => ({ k: p.dataset.hud!, r: boxOf(p) }))
    .filter((p) => p.r.width > 0 && p.k !== skip)   // a piece only previewed from the library takes no part
  const stays = (k: string) => k.startsWith('chrome:') || fixed(k)
  const order = [...pieces.filter((p) => stays(p.k)), ...pieces.filter((p) => !stays(p.k)).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)]
  const settled: DOMRect[] = fixedBlockers()
  let moved = 0, stuck = 0
  for (const p of order) {
    // a piece that runs off the view (a tall corner stack) needs a place as much as one on top of another
    const outside = p.r.left < view.left - 1 || p.r.top < view.top - 1 || p.r.right > view.right + 1 || p.r.bottom > view.bottom + 1
    if (stays(p.k) || (!outside && !settled.some((r) => hits(p.r.left, p.r.top, p.r.width, p.r.height, r)))) { settled.push(p.r); continue }
    // full size first; when the view is full, smaller (85, 70, 55 %) rather than on top of another piece
    const s0 = scaleOf(p.k), w = p.r.width / s0, h = p.r.height / s0
    let done = false
    for (const z of [1, 0.85, 0.7, 0.55]) {
      const spot = freeSpot(view, new DOMRect(p.r.left, p.r.top, w * z, h * z), settled, model)
      if (!spot) continue
      onMove(p.k, { ...spot, auto: true, z: z < 1 ? z : undefined })
      settled.push(new DOMRect(view.left + spot.x * view.width, view.top + spot.y * view.height, w * z, h * z))
      moved++
      done = true
      break
    }
    if (!done) { stuck++; settled.push(p.r) }
  }
  return { moved, stuck }
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
/** Saves an element as a transparent PNG at 3×, leaving out handles and other controls. */
export async function savePng(el: HTMLElement, name: string, scale = 3) {
  const { toPng } = await import('html-to-image')
  const pi = usePresent.getState().pngInk   // as shown, or forced dark (for light grounds) or light (for dark ones)
  const ink = pi === 'auto' ? null : 'ink-' + pi
  if (ink) el.classList.add(ink)   // re-resolves the theme tokens inside the piece for the capture
  const url = await toPng(el, {
    pixelRatio: scale,
    style: { background: 'none', zoom: el.style.zoom, opacity: el.style.opacity },
    filter: (n) => !(n instanceof Element && n.matches('.hud-piece__bar, [data-no-export], canvas, [data-hud^="chrome:"], .stage__drop, .landing')),
  }).finally(() => { if (ink) el.classList.remove(ink) })
  const a = document.createElement('a')
  a.href = url
  a.download = `quantum-sculptor-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stamp()}.png`
  a.click()
}

/** Lays every piece out afresh for the view's shape (hud/tidy.ts): measures each at its natural size,
 *  then places it on the grid around the object. Object and full-view marks stay as they are. */
export function composeLayout(root: HTMLElement, onMove: (k: string, p: Placement) => void, slotOf: (k: string) => Slot, scaleOf: (k: string) => number, reserve: number): Rect | null {
  const view = root.getBoundingClientRect()
  const boxes = [...root.querySelectorAll<HTMLElement>('.hud-piece[data-hud]')]
    .filter((p) => !p.parentElement?.closest('.hud-piece') && !p.dataset.hud!.startsWith('chrome:'))
    .map((p) => { const r = boxOf(p), z = scaleOf(p.dataset.hud!); return { k: p.dataset.hud!, w: r.width / z, h: r.height / z, slot: slotOf(p.dataset.hud!) } })
    .filter((b) => b.w > 0 && b.h > 0)
  const { placed, hero } = layout(boxes, view.width, view.height, reserve)
  for (const q of placed) onMove(q.k, { x: q.x / view.width, y: q.y / view.height, auto: true, z: q.z < 0.999 ? q.z : undefined })
  return hero
}
