// Built-in shapes to start from, made here and opened like any other mesh: about 80 mm across, +Z up,
// closed so they voxelise cleanly. Three primitives, and four Calabi-Yau cross-sections.
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type ShapeId = 'sphere' | 'cube' | 'pyramid' | 'cy3' | 'cy4' | 'cy5' | 'cy6'
export const SHAPES: { id: ShapeId; t: string; d: string }[] = [
  { id: 'sphere', t: 'Sphere', d: 'About 80 mm across.' },
  { id: 'cube', t: 'Cube', d: 'About 80 mm across.' },
  { id: 'pyramid', t: 'Pyramid', d: 'About 80 mm across.' },
  { id: 'cy3', t: 'CY 3', d: 'Calabi-Yau cross-section, degree 3: z₁³ + z₂³ = 1.' },
  { id: 'cy4', t: 'CY 4', d: 'Calabi-Yau cross-section, degree 4: z₁⁴ + z₂⁴ = 1.' },
  { id: 'cy5', t: 'CY 5', d: 'Calabi-Yau cross-section, degree 5: z₁⁵ + z₂⁵ = 1.' },
  { id: 'cy6', t: 'CY 6', d: 'Calabi-Yau cross-section, degree 6: z₁⁶ + z₂⁶ = 1.' },
]
export const cyDegree = (id: ShapeId) => (id.startsWith('cy') ? Number(id.slice(2)) : 0)

/**
 * A Calabi-Yau cross-section, z1^n + z2^n = 1 in C², drawn the way Andrew Hanson projects it to 3D:
 * z1 = e^(2πi k1/n) cos(θ + iξ)^(2/n), z2 = e^(2πi k2/n) sin(θ + iξ)^(2/n), one patch per (k1, k2),
 * then (x, y, z) = (Re z1, Re z2, cos α Im z1 + sin α Im z2). The surface has no thickness, so each patch
 * is made a thin closed slab (both faces and the rim) for the voxeliser to fill.
 */
function calabiYau(n: number, res = 24, thick = 0.1, alpha = Math.PI / 4): THREE.BufferGeometry {
  const m = res + 1
  const pos: number[] = []
  const idx: number[] = []
  const cpow = (re: number, im: number, p: number): [number, number] => {
    const r = Math.hypot(re, im)
    if (r < 1e-9) return [0, 0]
    const a = Math.atan2(im, re) * p, rp = r ** p
    return [rp * Math.cos(a), rp * Math.sin(a)]
  }
  const point = (k1: number, k2: number, th: number, xi: number) => {
    const [c1, c2] = cpow(Math.cos(th) * Math.cosh(xi), -Math.sin(th) * Math.sinh(xi), 2 / n)
    const [s1, s2] = cpow(Math.sin(th) * Math.cosh(xi), Math.cos(th) * Math.sinh(xi), 2 / n)
    const p1 = (2 * Math.PI * k1) / n, p2 = (2 * Math.PI * k2) / n
    const z1 = [c1 * Math.cos(p1) - c2 * Math.sin(p1), c1 * Math.sin(p1) + c2 * Math.cos(p1)]
    const z2 = [s1 * Math.cos(p2) - s2 * Math.sin(p2), s1 * Math.sin(p2) + s2 * Math.cos(p2)]
    return new THREE.Vector3(z1[0], z2[0], Math.cos(alpha) * z1[1] + Math.sin(alpha) * z2[1])
  }
  for (let k1 = 0; k1 < n; k1++)
    for (let k2 = 0; k2 < n; k2++) {
      const P: THREE.Vector3[] = []
      for (let a = 0; a < m; a++)
        for (let b = 0; b < m; b++) P.push(point(k1, k2, (a / res) * (Math.PI / 2), (b / res) * 2 - 1))
      const at = (a: number, b: number) => P[Math.min(res, Math.max(0, a)) * m + Math.min(res, Math.max(0, b))]
      const base = pos.length / 3
      for (const side of [1, -1])
        for (let a = 0; a < m; a++)
          for (let b = 0; b < m; b++) {
            const du = at(a + 1, b).clone().sub(at(a - 1, b)), dv = at(a, b + 1).clone().sub(at(a, b - 1))
            const nrm = du.cross(dv).normalize().multiplyScalar(thick * side)
            const q = at(a, b).clone().add(nrm)
            pos.push(q.x, q.y, q.z)
          }
      const v = (s: number, a: number, b: number) => base + s * m * m + a * m + b
      for (let a = 0; a < res; a++)
        for (let b = 0; b < res; b++) {
          idx.push(v(0, a, b), v(0, a + 1, b), v(0, a, b + 1), v(0, a + 1, b), v(0, a + 1, b + 1), v(0, a, b + 1))
          idx.push(v(1, a, b), v(1, a, b + 1), v(1, a + 1, b), v(1, a + 1, b), v(1, a, b + 1), v(1, a + 1, b + 1))
        }
      // the rim joins the two faces all the way round
      const ring: [number, number][] = []
      for (let a = 0; a < res; a++) ring.push([a, 0])
      for (let b = 0; b < res; b++) ring.push([res, b])
      for (let a = res; a > 0; a--) ring.push([a, res])
      for (let b = res; b > 0; b--) ring.push([0, b])
      ring.forEach(([a, b], i) => {
        const [c, d] = ring[(i + 1) % ring.length]
        idx.push(v(0, a, b), v(1, a, b), v(0, c, d), v(0, c, d), v(1, a, b), v(1, c, d))
      })
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeBoundingBox()
  const size = g.boundingBox!.getSize(new THREE.Vector3())
  return g.scale(80 / Math.max(size.x, size.y, size.z), 80 / Math.max(size.x, size.y, size.z), 80 / Math.max(size.x, size.y, size.z))
}

function geometry(id: ShapeId): THREE.BufferGeometry {
  switch (id) {
    case 'sphere': return new THREE.SphereGeometry(40, 96, 64)
    case 'cube': return new THREE.BoxGeometry(70, 70, 70)
    // three.js builds round solids along +Y: turn the pyramid to stand on +Z
    case 'pyramid': return new THREE.ConeGeometry(48, 72, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI / 2)
    default: return calabiYau(cyDegree(id))
  }
}

/** The shape as a binary STL file. */
export function shapeFile(id: ShapeId): File {
  const raw = geometry(id)
  const g = mergeVertices(raw.getAttribute('uv') ? raw.deleteAttribute('normal').deleteAttribute('uv') : raw)
  g.computeVertexNormals()
  const data = new STLExporter().parse(new THREE.Mesh(g), { binary: true }) as DataView
  return new File([data.buffer as ArrayBuffer], `${id}.stl`, { type: 'model/stl' })
}
