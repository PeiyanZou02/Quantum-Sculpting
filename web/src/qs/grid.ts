/** A dense n³ voxel grid as sent by /api/grid/<which>. numpy C-order: index = (x*n + y)*n + z, z up. */
export interface Grid {
  n: number
  data: Float32Array
}

export const idx = (n: number, x: number, y: number, z: number) => (x * n + y) * n + z
export const at = (g: Grid, x: number, y: number, z: number) => g.data[idx(g.n, x, y, z)]

export type Axis = 'x' | 'y' | 'z'

/** Values of one section, as rows[v][u]: for axis z, u = x and v = y; for x, u = y, v = z; for y, u = x, v = z. */
export function section(g: Grid, axis: Axis, index: number): Float32Array {
  const { n } = g
  const out = new Float32Array(n * n)
  for (let v = 0; v < n; v++)
    for (let u = 0; u < n; u++) {
      const [x, y, z] = axis === 'z' ? [u, v, index] : axis === 'x' ? [index, u, v] : [u, index, v]
      out[v * n + u] = at(g, x, y, z)
    }
  return out
}

/** Cells at or above `level` per layer along an axis. */
export function solidPerLayer(g: Grid, axis: Axis, level = 0.5): number[] {
  const { n } = g
  const counts = new Array(n).fill(0)
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++)
      for (let z = 0; z < n; z++) {
        if (g.data[idx(n, x, y, z)] < level) continue
        counts[axis === 'x' ? x : axis === 'y' ? y : z]++
      }
  return counts
}

/** Histogram of non-empty cells into `bins` bins over (0, 1]. */
export function histogram(g: Grid, bins = 48, floor = 0.5 / 255): number[] {
  const h = new Array(bins).fill(0)
  for (const v of g.data) {
    if (v <= floor) continue
    h[Math.min(bins - 1, Math.floor(Math.min(v, 1) * bins))]++
  }
  return h
}
