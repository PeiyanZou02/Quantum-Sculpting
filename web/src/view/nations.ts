// Evolve (app/nations.py): nations are voxel regions, one qubit each. Here: their colours, names and
// the helpers that paint a territory frame onto the instanced voxels.
//
// Palette: 16 muted hues in OKLCH (C 0.11, two lightness steps), every hue 22.5° apart, put in an
// order where neighbouring ids are far apart in hue and lightness. Validated with the dataviz
// validator (adjacent pairs): light ground #E3E4E7 — normal-vision ΔE ≥ 20.3, protan/deutan ΔE ≥ 9.9;
// dark ground #141517 — normal ΔE ≥ 20.3, CVD ΔE ≥ 9.7, every colour ≥ 3:1 against the ground.
// On the light ground several sit just under 3:1, so a nation is never colour-alone: it always
// carries its letter. Colour follows the nation id, never its rank or how many are alive.
// Ids 16–23 (nations born late in a long history) reuse slots 0–7 one lightness step darker.
import type { Grid } from '../qs/grid'

export type Theme = 'light' | 'dark'

/** Nation colours on the light ground, by nation id (0–15). */
export const NATION_COLORS: string[] = [
  '#c36e86', '#6d761c', '#3772ac', '#a48a32', '#2e99c0', '#985383', '#18a292', '#c2764f',
  '#7587cf', '#a5524d', '#08a2af', '#976213', '#7460a7', '#218258', '#a876b8', '#6b9c58',
]
/** The same hues stepped for the dark ground. */
export const NATION_COLORS_DARK: string[] = [
  '#c9748c', '#737c24', '#3d78b2', '#aa9039', '#369fc7', '#9f5989', '#25a898', '#c97c55',
  '#7b8dd6', '#ac5853', '#08a2af', '#9d671c', '#7966ae', '#29885e', '#ae7cbe', '#71a25e',
]
const LATE_LIGHT = ['#a25169', '#515803', '#16558c', '#856c02', '#037a9e', '#793765', '#028073', '#a15831']
const LATE_DARK = ['#af5c75', '#626a09', '#2a669f', '#91781a', '#0d86ad', '#8c4877', '#098e7f', '#ae643d']
/** Voxels that belong to no nation in the frame (matches the engine's plain voxel grey). */
export const NO_NATION: Record<Theme, string> = { light: '#C9CBD0', dark: '#9A9CA2' }

/** At most 24 nations over a history (nations.MAX_TOTAL), named A–X as in Peiyan's page. */
export const NATION_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWX'
export const nationName = (i: number) => NATION_NAMES[i] ?? `N${i + 1}`

/** Colour of nation `i` (0-based id) as a CSS hex string. */
export function nationColor(i: number, theme: Theme = 'light'): string {
  if (!(i >= 0)) return NO_NATION[theme]
  const slot = i % 16
  if (i < 16) return (theme === 'dark' ? NATION_COLORS_DARK : NATION_COLORS)[slot]
  return (theme === 'dark' ? LATE_DARK : LATE_LIGHT)[slot % 8]
}

// sRGB hex → linear RGB, the working space three.js keeps instance colours in (ColorManagement on).
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linear = (hex: string) => [1, 3, 5].map((k) => toLinear(parseInt(hex.slice(k, k + 2), 16) / 255))
const tables: Partial<Record<Theme, Float32Array>> = {}
/** Linear RGB per owner byte: index 0 is no nation, b = id + 1 is nation id. */
function table(theme: Theme) {
  let t = tables[theme]
  if (!t) {
    t = new Float32Array(256 * 3)
    for (let b = 0; b < 256; b++) t.set(linear(nationColor(b - 1, theme)), b * 3)
    tables[theme] = t
  }
  return t
}

/**
 * Instance colours for the voxels the engine drew: `cells` are the x, y, z, value quads that
 * Engine.setVoxels keeps in mesh.userData.cells; `owner` is a full n³ frame of owner + 1 (0 = empty),
 * indexed (x·n + y)·n + z. Returns linear RGB triples, one per cell, ready for mesh.instanceColor.
 * Cells the frame leaves empty get the plain voxel grey.
 */
export function ownerToColors(owner: Uint8Array, cells: number[], n: number, theme: Theme = 'light'): Float32Array {
  const t = table(theme)
  const count = Math.floor(cells.length / 4)
  const out = new Float32Array(count * 3)
  const n2 = n * n
  for (let k = 0; k < count; k++) {
    const x = cells[k * 4], y = cells[k * 4 + 1], z = cells[k * 4 + 2]
    const b = x >= 0 && y >= 0 && z >= 0 && x < n && y < n && z < n ? owner[x * n2 + y * n + z] : 0
    out[k * 3] = t[b * 3]
    out[k * 3 + 1] = t[b * 3 + 1]
    out[k * 3 + 2] = t[b * 3 + 2]
  }
  return out
}

/** The territory of one frame as a solid grid (1 where any nation owns the cell), for Engine.setVoxels
 *  at level 0.5, so the shape on screen is the shape of the turn on screen (procData is the last turn). */
export function ownerGrid(owner: Uint8Array, n: number): Grid {
  const data = new Float32Array(n * n * n)
  for (let i = 0; i < data.length; i++) data[i] = owner[i] ? 1 : 0
  return { n, data }
}
