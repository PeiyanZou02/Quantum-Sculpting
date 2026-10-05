// Radiance .hdr (RGBE) reader, enough for the Entanglement Shader's lookup tables: one channel
// (R == G == B), flat or new-style RLE scanlines. Returns row-major floats with the first scanline
// as row 0, which is t = 0 (view angle 0) in the shader. Ported from moduli/lib/hdr.ts.

export interface Lut {
  width: number
  height: number
  data: Float32Array
  max: number
}

export function parseHDR(bytes: Uint8Array): Lut {
  let pos = 0
  const line = (): string => {
    let s = ''
    while (pos < bytes.length) {
      const c = bytes[pos++]
      if (c === 10) break
      s += String.fromCharCode(c)
    }
    return s
  }
  if (!line().startsWith('#?')) throw new Error('Not a Radiance .hdr file')
  for (;;) {
    const l = line()
    if (l === '') break
    if (pos >= bytes.length) throw new Error('Truncated .hdr header')
  }
  const res = line().match(/([-+])Y\s+(\d+)\s+([-+])X\s+(\d+)/)
  if (!res) throw new Error('Unsupported .hdr orientation')
  const height = Number(res[2])
  const width = Number(res[4])
  const data = new Float32Array(width * height)
  const scan = new Uint8Array(width * 4)
  let max = 0
  for (let y = 0; y < height; y++) {
    if (pos + 4 > bytes.length) throw new Error('Truncated .hdr data')
    if (bytes[pos] === 2 && bytes[pos + 1] === 2 && ((bytes[pos + 2] << 8) | bytes[pos + 3]) === width) {
      pos += 4
      for (let ch = 0; ch < 4; ch++) {
        let x = 0
        while (x < width) {
          let count = bytes[pos++]
          if (count > 128) {
            count -= 128
            const v = bytes[pos++]
            for (let i = 0; i < count && x < width; i++) scan[x++ * 4 + ch] = v
          } else {
            for (let i = 0; i < count && x < width; i++) scan[x++ * 4 + ch] = bytes[pos++]
          }
          if (count === 0) throw new Error('Corrupt .hdr scanline')
        }
      }
    } else {
      for (let i = 0; i < width * 4; i++) scan[i] = bytes[pos++]
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3]
      const v = e ? scan[x * 4] * Math.pow(2, e - 136) : 0
      data[y * width + x] = v
      if (v > max) max = v
    }
  }
  return { width, height, data, max }
}
