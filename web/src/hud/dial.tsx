// Orbit, abstracted (QLMarks4): position as numbers on scales, not rings around the object.
// O1 tick ring, O2 split arcs and O3 edge rulers are draggable (each drag calls ctx.orbitTo);
// O4 polar keeps a short dashed history.
import { useMemo, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import type { HudCtx, HudModule } from './types'
import { Card, useCamTrail } from './camera'
import './orbit.css'

const RAD = Math.PI / 180
const wrap360 = (v: number) => ((v % 360) + 360) % 360
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const n1 = (v: number) => v.toFixed(1)
const a3 = (v: number) => String(Math.round(wrap360(v)) % 360).padStart(3, '0')
const fE = (v: number) => Math.round(v) + '°'
const cross = (x: number, y: number, r = 6) => `M${n1(x - r)} ${n1(y)}H${n1(x + r)}M${n1(x)} ${n1(y - r)}V${n1(y + r)}`
/** Point at compass angle a (0 at top, clockwise) and radius r around (cx, cy). */
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + r * Math.sin(a * RAD), cy - r * Math.cos(a * RAD)]

/** Pointer position in the SVG's own units. */
function svgPoint(e: RPointerEvent<SVGElement>): [number, number] {
  const el = e.currentTarget
  const svg = el instanceof SVGSVGElement ? el : el.ownerSVGElement
  if (!svg) return [0, 0]
  const r = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  const k = vb && vb.width && r.width ? vb.width / r.width : 1
  return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]
}

/** Press-and-drag on an SVG element; onPoint receives the pointer in SVG units on press and move. */
function useDrag(onPoint: (x: number, y: number) => void) {
  const [id, setId] = useState<number | null>(null)
  const end = (e: RPointerEvent<SVGElement>) => {
    if (e.pointerId !== id) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setId(null)
  }
  return {
    active: id != null,
    on: {
      onPointerDown: (e: RPointerEvent<SVGElement>) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        setId(e.pointerId)
        onPoint(...svgPoint(e))
      },
      onPointerMove: (e: RPointerEvent<SVGElement>) => {
        if (e.pointerId === id) onPoint(...svgPoint(e))
      },
      onPointerUp: end,
      onPointerCancel: end,
    },
  }
}

// O1 · tick ring: 72 ticks, one node, no ellipse ---------------------------------------------

const T_CX = 114
const T_CY = 76
const T_R = 56
const TICKS72 = (() => {
  let d = ''
  for (let i = 0; i < 72; i++) {
    const a = polar(T_CX, T_CY, T_R - 3, i * 5)
    const b = polar(T_CX, T_CY, T_R + 3, i * 5)
    d += `M${n1(a[0])} ${n1(a[1])}L${n1(b[0])} ${n1(b[1])}`
  }
  return d
})()

function TickRing({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const drag = useDrag((x, y) => ctx.orbitTo(wrap360(Math.atan2(x - T_CX, T_CY - y) / RAD), el))
  const [hov, setHov] = useState(false)
  const a = polar(T_CX, T_CY, T_R - 10, az)
  const b = polar(T_CX, T_CY, T_R + 12, az)
  const p = polar(T_CX, T_CY, T_R, az)
  const l = polar(T_CX, T_CY, T_R + 16, az)
  const anchor = Math.sin(az * RAD) > 0.25 ? 'start' : Math.sin(az * RAD) < -0.25 ? 'end' : 'middle'
  return (
    <Card title="Azimuth" value={'el ' + fE(el)} w={228} h={152}>
      <path d={TICKS72} className="qh-k3" />
      <path d={cross(T_CX, T_CY)} className="qh-k3" />
      {(hov || drag.active) && <circle cx={n1(p[0])} cy={n1(p[1])} r="9" className={drag.active ? 'qh-k1' : 'qh-k3 qh-halo'} />}
      <line x1={n1(a[0])} y1={n1(a[1])} x2={n1(b[0])} y2={n1(b[1])} className="qh-k1" />
      <circle cx={n1(p[0])} cy={n1(p[1])} r="4" className="qh-f1" />
      <text x={n1(l[0])} y={n1(l[1] + 3.5)} textAnchor={anchor} className="qh-t1">{'az ' + a3(az) + '°'}</text>
      <circle
        cx={T_CX}
        cy={T_CY}
        r={T_R}
        className={'qh-ring-hit qh-grab' + (drag.active ? ' qh-on' : '')}
        data-tip="Azimuth"
        data-tip-desc="Drag around the ring to orbit."
        onPointerEnter={() => setHov(true)}
        onPointerLeave={() => setHov(false)}
        {...drag.on}
      />
    </Card>
  )
}

// O2 · split arcs: azimuth and elevation read apart ------------------------------------------

const S_AX = 50
const S_AY = 72
const S_AR = 40
const S_EX = 118
const S_EY = 72
const S_ER = 56
const EL_BASE = `M${S_EX + S_ER} ${S_EY}A${S_ER} ${S_ER} 0 0 0 ${S_EX} ${S_EY - S_ER}`
const EL_BELOW = `M${S_EX + S_ER} ${S_EY}A${S_ER} ${S_ER} 0 0 1 ${S_EX} ${S_EY + S_ER}`
const EL_HIT = `M${S_EX} ${S_EY - S_ER}A${S_ER} ${S_ER} 0 0 1 ${S_EX} ${S_EY + S_ER}`

function SplitArcs({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const da = useDrag((x, y) => ctx.orbitTo(wrap360(Math.atan2(x - S_AX, S_AY - y) / RAD), el))
  const de = useDrag((x, y) => {
    const dx = Math.max(x - S_EX, 0.001)
    ctx.orbitTo(az, clamp(Math.atan2(S_EY - y, dx) / RAD, -89, 89))
  })
  const A = wrap360(az)
  const ap = polar(S_AX, S_AY, S_AR, A)
  const azArc = A > 0.5 ? `M${S_AX} ${S_AY - S_AR}A${S_AR} ${S_AR} 0 ${A > 180 ? 1 : 0} 1 ${n1(ap[0])} ${n1(ap[1])}` : ''
  const ep: [number, number] = [S_EX + S_ER * Math.cos(el * RAD), S_EY - S_ER * Math.sin(el * RAD)]
  const elArc = Math.abs(el) > 0.5 ? `M${S_EX + S_ER} ${S_EY}A${S_ER} ${S_ER} 0 0 ${el > 0 ? 0 : 1} ${n1(ep[0])} ${n1(ep[1])}` : ''
  return (
    <Card title="Orbit" value={`${a3(az)} / ${Math.round(el)}`} w={190} h={150}>
      <circle cx={S_AX} cy={S_AY} r={S_AR} className="qh-k4" />
      <path d={cross(S_AX, S_AY, 4)} className="qh-k4" />
      {azArc && <path d={azArc} className="qh-k1" style={{ strokeWidth: da.active ? 1.6 : 1 }} />}
      <circle cx={n1(ap[0])} cy={n1(ap[1])} r="3.5" className="qh-f1" />
      <line x1={S_EX - 8} y1={S_EY} x2={S_EX + S_ER + 6} y2={S_EY} className="qh-k4" />
      <path d={EL_BASE} className="qh-k4" />
      <path d={EL_BELOW} className="qh-k4 qh-guide" />
      {elArc && <path d={elArc} className="qh-k1" style={{ strokeWidth: de.active ? 1.6 : 1 }} />}
      <circle cx={n1(ep[0])} cy={n1(ep[1])} r="3.5" className="qh-f1" />
      <text x={S_AX} y="142" textAnchor="middle" className="qh-t1">{'az ' + a3(az) + '°'}</text>
      <text x={S_EX + 10} y="142" className="qh-t1">{'el ' + fE(el)}</text>
      <circle
        cx={S_AX}
        cy={S_AY}
        r={S_AR}
        className={'qh-ring-hit qh-grab' + (da.active ? ' qh-on' : '')}
        data-tip="Azimuth"
        data-tip-desc="Drag around the circle to orbit."
        {...da.on}
      />
      <path
        d={EL_HIT}
        className={'qh-ring-hit qh-grab' + (de.active ? ' qh-on' : '')}
        data-tip="Elevation"
        data-tip-desc="Drag along the arc to raise or lower the camera."
        {...de.on}
      />
    </Card>
  )
}

// O3 · edge rulers: azimuth on the floor edge, elevation on the side -------------------------

function EdgeRulers({ ctx }: { ctx: HudCtx }) {
  const { w, h } = ctx
  const { az, el } = ctx.cam
  // bottom ruler (az 0 → 360) and right ruler (el +90 at the top → −90)
  const x0 = 40
  const x1 = Math.max(x0 + 100, w - 60)
  const yb = h - 26
  const xr = w - 26
  const y0 = 40
  const y1 = Math.max(y0 + 100, h - 60)
  const X = (a: number) => x0 + (wrap360(a) / 360) * (x1 - x0)
  const Y = (e: number) => y0 + ((90 - clamp(e, -90, 90)) / 180) * (y1 - y0)
  const g = useMemo(() => {
    let minor = ''
    let major = ''
    for (let a = 0; a <= 360; a += 10) {
      const x = n1(x0 + (a / 360) * (x1 - x0))
      if (a % 90 === 0) major += `M${x} ${yb - 6}V${yb + 6}`
      else minor += `M${x} ${yb - 4}V${yb + 4}`
    }
    for (let e = -90; e <= 90; e += 10) {
      const y = n1(y0 + ((90 - e) / 180) * (y1 - y0))
      if (e % 45 === 0) major += `M${xr - 6} ${y}H${xr + 6}`
      else minor += `M${xr - 4} ${y}H${xr + 4}`
    }
    return { minor, major }
  }, [x0, x1, yb, xr, y0, y1])
  const dA = useDrag((x) => ctx.orbitTo(clamp((x - x0) / (x1 - x0), 0, 1) * 360, el))
  const dE = useDrag((_x, y) => ctx.orbitTo(az, clamp(90 - ((y - y0) / (y1 - y0)) * 180, -89, 89)))
  const ax = X(az)
  const ey = Y(el)
  return (
    <svg className="qh-layer qh-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      <path d={g.minor} className="qh-k4" />
      <path d={g.major} className="qh-k3" />
      {[0, 90, 180, 270, 360].map((a) => (
        <text key={a} x={n1(x0 + (a / 360) * (x1 - x0))} y={yb - 10} textAnchor="middle" className="qh-t3">
          {String(a).padStart(3, '0')}
        </text>
      ))}
      {[90, 0, -90].map((e) => (
        <text key={e} x={xr + 10} y={n1(Y(e) + 3.5)} className="qh-t3">
          {e > 0 ? '+' + e : e < 0 ? '−' + -e : '0'}
        </text>
      ))}
      <path d={`M${n1(ax)} ${yb + 7}l-4 7h8z`} className="qh-f1" />
      <text x={n1(ax + 8)} y={yb + 18} className="qh-t1">{a3(az)}</text>
      <path d={`M${xr - 7} ${n1(ey)}l-7 -4v8z`} className="qh-f1" />
      <text x={xr - 18} y={n1(ey + 3.5)} textAnchor="end" className="qh-t1">{Math.round(el)}</text>
      <rect
        x={x0 - 6}
        y={yb - 12}
        width={x1 - x0 + 12}
        height={34}
        className={'qh-hit qh-ew'}
        data-tip="Azimuth"
        data-tip-desc="Drag along the ruler to orbit."
        {...dA.on}
      />
      <rect
        x={xr - 24}
        y={y0 - 6}
        width={34}
        height={y1 - y0 + 12}
        className={'qh-hit qh-ns'}
        data-tip="Elevation"
        data-tip-desc="Drag along the ruler to raise or lower the camera."
        {...dE.on}
      />
    </svg>
  )
}

// O4 · polar: elevation inward, recent path dashed -------------------------------------------

const P_CX = 92
const P_CY = 80
const P_R = 60
const pr = (el: number) => Math.min(P_R + 16, (P_R * (90 - el)) / 90)
const SPOKES = (() => {
  let d = ''
  for (let a = 0; a < 360; a += 45) {
    const p = polar(P_CX, P_CY, P_R, a)
    d += `M${P_CX} ${P_CY}L${n1(p[0])} ${n1(p[1])}`
  }
  return d
})()

function Polar({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const trail = useCamTrail(ctx.tick, az, el)
  let path = ''
  for (const [a, e] of trail) {
    const p = polar(P_CX, P_CY, pr(e), a)
    path += (path ? 'L' : 'M') + n1(p[0]) + ' ' + n1(p[1])
  }
  const p = polar(P_CX, P_CY, pr(el), az)
  if (path) path += 'L' + n1(p[0]) + ' ' + n1(p[1])
  const flip = p[0] > 130
  return (
    <Card title="Polar" value={`${a3(az)} / ${Math.round(el)}`} w={190} h={160}>
      <circle cx={P_CX} cy={P_CY} r={P_R} className="qh-k4" />
      <circle cx={P_CX} cy={P_CY} r={P_R * (2 / 3)} className="qh-k4" />
      <circle cx={P_CX} cy={P_CY} r={P_R / 3} className="qh-k4" />
      <path d={SPOKES} className="qh-k4 qh-dot3" />
      {el < 0 && <circle cx={P_CX} cy={P_CY} r={P_R + 16} className="qh-k4 qh-guide" />}
      {path && <path d={path} className="qh-k1 qh-guide" />}
      <circle cx={n1(p[0])} cy={n1(p[1])} r="4" className="qh-f1" />
      <text x={n1(flip ? p[0] - 9 : p[0] + 9)} y={n1(p[1] - 6)} textAnchor={flip ? 'end' : 'start'} className="qh-t1">
        {`${a3(az)} / ${Math.round(el)}`}
      </text>
      <text x={P_CX} y={P_CY - P_R - 6} textAnchor="middle" className="qh-t3">0°</text>
      <text x={P_CX + P_R + 6} y={P_CY + 3.5} className="qh-t3">el 0</text>
    </Card>
  )
}

export const DIAL_MODULES: HudModule[] = [
  {
    family: 'dial',
    id: 'o1',
    label: 'tick ring',
    desc: '72 ticks, one node, no ellipse',
    slot: 'br',
    interactive: true,
    render: (ctx) => <TickRing ctx={ctx} />,
  },
  {
    family: 'dial',
    id: 'o2',
    label: 'split arcs',
    desc: 'Azimuth and elevation read apart',
    slot: 'br',
    interactive: true,
    render: (ctx) => <SplitArcs ctx={ctx} />,
  },
  {
    family: 'dial',
    id: 'o3',
    label: 'edge rulers',
    desc: 'Azimuth on the floor edge, elevation on the side',
    slot: 'full',
    interactive: true,
    render: (ctx) => <EdgeRulers ctx={ctx} />,
  },
  {
    family: 'dial',
    id: 'o4',
    label: 'polar',
    desc: 'Elevation inward, recent path dashed',
    slot: 'br',
    render: (ctx) => <Polar ctx={ctx} />,
  },
]
