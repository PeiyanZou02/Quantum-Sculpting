// Orbit rings (QLMarks4 · "Orbit rings"): where the view camera is, and where it can go. Drawn in
// perspective around the model with ctx.project, plus the satin gimbal (QLControls4 · "Orbit gimbal
// states") bound to the live camera.
//
// Note on the camera node: any point on the line from the target toward the camera projects onto
// the target itself, so a node drawn "at the camera" would sit on the model. The node is therefore
// shown in profile: on the elevation arc in the vertical plane square to the view (to the right of
// the model), where the elevation reads at its true angle. The azimuth is marked on the floor ring
// at the point nearest the viewer.
/* oxlint-disable react-hooks/exhaustive-deps -- projected geometry is memoised by ctx.tick (and size, box); ctx.project is read inside */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import type { HudCtx, HudModule, Vec3 } from './types'
import { QCam } from '../qs/QCam'
import './orbit.css'

const RAD = Math.PI / 180
const wrap360 = (v: number) => ((v % 360) + 360) % 360
/** Signed shortest-arc difference b − a in (−180, 180]. */
const dArc = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const n1 = (v: number) => v.toFixed(1)
const fA = (v: number) => String(Math.round(wrap360(v)) % 360).padStart(3, '0') + '°'
const fE = (v: number) => Math.round(v) + '°'

type Proj = HudCtx['project']
type P2 = [number, number]

interface Frame {
  /** Floor centre of the box, ring radius. */
  c: Vec3
  R: number
}

function frameOf(box: HudCtx['box']): Frame | null {
  if (!box) return null
  const { min, max } = box
  const ext = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1)
  return { c: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]], R: 0.75 * ext }
}
const boxKey = (b: HudCtx['box']) => (b ? b.min.join(',') + '|' + b.max.join(',') : '')

/** Point on the horizontal ring at azimuth t (az 0 = −y, toward +x), scaled by k. */
const ringPt = (f: Frame, t: number, k = 1, dz = 0): Vec3 => [
  f.c[0] + f.R * k * Math.sin(t * RAD),
  f.c[1] - f.R * k * Math.cos(t * RAD),
  f.c[2] + dz,
]
/** Point on the sphere around the ring centre at azimuth a, elevation e. */
const sphPt = (c: Vec3, R: number, a: number, e: number): Vec3 => [
  c[0] + R * Math.cos(e * RAD) * Math.sin(a * RAD),
  c[1] - R * Math.cos(e * RAD) * Math.cos(a * RAD),
  c[2] + R * Math.sin(e * RAD),
]

/** Polyline through projected points, broken where a point is behind the camera. */
function pathOf(project: Proj, pts: Vec3[]): string {
  let d = ''
  let pen = false
  for (const p of pts) {
    const q = project(p)
    if (!q) {
      pen = false
      continue
    }
    d += (pen ? 'L' : 'M') + n1(q[0]) + ' ' + n1(q[1])
    pen = true
  }
  return d
}

/** The floor ring split into the half nearer the viewer (solid ink) and the far half (hidden, dashed). */
function ringHalves(project: Proj, f: Frame, az: number, k = 1, dz = 0): { front: string; back: string } {
  const front: Vec3[] = []
  const back: Vec3[] = []
  for (let i = 0; i <= 72; i++) {
    const t = az - 90 + i * 2.5
    front.push(ringPt(f, t, k, dz))
    back.push(ringPt(f, t + 180, k, dz))
  }
  return { front: pathOf(project, front), back: pathOf(project, back) }
}

interface Seg {
  d: string
  front: boolean
}
/** Radial ticks on the ring every `step` degrees; majors (every 90°) reach further out. */
function ringTicks(project: Proj, f: Frame, az: number, step: number): Seg[] {
  const out: Seg[] = []
  for (let t = 0; t < 360; t += step) {
    const mj = t % 90 === 0
    const a = project(ringPt(f, t, 1))
    const b = project(ringPt(f, t, mj ? 1.12 : 1.06))
    if (!a || !b) continue
    out.push({ d: `M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`, front: Math.cos((t - az) * RAD) > 0 })
  }
  return out
}

const cross = (p: P2 | null, r = 8) => (p ? `M${n1(p[0] - r)} ${n1(p[1])}H${n1(p[0] + r)}M${n1(p[0])} ${n1(p[1] - r)}V${n1(p[1] + r)}` : '')

/** Full-viewport SVG layer for the 'object' slot; only marked children take pointer events. */
function Layer({ ctx, children, className, opacity }: { ctx: HudCtx; children: ReactNode; className?: string; opacity?: number }) {
  return (
    <svg
      className={'qh-layer qh-svg' + (className ? ' ' + className : '')}
      width={ctx.w}
      height={ctx.h}
      viewBox={`0 0 ${ctx.w} ${ctx.h}`}
      style={{ width: ctx.w, height: ctx.h, opacity }}
    >
      {children}
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------
// v1 · gimbal: azimuth ring with ticks, elevation arc, camera node (draggable)

interface Drag {
  id: number
  x0: number
  y0: number
  a0: number
  e0: number
}

function GimbalRing({ ctx }: { ctx: HudCtx }) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hov, setHov] = useState(false)
  const { az, el } = ctx.cam
  const bk = boxKey(ctx.box)

  const g = useMemo(() => {
    const f = frameOf(ctx.box)
    if (!f) return null
    const P = ctx.project
    const ring = ringHalves(P, f, az)
    const ticks = ringTicks(P, f, az, 30)
    // the azimuth mark: the ring point nearest the viewer
    const a0 = P(ringPt(f, az, 0.92))
    const a1 = P(ringPt(f, az, 1.14))
    const aL = P(ringPt(f, az, 1.2))
    // elevation arc in profile: the vertical plane square to the view, on the model's right
    const right = az + 90
    const quarter: Vec3[] = []
    for (let e = 0; e <= 90; e += 3) quarter.push(sphPt(f.c, f.R, right, e))
    const swept: Vec3[] = []
    const n = Math.max(2, Math.ceil(Math.abs(el) / 3))
    for (let i = 0; i <= n; i++) swept.push(sphPt(f.c, f.R, right, (el * i) / n))
    const node = P(sphPt(f.c, f.R, right, el))
    const foot = P(ringPt(f, right, Math.cos(el * RAD)))
    const ctr = P(f.c)
    return {
      ring,
      ticks,
      azMark: a0 && a1 ? `M${n1(a0[0])} ${n1(a0[1])}L${n1(a1[0])} ${n1(a1[1])}` : '',
      aL,
      quarter: pathOf(P, quarter),
      swept: Math.abs(el) > 0.5 ? pathOf(P, swept) : '',
      node,
      foot,
      ctr,
    }
  }, [ctx.tick, ctx.w, ctx.h, bk, az, el])

  if (!g) return null
  const { node, ctr, foot, aL } = g
  const dragging = drag != null

  const onDown = (e: RPointerEvent<SVGElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: e.pointerId, x0: e.clientX, y0: e.clientY, a0: ctx.cam.az, e0: ctx.cam.el })
  }
  const onMove = (e: RPointerEvent<SVGElement>) => {
    if (!drag || e.pointerId !== drag.id) return
    const a = wrap360(drag.a0 + (e.clientX - drag.x0) * 0.5)
    const v = clamp(drag.e0 - (e.clientY - drag.y0) * 0.5, -89, 89)
    ctx.orbitTo(a, v)
  }
  const onUp = (e: RPointerEvent<SVGElement>) => {
    if (!drag || e.pointerId !== drag.id) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }

  return (
    <Layer ctx={ctx}>
      <path d={g.ring.back} className="qh-k4 qh-guide" />
      {g.ticks.map((t, i) => (
        <path key={i} d={t.d} className={t.front ? 'qh-k1' : 'qh-k4'} />
      ))}
      <path d={g.quarter} className="qh-k3 qh-guide" />
      {g.swept && <path d={g.swept} className="qh-k1" />}
      {node && foot && (
        <line x1={n1(node[0])} y1={n1(node[1])} x2={n1(foot[0])} y2={n1(foot[1])} className="qh-k3 qh-drop" />
      )}
      {node && ctr && (
        <line x1={n1(node[0])} y1={n1(node[1])} x2={n1(ctr[0])} y2={n1(ctr[1])} className="qh-k1 qh-dot3" />
      )}
      <path d={cross(ctr)} className="qh-k1" />
      <path d={g.ring.front} className="qh-k1" />
      {g.azMark && <path d={g.azMark} className="qh-k1" />}
      {aL && (
        <text x={n1(aL[0])} y={n1(aL[1] + 12)} textAnchor="middle" className="qh-t1 qh-th">
          {'az ' + fA(az)}
        </text>
      )}
      {node && (
        <g>
          <circle
            cx={n1(node[0])}
            cy={n1(node[1])}
            r="12"
            className={dragging ? 'qh-k1' : 'qh-k3 qh-halo'}
            opacity={hov || dragging ? 1 : 0}
          />
          <circle cx={n1(node[0])} cy={n1(node[1])} r="9" className="qh-k1" />
          <circle cx={n1(node[0])} cy={n1(node[1])} r={dragging ? 4.5 : 3.5} className="qh-f1" />
          <text x={n1(node[0] + 16)} y={n1(node[1] - 8)} className="qh-t1 qh-th">
            {'el ' + fE(el)}
          </text>
          <circle
            cx={n1(node[0])}
            cy={n1(node[1])}
            r="14"
            className={'qh-hit qh-grab' + (dragging ? ' qh-on' : '')}
            data-tip="Camera"
            data-tip-desc="Drag to orbit: across for azimuth, up and down for elevation."
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerEnter={() => setHov(true)}
            onPointerLeave={() => setHov(false)}
          />
        </g>
      )}
    </Layer>
  )
}

// ---------------------------------------------------------------------------------------------
// v2 · cage: latitude and meridians, for free orbit

const CAGE_LATS = [-60, -30, 0, 30, 60]
const CAGE_MERS = [0, 30, 60, 90, 120, 150]

function Cage({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const bk = boxKey(ctx.box)
  const g = useMemo(() => {
    const box = ctx.box
    if (!box) return null
    const P = ctx.project
    const { min, max } = box
    const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    const R = 0.75 * Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1)
    // camera direction, to split each circle into its near and far halves
    const cd: Vec3 = [Math.cos(el * RAD) * Math.sin(az * RAD), -Math.cos(el * RAD) * Math.cos(az * RAD), Math.sin(el * RAD)]
    const near: Vec3[][] = []
    const far: Vec3[][] = []
    const circle = (fn: (t: number) => Vec3) => {
      let run: Vec3[] = []
      let side: boolean | null = null
      for (let i = 0; i <= 72; i++) {
        const p = fn(i * 5)
        const s = (p[0] - c[0]) * cd[0] + (p[1] - c[1]) * cd[1] + (p[2] - c[2]) * cd[2] >= 0
        if (side !== null && s !== side) {
          run.push(p)
          ;(side ? near : far).push(run)
          run = []
        }
        run.push(p)
        side = s
      }
      if (run.length > 1) (side ? near : far).push(run)
    }
    for (const la of CAGE_LATS) circle((t) => sphPt(c, R, t, la))
    for (const m of CAGE_MERS) circle((t) => sphPt(c, R, m, t))
    // silhouette: the great circle square to the view
    const up: Vec3 = [-Math.sin(el * RAD) * Math.sin(az * RAD), Math.sin(el * RAD) * Math.cos(az * RAD), Math.cos(el * RAD)]
    const rt: Vec3 = [Math.cos(az * RAD), Math.sin(az * RAD), 0]
    const sil: Vec3[] = []
    for (let i = 0; i <= 72; i++) {
      const t = i * 5 * RAD
      sil.push([c[0] + R * (Math.cos(t) * rt[0] + Math.sin(t) * up[0]), c[1] + R * (Math.cos(t) * rt[1] + Math.sin(t) * up[1]), c[2] + R * (Math.cos(t) * rt[2] + Math.sin(t) * up[2])])
    }
    // camera, in profile on its own latitude
    const arc: Vec3[] = []
    for (let t = 65; t <= 115; t += 5) arc.push(sphPt(c, R, az + t, el))
    return {
      near: near.map((r) => pathOf(P, r)).join(''),
      far: far.map((r) => pathOf(P, r)).join(''),
      sil: pathOf(P, sil),
      arc: pathOf(P, arc),
      node: P(sphPt(c, R, az + 90, el)),
    }
  }, [ctx.tick, ctx.w, ctx.h, bk, az, el])
  if (!g) return null
  const { node } = g
  return (
    <Layer ctx={ctx}>
      <path d={g.far} className="qh-k4 qh-guide" />
      <path d={g.near} className="qh-k3" />
      <path d={g.sil} className="qh-k1" />
      <path d={g.arc} className="qh-k1" />
      {node && (
        <>
          <circle cx={n1(node[0])} cy={n1(node[1])} r="3.5" className="qh-f1" />
          <text x={n1(node[0] + 10)} y={n1(node[1] - 8)} className="qh-t1 qh-th">
            {fA(az) + ' / ' + fE(el)}
          </text>
        </>
      )}
    </Layer>
  )
}

// ---------------------------------------------------------------------------------------------
// v3 · stations: twelve fixed views, visited ones filled (click to go)

const STATIONS = Array.from({ length: 12 }, (_, i) => i * 30)

function Stations({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const bk = boxKey(ctx.box)
  const [visited, setVisited] = useState(0)
  const [hot, setHot] = useState(-1)

  // nearest station within 15°, and whether the camera sits on it
  let cur = -1
  let best = 15
  for (let i = 0; i < 12; i++) {
    const d = Math.abs(dArc(az, STATIONS[i]))
    if (d < best) {
      best = d
      cur = i
    }
  }
  const at = cur >= 0 && best < 4 ? cur : -1
  useEffect(() => {
    if (at >= 0) setVisited((m) => m | (1 << at))
  }, [at])

  const g = useMemo(() => {
    const f = frameOf(ctx.box)
    if (!f) return null
    const P = ctx.project
    return {
      ring: ringHalves(P, f, az),
      pts: STATIONS.map((t) => ({ p: P(ringPt(f, t)), front: Math.cos((t - az) * RAD) > -0.05 })),
      lab: P(ringPt(f, az, 1.2)),
      ctr: P(f.c),
    }
  }, [ctx.tick, ctx.w, ctx.h, bk, az])
  if (!g) return null

  const go = (i: number) => {
    setVisited((m) => m | (1 << i))
    ctx.orbitTo(STATIONS[i], el)
  }
  const label = cur >= 0 ? `station ${String(cur + 1).padStart(2, '0')} / 12` : `${fA(az)} · 12 stations`

  return (
    <Layer ctx={ctx}>
      <path d={g.ring.back} className="qh-k4 qh-guide" />
      <path d={g.ring.front} className="qh-k1" />
      <path d={cross(g.ctr, 6)} className="qh-k3" />
      {g.pts.map(({ p, front }, i) => {
        if (!p) return null
        const on = i === cur
        const seen = (visited >> i) & 1
        const x = n1(p[0])
        const y = n1(p[1])
        return (
          <g key={i}>
            {(on || hot === i) && <circle cx={x} cy={y} r="9" className={on ? 'qh-k1' : 'qh-k3 qh-halo'} />}
            <circle
              cx={x}
              cy={y}
              r={on ? 4 : 2.5}
              className={(seen || on ? (front ? 'qh-f1 ' : 'qh-f3 ') : 'qh-fbg ') + (front ? 'qh-k1' : 'qh-k3')}
            />
            <circle
              cx={x}
              cy={y}
              r="10"
              className="qh-hit qh-press"
              data-tip={`Station ${String(i + 1).padStart(2, '0')} · ${fA(STATIONS[i])}`}
              data-tip-desc={seen ? 'Visited. Click to swing the camera back here.' : 'Click to swing the camera here.'}
              onPointerEnter={() => setHot(i)}
              onPointerLeave={() => setHot(-1)}
              onClick={() => go(i)}
            />
          </g>
        )
      })}
      {g.lab && (
        <text x={n1(g.lab[0])} y={n1(g.lab[1] + 12)} textAnchor="middle" className="qh-t1 qh-th">
          {label}
        </text>
      )}
    </Layer>
  )
}

// ---------------------------------------------------------------------------------------------
// v4 · live: shown only while the view is moving; fades ~800ms after the last change

function useMoving(tick: number, az: number, ms = 800) {
  const [moving, setMoving] = useState(false)
  const [rate, setRate] = useState(0)
  const last = useRef<{ tick: number; az: number; t: number } | null>(null)
  const timer = useRef(0)
  useEffect(() => {
    const now = performance.now()
    const p = last.current
    last.current = { tick, az, t: now }
    if (!p || p.tick === tick) return
    const dt = (now - p.t) / 1000
    if (dt > 0 && dt < 0.5) {
      const v = Math.abs(dArc(p.az, az)) / dt
      setRate((r) => r * 0.7 + v * 0.3)
    }
    setMoving(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setMoving(false)
      setRate(0)
    }, ms)
  }, [tick, az, ms])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { moving, rate }
}

function LiveRing({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const bk = boxKey(ctx.box)
  const { moving, rate } = useMoving(ctx.tick, az)
  const g = useMemo(() => {
    if (!moving) return null
    const f = frameOf(ctx.box)
    if (!f) return null
    const P = ctx.project
    return {
      ring: ringHalves(P, f, az),
      ticks: ringTicks(P, f, az, 30),
      node: P(ringPt(f, az)),
      ctr: P(f.c),
    }
  }, [moving, ctx.tick, ctx.w, ctx.h, bk, az])
  // keep the last drawing while fading out
  const keep = useRef(g)
  if (g) keep.current = g
  const d = g ?? keep.current
  if (!d) return null
  const r = Math.round(rate)
  const label = r >= 1 ? `orbiting · ${r}°/s` : `${fA(az)} / ${fE(el)}`
  const { node } = d
  return (
    <Layer ctx={ctx} className="qh-live" opacity={moving ? 1 : 0}>
      <path d={d.ring.back} className="qh-k4 qh-guide" />
      {d.ticks.map((t, i) => (
        <path key={i} d={t.d} className={t.front ? 'qh-k1' : 'qh-k4'} />
      ))}
      <path d={d.ring.front} className="qh-k1" />
      <path d={cross(d.ctr)} className="qh-k1" />
      {node && (
        <>
          <circle cx={n1(node[0])} cy={n1(node[1])} r="9" className="qh-k1" />
          <circle cx={n1(node[0])} cy={n1(node[1])} r="4" className="qh-f1" />
          <text x={n1(node[0])} y={n1(node[1] + 24)} textAnchor="middle" className="qh-t1 qh-th">
            {label}
          </text>
        </>
      )}
    </Layer>
  )
}

// ---------------------------------------------------------------------------------------------
// v5 · gimbal states: the satin QCam bound to the live camera (rest, hover, drag, snap)

function GimbalStates({ ctx }: { ctx: HudCtx }) {
  const { az, el, dist } = ctx.cam
  return (
    <div
      style={{ pointerEvents: 'auto', display: 'inline-flex' }}
      data-tip="Orbit gimbal"
      data-tip-desc="Drag to orbit, double-click to reset, or pick a station. Scales appear while the hand is on it."
    >
      <QCam value={{ az: wrap360(az), el: clamp(el, 0, 89), dist }} onChange={(c) => ctx.orbitTo(c.az, c.el)} />
    </div>
  )
}

export const ORBIT_MODULES: HudModule[] = [
  {
    family: 'orbit',
    id: 'v1',
    label: 'gimbal',
    desc: 'Azimuth ring, elevation arc, camera node',
    slot: 'object',
    interactive: true,
    render: (ctx) => <GimbalRing ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v2',
    label: 'cage',
    desc: 'Latitude and meridians, for free orbit',
    slot: 'object',
    render: (ctx) => <Cage ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v3',
    label: 'stations',
    desc: 'Twelve fixed views, visited ones filled',
    slot: 'object',
    interactive: true,
    render: (ctx) => <Stations ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v4',
    label: 'live',
    desc: 'Shown only while the view is moving',
    slot: 'object',
    render: (ctx) => <LiveRing ctx={ctx} />,
  },
  {
    family: 'orbit',
    id: 'v5',
    label: 'gimbal states',
    desc: 'Scales appear only while the hand is on it',
    slot: 'bl',
    interactive: true,
    render: (ctx) => <GimbalStates ctx={ctx} />,
  },
]
