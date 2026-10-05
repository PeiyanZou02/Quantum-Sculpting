// Colours of a section through the grid, one per cell, for the section map and the cutting plane in
// the view. Grey ramps the value from the ground to the ink, as on Peiyan's page; Heat runs it through
// a perceptual colour scale; Nations paints each cell in its nation's colour (Evolve).
import { nationColor, type Theme } from '../view/nations'
import type { Axis, Grid } from './grid'
import { useStore } from '../store'

export type SliceColor = 'auto' | 'grey' | 'heat' | 'nations'
export const SLICE_COLORS: { value: SliceColor; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'grey', label: 'Grey' }, { value: 'heat', label: 'Heat' }, { value: 'nations', label: 'Nations' },
]

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)) as RGB
/** Viridis at five stops: dark, readable on both grounds, and kind to colour-blind eyes. */
const HEAT = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'].map(hex)
function heat(t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (HEAT.length - 1)
  const i = Math.min(HEAT.length - 2, Math.floor(x)), f = x - i
  return [0, 1, 2].map((c) => HEAT[i][c] + (HEAT[i + 1][c] - HEAT[i][c]) * f) as RGB
}

/** The colour scheme a choice resolves to: Auto is Nations while an Evolve turn is on screen, else Grey. */
export const resolveSliceColor = (c: SliceColor, nations: boolean): Exclude<SliceColor, 'auto'> =>
  c === 'auto' ? (nations ? 'nations' : 'grey') : c === 'nations' && !nations ? 'grey' : c

/** The cell of the grid at section position (u, v), as section() in grid.ts reads it. */
const cellAt = (axis: Axis, index: number, u: number, v: number): [number, number, number] =>
  axis === 'z' ? [u, v, index] : axis === 'x' ? [index, u, v] : [u, index, v]

/**
 * RGBA per section cell (n × n, row v, column u, as section() lays it out). Empty cells are clear;
 * `owner` is Evolve's frame (owner + 1 per cell, 0 empty), indexed (x·n + y)·n + z.
 */
export function sectionRGBA(g: Grid, axis: Axis, index: number, scheme: Exclude<SliceColor, 'auto'>, theme: Theme, owner?: Uint8Array | null): Uint8ClampedArray {
  const n = g.n, out = new Uint8ClampedArray(n * n * 4)
  const css = getComputedStyle(document.documentElement)
  const bg = hex(css.getPropertyValue('--qs-bg').trim() || '#F4F4F4'), ink = hex(css.getPropertyValue('--qs-ink').trim() || '#161616')
  const pal = new Map<number, RGB>()
  for (let v = 0; v < n; v++)
    for (let u = 0; u < n; u++) {
      const [x, y, z] = cellAt(axis, Math.min(index, n - 1), u, v)
      const i = (x * n + y) * n + z
      const val = Math.min(1, Math.max(0, g.data[i]))
      const o = (v * n + u) * 4
      const who = scheme === 'nations' && owner && owner.length === g.data.length ? owner[i] : 0
      if (val <= 0.02 && !who) continue
      let c: RGB
      if (who) {
        if (!pal.has(who)) pal.set(who, hex(nationColor(who - 1, theme)))
        c = pal.get(who)!
      } else if (scheme === 'heat') c = heat(val)
      else c = [0, 1, 2].map((k) => bg[k] + (ink[k] - bg[k]) * val) as RGB
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]
      out[o + 3] = who ? 255 : scheme === 'heat' ? Math.round(80 + 175 * val) : 255
    }
  return out
}

/** The scheme and Evolve frame for a section of the shown result (`processed`) or of the input voxels. */
export function useSliceScheme(processed: boolean): { scheme: Exclude<SliceColor, 'auto'>; owner: Uint8Array | null } {
  const choice = useStore((s) => s.sliceColor)
  const owner = useStore((s) => (processed && s.proc?.mode === 'nations' ? s.evolve.owner ?? null : null))
  return { scheme: resolveSliceColor(choice, !!owner), owner }
}
