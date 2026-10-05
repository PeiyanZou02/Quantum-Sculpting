// Data and runtime, from design/handoff/QLData4.dc.html ("08 Data and runtime"): figures for the mesh
// level, the density floor, the runtime block (run header, steps, log, runs) and more views of the
// data: tiles, signed distance on the slice, voxel values and a level sweep.
// Everything is derived here from HudCtx (the raw grids, the log, the run and job metadata) and memoised
// on the grid's array, so it stays quick from 32³ to 128³. Nothing here makes a request.
import { Component, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ErrorInfo, ReactNode, PointerEvent as RPointerEvent } from 'react'
import { histogram, section, type Axis } from '../qs/grid'
import type { HudCtx } from './types'
import { useNow } from '../useNow'
import './datamarks.css'

type G = { n: number; data: Float32Array }
type Tiling = 'cube' | 'layers'

// ── small helpers ──────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const int = (v: number) => Math.round(v).toLocaleString('en-US')
const f2 = (v: number) => v.toFixed(2)
const minus = (v: number, d = 2) => (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d)
const N = ({ children }: { children: ReactNode }) => <span className="qdm-n">{children}</span>

/** Seconds as a short duration. */
function dur(s: number) {
  if (!Number.isFinite(s) || s < 0) return '—'
  if (s < 1) return `${Math.max(0, Math.round(s * 1000))} ms`
  if (s < 60) return `${s.toFixed(1)} s`
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(0).padStart(2, '0')}`
}
const clock = (t: number) => {
  const d = new Date(t < 1e11 ? t * 1000 : t)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':')
}
const bytes = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)
const compact = (v: number) => (v < 1000 ? String(v) : v < 1e6 ? `${(v / 1000).toFixed(v < 1e4 ? 1 : 0)}k` : `${(v / 1e6).toFixed(1)}M`)
const MODE: Record<string, string> = { gaussian: 'gaussian', emulator: 'emulation', atlas: 'atlas', nations: 'evolve' }
const modeWord = (m?: string | null) => (m ? MODE[m] ?? m : '—')

/** Results keyed by the grid's array: every module and every re-render shares them. */
const memo = new WeakMap<object, Map<string, unknown>>()
function cached<T>(owner: object, key: string, fn: () => T): T {
  let m = memo.get(owner)
  if (!m) memo.set(owner, (m = new Map()))
  if (m.has(key)) return m.get(key) as T
  const v = fn()
  if (m.size >= 48) m.delete(m.keys().next().value as string)
  m.set(key, v)
  return v
}

/** A family's piece keeps rendering even if one computation trips over odd data. */
export class Safe extends Component<{ children: ReactNode; data: unknown }, { err: boolean; data: unknown }> {
  state = { err: false, data: this.props.data }
  static getDerivedStateFromError() { return { err: true } }
  // new data gets a fresh try
  static getDerivedStateFromProps(p: { data: unknown }, s: { data: unknown }) { return p.data !== s.data ? { err: false, data: p.data } : null }
  componentDidCatch(e: Error, info: ErrorInfo) { console.warn('datamarks:', e.message, info.componentStack) }
  render() { return this.state.err ? <span className="qdm-empty">Nothing to show here.</span> : this.props.children }
}

function Box({ title, sub, right, w, children }: { title: string; sub?: ReactNode; right?: ReactNode; w?: number; children: ReactNode }) {
  return (
    <div className="qdm" style={w ? { width: w } : undefined}>
      <div className="qdm-head">
        <span className="qdm-t">{title}{sub != null && <span className="qdm-t__sub"> · {sub}</span>}</span>
        {right != null && <span className="qdm-r">{right}</span>}
      </div>
      {children}
    </div>
  )
}
const Empty = ({ children }: { children: ReactNode }) => <span className="qdm-empty">{children}</span>

// ── derived data ───────────────────────────────────────────────────────────────────────────────

/** Cells at or above each of 1000 steps over 0–1 (suffix counts): kept(L) for any level in O(1). */
const FB = 1000
function fineSuffix(g: G): Float64Array {
  return cached(g.data, 'fine', () => {
    const h = new Float64Array(FB + 1)
    const d = g.data
    for (let i = 0; i < d.length; i++) {
      const v = d[i]
      if (v > 0) h[Math.min(FB - 1, Math.floor(v * FB))]++
    }
    for (let b = FB - 1; b >= 0; b--) h[b] += h[b + 1]
    return h
  })
}
const keptAt = (suf: Float64Array, L: number) => suf[clamp(Math.ceil(L * FB - 1e-6), 0, FB)]

/** Solid cells of the input (the coverage total, as the service reports it). */
function inputSolid(ctx: HudCtx): number {
  if (ctx.grid) return ctx.grid.solid
  const g = ctx.data.grid
  if (!g) return 0
  return cached(g.data, 'sum', () => {
    let s = 0
    for (let i = 0; i < g.data.length; i++) s += g.data[i]
    return Math.round(s)
  })
}

/** Connected parts (6-neighbour) of the cells at or above L. */
function partsAt(g: G, L: number): number {
  return cached(g.data, 'parts' + L.toFixed(3), () => {
    const { n, data } = g
    const nn = n * n, total = nn * n
    const seen = new Uint8Array(total)
    const stack = new Int32Array(total)
    let count = 0
    for (let i = 0; i < total; i++) {
      if (seen[i] || !(data[i] >= L)) continue
      count++
      let sp = 0
      stack[sp++] = i
      seen[i] = 1
      while (sp) {
        const c = stack[--sp]
        const z = c % n, y = Math.floor(c / n) % n, x = Math.floor(c / nn)
        const nb = [z > 0 ? c - 1 : -1, z < n - 1 ? c + 1 : -1, y > 0 ? c - n : -1, y < n - 1 ? c + n : -1, x > 0 ? c - nn : -1, x < n - 1 ? c + nn : -1]
        for (const j of nb) if (j >= 0 && !seen[j] && data[j] >= L) { seen[j] = 1; stack[sp++] = j }
      }
    }
    return count
  })
}

// Signed distance on one section (voxels, negative inside), as the level-set mesh sees the field at a
// level. Cells beside the surface get a sub-voxel distance from where the field crosses the level along
// each axis; each projects to a point on the surface along the field's gradient. Every cell of the
// section then takes its distance to the nearest of those points within BAND + 1 cells (exact in the
// band, like the service's level set); farther cells only keep their side.
const BAND = 3, REACH = BAND + 1
function sliceSdf(g: G, L: number, axis: Axis, index: number): Float32Array {
  return cached(g.data, `ssdf${L.toFixed(3)}${axis}${index}`, () => {
    const { n, data } = g
    const ax = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
    const at = (x: number, y: number, z: number) => data[(clamp(x, 0, n - 1) * n + clamp(y, 0, n - 1)) * n + clamp(z, 0, n - 1)]
    const lo = Math.max(0, index - REACH), hi = Math.min(n - 1, index + REACH)
    const span = [n, n, n]
    span[ax] = hi - lo + 1
    // surface point per cell of the slab, or NaN
    const P = new Float32Array(span[0] * span[1] * span[2] * 3).fill(NaN)
    const pi = (x: number, y: number, z: number) => ((x - (ax === 0 ? lo : 0)) * span[1] + (y - (ax === 1 ? lo : 0))) * span[2] + (z - (ax === 2 ? lo : 0))
    const c = [0, 0, 0]
    for (c[0] = ax === 0 ? lo : 0; c[0] <= (ax === 0 ? hi : n - 1); c[0]++)
      for (c[1] = ax === 1 ? lo : 0; c[1] <= (ax === 1 ? hi : n - 1); c[1]++)
        for (c[2] = ax === 2 ? lo : 0; c[2] <= (ax === 2 ? hi : n - 1); c[2]++) {
          const [x, y, z] = c
          const v0 = at(x, y, z), ins = v0 >= L, p0 = L - v0
          let inv = 0
          for (let a = 0; a < 3; a++) {
            let best = Infinity
            for (const dir of [-1, 1]) {
              const k = c[a] + dir
              if (k < 0 || k >= n) continue
              const v1 = a === 0 ? at(k, y, z) : a === 1 ? at(x, k, z) : at(x, y, k)
              if (v1 >= L === ins) continue
              const t = p0 / (p0 - (L - v1))
              if (t < best) best = t
            }
            if (best < Infinity) inv += 1 / Math.max(best, 1e-3) ** 2
          }
          if (!inv) continue
          const d = 1 / Math.sqrt(inv)
          let gx = at(x - 1, y, z) - at(x + 1, y, z), gy = at(x, y - 1, z) - at(x, y + 1, z), gz = at(x, y, z - 1) - at(x, y, z + 1)
          const gl = Math.hypot(gx, gy, gz)
          if (gl < 1e-9) continue
          gx /= gl; gy /= gl; gz /= gl // outward
          const s = ins ? d : -d
          const o = pi(x, y, z) * 3
          P[o] = x + gx * s; P[o + 1] = y + gy * s; P[o + 2] = z + gz * s
        }
    const out = new Float32Array(n * n)
    for (let v = 0; v < n; v++)
      for (let u = 0; u < n; u++) {
        const p = axis === 'z' ? [u, v, index] : axis === 'x' ? [index, u, v] : [u, index, v]
        let best = Infinity
        const x0 = Math.max(ax === 0 ? lo : 0, p[0] - REACH), x1 = Math.min(ax === 0 ? hi : n - 1, p[0] + REACH)
        const y0 = Math.max(ax === 1 ? lo : 0, p[1] - REACH), y1 = Math.min(ax === 1 ? hi : n - 1, p[1] + REACH)
        const z0 = Math.max(ax === 2 ? lo : 0, p[2] - REACH), z1 = Math.min(ax === 2 ? hi : n - 1, p[2] + REACH)
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++)
            for (let z = z0; z <= z1; z++) {
              const o = pi(x, y, z) * 3
              const qx = P[o]
              if (qx !== qx) continue
              const dd = (qx - p[0]) ** 2 + (P[o + 1] - p[1]) ** 2 + (P[o + 2] - p[2]) ** 2
              if (dd < best) best = dd
            }
        const d = Math.min(Math.sqrt(best), REACH + 0.5)
        out[v * n + u] = at(p[0], p[1], p[2]) >= L ? -d : d
      }
    return out
  })
}

// Marching squares over an n×n section (rows v up), sampled at cell centres with the border repeated,
// so fills reach the edges. Coordinates in px of a size × size box, y down.
function lattice(n: number, size: number) {
  const px = size / n
  const X = new Float64Array(n + 2)
  X[0] = 0
  for (let i = 0; i < n; i++) X[i + 1] = (i + 0.5) * px
  X[n + 1] = size
  return X
}
type Val = (a: number, b: number) => number
const pt = (x: number, y: number) => `${+x.toFixed(1)} ${+y.toFixed(1)}`

/** Region where val < t, as one path (runs of whole cells merged). */
function isoFill(val: Val, X: Float64Array, Y: Float64Array, H: number, t: number): string {
  let p = ''
  const ma = X.length - 1, mb = Y.length - 1
  for (let b = 0; b < mb; b++) {
    const y0 = H - Y[b], y1 = H - Y[b + 1]
    let run = -1
    for (let a = 0; a <= ma; a++) {
      const full = a < ma && val(a, b) < t && val(a + 1, b) < t && val(a + 1, b + 1) < t && val(a, b + 1) < t
      if (full) { if (run < 0) run = a; continue }
      if (run >= 0) { p += `M${pt(X[run], y0)}H${+X[a].toFixed(1)}V${+y1.toFixed(1)}H${+X[run].toFixed(1)}Z`; run = -1 }
      if (a === ma) break
      const fs = [val(a, b), val(a + 1, b), val(a + 1, b + 1), val(a, b + 1)]
      if (fs.every((f) => f >= t)) continue
      const xs = [X[a], X[a + 1], X[a + 1], X[a]], ys = [y0, y0, y1, y1]
      let first = true
      for (let e = 0; e < 4; e++) {
        const e1 = (e + 1) % 4
        if (fs[e] < t) { p += (first ? 'M' : 'L') + pt(xs[e], ys[e]); first = false }
        if (fs[e] < t !== fs[e1] < t) {
          const k = (t - fs[e]) / (fs[e1] - fs[e])
          p += (first ? 'M' : 'L') + pt(xs[e] + (xs[e1] - xs[e]) * k, ys[e] + (ys[e1] - ys[e]) * k)
          first = false
        }
      }
      p += 'Z'
    }
  }
  return p
}
/** The line val = t, as segments. */
function isoLine(val: Val, X: Float64Array, Y: Float64Array, H: number, t: number): string {
  let p = ''
  for (let b = 0; b < Y.length - 1; b++) {
    const y0 = H - Y[b], y1 = H - Y[b + 1]
    for (let a = 0; a < X.length - 1; a++) {
      const fs = [val(a, b), val(a + 1, b), val(a + 1, b + 1), val(a, b + 1)]
      const xs = [X[a], X[a + 1], X[a + 1], X[a]], ys = [y0, y0, y1, y1]
      const hits: string[] = []
      for (let e = 0; e < 4; e++) {
        const e1 = (e + 1) % 4
        if (fs[e] < t !== fs[e1] < t) {
          const k = (t - fs[e]) / (fs[e1] - fs[e])
          hits.push(pt(xs[e] + (xs[e1] - xs[e]) * k, ys[e] + (ys[e1] - ys[e]) * k))
        }
      }
      for (let k = 0; k + 1 < hits.length; k += 2) p += `M${hits[k]}L${hits[k + 1]}`
    }
  }
  return p
}
/** Lattice value lookup for a w×h window of a section (border repeated). */
const windowVal = (sec: Float32Array, n: number, u0: number, v0: number, w: number, h: number, off = 0): Val =>
  (a, b) => sec[(v0 + clamp(b - 1, 0, h - 1)) * n + u0 + clamp(a - 1, 0, w - 1)] - off

const cellName = (axis: Axis, index: number, u: number, v: number) =>
  axis === 'z' ? `x ${u} · y ${v} · z ${index}` : axis === 'x' ? `x ${index} · y ${u} · z ${v}` : `x ${u} · y ${index} · z ${v}`

// ── L1–L4 figures ────────────────────────────────────────────────────────────────────────────

function useKept(ctx: HudCtx) {
  const g = ctx.data.proc
  const suf = useMemo(() => (g ? fineSuffix(g) : null), [g])
  const solid = inputSolid(ctx)
  if (!suf || !solid) return null
  const kept = keptAt(suf, ctx.level)
  return { suf, solid, kept, pct: Math.round((kept / solid) * 100) }
}

export function Readout({ ctx }: { ctx: HudCtx }) {
  const L = ctx.level
  const lp = clamp((L - 0.05) / 0.9, 0, 1) * 100
  return (
    <div className="qdm" style={{ width: 236, gap: 12 }}>
      <div className="qdm-head"><span className="qdm-t">Level</span><span className="qdm-r">{ctx.report?.method === 'advect' ? 'push' : 'threshold'}</span></div>
      <span className="qdm-big">{f2(L)}</span>
      <div className="qdm-ruler">
        {Array.from({ length: 19 }, (_, i) => (
          <span key={i} className={'qdm-ruler__t' + (i % 3 === 0 ? ' qdm-ruler__t--major' : '') + (0.05 + i * 0.05 <= L + 1e-6 ? ' qdm-ruler__t--on' : '')} style={{ left: `${(i / 18) * 100}%` }} />
        ))}
        <span className="qdm-ruler__lv" style={{ left: `${lp}%` }} />
      </div>
      <div className="qdm-ends"><span><N>0.05</N> swell</span><span>erode <N>0.95</N></span></div>
    </div>
  )
}

export function Kept({ ctx }: { ctx: HudCtx }) {
  const k = useKept(ctx)
  if (!k) return <Box title="Kept volume" w={250}><Empty>No quantum result yet.</Empty></Box>
  return (
    <div className="qdm" style={{ width: 250, gap: 12 }}>
      <span className="qdm-t">Kept volume</span>
      <div className="qdm-kv"><span className="qdm-mid">{k.pct}%</span><span className="qdm-sub">of the input solid</span></div>
      <div className="qdm-bar"><span className="qdm-bar__on" style={{ width: `${Math.min(100, k.pct)}%` }} /><span className="qdm-bar__off" /></div>
      <span className="qdm-line"><N>{int(k.kept)}</N> cells kept · input <N>{int(k.solid)}</N></span>
    </div>
  )
}

export function Chip({ ctx }: { ctx: HudCtx }) {
  const k = useKept(ctx)
  return (
    <span className="qdm-chip">
      Level <N>{f2(ctx.level)}</N>
      {k ? <span className="qdm-dim">· keeps <N>{k.pct}%</N></span> : <span className="qdm-dim">· no result yet</span>}
    </span>
  )
}

export function LevelKept({ ctx }: { ctx: HudCtx }) {
  const k = useKept(ctx)
  const W = 260
  const suf = k?.suf ?? null, solid = k?.solid ?? 0
  const curve = useMemo(() => {
    if (!suf || !solid) return null
    const pts: number[] = []
    for (let i = 0; i <= 52; i++) pts.push(keptAt(suf, 0.05 + i * (0.9 / 52)) / solid)
    return pts
  }, [suf, solid])
  if (!k || !curve) return <Box title="Level vs kept" w={W}><Empty>No quantum result yet.</Empty></Box>
  const kmax = Math.max(1, curve[0])
  const ky = (f: number) => 100 - (f / kmax) * 90
  const kx = clamp((ctx.level - 0.05) / 0.9, 0, 1) * W
  const y = ky(k.kept / k.solid), k1 = ky(1)
  return (
    <Box title="Level vs kept" right={<><N>{f2(ctx.level)}</N> · <N>{k.pct}%</N></>} w={W}>
      <svg width={W} height={112} viewBox={`0 0 ${W} 112`}>
        <line x1={0} y1={100} x2={W} y2={100} stroke="var(--qs-ink4)" strokeWidth={1} />
        <line x1={0} y1={k1} x2={W} y2={k1} stroke="var(--qs-ink3)" strokeWidth={1} strokeDasharray="2 3" />
        <text x={W} y={k1 - 4} textAnchor="end" style={{ font: '400 10px var(--qs-sans)', fill: 'var(--qs-ink3)' }}>input</text>
        <polyline points={curve.map((f, i) => `${+(i * (W / 52)).toFixed(1)},${+ky(f).toFixed(1)}`).join(' ')} fill="none" stroke="var(--qs-ink)" strokeWidth={1.25} />
        <line x1={kx} y1={y} x2={kx} y2={100} stroke="var(--qs-ink)" strokeWidth={1} strokeDasharray="1 3" />
        <circle cx={kx} cy={y} r={3.5} fill="var(--qs-ink)" />
        <text x={0} y={111} style={{ font: '400 9.5px var(--qs-mono)', fill: 'var(--qs-ink3)' }}>0.05</text>
        <text x={W} y={111} textAnchor="end" style={{ font: '400 9.5px var(--qs-mono)', fill: 'var(--qs-ink3)' }}>0.95</text>
      </svg>
      <span className="qdm-cap">Dashed line is the input solid.</span>
    </Box>
  )
}

// ── density ────────────────────────────────────────────────────────────────────────────────────

export function Density({ ctx }: { ctx: HudCtx }) {
  const g = ctx.data.proc
  const NB = 40, W = 360, H = 100, BASE = 16, TOP = 24
  const bins = useMemo(() => (g ? histogram(g, NB) : null), [g])
  const suf = useMemo(() => (g ? fineSuffix(g) : null), [g])
  const plot = useRef<HTMLDivElement>(null)
  const [hb, setHb] = useState<number | null>(null)
  const [held, setHeld] = useState<number | null>(null)
  // The level belongs to the app. If the host offers a setter, a drag commits on release; otherwise it previews.
  const commit = (ctx as HudCtx & { setLevel?: (v: number) => void }).setLevel
  const solid = inputSolid(ctx)
  if (!g || !bins || !suf) return <Box title="Density" w={W}><Empty>No quantum result yet.</Empty></Box>
  const L = held ?? ctx.level
  const kept = keptAt(suf, L)
  const BH = H - BASE - TOP
  const peak = Math.sqrt(Math.max(1, ...bins))
  const bw = W / NB
  const frac = (x: number) => {
    const r = plot.current?.getBoundingClientRect()
    return r && r.width ? clamp((x - r.left) / r.width, 0, 1) : 0
  }
  const lv = (f: number) => clamp(Math.round(f * 100) / 100, 0.05, 0.95)
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setHeld(lv(frac(e.clientX)))
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const f = frac(e.clientX)
    setHb(clamp(Math.floor(f * NB), 0, NB - 1))
    if (held != null) setHeld(lv(f))
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (held == null) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    commit?.(held)
    setHeld(null)
  }
  const hx = hb != null ? (hb + 0.5) * bw : 0
  return (
    <Box title="Density" right={<>level <N>{f2(L)}</N> · keeps <N>{int(kept)}</N> cells{solid ? <> · <N>{Math.round((kept / solid) * 100)}%</N></> : null}</>} w={W}>
      <div ref={plot} className={'qdm-plot' + (held != null ? ' qdm-plot--held' : '')} style={{ width: W, height: H }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => held == null && setHb(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
          {bins.map((c, b) => {
            const h = c ? Math.max(1, (Math.sqrt(c) / peak) * BH) : 0
            const on = (b + 0.5) / NB >= L
            return <rect key={b} x={b * bw + 1} width={bw - 2} y={H - BASE - h} height={h} fill={on ? 'var(--qs-ink)' : b === hb ? 'var(--qs-ink3)' : 'var(--qs-ink4)'} />
          })}
          <line x1={0} x2={W} y1={H - BASE + 0.5} y2={H - BASE + 0.5} stroke="var(--qs-ink4)" strokeWidth={1} />
          <line x1={L * W} x2={L * W} y1={19} y2={H - BASE} stroke="var(--qs-ink)" strokeWidth={1} />
        </svg>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span key={t} className="qdm-axis" style={{ left: t * W, transform: t === 0 ? 'none' : t === 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{t}</span>
        ))}
        <span className={'qdm-flag' + (held != null ? ' qdm-flag--held' : '')} style={{ left: L * W }}>{f2(L)}</span>
        {hb != null && held == null && (
          <span className="qdm-tip" style={{ left: clamp(hx + 8, 0, W - 170), top: TOP }}>
            <N>{(hb / NB).toFixed(3)}–{((hb + 1) / NB).toFixed(3)}</N> · <N>{int(bins[hb])}</N> cells
          </span>
        )}
      </div>
    </Box>
  )
}

// ── runtime ────────────────────────────────────────────────────────────────────────────────────

type Log = HudCtx['log']
interface Req { t0: number; t1: number; method: string; path: string; status: string; ms: number }
const NET = /^(\w+)\s+(\S+)\s+(\S+)\s+(\d+) ms$/
/** Requests from the runtime log ("GET  /api/…  200  12 ms" lines, stamped when they ended). */
function requests(log: Log): Req[] {
  return cached(log, 'req', () => {
    const out: Req[] = []
    for (const l of log) {
      if (l.level !== 'net') continue
      const m = NET.exec(l.text.trim())
      if (!m) continue
      const ms = +m[4]
      out.push({ t0: l.t - ms, t1: l.t, method: m[1], path: m[2], status: m[3], ms })
    }
    return out
  })
}

/** A value that follows its source at most every `ms` (first and last change always land), so heavy
 *  views keep up with a dragged level or a sweeping plane without recomputing on every frame. */
function useThrottled<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value)
  const last = useRef(0)
  useEffect(() => {
    const wait = last.current + ms - Date.now()
    const apply = () => { last.current = Date.now(); setOut(value) }
    if (wait <= 0) { apply(); return }
    const t = setTimeout(apply, wait)
    return () => clearTimeout(t)
  }, [value, ms])
  return out
}

export function RunHeader({ ctx }: { ctx: HudCtx }) {
  const job = ctx.job?.status === 'running' ? ctx.job : null
  // when a job is running, a clock that ticks so the elapsed time moves between polls
  const now = useNow(!!job, 500)
  // job.elapsed is from the last poll; carry it forward on the local clock
  const [polled, setPolled] = useState<{ e: number; at: number } | null>(null)
  if (job && polled?.e !== job.elapsed) setPolled({ e: job.elapsed, at: now })
  const proc = ctx.proc
  if (!proc && !job) return <Box title="Runtime" w={300} right={<Live on={false} label="idle" />}><Empty>No quantum run yet.</Empty></Box>
  const run = job?.run ?? proc?.run ?? ctx.q.run
  const mode = job ? 'atlas' : proc?.mode
  const n = ctx.grid?.n ?? ctx.data.grid?.n ?? ctx.n
  const elapsed = job ? job.elapsed + (polled?.e === job.elapsed ? (now - polled.at) / 1000 : 0) : proc?.seconds ?? NaN
  const tiles = job ? { done: job.tiles_done, total: job.tiles_total, cached: job.tiles_cached, shape: job.tile_shape } : proc?.tiles
    ? { done: proc.tiles.jobs, total: proc.tiles.jobs, cached: proc.tiles.cached ?? (proc.cached ? proc.tiles.jobs : 0), shape: proc.tiles.shape ?? [n, n, n] }
    : { done: 1, total: 1, cached: proc?.cached ? 1 : 0, shape: [n, n, n] }
  // requests during this run: from its start (job) or the span the result took
  const reqs = requests(ctx.log)
  const t0 = job ? now - elapsed * 1000 : (ctx.runs.find((r) => r.id === proc?.proc_id)?.t ?? reqs[reqs.length - 1]?.t1 ?? now) - (proc?.seconds ?? 0) * 1000 - 2000
  const during = reqs.filter((r) => r.t1 >= t0)
  const polls = during.filter((r) => /^\/api\/process\/[^/]+$/.test(r.path)).length
  const cells = tiles.shape.reduce((a, b) => a * b, 1)
  const sent = mode === 'atlas' ? Math.max(0, tiles.done - tiles.cached) * cells : 0
  const counters: [string, string][] = [
    [dur(elapsed), 'elapsed'],
    [job ? `${tiles.done}/${tiles.total}` : String(tiles.total), job ? 'tiles back' : tiles.total === 1 ? 'tile' : 'tiles'],
    [String(mode === 'atlas' ? polls : during.length), mode === 'atlas' ? 'status polls' : 'requests'],
    [String(tiles.cached), 'cache hits'],
    [mode === 'atlas' ? compact(sent) : '0', mode === 'atlas' ? 'values sent' : 'sent · local'],
    [bytes(n * n * n * 4), 'result received'],
  ]
  return (
    <Box title="Runtime" sub={<><N>{run}</N> · {modeWord(mode)}</>} right={<Live on={!!job} label={job ? 'live' : proc?.cached ? 'cached' : 'done'} />} w={300}>
      <div className="qdm-counters">
        {counters.map(([v, k]) => (
          <div key={k} className="qdm-counter"><span className="qdm-counter__v">{v}</span><span className="qdm-counter__k">{k}</span></div>
        ))}
      </div>
    </Box>
  )
}
const Live = ({ on, label }: { on: boolean; label: string }) => (
  <span className={'qdm-live' + (on ? '' : ' qdm-live--off')}><span className={'qdm-live__dot' + (on ? ' qdm-blink' : ' qdm-live__dot--off')} />{label}</span>
)

/** The pipeline step a request belongs to, or null for housekeeping (state, models, key, jobs list). */
function stepOf(r: Req, ctx: HudCtx): string | null {
  const p = r.path
  if (/^\/api\/model(\/|$)/.test(p)) return 'Load model'
  if (p.startsWith('/api/voxelize')) return `Voxelize ${ctx.grid?.n ?? ctx.n}³`
  if (/^\/api\/process\/[^/]+(\/preview)?$/.test(p)) return 'Atlas · run'
  if (p === '/api/process') {
    const m = ctx.job ? 'atlas' : ctx.proc?.mode ?? ctx.q.mode
    return m === 'atlas' ? 'Atlas · submit' : m === 'emulator' ? 'Emulate' : m === 'gaussian' ? 'Gaussian blur' : m === 'nations' ? 'Evolve' : 'Quantum'
  }
  if (p.startsWith('/api/nations')) return 'Evolve · frames'
  if (p === '/api/grid/input') return 'Fetch grid'
  if (p === '/api/grid/processed') return 'Fetch result'
  if (p === '/api/mesh') return `Level set · ${f2(ctx.level)}`
  if (p === '/api/export') return 'Export STL + json'
  return null
}

export function Steps({ ctx }: { ctx: HudCtx }) {
  const running = ctx.job?.status === 'running'
  const now = useNow(running, 500)
  const reqs = requests(ctx.log)
  // consecutive requests of one step make one span
  const spans: { t: string; t0: number; t1: number }[] = []
  for (const r of reqs) {
    const t = stepOf(r, ctx)
    if (!t) continue
    const last = spans[spans.length - 1]
    if (last && last.t === t) { last.t0 = Math.min(last.t0, r.t0); last.t1 = Math.max(last.t1, r.t1) } else spans.push({ t, t0: r.t0, t1: r.t1 })
  }
  // the latest pipeline: the last model load, then everything since the last voxelisation; at most eight steps
  let from = 0, vox = -1
  for (let i = spans.length - 1; i >= 0; i--) if (spans[i].t === 'Load model') { from = i; break }
  for (let i = spans.length - 1; i > from; i--) if (spans[i].t.startsWith('Voxelize')) { vox = i; break }
  const chain = vox > from + 1 ? [spans[from], ...spans.slice(vox)] : spans.slice(from)
  const shown = chain.length > 8 ? [chain[0], ...chain.slice(-7)] : chain
  if (!shown.length) return <Box title="Steps" w={300}><Empty>No requests yet.</Empty></Box>
  // time while something ran; idle stretches (waiting for the person) are cut down to a short gap
  const GAP = 400
  const ends = shown.map((s, i) => (i === shown.length - 1 && running && s.t.startsWith('Atlas') ? Math.max(s.t1, now) : s.t1))
  const cuts: [number, number][] = []
  let end = shown[0].t0, busy = 0
  shown.forEach((s, i) => {
    if (s.t0 - end > 1500) cuts.push([end, s.t0 - end - GAP])
    busy += Math.max(0, ends[i] - Math.max(s.t0, end))
    end = Math.max(end, ends[i])
  })
  const at = (t: number) => t - shown[0].t0 - cuts.reduce((acc, [c, len]) => (c < t ? acc + len : acc), 0)
  const rows = shown.map((s, i) => ({ t: s.t, x: at(s.t0), w: ends[i] - s.t0, last: i === shown.length - 1 }))
  const cursor = at(end)
  const span = Math.max(1, cursor)
  return (
    <Box title="Steps" right={<><N>{dur(busy / 1000)}</N> working</>} w={300}>
      <div className="qdm-gantt">
        {rows.map((r, i) => (
          <div key={i} className="qdm-gantt__row">
            <span className="qdm-gantt__t">{r.t}</span>
            <span className="qdm-gantt__track">
              <span className="qdm-gantt__bar" style={{ left: `${(r.x / span) * 100}%`, width: `${(r.w / span) * 100}%`, background: r.last ? 'var(--qs-ink)' : 'var(--qs-ink2)' }} />
            </span>
            <span className="qdm-gantt__d">{dur(r.w / 1000)}</span>
          </div>
        ))}
        <div className="qdm-gantt__play"><div className="qdm-gantt__head" /></div>
      </div>
    </Box>
  )
}

export function LogList({ ctx }: { ctx: HudCtx }) {
  const lines = ctx.log.slice(-7)
  if (!lines.length) return <Box title="Log" w={300}><Empty>Nothing logged yet.</Empty></Box>
  return (
    <Box title="Log" right={<><N>{int(ctx.log.length)}</N> lines</>} w={300}>
      <div className="qdm-log">
        {lines.map((l, i) => {
          const lv = l.level ?? 'info'
          const text = lv === 'net' ? l.text.trim().replace(/\s{2,}/g, ' · ') : l.text
          return (
            <div key={`${l.t}-${i}`} className={'qdm-log__row' + (i === lines.length - 1 ? ' qdm-log__row--new' : '')}>
              <span>{clock(l.t)}</span>
              <span className={'qdm-log__lv' + (lv === 'warn' || lv === 'error' ? ' qdm-log__lv--hi' : '')}>{lv}</span>
              <span title={l.text}>{text}</span>
            </div>
          )
        })}
      </div>
    </Box>
  )
}

/** What we learn about each run while it is the current result: kept for the table after it is replaced. */
interface RunInfo { run: string; mode: string; n: number; level: number; seconds: number | null; cache: string }
const RUNS = new Map<number, RunInfo>()
function cacheWord(p: NonNullable<HudCtx['proc']>) {
  if (p.mode !== 'atlas') return 'local'
  const t = p.tiles
  if (p.cached) return t && t.jobs > 1 ? `hit, ${t.jobs} tiles` : 'hit, no job'
  if (t?.cached) return `${t.cached}/${t.jobs} hit`
  return 'miss, saved'
}
export function RunsTable({ ctx }: { ctx: HudCtx }) {
  const p = ctx.proc
  if (p) RUNS.set(p.proc_id, { run: p.run, mode: modeWord(p.mode), n: ctx.data.proc?.n ?? ctx.grid?.n ?? ctx.n, level: ctx.level, seconds: p.seconds ?? null, cache: cacheWord(p) })
  const ids = ctx.runs.map((r) => r.id)
  if (p && !ids.includes(p.proc_id)) ids.push(p.proc_id)
  const rows = ids.slice(-5).map((id) => {
    const info = RUNS.get(id), r = ctx.runs.find((x) => x.id === id)
    return { id, run: info?.run ?? r?.label.split(' · ')[0] ?? `#${id}`, mode: info?.mode ?? modeWord(r?.mode), n: info?.n, level: info?.level, s: info?.seconds, cache: info?.cache ?? '—' }
  })
  if (!rows.length) return <Box title="Runs" w={300}><Empty>No runs yet.</Empty></Box>
  return (
    <Box title="Runs" right={<><N>{ctx.runs.length || rows.length}</N> this session</>} w={300}>
      <div className="qdm-runs">
        <div className="qdm-runs__row qdm-runs__row--head"><span>Run</span><span>Mode</span><span>Grid</span><span>Level</span><span>Time</span><span>Cache</span></div>
        {rows.map((r) => (
          <div key={r.id} className={'qdm-runs__row' + (r.id === p?.proc_id ? ' qdm-runs__row--now' : '')}>
            <span>{r.run}</span><span>{r.mode}</span><span>{r.n ? `${r.n}³` : '—'}</span><span>{r.level != null ? f2(r.level) : '—'}</span>
            <span>{r.s != null ? dur(r.s) : '—'}</span><span className="qdm-runs__c">{r.cache}</span>
          </div>
        ))}
      </div>
    </Box>
  )
}

// ── tiles ──────────────────────────────────────────────────────────────────────────────────────

type TK = 'done' | 'running' | 'queued' | 'cached' | 'empty'
interface Plan { n: number; mode: Tiling; shape: number[]; counts: number[]; ks: TK[]; phase: 'live' | 'done' | 'planned'; halved: boolean }
const TILE_LABEL: Record<TK, string> = { done: 'done', running: 'running', queued: 'queued', cached: 'cached, not sent', empty: 'empty, skipped' }
const ATLAS_PARALLEL = 3

/** Per tile (order x, y, z as the service splits): 1 if the tile holds anything. */
function tileFlags(g: G, shape: number[], fn: (i: number) => boolean, key: string): Uint8Array {
  return cached(g.data, key + shape.join('x'), () => {
    const n = g.n
    const [sx, sy, sz] = shape
    const cx = n / sx, cy = n / sy, cz = n / sz
    const out = new Uint8Array(cx * cy * cz)
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++) {
        const base = (x * n + y) * n
        const tb = (Math.floor(x / sx) * cy + Math.floor(y / sy)) * cz
        for (let z = 0; z < n; z++) {
          const t = tb + Math.floor(z / sz)
          if (!out[t] && fn(base + z)) out[t] = 1
        }
      }
    return out
  })
}

function planTiles(ctx: HudCtx, alt: Tiling | null): Plan | null {
  const input = ctx.data.grid
  const n = input?.n ?? ctx.grid?.n
  if (!n) return null
  const job = ctx.job?.status === 'running' ? ctx.job : null
  const actual: Tiling = job?.tiling ?? ctx.proc?.tiles?.mode ?? (ctx.q.tiling === 'layers' ? 'layers' : 'cube')
  const mode = alt ?? actual
  const planned = mode !== actual
  let shape = (!planned ? job?.tile_shape ?? ctx.proc?.tiles?.shape : undefined) ?? ctx.grid?.tiles?.[mode]?.shape ?? [n, n, n]
  if (shape.length !== 3 || shape.some((s) => !(s > 0) || n % s)) shape = [n, n, n]
  const counts = shape.map((s) => n / s)
  const total = counts[0] * counts[1] * counts[2]
  const full = input ? tileFlags(input, shape, (i) => input.data[i] > 0, 'full') : null
  const ks: TK[] = Array.from({ length: total }, (_, i) => (full && !full[i] ? 'empty' : 'queued'))
  const todo = ks.map((k, i) => (k === 'empty' ? -1 : i)).filter((i) => i >= 0)
  let phase: Plan['phase'] = 'planned'
  if (!planned && job) {
    phase = 'live'
    const done = new Set<number>()
    // a tile that came back no longer equals the input in the live preview
    const p = ctx.data.proc
    if (p && input && p.n === n) {
      const diff = tileFlags(p, shape, (i) => Math.abs(p.data[i] - input.data[i]) > 1e-6, 'diff')
      for (const i of todo) if (diff[i]) done.add(i)
    }
    // layer runs: everything below the frontier is back
    if (mode === 'layers' && job.frontier != null) for (const i of todo) if ((i % counts[2]) * shape[2] < job.frontier) done.add(i)
    for (const i of todo) { if (done.size >= job.tiles_done) break; done.add(i) }
    let c = job.tiles_cached
    for (const i of todo) if (done.has(i)) ks[i] = c-- > 0 ? 'cached' : 'done'
    let r = job.tiles_done === 0 ? 1 : ATLAS_PARALLEL
    for (const i of todo) if (!done.has(i) && r-- > 0) ks[i] = 'running'
  } else if (!planned && ctx.proc) {
    phase = 'done'
    let c = ctx.proc.cached ? todo.length : ctx.proc.tiles?.cached ?? 0
    for (const i of todo) ks[i] = c-- > 0 ? 'cached' : 'done'
  }
  const vol = shape[0] * shape[1] * shape[2]
  const halved = vol < Math.min(n * n * n, 2 ** 15) || (!!job?.note && !planned)
  return { n, mode, shape, counts, ks, phase, halved }
}

export function Tiles({ ctx }: { ctx: HudCtx }) {
  const [alt, setAlt] = useState<Tiling | null>(null)
  const [hv, setHv] = useState<number | null>(null)
  const plan = planTiles(ctx, alt)
  if (!plan) return <Box title="Tiles" w={300}><Empty>Voxelise to see the tiles.</Empty></Box>
  const { n, mode, shape, counts, ks, phase } = plan
  const [cx, cy, cz] = counts
  const slabs = mode === 'layers' && cx === 1 && cy === 1
  const tileName = (i: number) => {
    const ix = Math.floor(i / (cy * cz)), iy = Math.floor(i / cz) % cy, iz = i % cz
    const r = (k: number, s: number) => `${k * s}–${k * s + s - 1}`
    return slabs ? `Slab ${iz} · z ${r(iz, shape[2])} · ${TILE_LABEL[ks[i]]}` : `Tile ${i} · x ${r(ix, shape[0])} · y ${r(iy, shape[1])} · z ${r(iz, shape[2])} · ${TILE_LABEL[ks[i]]}`
  }
  const count = (k: TK) => ks.filter((x) => x === k).length
  const summary = (['done', 'running', 'queued', 'cached', 'empty'] as TK[]).filter((k) => count(k) > 0)
    .map((k, i) => <span key={k}>{i ? ' · ' : ''}<N>{count(k)}</N> {k}</span>)
  const tile = (i: number, style: CSSProperties) => (
    <span key={i} className={`qdm-tile qdm-tile--${ks[i]}` + (hv === i ? ' qdm-tile--hover' : '')} style={style} onPointerEnter={() => setHv(i)} onPointerLeave={() => setHv(null)} />
  )
  let body: ReactNode
  if (slabs) {
    const h = clamp(Math.floor(150 / cz) - 2, 2, 6), gap = cz > 40 ? 1 : 2
    body = <div className="qdm-tiles__slabs" style={{ gap, width: 150 }}>{Array.from({ length: cz }, (_, k) => tile(k, { height: h, width: '100%' }))}</div>
  } else {
    const cols = cz > 1 ? 2 : 1
    const panelW = cols === 1 ? 150 : 68
    const gap = cx > 4 ? 2 : 4
    const s = clamp(Math.floor((panelW - (cx - 1) * gap) / cx), 3, cols === 1 ? 64 : 30)
    body = (
      <div className="qdm-tiles__layers" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
        {Array.from({ length: cz }, (_, iz) => (
          <div key={iz} className="qdm-tiles__layer">
            <span className="qdm-tiles__z">z {iz * shape[2]}–{iz * shape[2] + shape[2] - 1}</span>
            <div className="qdm-tiles__grid" style={{ gridTemplateColumns: `repeat(${cx}, ${s}px)`, gap }}>
              {Array.from({ length: cy }, (_, row) => Array.from({ length: cx }, (_, ix) => tile((ix * cy + (cy - 1 - row)) * cz + iz, { width: s, height: s })))}
            </div>
          </div>
        ))}
      </div>
    )
  }
  const actual = alt == null || phase !== 'planned' ? mode : alt === 'cube' ? 'layers' : 'cube'
  const pick = (m: Tiling) => setAlt(m === actual ? null : m)
  return (
    <Box title="Tiles" sub={<><N>{n}³</N> · {phase}</>} w={300}
      right={
        <span className="qdm-seg">
          {(['cube', 'layers'] as Tiling[]).map((m) => (
            <button key={m} className={'qdm-seg__i' + (m === mode ? ' qdm-seg__i--on' : '')} onClick={() => pick(m)}>{m === 'cube' ? 'Cubes' : 'Layers'}</button>
          ))}
        </span>
      }>
      <div className="qdm-tiles">
        {body}
        <div className="qdm-legend">
          {(['done', 'running', 'queued', 'cached', 'empty'] as TK[]).map((k) => (
            <span key={k}><span className={`qdm-tile qdm-tile--${k}`} />{TILE_LABEL[k]}</span>
          ))}
          <span className={plan.halved ? '' : 'qdm-legend__off'}><span className="qdm-halved"><i /><i /></span>halved after a size error</span>
        </div>
      </div>
      {hv != null && hv < ks.length ? <span className="qdm-data">{tileName(hv)}</span> : <span className="qdm-line">{summary}</span>}
      <span className="qdm-line">{slabs ? 'Layers' : 'Cubes'} are <N>{shape.join(' × ')}</N>{slabs ? ', sent bottom to top' : ''}.</span>
    </Box>
  )
}

// ── signed distance on the slice ───────────────────────────────────────────────────────────────

export function FieldMap({ ctx }: { ctx: HudCtx }) {
  const src = ctx.data.proc ?? ctx.data.grid
  const isResult = !!ctx.data.proc
  const L = useThrottled(isResult ? ctx.level : 0.5, 120)
  const slice = useThrottled(`${ctx.slice.axis}${ctx.slice.index}`, 90)
  const live = ctx.report?.grow ?? 0
  const [op, setOp] = useState(live)
  // follows the mesh's own offset whenever that changes
  const [opOf, setOpOf] = useState(live)
  if (opOf !== live) { setOpOf(live); setOp(live) }
  const [hov, setHov] = useState<[number, number] | null>(null)
  const S = 172
  const n = src?.n ?? 0
  const axis = slice[0] as Axis, index = clamp(+slice.slice(1), 0, Math.max(0, n - 1))
  const sec = useMemo(() => (src ? sliceSdf(src, L, axis, index) : null), [src, L, axis, index])
  const paths = useMemo(() => {
    if (!sec || !src) return null
    const X = lattice(n, S)
    const at = (a: number, b: number) => clamp(b - 1, 0, n - 1) * n + clamp(a - 1, 0, n - 1)
    const val: Val = (a, b) => sec[at(a, b)] - op
    // without an offset the surface is the field's own crossing, exactly what the mesh is cut from
    const raw = op ? null : section(src, axis, index)
    const surf: Val = raw ? (a, b) => L - raw[at(a, b)] : val
    return {
      band: isoFill(val, X, X, S, BAND),
      inside: isoFill(surf, X, X, S, 0),
      steps: [-3, -2, -1, 1, 2, 3].map((t) => isoLine(val, X, X, S, t)).join(''),
      zero: isoLine(surf, X, X, S, 0),
    }
  }, [sec, src, axis, index, L, n, op])
  if (!src || !sec || !paths) return <Box title="Signed distance" w={S + 28}><Empty>Voxelise to see the field.</Empty></Box>
  const cell = (e: RPointerEvent<HTMLDivElement>): [number, number] | null => {
    const r = e.currentTarget.getBoundingClientRect()
    const u = Math.floor(((e.clientX - r.left) / r.width) * n), v = n - 1 - Math.floor(((e.clientY - r.top) / r.height) * n)
    return u >= 0 && u < n && v >= 0 && v < n ? [u, v] : null
  }
  let read: ReactNode = <>level <N>{f2(L)}</N> · band <N>±{BAND}</N> vox{op ? <> · offset <N>{minus(op, 1)}</N></> : null}</>
  if (hov) {
    const raw = sec[hov[1] * n + hov[0]], d = raw - op, far = Math.abs(raw) > REACH
    read = <><N>{cellName(axis, index, hov[0], hov[1])}</N> · d <N>{far ? `${raw < 0 ? '<' : '>'} ${minus(raw < 0 ? -REACH - op : REACH - op, 0)}` : minus(d)}</N> vox · {d < 0 ? 'inside' : 'outside'}{Math.abs(d) <= BAND ? ' · in band' : ''}</>
  }
  const opts: [number, string][] = [[-1, 'Shrink'], [0, 'None'], [1, 'Thicken']]
  const px = S / n
  return (
    <Box title="Signed distance" sub={isResult ? 'result' : 'input'} right={<N>{axis} {index}</N>} w={S + 28}>
      <div className="qdm-map" style={{ width: S, height: S }} onPointerMove={(e) => setHov(cell(e))} onPointerLeave={() => setHov(null)}>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
          <path d={paths.band} fill="var(--qs-ink)" fillOpacity={0.07} />
          <path d={paths.inside} fill="var(--qs-ink)" fillOpacity={0.13} />
          <path d={paths.steps} fill="none" stroke="var(--qs-ink3)" strokeWidth={0.6} />
          <path d={paths.zero} fill="none" stroke="var(--qs-ink)" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
        {hov && <span className="qdm-map__cell" style={{ left: hov[0] * px, top: (n - 1 - hov[1]) * px, width: px, height: px }} />}
      </div>
      <span className="qdm-seg" style={{ alignSelf: 'flex-start' }}>
        {opts.map(([v, t]) => {
          const on = Math.sign(op) === v
          const amt = on && v ? Math.abs(op) : 1
          return <button key={t} className={'qdm-seg__i' + (on ? ' qdm-seg__i--on' : '')} onClick={() => setOp(v === 0 ? 0 : v * (Math.sign(live) === v ? Math.abs(live) : 1))}>{t}{v ? <N>{+amt.toFixed(2)}</N> : null}</button>
        })}
      </span>
      <span className="qdm-line qdm-line--wrap">{read}</span>
    </Box>
  )
}

// ── voxel values ───────────────────────────────────────────────────────────────────────────────

interface Win { index: number; u0: number; v0: number; sec: Float32Array }
/** The w×h window of a section where the surface crosses the most cells (sum tables, so any size is quick). */
function bestOn(sec: Float32Array, n: number, w: number, h: number): { score: number; u0: number; v0: number } {
  const W = n + 1
  const sat = new Float64Array(W * W)
  for (let v = 0; v < n; v++)
    for (let u = 0; u < n; u++) {
      const c = sec[v * n + u]
      const frac = c > 0.02 && c < 0.98 ? 1 : 0
      const r = u + 1 < n ? sec[v * n + u + 1] : c, t = v + 1 < n ? sec[(v + 1) * n + u] : c
      const edge = (c >= 0.5) !== (r >= 0.5) || (c >= 0.5) !== (t >= 0.5) ? 0.5 : 0
      sat[(v + 1) * W + u + 1] = frac + edge + sat[v * W + u + 1] + sat[(v + 1) * W + u] - sat[v * W + u]
    }
  let best = { score: -1, u0: 0, v0: 0 }
  const mid = (n - w) / 2
  for (let v0 = 0; v0 + h <= n; v0++)
    for (let u0 = 0; u0 + w <= n; u0++) {
      const s = sat[(v0 + h) * W + u0 + w] - sat[v0 * W + u0 + w] - sat[(v0 + h) * W + u0] + sat[v0 * W + u0] - 1e-4 * (Math.abs(u0 - mid) + Math.abs(v0 - mid))
      if (s > best.score) best = { score: s, u0, v0 }
    }
  return best
}
function voxelWindow(g: G, axis: Axis, index: number, w: number, h: number): Win | null {
  const n = g.n
  if (n < Math.max(w, h)) return null
  return cached(g.data, `win${axis}${index}:${w}x${h}`, () => {
    const sec = section(g, axis, index)
    const b = bestOn(sec, n, w, h)
    if (b.score >= 1) return { index, ...b, sec }
    // nothing crosses this slice: the nearest slice along the axis that does
    for (let d = 1; d < n; d++)
      for (const k of [index - d, index + d]) {
        if (k < 0 || k >= n) continue
        const s2 = section(g, axis, k)
        const b2 = bestOn(s2, n, w, h)
        if (b2.score >= 1) return { index: k, ...b2, sec: s2 }
      }
    return null
  })
}
/** How much fatter 0/1 voxels are than the coverage surface, in voxels (volume difference over surface cells). */
function fatness(g: G): number | null {
  return cached(g.data, 'fat', () => {
    let touched = 0, sum = 0, surf = 0
    for (let i = 0; i < g.data.length; i++) {
      const c = g.data[i]
      if (c > 1e-3) { touched++; sum += Math.min(1, c) }
      if (c > 1e-3 && c < 1 - 1e-3) surf++
    }
    return surf ? (touched - sum) / surf : null
  })
}

function ValuePanel({ win, n, w, h, cell, binary, numbers }: { win: Win; n: number; w: number; h: number; cell: number; binary?: boolean; numbers?: boolean }) {
  const W = w * cell, H = h * cell
  const { sec, u0, v0 } = win
  const lines = useMemo(() => {
    const X = new Float64Array(w + 2), Y = new Float64Array(h + 2)
    X[0] = 0; X[w + 1] = W; Y[0] = 0; Y[h + 1] = H
    for (let i = 0; i < w; i++) X[i + 1] = (i + 0.5) * cell
    for (let j = 0; j < h; j++) Y[j + 1] = (j + 0.5) * cell
    const cov = windowVal(sec, n, u0, v0, w, h)
    const bin: Val = (a, b) => (cov(a, b) > 1e-3 ? 1 : 0)
    return { surface: isoLine(cov, X, Y, H, 0.5), blocky: isoLine(bin, X, Y, H, 0.5) }
  }, [sec, n, u0, v0, w, h, cell, W, H])
  const cells: ReactNode[] = []
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const c = clamp(sec[(v0 + j) * n + u0 + i], 0, 1)
      const o = binary ? (c > 1e-3 ? 1 : 0) : c
      const x = i * cell, y = H - (j + 1) * cell
      cells.push(<rect key={`${i}-${j}`} x={x} y={y} width={cell} height={cell} fill="var(--qs-ink)" fillOpacity={+o.toFixed(3)} stroke="var(--qs-ink4)" strokeWidth={0.5} />)
      if (numbers) {
        const t = c >= 0.995 ? '1' : c <= 0.005 ? '0' : c.toFixed(2).replace(/^0/, '')
        cells.push(<text key={`t${i}-${j}`} x={x + cell / 2} y={y + cell / 2 + 3} textAnchor="middle" style={{ font: '400 8.5px var(--qs-mono)', fill: o > 0.55 ? 'var(--qs-bg)' : t === '0' ? 'var(--qs-ink4)' : 'var(--qs-ink2)' }}>{t}</text>)
      }
    }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {cells}
      {binary ? (
        <>
          <path d={lines.surface} fill="none" stroke="var(--qs-bg)" strokeWidth={1.5} strokeLinecap="round" />
          <path d={lines.blocky} fill="none" stroke="var(--qs-ink)" strokeWidth={1} strokeDasharray="3 3" />
        </>
      ) : (
        <path d={lines.surface} fill="none" stroke="var(--qs-ink)" strokeWidth={1.5} strokeLinecap="round" />
      )}
    </svg>
  )
}

function winLabel(axis: Axis, win: Win, w: number, h: number) {
  const r = (a: number, k: number) => `${a}–${a + k - 1}`
  const [U, V] = axis === 'z' ? ['x', 'y'] : axis === 'x' ? ['y', 'z'] : ['x', 'z']
  return `${axis} ${win.index} · ${U} ${r(win.u0, w)} · ${V} ${r(win.v0, h)}`
}

export function VoxelValues({ ctx }: { ctx: HudCtx }) {
  const g = ctx.data.grid
  const w = 8, h = 6, cell = 16
  const win = useMemo(() => (g ? voxelWindow(g, ctx.slice.axis, clamp(ctx.slice.index, 0, g.n - 1), w, h) : null), [g, ctx.slice.axis, ctx.slice.index])
  const fat = useMemo(() => (g ? fatness(g) : null), [g])
  if (!g || !win) return <Box title="Voxel values" w={276}><Empty>Voxelise to see the values.</Empty></Box>
  const binaryGrid = ctx.grid?.values === 'binary'
  return (
    <Box title="Voxel values" right={<N>{winLabel(ctx.slice.axis, win, w, h)}</N>} w={276}>
      <div className="qdm-pair">
        <div className="qdm-panel">
          {binaryGrid ? <div style={{ width: w * cell, height: h * cell, display: 'flex', alignItems: 'center' }}><Empty>This grid was voxelised as 0 or 1.</Empty></div>
            : <ValuePanel win={win} n={g.n} w={w} h={h} cell={cell} />}
          <span className="qdm-panel__t">Coverage</span>
          <span className="qdm-cap">0.5 level is the true surface</span>
        </div>
        <div className="qdm-panel">
          <ValuePanel win={win} n={g.n} w={w} h={h} cell={cell} binary />
          <span className="qdm-panel__t">0 or 1</span>
          <span className="qdm-cap">{fat != null && !binaryGrid ? <>About <N>{fat.toFixed(2)}</N> voxel fat</> : 'About half a voxel fat'}</span>
        </div>
      </div>
    </Box>
  )
}

export function Coverage({ ctx }: { ctx: HudCtx }) {
  const g = ctx.data.grid
  const w = 10, h = 7, cell = 24
  const win = useMemo(() => (g ? voxelWindow(g, ctx.slice.axis, clamp(ctx.slice.index, 0, g.n - 1), w, h) : null), [g, ctx.slice.axis, ctx.slice.index])
  if (!g || !win) return <Box title="Coverage" w={w * cell}><Empty>Voxelise to see the coverage.</Empty></Box>
  return (
    <Box title="Coverage" right={<N>{ctx.slice.axis} {win.index}</N>} w={w * cell}>
      <ValuePanel win={win} n={g.n} w={w} h={h} cell={cell} numbers />
      <span className="qdm-line"><N>{winLabel(ctx.slice.axis, win, w, h).split(' · ').slice(1).join(' · ')}</N></span>
      <span className="qdm-cap">{ctx.grid?.values === 'binary' ? 'This grid was voxelised as 0 or 1.' : '0.5 level is the true surface.'}</span>
    </Box>
  )
}

// ── level sweep ────────────────────────────────────────────────────────────────────────────────

/** Mean-pool to at most 64 cells a side, for drawing only. */
function drawable(g: G): G {
  if (g.n <= 64) return g
  return cached(g.data, 'pool64', () => {
    const n = g.n, k = Math.ceil(n / 64), m = Math.floor(n / k), inv = 1 / (k * k * k)
    const out = new Float32Array(m * m * m)
    for (let x = 0; x < m * k; x++)
      for (let y = 0; y < m * k; y++) {
        const src = (x * n + y) * n, dst = (Math.floor(x / k) * m + Math.floor(y / k)) * m
        for (let z = 0; z < m * k; z++) out[dst + Math.floor(z / k)] += g.data[src + z] * inv
      }
    return { n: m, data: out }
  })
}

type V3 = [number, number, number]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** Five iso views of one field, ray-cast through the voxels from a fixed three-quarter view, as alpha masks
 *  (drawn in ink through CSS, so they follow the theme). One fit for all five, so swelling and erosion compare. */
interface Mask { shade: string; lit: string }
function sweepMasks(g0: G, levels: number[], W: number, H: number): Mask[] {
  const g = drawable(g0)
  return cached(g.data, `sweep${levels.map(f2).join(',')}:${W}x${H}`, () => {
    const { n, data } = g
    const az = (35 * Math.PI) / 180, el = (22 * Math.PI) / 180
    const e: V3 = [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)]
    const v: V3 = [-e[0], -e[1], -e[2]]
    const r = norm([v[1], -v[0], 0])
    const u: V3 = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]]
    const light = norm([-0.45 * r[0] + 0.75 * u[0] + 0.55 * e[0], -0.45 * r[1] + 0.75 * u[1] + 0.55 * e[1], -0.45 * r[2] + 0.75 * u[2] + 0.55 * e[2]])
    // bounds of what the lowest level keeps
    const lo = Math.min(...levels)
    const bmin: V3 = [n, n, n], bmax: V3 = [0, 0, 0]
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
      if (!(data[(x * n + y) * n + z] >= lo)) continue
      const p = [x, y, z]
      for (let a = 0; a < 3; a++) { bmin[a] = Math.min(bmin[a], p[a]); bmax[a] = Math.max(bmax[a], p[a] + 1) }
    }
    const none = levels.map(() => ({ shade: '', lit: '' }))
    if (bmin[0] >= bmax[0]) return none
    const c: V3 = [(bmin[0] + bmax[0]) / 2, (bmin[1] + bmax[1]) / 2, (bmin[2] + bmax[2]) / 2]
    let mr = 0, mu = 0
    for (let k = 0; k < 8; k++) {
      const p: V3 = [k & 1 ? bmax[0] : bmin[0], k & 2 ? bmax[1] : bmin[1], k & 4 ? bmax[2] : bmin[2]]
      const d: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
      mr = Math.max(mr, Math.abs(dot(d, r))); mu = Math.max(mu, Math.abs(dot(d, u)))
    }
    const s = Math.min(W / 2 / (mr * 1.12), H / 2 / (mu * 1.12))
    // The field is trilinear between cell centres (q = p − ½). Rays step through the cells of that
    // lattice, skip any whose eight corners all lie below the level, and find the crossing inside the
    // first one that reaches it; the shading normal is the trilinear gradient, so the surface reads smooth.
    const m = n - 1
    const cmax = cached(g.data, 'cmax', () => {
      const out = new Float32Array(m * m * m)
      for (let x = 0; x < m; x++) for (let y = 0; y < m; y++) for (let z = 0; z < m; z++) {
        let mx = -Infinity
        for (let k = 0; k < 8; k++) mx = Math.max(mx, data[((x + (k & 1)) * n + y + ((k >> 1) & 1)) * n + z + (k >> 2)])
        out[(x * m + y) * m + z] = mx
      }
      return out
    })
    // shading normals come from a lightly smoothed copy ([1 2 1] per axis), much as the mesh is smoothed
    const soft = cached(g.data, 'soft121', () => {
      let a = Float32Array.from(data)
      for (const st of [1, n, n * n]) {
        const b = new Float32Array(a.length)
        for (let i = 0; i < a.length; i++) {
          const k = Math.floor(i / st) % n
          b[i] = (2 * a[i] + a[k > 0 ? i - st : i] + a[k < n - 1 ? i + st : i]) / 4
        }
        a = b
      }
      return a
    })
    const tri = (qx: number, qy: number, qz: number, grad: number[] | null, f: Float32Array = data) => {
      const x = clamp(Math.floor(qx), 0, m - 1), y = clamp(Math.floor(qy), 0, m - 1), z = clamp(Math.floor(qz), 0, m - 1)
      const fx = qx - x, fy = qy - y, fz = qz - z
      const o = (x * n + y) * n + z
      const c000 = f[o], c001 = f[o + 1], c010 = f[o + n], c011 = f[o + n + 1]
      const c100 = f[o + n * n], c101 = f[o + n * n + 1], c110 = f[o + n * n + n], c111 = f[o + n * n + n + 1]
      const c00 = c000 + (c001 - c000) * fz, c01 = c010 + (c011 - c010) * fz, c10 = c100 + (c101 - c100) * fz, c11 = c110 + (c111 - c110) * fz
      const c0 = c00 + (c01 - c00) * fy, c1 = c10 + (c11 - c10) * fy
      if (grad) {
        grad[0] = c1 - c0
        grad[1] = (c01 - c00) * (1 - fx) + (c11 - c10) * fx
        const d00 = c001 - c000, d01 = c011 - c010, d10 = c101 - c100, d11 = c111 - c110
        grad[2] = (d00 + (d01 - d00) * fy) * (1 - fx) + (d10 + (d11 - d10) * fy) * fx
      }
      return c0 + (c1 - c0) * fx
    }
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const c2 = cv.getContext('2d')
    if (!c2 || m < 1) return none
    const step = [v[0] > 0 ? 1 : -1, v[1] > 0 ? 1 : -1, v[2] > 0 ? 1 : -1]
    const R = 3 * n, SUB = 6
    const grad = [0, 0, 0]
    return levels.map((L) => {
      const img = c2.createImageData(W, H), px = img.data
      const lit = new Uint8ClampedArray(W * H)
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const sx = (i + 0.5 - W / 2) / s, sy = (H / 2 - j - 0.5) / s
          const o: V3 = [c[0] + r[0] * sx + u[0] * sy + e[0] * R - 0.5, c[1] + r[1] * sx + u[1] * sy + e[1] * R - 0.5, c[2] + r[2] * sx + u[2] * sy + e[2] * R - 0.5]
          let t0 = -Infinity, t1 = Infinity
          for (let a = 0; a < 3; a++) {
            let ta = (0 - o[a]) / v[a], tb = (m - o[a]) / v[a]
            if (ta > tb) [ta, tb] = [tb, ta]
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb)
          }
          if (!(t0 < t1)) continue
          const cell = [0, 1, 2].map((a) => clamp(Math.floor(o[a] + v[a] * (t0 + 1e-6)), 0, m - 1))
          const tMax = [0, 1, 2].map((a) => ((step[a] > 0 ? cell[a] + 1 : cell[a]) - o[a]) / v[a])
          const tDelta = [0, 1, 2].map((a) => Math.abs(1 / v[a]))
          let tIn = t0
          for (let guard = 0; guard < 4 * n; guard++) {
            const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2
            const tOut = Math.min(tMax[a], t1)
            if (cmax[(cell[0] * m + cell[1]) * m + cell[2]] >= L) {
              let ta = tIn, hit = -1
              for (let k = 1; k <= SUB; k++) {
                const tb = tIn + ((tOut - tIn) * k) / SUB
                if (tri(o[0] + v[0] * tb, o[1] + v[1] * tb, o[2] + v[2] * tb, null) >= L) {
                  let lo = ta, hi = tb
                  for (let b = 0; b < 5; b++) {
                    const mid = (lo + hi) / 2
                    if (tri(o[0] + v[0] * mid, o[1] + v[1] * mid, o[2] + v[2] * mid, null) >= L) hi = mid; else lo = mid
                  }
                  hit = hi
                  break
                }
                ta = tb
              }
              if (hit >= 0) {
                tri(o[0] + v[0] * hit, o[1] + v[1] * hit, o[2] + v[2] * hit, grad, soft)
                const nm = norm([-grad[0], -grad[1], -grad[2]])
                const lam = Math.max(0, dot(nm, light))
                px[(j * W + i) * 4 + 3] = Math.round(255 * (0.12 + 0.74 * (1 - lam)))
                lit[j * W + i] = Math.round(255 * (0.2 + 0.72 * lam))
                break
              }
            }
            if (tOut >= t1) break
            tIn = tOut
            cell[a] += step[a]
            if (cell[a] < 0 || cell[a] >= m) break
            tMax[a] += tDelta[a]
          }
        }
      // two masks: darker away from the light (drawn on a light ground) and brighter toward it (on a dark one)
      c2.putImageData(img, 0, 0)
      const shade = cv.toDataURL('image/png')
      for (let k = 0; k < W * H; k++) px[k * 4 + 3] = lit[k]
      c2.putImageData(img, 0, 0)
      return { shade, lit: cv.toDataURL('image/png') }
    })
  })
}

function sweepLevels(L: number): number[] {
  const out: number[] = []
  let k0 = -2
  while (L + k0 * 0.15 < 0.05 - 1e-9) k0++
  while (L + (k0 + 4) * 0.15 > 0.95 + 1e-9) k0--
  for (let k = k0; k < k0 + 5; k++) out.push(Math.round((L + k * 0.15) * 100) / 100)
  return out
}

export function Sweep({ ctx }: { ctx: HudCtx }) {
  const g = ctx.data.proc
  const W = 96, H = 108
  const level = useThrottled(ctx.level, 250)
  const levels = useMemo(() => sweepLevels(level), [level])
  const masks = useMemo(() => (g ? sweepMasks(g, levels, W * 2, H * 2) : null), [g, levels])
  const suf = useMemo(() => (g ? fineSuffix(g) : null), [g])
  const solid = inputSolid(ctx)
  const width = 5 * W + 4 * 16
  if (!g || !masks || !suf) return <Box title="Level sweep" w={width}><Empty>No quantum result yet.</Empty></Box>
  const cur = levels.reduce((b, l) => (Math.abs(l - level) < Math.abs(b - level) ? l : b), levels[0])
  return (
    <Box title="Level sweep" sub="one field, five thresholds" right="sample counts" w={width}>
      <div className="qdm-sweep">
        {levels.map((l, i) => {
          const on = l === cur
          const kept = keptAt(suf, l), parts = partsAt(g, l)
          return (
            <div key={i} className="qdm-sweep__i">
              <div className="qdm-sweep__img">
                {masks[i].shade ? (['shade', 'lit'] as const).map((k) => (
                  <div key={k} className={`qdm-sweep__mask qdm-sweep__mask--${k}`} style={{ WebkitMaskImage: `url(${masks[i][k]})`, maskImage: `url(${masks[i][k]})` }} />
                )) : <span className="qdm-empty" style={{ position: 'absolute', bottom: 8 }}>nothing kept</span>}
                {on && (
                  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
                    <path d={`M0 14V0H14M${W - 14} 0H${W}V14M${W} ${H - 14}V${H}H${W - 14}M14 ${H}H0V${H - 14}`} fill="none" stroke="var(--qs-ink)" strokeWidth={1.5} />
                  </svg>
                )}
              </div>
              <div className={'qdm-sweep__lv' + (on ? ' qdm-sweep__lv--on' : '')}>
                <span>Level <N>{f2(l)}</N></span>
                <span className="qdm-sweep__k">keeps <N>{solid ? `${Math.round((kept / solid) * 100)}%` : int(kept)}</N></span>
                <span className="qdm-sweep__k"><N>{parts}</N> {parts === 1 ? 'part' : 'parts'}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Box>
  )
}
