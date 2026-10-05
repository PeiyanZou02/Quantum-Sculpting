// 344 × 344 processed section with the contour at the level, as in the 03a / 04a inspectors.
import { useEffect, useMemo, useRef, useState } from 'react'
import { section, type Axis, type Grid } from '../qs/grid'

const S = 344

export function SectionMap({ grid, input, axis, index, level, onIndex }: {
  grid: Grid | null; input?: Grid | null; axis: Axis; index: number; level: number; onIndex?: (i: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<[number, number] | null>(null)
  const n = grid?.n ?? 32
  const sec = useMemo(() => (grid ? section(grid, axis, Math.min(index, grid.n - 1)) : null), [grid, axis, index])
  const inSec = useMemo(() => (input ? section(input, axis, Math.min(index, input.n - 1)) : null), [input, axis, index])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = 2
    c.width = S * dpr
    c.height = S * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, S, S)
    const u = S / n
    // faint dot per empty cell
    ctx.fillStyle = 'rgba(21,22,24,.12)'
    for (let v = 0; v < n; v++) for (let x = 0; x < n; x++) ctx.fillRect(x * u + u / 2 - 0.5, (n - 1 - v) * u + u / 2 - 0.5, 1, 1)
    if (!sec) return
    for (let v = 0; v < n; v++)
      for (let x = 0; x < n; x++) {
        const val = Math.min(1, sec[v * n + x])
        if (val <= 0.02) continue
        ctx.fillStyle = `rgba(21,22,24,${(0.08 + val * 0.82).toFixed(3)})`
        ctx.fillRect(x * u + 0.5, (n - 1 - v) * u + 0.5, u - 1, u - 1)
      }
    // marching-squares contour at the level, through cell centres
    const f = (x: number, v: number) => sec[v * n + x] - level
    const P = (x: number, v: number): [number, number] => [x * u + u / 2, (n - 1 - v) * u + u / 2]
    const lerp = (a: [number, number], b: [number, number], fa: number, fb: number): [number, number] => {
      const t = fa / (fa - fb)
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    const contour = (fn: (x: number, v: number) => number, style: string, dash: number[], w: number) => {
      ctx.strokeStyle = style
      ctx.lineWidth = w
      ctx.setLineDash(dash)
      ctx.beginPath()
      for (let v = 0; v < n - 1; v++)
        for (let x = 0; x < n - 1; x++) {
          const c0 = fn(x, v), c1 = fn(x + 1, v), c2 = fn(x + 1, v + 1), c3 = fn(x, v + 1)
          const pts: [number, number][] = []
          const corners: [number, number][] = [P(x, v), P(x + 1, v), P(x + 1, v + 1), P(x, v + 1)]
          const vals = [c0, c1, c2, c3]
          for (let e = 0; e < 4; e++) {
            const a = vals[e], b = vals[(e + 1) % 4]
            if ((a >= 0) !== (b >= 0)) pts.push(lerp(corners[e], corners[(e + 1) % 4], a, b))
          }
          for (let k = 0; k + 1 < pts.length; k += 2) {
            ctx.moveTo(...pts[k])
            ctx.lineTo(...pts[k + 1])
          }
        }
      ctx.stroke()
    }
    if (inSec) contour((x, v) => inSec[v * n + x] - 0.5, '#8B8D93', [2, 3], 1)
    contour(f, '#151618', [], 1.25)
    ctx.setLineDash([])
  }, [sec, inSec, n, level])

  const cell = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * n), v = n - 1 - Math.floor(((e.clientY - r.top) / r.height) * n)
    return x >= 0 && x < n && v >= 0 && v < n ? ([x, v] as [number, number]) : null
  }
  const [hu, hv] = hover ?? [0, 0]
  const coords = axis === 'z' ? `x ${hu} · y ${hv} · z ${index}` : axis === 'x' ? `x ${index} · y ${hu} · z ${hv}` : `x ${hu} · y ${index} · z ${hv}`
  return (
    <div style={{ position: 'relative', width: S, height: S }}
      onPointerMove={(e) => setHover(cell(e))}
      onPointerLeave={() => setHover(null)}
      onWheel={(e) => onIndex?.(Math.max(0, Math.min(n - 1, index + (e.deltaY > 0 ? -1 : 1))))}
    >
      <canvas ref={ref} style={{ width: S, height: S, display: 'block' }} />
      {hover && sec && (
        <>
          <div style={{ position: 'absolute', left: (hu * S) / n, top: ((n - 1 - hv) * S) / n, width: S / n, height: S / n, outline: '1.5px solid var(--qs-ink)', pointerEvents: 'none' }} />
          <span className="qs-small" style={{ position: 'absolute', left: 0, bottom: -18, color: 'var(--qs-ink2)' }}>
            {coords} · {inSec ? `${inSec[hv * n + hu].toFixed(2)} → ` : ''}{sec[hv * n + hu].toFixed(2)}
          </span>
        </>
      )}
    </div>
  )
}
