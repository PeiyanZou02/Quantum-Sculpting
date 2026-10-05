// Scan and slice: the layer being read or printed (QLMarks4, "Scan and slice").
// v1 sweep, v2 plane + index (QSlice-style cabinet cube), v3 layer stack, v4 marching.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import { solidPerLayer, type Axis } from '../qs/grid'
import { Count } from './Num'
import type { HudCtx } from './types'
import './lab.css'

type V2 = [number, number]
type V3 = [number, number, number]

const SWEEP_MS = 3200
const n1 = (v: number) => Math.round(v * 10) / 10
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ---------------------------------------------------------------- v1 sweep

/** A 3.2 s pass across the view each time ctx.busy turns on. */
export function Sweep({ ctx }: { ctx: HudCtx }) {
  const [pass, setPass] = useState(0)
  const [on, setOn] = useState(false)
  const was = useRef(false)
  const t = useRef(0)
  useEffect(() => {
    if (ctx.busy && !was.current) {
      setPass((p) => p + 1)
      setOn(true)
      clearTimeout(t.current)
      t.current = window.setTimeout(() => setOn(false), SWEEP_MS)
    }
    was.current = ctx.busy
  }, [ctx.busy])
  useEffect(() => () => clearTimeout(t.current), [])
  if (!on) return null
  const pad = 48
  const L = 14
  return (
    <div className="qs-lab-layer" style={{ width: ctx.w, height: ctx.h }} aria-hidden>
      <div style={{ position: 'absolute', left: pad, top: pad, width: L, height: L, borderLeft: '1px solid var(--qs-ink)', borderTop: '1px solid var(--qs-ink)' }} />
      <div style={{ position: 'absolute', right: pad, bottom: pad, width: L, height: L, borderRight: '1px solid var(--qs-ink)', borderBottom: '1px solid var(--qs-ink)' }} />
      <div style={{ position: 'absolute', left: pad, right: pad, top: pad, bottom: pad }}>
        <div key={pass} className="qs-lab-sweep">
          <span className="qs-lab-small" style={{ position: 'absolute', right: 0, top: -14, color: 'var(--qs-ink)' }}>
            scan
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- v2 plane + index

const W = 260
const H = 156
const KX = 0.433
const KY = 0.25
const OX = 34
const OY = 132
const U32 = 2.9

/** The QSlice cabinet cube with its plane and index tab, driven by ctx.slice / ctx.n. Drag to move. */
export function PlaneIndex({ ctx }: { ctx: HudCtx }) {
  const N = Math.max(1, ctx.n)
  const ax: Axis = ctx.slice.axis
  const k = clamp(Math.round(ctx.slice.index), 0, N - 1)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  const u = (U32 * 32) / N
  const P = (i: number, j: number, z: number): V2 => [OX + u * (i + j * KX), OY - u * (z + j * KY)]
  const p3 = (a: number, b: number, L: number): V2 => (ax === 'z' ? P(a, b, L) : ax === 'x' ? P(L, a, b) : P(a, L, b))
  const quad = (L: number) =>
    'M' + ([[0, 0], [N, 0], [N, N], [0, N]] as V2[]).map(([a, b]) => p3(a, b, L).map(n1).join(' ')).join('L') + 'Z'

  let hid = ''
  let vis = ''
  const C8: V3[] = []
  for (const z of [0, N]) for (const j of [0, N]) for (const i of [0, N]) C8.push([i, j, z])
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const A = C8[a]
      const B = C8[b]
      if (A.filter((x, t) => x !== B[t]).length !== 1) continue
      const pa = P(...A)
      const pb = P(...B)
      const s = `M${n1(pa[0])} ${n1(pa[1])}L${n1(pb[0])} ${n1(pb[1])}`
      if ([A, B].some((q) => q[0] === 0 && q[1] === N && q[2] === 0)) hid += s
      else vis += s
    }

  const RB: (t: number) => V3 = ax === 'z' ? (t) => [N, N, t] : ax === 'x' ? (t) => [t, 0, 0] : (t) => [N, t, 0]
  const OF: V2 = ax === 'z' ? [14, 0] : ax === 'x' ? [0, 14] : [12, 7]
  const TD: V2 = ax === 'z' ? [1, 0] : ax === 'x' ? [0, 1] : [0.5, 0.87]
  const Rr = (t: number): V2 => {
    const q = P(...RB(t))
    return [q[0] + OF[0], q[1] + OF[1]]
  }
  const r0 = Rr(0)
  const r1 = Rr(N)
  let ticks = ''
  let major = ''
  for (let i = 0; i <= 16; i++) {
    const q = Rr((i * N) / 16)
    const mj = i % 4 === 0
    const L = mj ? 6 : 3
    const s = `M${n1(q[0])} ${n1(q[1])}L${n1(q[0] + TD[0] * L)} ${n1(q[1] + TD[1] * L)}`
    if (mj) major += s
    else ticks += s
  }
  const tab = (c: number): V2 => {
    const q = Rr(c + 0.5)
    return [q[0] + TD[0] * 9, q[1] + TD[1] * 9]
  }
  const A0 = P(...RB(k + 0.5))
  const T0 = Rr(k + 0.5)
  const TT = tab(k)
  const ghost = hover != null && hover !== k ? hover : null
  const GT = ghost != null ? tab(ghost) : null
  const ttr = ax === 'z' ? 'translate(0,-50%)' : ax === 'x' ? 'translate(-50%,0)' : 'translate(0,-20%)'
  const ends = [0, N - 1].filter((t) => Math.abs(t - k) > (2 * N) / 32)

  const toIdx = (e: RPointerEvent<HTMLDivElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const sc = W / (rc.width || W)
    const mx = (e.clientX - rc.left) * sc
    const my = (e.clientY - rc.top) * sc
    const dx = r1[0] - r0[0]
    const dy = r1[1] - r0[1]
    return clamp(Math.round((((mx - r0[0]) * dx + (my - r0[1]) * dy) / (dx * dx + dy * dy)) * N - 0.5), 0, N - 1)
  }
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(e.pointerId)
    const i = toIdx(e)
    setHover(i)
    if (i !== k) ctx.setSlice({ index: i })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const i = toIdx(e)
    if (drag != null && e.pointerId === drag && i !== k) ctx.setSlice({ index: i })
    if (i !== hover) setHover(i)
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag == null || e.pointerId !== drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }

  const held = drag != null
  return (
    <div
      className="qs-lab-hit"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => !held && setHover(null)}
      data-tip="Slice plane"
      data-tip-desc="Drag to move the plane; hover previews a layer"
      style={{ position: 'relative', width: W, height: H, cursor: held ? 'grabbing' : 'ns-resize', userSelect: 'none', touchAction: 'none' }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
        <path d={hid} style={{ fill: 'none', stroke: 'var(--qs-ink4)', strokeWidth: 1, strokeDasharray: '2 3' }} />
        {ghost != null && <path d={quad(ghost + 0.5)} style={{ fill: 'none', stroke: 'var(--qs-ink2)', strokeWidth: 1, strokeDasharray: '3 3' }} />}
        <path d={quad(k + 0.5)} style={{ fill: held ? 'var(--qs-line)' : 'var(--qs-faint)', stroke: 'var(--qs-ink)', strokeWidth: 1 }} />
        <path d={vis} style={{ fill: 'none', stroke: 'var(--qs-ink3)', strokeWidth: 1 }} />
        <path d={`M${n1(A0[0])} ${n1(A0[1])}L${n1(T0[0])} ${n1(T0[1])}`} style={{ fill: 'none', stroke: 'var(--qs-ink)', strokeWidth: 1 }} />
        <path d={`M${n1(r0[0])} ${n1(r0[1])}L${n1(r1[0])} ${n1(r1[1])}`} style={{ fill: 'none', stroke: 'var(--qs-ink3)', strokeWidth: 1 }} />
        <path d={ticks} style={{ fill: 'none', stroke: 'var(--qs-ink4)', strokeWidth: 1 }} />
        <path d={major} style={{ fill: 'none', stroke: 'var(--qs-ink3)', strokeWidth: 1 }} />
      </svg>
      {ends.map((t) => {
        const q = Rr(t + 0.5)
        const pos = ax === 'x' ? { left: q[0], top: q[1] + 9, transform: 'translate(-50%,0)' } : { left: q[0] + TD[0] * 10, top: q[1] + TD[1] * 10, transform: 'translate(0,-50%)' }
        return (
          <span key={t} className="qs-lab-small" style={{ position: 'absolute', ...pos, fontSize: 11, color: 'var(--qs-ink3)', pointerEvents: 'none' }}>
            {t}
          </span>
        )
      })}
      {GT && ghost != null && (
        <span className="qs-lab-pill qs-lab-pill--ghost" style={{ position: 'absolute', left: n1(GT[0]), top: n1(GT[1]), transform: ttr, pointerEvents: 'none' }}>
          {`${ax} ${ghost}`}
        </span>
      )}
      <span className={'qs-lab-pill' + (held ? ' qs-lab-pill--held' : '')} style={{ position: 'absolute', left: n1(TT[0]), top: n1(TT[1]), transform: ttr, pointerEvents: 'none' }}>
        {`${ax} ${k}`}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- v3 layer stack

const ROW = 7 // px per stroke row (1px stroke + gap)

/** One stroke per layer group, top = highest layer, as long as the cells the model fills in it; the
 *  cursor at the cutting plane glides with it. Click or drag to set the slice. */
export function LayerStack({ ctx }: { ctx: HudCtx }) {
  const N = Math.max(1, ctx.n)
  const g = Math.max(1, Math.ceil(N / 32)) // layers per stroke
  const G = Math.ceil(N / g)
  const k = clamp(Math.round(ctx.slice.index), 0, N - 1)
  const cur = Math.floor(k / g)
  const [drag, setDrag] = useState<number | null>(null)
  const grid = ctx.data.grid
  const counts = useMemo(() => {
    const per = grid && grid.n === N ? solidPerLayer(grid, ctx.slice.axis) : []
    return Array.from({ length: G }, (_, grp) => per.slice(grp * g, grp * g + g).reduce((a, v) => a + v, 0))
  }, [grid, N, G, g, ctx.slice.axis])
  const peak = Math.max(1, ...counts)

  const at = (e: RPointerEvent<HTMLDivElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const row = clamp(Math.floor((e.clientY - rc.top) / ROW), 0, G - 1)
    const grp = G - 1 - row
    return grp === cur ? k : clamp(grp * g + Math.floor(g / 2), 0, N - 1)
  }
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(e.pointerId)
    const i = at(e)
    if (i !== k) ctx.setSlice({ index: i })
  }
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag == null || e.pointerId !== drag) return
    const i = at(e)
    if (i !== k) ctx.setSlice({ index: i })
  }
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag == null || e.pointerId !== drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }
  const width = (grp: number) => (counts[grp] ? 6 + 94 * (counts[grp] / peak) : 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <span className="qs-lab-label">Layers</span>
      <div
        className="qs-lab-stack qs-lab-hit"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ position: 'relative', width: 200, cursor: drag != null ? 'grabbing' : 'pointer', userSelect: 'none', touchAction: 'none' }}
      >
        {Array.from({ length: G }, (_, r) => {
          const grp = G - 1 - r, lo = grp * g, hi = Math.min(N - 1, lo + g - 1)
          const d = Math.abs(grp - cur)
          return (
            <div key={grp} className="qs-lab-row" data-tip={g > 1 ? `Layers ${lo}–${hi}` : `Layer ${lo}`} data-tip-desc={`${counts[grp] ?? 0} cells`}
              style={{ height: ROW, display: 'flex', alignItems: 'center' }}>
              <span className="qs-lab-stroke" style={{ width: width(grp), height: 1, flex: 'none', background: d === 0 ? 'var(--qs-ink)' : d < 3 ? 'var(--qs-ink3)' : 'var(--qs-ink4)' }} />
            </div>
          )
        })}
        {/* the cutting plane: a rule across the stack and its layer, gliding as it moves */}
        <div className="qs-lab-cursor" style={{ transform: `translateY(${(G - 1 - cur) * ROW + ROW / 2}px)` }} aria-hidden>
          <span className="qs-lab-cursor__rule" />
          <span className="qs-lab-small" style={{ color: 'var(--qs-ink)' }}>layer {k}</span>
        </div>
      </div>
      <span className="qs-lab-small" style={{ color: 'var(--qs-ink3)' }}>
        {ctx.slice.axis} 0–{N - 1} · <Count>{counts[cur] ?? 0}</Count> cells
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- v4 marching

/** Dashed marching rectangle around the object while the grid is being recomputed. */
export function Marching({ ctx }: { ctx: HudCtx }) {
  if (!ctx.busy || !ctx.rect) return null
  const pad = 10
  const { l, r, t, b } = ctx.rect
  const x = n1(l - pad)
  const y = n1(t - pad)
  const w = n1(r - l + 2 * pad)
  const h = n1(b - t + 2 * pad)
  return (
    <svg className="qs-lab-layer" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} aria-hidden>
      <rect className="qs-lab-march" x={x} y={y} width={w} height={h} style={{ fill: 'none', stroke: 'var(--qs-ink)', strokeWidth: 1, strokeDasharray: '4 4' }} />
      <text x={x + 8} y={y + h + 16} style={{ fill: 'var(--qs-ink3)', font: '400 10px/1 var(--qs-mono)' }}>
        recomputing grid
      </text>
    </svg>
  )
}
