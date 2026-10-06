// The STL on the website: made in the browser from the mesh on screen and saved to the visitor's downloads.

const files = new Map<string, string>()
export const savedFile = (name: string) => files.get(name)
export function keepFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  files.set(name, url)
  return url
}

/** A binary STL of a mesh: 80-byte header, the triangle count, then per triangle its normal and three corners. */
export function stlOf(mesh: { vertices: Float32Array; faces: Uint32Array }): Blob {
  const { vertices: v, faces: f } = mesh
  const n = f.length / 3
  const out = new DataView(new ArrayBuffer(84 + n * 50))
  out.setUint32(80, n, true)
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50
    const [a, b, c] = [f[t * 3] * 3, f[t * 3 + 1] * 3, f[t * 3 + 2] * 3]
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const len = Math.hypot(nx, ny, nz) || 1
    ;[nx / len, ny / len, nz / len].forEach((x, i) => out.setFloat32(o + i * 4, x, true))
    ;[a, b, c].forEach((p, k) => { for (let i = 0; i < 3; i++) out.setFloat32(o + 12 + k * 12 + i * 4, v[p + i], true) })
  }
  return new Blob([out.buffer], { type: 'model/stl' })
}
