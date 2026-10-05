import { useState } from 'react'

const wrap360 = (v: number) => ((v % 360) + 360) % 360
const dArc = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180

/** Recent camera positions (az, el), newest last; a new point is kept once the camera moves ≥ 2°. */
export function useCamTrail(tick: number, az: number, el: number, max = 24): [number, number][] {
  const [s, setS] = useState<{ key: string; trail: [number, number][] }>({ key: '', trail: [] })
  // updated while rendering when the camera changes (no effect, so no extra commit)
  const key = `${tick}|${az}|${el}|${max}`
  if (s.key !== key) {
    const t = s.trail, l = t[t.length - 1]
    let trail = t
    if (!(l && Math.abs(dArc(l[0], az)) < 2 && Math.abs(l[1] - el) < 2)) {
      const n: [number, number][] = [...t, [wrap360(az), el]]
      trail = n.length > max ? n.slice(n.length - max) : n
    }
    setS({ key, trail })
  }
  return s.trail
}
