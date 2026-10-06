// What a mesh is painted with under value and entanglement shading (Engine.paintMesh): in Evolve, the
// nation whose cells the surface touches; otherwise how dense the quantum result is just under the
// surface (the denser, the deeper the colour, the thicker the film).
import * as THREE from 'three'
import { Engine } from '../view/engine'

type G = { n: number; data: Float32Array }

/** The grid's value at a point (cell centres on whole numbers), trilinear, 0 outside. */
function at(g: G, x: number, y: number, z: number): number {
  const { n, data } = g, n2 = n * n
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z)
  const fx = x - x0, fy = y - y0, fz = z - z0
  let v = 0
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    const a = x0 + i, b = y0 + j, c = z0 + k
    if (a < 0 || b < 0 || c < 0 || a >= n || b >= n || c >= n) continue
    v += data[a * n2 + b * n + c] * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz)
  }
  return v
}

/** The value most dense cells stay under (95th percentile of the cells at or above the level): the top
 *  of the value ramp, so the colours spread over what the result really holds. */
export function peakOf(g: G, level: number): number {
  const v: number[] = []
  for (let i = 0; i < g.data.length; i += 3) if (g.data[i] >= level) v.push(g.data[i])
  if (!v.length) return 1
  v.sort((a, b) => a - b)
  return Math.max(level + 1e-3, v[Math.floor(v.length * 0.95)])
}

/** Density under the surface: the larger of the samples a cell in and a cell out along the normal
 *  (one of them is inside), from the level up to `peak`. */
export function densityPaint(g: G, level: number, peak = 1) {
  const c = new THREE.Color()
  return (p: THREE.Vector3, nv: THREE.Vector3) => {
    const v = Math.max(at(g, p.x + nv.x, p.y + nv.y, p.z + nv.z), at(g, p.x - nv.x, p.y - nv.y, p.z - nv.z))
    return Engine.ramp((v - level) / Math.max(1e-6, peak - level), c)
  }
}

/** The nation the surface touches: the nearest owned cell around the vertex, inward first. */
export function nationPaint(owner: Uint8Array, n: number, palette: Float32Array) {
  const c = new THREE.Color(), n2 = n * n
  const cell = (x: number, y: number, z: number) => {
    const a = Math.round(x), b = Math.round(y), d = Math.round(z)
    return a < 0 || b < 0 || d < 0 || a >= n || b >= n || d >= n ? 0 : owner[a * n2 + b * n + d]
  }
  return (p: THREE.Vector3, nv: THREE.Vector3) => {
    let o = cell(p.x - nv.x * 0.6, p.y - nv.y * 0.6, p.z - nv.z * 0.6) || cell(p.x, p.y, p.z)
    for (let r = 1; !o && r <= 2; r++)
      for (let i = -r; i <= r && !o; i++) for (let j = -r; j <= r && !o; j++) for (let k = -r; k <= r && !o; k++) o = cell(p.x + i, p.y + j, p.z + k)
    if (!o) return null
    return c.setRGB(palette[o * 3], palette[o * 3 + 1], palette[o * 3 + 2])
  }
}
