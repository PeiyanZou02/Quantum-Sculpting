// Colours of a section through the grid, for the section map and the cutting plane in the view. Grey
// ramps the value from the ground to the ink, as on Peiyan's page; Heat runs it through a perceptual
// colour scale; Nations paints each cell in its nation's colour (Evolve); Diffusion draws the field as
// the blur leaves it, smooth between cells, coloured, with the level's contour (Peiyan's slice, in
// colour). What the section cuts through is set apart: the voxels, the result, or the mesh (the result
// filled where it passes the level, as the printed part would be cut).
import { nationColor, type Theme } from '../view/nations'
import type { Axis, Grid } from './grid'
import { useStore } from '../store'

export type SliceColor = 'auto' | 'grey' | 'heat' | 'diffusion' | 'nations'
export const SLICE_COLORS: { value: SliceColor; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'grey', label: 'Grey' }, { value: 'heat', label: 'Heat' }, { value: 'diffusion', label: 'Diffusion' }, { value: 'nations', label: 'Nations' },
]
/** What the section cuts: Auto follows the view on screen. */
export type SliceOf = 'auto' | 'voxels' | 'result' | 'mesh'
export const SLICE_OF: { value: SliceOf; label: string }[] = [
  { value: 'auto', label: 'Auto' }, { value: 'voxels', label: 'Voxels' }, { value: 'result', label: 'Result' }, { value: 'mesh', label: 'Mesh' },
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

/** Whether a section is drawn smooth (sectionSmooth) rather than one colour per cell. */
export const smoothSection = (scheme: Exclude<SliceColor, 'auto'>, of: SliceOf) => scheme === 'diffusion' || of === 'mesh'

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
      const nations = scheme === 'nations' && !!owner && owner.length === g.data.length
      const who = nations ? owner[i] : 0
      // in Evolve a cell is drawn only if a nation holds it this turn (the grid is the final shape)
      if (nations ? !who : val <= 0.02) continue
      let c: RGB
      if (who) {
        if (!pal.has(who)) pal.set(who, hex(nationColor(who - 1, theme)))
        c = pal.get(who)!
      } else if (scheme === 'heat' || scheme === 'diffusion') c = heat(val)
      else c = [0, 1, 2].map((k) => bg[k] + (ink[k] - bg[k]) * val) as RGB
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]
      out[o + 3] = who ? 255 : scheme === 'heat' || scheme === 'diffusion' ? Math.round(80 + 175 * val) : 255
    }
  return out
}

/** Samples per cell for the smooth sections (diffusion, mesh). */
const K = 6

/**
 * A smooth section image, (n·K)² RGBA, rows bottom-up like sectionRGBA: the field interpolated between
 * cell centres. `diffusion` colours it on the heat scale (clear where empty) with the level's contour
 * in ink; `mesh` fills it where it passes the level (in the nation's colour in Evolve, else the
 * surface grey) and draws the outline.
 */
export function sectionSmooth(g: Grid, axis: Axis, index: number, kind: 'diffusion' | 'mesh', level: number, theme: Theme, owner?: Uint8Array | null): { rgba: Uint8ClampedArray; size: number } {
  const n = g.n, k = n * K > 640 ? Math.max(1, Math.floor(640 / n)) : K, S = n * k
  const out = new Uint8ClampedArray(S * S * 4)
  const css = getComputedStyle(document.documentElement)
  const ink = hex(css.getPropertyValue('--qs-ink').trim() || '#161616')
  const surface: RGB = theme === 'dark' ? [0x9A, 0x9C, 0xA2] : [0xC9, 0xCB, 0xD0]
  const idx = Math.min(index, n - 1)
  const val = (u: number, v: number) => {
    const [x, y, z] = cellAt(axis, idx, Math.max(0, Math.min(n - 1, u)), Math.max(0, Math.min(n - 1, v)))
    return g.data[(x * n + y) * n + z]
  }
  // the field at every sample, then colours and the contour where it crosses the level
  const f = new Float32Array(S * S)
  for (let py = 0; py < S; py++)
    for (let px = 0; px < S; px++) {
      const u = (px + 0.5) / k - 0.5, v = (py + 0.5) / k - 0.5
      const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0
      f[py * S + px] = (val(u0, v0) * (1 - fu) + val(u0 + 1, v0) * fu) * (1 - fv) + (val(u0, v0 + 1) * (1 - fu) + val(u0 + 1, v0 + 1) * fu) * fv
    }
  const pal = new Map<number, RGB>()
  const nation = (px: number, py: number): RGB | null => {
    if (!owner || owner.length !== g.data.length) return null
    const [x, y, z] = cellAt(axis, idx, Math.min(n - 1, Math.floor(px / k)), Math.min(n - 1, Math.floor(py / k)))
    const who = owner[(x * n + y) * n + z]
    if (!who) return null
    if (!pal.has(who)) pal.set(who, hex(nationColor(who - 1, theme)))
    return pal.get(who)!
  }
  for (let py = 0; py < S; py++)
    for (let px = 0; px < S; px++) {
      const i = py * S + px, o = i * 4, a = f[i]
      const inside = a >= level
      const edge = (px + 1 < S && (f[i + 1] >= level) !== inside) || (py + 1 < S && (f[i + S] >= level) !== inside)
      let c: RGB | null = null, al = 0
      if (edge) { c = ink; al = 255 }
      else if (kind === 'diffusion') {
        if (a > 0.02) { c = heat(Math.min(1, a)); al = Math.round(60 + 195 * Math.min(1, a)) }
      } else if (inside) { c = nation(px, py) ?? surface; al = 255 }
      if (!c) continue
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = al
    }
  return { rgba: out, size: S }
}

/** The scheme and Evolve frame for a section of the shown result (`processed`) or of the input voxels. */
export function useSliceScheme(processed: boolean): { scheme: Exclude<SliceColor, 'auto'>; owner: Uint8Array | null } {
  const choice = useStore((s) => s.sliceColor)
  const owner = useStore((s) => (processed && s.proc?.mode === 'nations' ? s.evolve.owner ?? null : null))
  return { scheme: resolveSliceColor(choice, !!owner), owner }
}

/** What a section shows, resolved: the grid it cuts (and the input under a result, for readouts), the
 *  level its contour follows, its colours, and how it is drawn (cells, diffusion or mesh). */
export interface SectionSrc {
  grid: Grid | null; input: Grid | null; processed: boolean; level: number
  scheme: Exclude<SliceColor, 'auto'>; owner: Uint8Array | null; kind: 'cells' | 'diffusion' | 'mesh'
}
export function useSection(): SectionSrc {
  const gridData = useStore((s) => s.gridData), procData = useStore((s) => s.procData)
  const view = useStore((s) => s.view), of = useStore((s) => s.sliceOf), lv = useStore((s) => s.m.level)
  // Auto: the voxels under the model and the voxels, the result under it, the mesh's own cut under the mesh
  const want = of !== 'auto' ? of : view === 'processed' || view === 'scan' ? 'result' : view === 'result' ? 'mesh' : 'voxels'
  const processed = want !== 'voxels' && !!procData
  const { scheme, owner } = useSliceScheme(processed)
  const kind = want === 'mesh' ? 'mesh' : scheme === 'diffusion' ? 'diffusion' : 'cells'
  return { grid: processed ? procData : gridData, input: processed ? gridData : null, processed, level: processed ? lv : 0.5, scheme, owner, kind }
}
