// Camera, abstracted (QLMarks4): the view camera as a diagram rather than an object: where it
// stands, what it sees and how it sits against the grid. Ink is the camera; grey is context.
// Small corner diagrams, live from ctx.cam.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { HudCtx, HudModule } from './types'
import './orbit.css'

const RAD = Math.PI / 180
const wrap360 = (v: number) => ((v % 360) + 360) % 360
const dArc = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const n1 = (v: number) => v.toFixed(1)
const a3 = (v: number) => String(Math.round(wrap360(v)) % 360).padStart(3, '0')
const fA = (v: number) => a3(v) + '°'
const fE = (v: number) => Math.round(v) + '°'
const cross = (x: number, y: number, r = 8) => `M${n1(x - r)} ${n1(y)}H${n1(x + r)}M${n1(x)} ${n1(y - r)}V${n1(y + r)}`

/** Recent camera positions (az, el), newest last; a new point is kept once the camera moves ≥ 2°. */
export function useCamTrail(tick: number, az: number, el: number, max = 24): [number, number][] {
  const [trail, setTrail] = useState<[number, number][]>([])
  useEffect(() => {
    setTrail((t) => {
      const l = t[t.length - 1]
      if (l && Math.abs(dArc(l[0], az)) < 2 && Math.abs(l[1] - el) < 2) return t
      const n: [number, number][] = [...t, [wrap360(az), el]]
      return n.length > max ? n.slice(n.length - max) : n
    })
  }, [tick, az, el, max])
  return trail
}

/** Corner card: small-caps title, a mono readout, then the diagram. */
export function Card({ title, value, w = 220, h = 150, children, overflow = false }: { title: string; value: string; w?: number; h?: number; children: ReactNode; overflow?: boolean }) {
  return (
    <div className="qh-card" style={{ width: w }}>
      <div className="qh-head">
        <span className="qh-sc">{title}</span>
        <span className="qh-val">{value}</span>
      </div>
      <svg className="qh-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: overflow ? 'visible' : 'hidden' }}>
        {children}
      </svg>
    </div>
  )
}

// C1 · viewpoint: eye, view cone and target ---------------------------------------------------

function Viewpoint({ ctx }: { ctx: HudCtx }) {
  const { el, dist, fov } = ctx.cam
  const T = [176, 78] as const
  const s = Math.sin(el * RAD)
  const c = Math.cos(el * RAD)
  let L = 70 + 10 * clamp(dist, 1, 8)
  if (c > 0.01) L = Math.min(L, (T[0] - 16) / c)
  if (Math.abs(s) > 0.01) L = Math.min(L, (s > 0 ? T[1] - 14 : 136 - T[1]) / Math.abs(s))
  const E = [T[0] - L * c, T[1] - L * s]
  const phi = Math.atan2(T[1] - E[1], T[0] - E[0])
  const hf = (clamp(fov, 1, 170) / 2) * RAD
  const ray = (a: number, len: number) => `M${n1(E[0])} ${n1(E[1])}L${n1(E[0] + len * Math.cos(a))} ${n1(E[1] + len * Math.sin(a))}`
  const r = Math.min(40, L * 0.5)
  const a0 = [E[0] + r * Math.cos(phi - hf), E[1] + r * Math.sin(phi - hf)]
  const a1 = [E[0] + r * Math.cos(phi + hf), E[1] + r * Math.sin(phi + hf)]
  // label just outside the arc, past its lower end
  const lab = [a1[0] - 4, a1[1] + 14]
  return (
    <Card title="Viewpoint" value={`el ${fE(el)} · dist ${dist.toFixed(2)}`}>
      <line x1="8" y1={T[1]} x2="212" y2={T[1]} className="qh-k4 qh-guide" />
      <path d={ray(phi - hf, L * 1.3) + ray(phi + hf, L * 1.3)} className="qh-k3" />
      <line x1={n1(E[0])} y1={n1(E[1])} x2={T[0]} y2={T[1]} className="qh-k1 qh-dot3" />
      <path d={`M${n1(a0[0])} ${n1(a0[1])}A${r} ${r} 0 0 1 ${n1(a1[0])} ${n1(a1[1])}`} className="qh-k1" />
      <circle cx={n1(E[0])} cy={n1(E[1])} r="3.5" className="qh-f1" />
      <path d={cross(T[0], T[1])} className="qh-k1" />
      <text x={n1(lab[0])} y={n1(lab[1])} textAnchor="end" className="qh-t1">{'fov ' + Math.round(fov) + '°'}</text>
    </Card>
  )
}

// C2 · frustum plan: top view; grid bounds dashed --------------------------------------------

function FrustumPlan({ ctx }: { ctx: HudCtx }) {
  const { az, el, dist, fov } = ctx.cam
  const cx = 110
  const cy = 75
  const dh = Math.max(0, dist * Math.cos(el * RAD))
  const k = clamp(62 / Math.max(dh, 0.01), 18, 44)
  const sa = Math.sin(az * RAD)
  const ca = Math.cos(az * RAD)
  const C = [cx + k * dh * sa, cy + k * dh * ca]
  // looking toward the target, i.e. against the camera's own direction
  const phi = Math.atan2(-ca, -sa)
  const aspect = ctx.h > 0 ? ctx.w / ctx.h : 1.6
  const hh = Math.atan(Math.tan((clamp(fov, 1, 170) / 2) * RAD) * aspect)
  const reach = k * dh
  const near = Math.max(12, reach * 0.25)
  const far = Math.max(40, reach + k * 0.9)
  const ux = Math.cos(phi)
  const uy = Math.sin(phi)
  const px = -uy
  const py = ux
  const at = (d: number, side: number) => [C[0] + ux * d + px * side * d * Math.tan(hh), C[1] + uy * d + py * side * d * Math.tan(hh)]
  const nl = at(near, -1)
  const nr = at(near, 1)
  const fl = at(far, -1)
  const fr = at(far, 1)
  // the model's footprint inside the grid
  const n = Math.max(ctx.n, 1)
  const b = ctx.box
  const fp = b ? { x: cx - k / 2 + (b.min[0] / n) * k, y: cy + k / 2 - (b.max[1] / n) * k, w: ((b.max[0] - b.min[0]) / n) * k, h: ((b.max[1] - b.min[1]) / n) * k } : null
  const nlab = at(near, 1.6)
  const flab = at(far, 1.15)
  return (
    <Card title="Frustum" value={`hfov ${Math.round((hh * 2) / RAD)}° · ${fA(az)}`}>
      <rect x={n1(cx - k / 2)} y={n1(cy - k / 2)} width={n1(k)} height={n1(k)} className="qh-k4 qh-guide" />
      {fp && <rect x={n1(fp.x)} y={n1(fp.y)} width={n1(fp.w)} height={n1(fp.h)} className="qh-k3" />}
      <path d={`M${n1(C[0])} ${n1(C[1])}L${n1(fl[0])} ${n1(fl[1])}M${n1(C[0])} ${n1(C[1])}L${n1(fr[0])} ${n1(fr[1])}`} className="qh-k3" />
      <line x1={n1(nl[0])} y1={n1(nl[1])} x2={n1(nr[0])} y2={n1(nr[1])} className="qh-k1" />
      <line x1={n1(fl[0])} y1={n1(fl[1])} x2={n1(fr[0])} y2={n1(fr[1])} className="qh-k1" />
      <circle cx={n1(C[0])} cy={n1(C[1])} r="3.5" className="qh-f1" />
      <path d={cross(cx, cy, 6)} className="qh-k1" />
      <text x={n1(nlab[0])} y={n1(nlab[1] + 3)} textAnchor="middle" className="qh-t2">near</text>
      <text x={n1(flab[0])} y={n1(flab[1] + 3)} textAnchor="middle" className="qh-t2">far</text>
    </Card>
  )
}

// C3 · viewport: thirds, safe area, centre ---------------------------------------------------

const RATIOS: [number, string][] = [
  [16 / 9, '16:9'],
  [16 / 10, '16:10'],
  [3 / 2, '3:2'],
  [4 / 3, '4:3'],
  [1, '1:1'],
  [21 / 9, '21:9'],
]

function Viewport({ ctx }: { ctx: HudCtx }) {
  const a = ctx.h > 0 ? ctx.w / ctx.h : 1.6
  let fw = 200
  let fh = fw / a
  if (fh > 112) {
    fh = 112
    fw = fh * a
  }
  const x0 = 110 - fw / 2
  const y0 = 66 - fh / 2
  const x1 = x0 + fw
  const y1 = y0 + fh
  const m = 12
  const corners = `M${n1(x0)} ${n1(y0 + m)}V${n1(y0)}H${n1(x0 + m)}M${n1(x1 - m)} ${n1(y0)}H${n1(x1)}V${n1(y0 + m)}M${n1(x1)} ${n1(y1 - m)}V${n1(y1)}H${n1(x1 - m)}M${n1(x0 + m)} ${n1(y1)}H${n1(x0)}V${n1(y1 - m)}`
  const thirds = `M${n1(x0 + fw / 3)} ${n1(y0)}V${n1(y1)}M${n1(x0 + (2 * fw) / 3)} ${n1(y0)}V${n1(y1)}M${n1(x0)} ${n1(y0 + fh / 3)}H${n1(x1)}M${n1(x0)} ${n1(y0 + (2 * fh) / 3)}H${n1(x1)}`
  const name = RATIOS.find(([r]) => Math.abs(r - a) < 0.03)?.[1] ?? a.toFixed(2) + ':1'
  const s = ctx.w > 0 ? fw / ctx.w : 0
  const rc = ctx.rect
  const inSafe = rc ? rc.l >= ctx.w * 0.1 && rc.r <= ctx.w * 0.9 && rc.t >= ctx.h * 0.1 && rc.b <= ctx.h * 0.9 : true
  return (
    <Card title="Viewport" value={`${Math.round(ctx.w)} × ${Math.round(ctx.h)}`}>
      <path d={thirds} className="qh-k4 qh-guide" />
      <rect x={n1(x0 + fw * 0.1)} y={n1(y0 + fh * 0.1)} width={n1(fw * 0.8)} height={n1(fh * 0.8)} className="qh-k3 qh-dot3" />
      {rc && s > 0 && (
        <rect
          x={n1(x0 + clamp(rc.l, 0, ctx.w) * s)}
          y={n1(y0 + clamp(rc.t, 0, ctx.h) * s)}
          width={n1(Math.max(0, clamp(rc.r, 0, ctx.w) - clamp(rc.l, 0, ctx.w)) * s)}
          height={n1(Math.max(0, clamp(rc.b, 0, ctx.h) - clamp(rc.t, 0, ctx.h)) * s)}
          className="qh-k2"
        />
      )}
      <path d={corners} className="qh-k1" />
      <path d={cross(110, y0 + fh / 2, 6)} className="qh-k1" />
      <text x={n1(x0)} y={n1(y1 + 16)} className="qh-t2">{`${name} · safe area 80%${inSafe ? '' : ' · model outside'}`}</text>
    </Card>
  )
}

// C4 · az / el chart: sphere unwrapped, presets as rings (click to go) -----------------------

const PRESETS: { label: string; az: number; el: number }[] = [
  { label: 'Front', az: 0, el: 0 },
  { label: 'Right', az: 90, el: 0 },
  { label: 'Back', az: 180, el: 0 },
  { label: 'Left', az: 270, el: 0 },
  { label: 'Iso', az: 45, el: 35 },
  { label: 'Top', az: 0, el: 89 },
]
const CX0 = 30
const CW = 180
const CY0 = 20
const CH = 100
const ax = (az: number) => CX0 + (wrap360(az) / 360) * CW
const ey = (el: number) => CY0 + CH / 2 - (clamp(el, -90, 90) / 90) * (CH / 2)

function AzElChart({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const trail = useCamTrail(ctx.tick, az, el)
  const [hot, setHot] = useState(-1)
  // the recent path, broken where it wraps past 0 / 360
  let path = ''
  let prev: number | null = null
  for (const [a, e] of [...trail, [wrap360(az), el] as [number, number]]) {
    path += (prev == null || Math.abs(a - prev) > 180 ? 'M' : 'L') + n1(ax(a)) + ' ' + n1(ey(e))
    prev = a
  }
  const x = ax(az)
  const y = ey(el)
  const flip = x > 160
  return (
    <div style={{ pointerEvents: 'none' }}>
      <Card title="Az / el" value={`${fA(az)} · ${fE(el)}`}>
        <rect x={CX0} y={CY0} width={CW} height={CH} className="qh-k4" />
        <path d="M75 20V120M120 20V120M165 20V120M30 45H210M30 70H210M30 95H210" className="qh-k4 qh-dot3" />
        {path && <path d={path} className="qh-k1 qh-guide" />}
        {PRESETS.map((p, i) => {
          const px = ax(p.az)
          const py = ey(p.el)
          return (
            <g key={p.label}>
              {hot === i && <circle cx={n1(px)} cy={n1(py)} r="7" className="qh-k3 qh-halo" />}
              <circle cx={n1(px)} cy={n1(py)} r="3" className={hot === i ? 'qh-k1' : 'qh-k3'} />
              <circle
                cx={n1(px)}
                cy={n1(py)}
                r="8"
                className="qh-hit qh-press"
                data-tip={`${p.label} · ${a3(p.az)} / ${p.el}`}
                data-tip-desc="Click to swing the camera here."
                onPointerEnter={() => setHot(i)}
                onPointerLeave={() => setHot(-1)}
                onClick={() => ctx.orbitTo(p.az, p.el)}
              />
            </g>
          )
        })}
        <circle cx={n1(x)} cy={n1(y)} r="8" className="qh-k1" />
        <circle cx={n1(x)} cy={n1(y)} r="3.5" className="qh-f1" />
        <text x={n1(flip ? x - 12 : x + 12)} y={n1(y - 9)} textAnchor={flip ? 'end' : 'start'} className="qh-t1">
          {`${a3(az)} / ${Math.round(el)}`}
        </text>
        <text x="30" y="134" className="qh-t3">0</text>
        <text x="120" y="134" textAnchor="middle" className="qh-t3">180</text>
        <text x="210" y="134" textAnchor="end" className="qh-t3">360</text>
        <text x="24" y="24" textAnchor="end" className="qh-t3">+90</text>
        <text x="24" y="120" textAnchor="end" className="qh-t3">−90</text>
      </Card>
    </div>
  )
}

// C5 · three views: camera direction in plan and elevation -----------------------------------

function ThreeViews({ ctx }: { ctx: HudCtx }) {
  const { az, el } = ctx.cam
  const b = ctx.box
  const ext = b ? [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] : [ctx.n, ctx.n, ctx.n]
  const sc = 30 / Math.max(ext[0], ext[1], ext[2], 1)
  const ce = Math.cos(el * RAD)
  const se = Math.sin(el * RAD)
  const sa = Math.sin(az * RAD)
  const ca = Math.cos(az * RAD)
  const tiles = [
    { x: 6, name: 'top', w: ext[0], h: ext[1], v: [ce * sa, ce * ca] },
    { x: 80, name: 'front', w: ext[0], h: ext[2], v: [ce * sa, -se] },
    { x: 154, name: 'side', w: ext[1], h: ext[2], v: [-ce * ca, -se] },
  ]
  return (
    <Card title="Three views" value={`${fA(az)} · ${fE(el)}`} h={112}>
      {tiles.map((t) => {
        const cx = t.x + 30
        const cy = 38
        const len = Math.hypot(t.v[0], t.v[1])
        const C = [cx + 26 * t.v[0], cy + 26 * t.v[1]]
        const end = [C[0] + (cx - C[0]) * 0.5, C[1] + (cy - C[1]) * 0.5]
        return (
          <g key={t.name}>
            <rect x={t.x} y="8" width="60" height="60" className="qh-k4" />
            <rect x={n1(cx - (t.w * sc) / 2)} y={n1(cy - (t.h * sc) / 2)} width={n1(t.w * sc)} height={n1(t.h * sc)} className="qh-k3" />
            {len > 0.15 ? (
              <>
                <line x1={n1(C[0])} y1={n1(C[1])} x2={n1(end[0])} y2={n1(end[1])} className="qh-k1" />
                <circle cx={n1(C[0])} cy={n1(C[1])} r="3" className="qh-f1" />
              </>
            ) : (
              <>
                <circle cx={cx} cy={cy} r="6" className="qh-k1" />
                <circle cx={cx} cy={cy} r="2" className="qh-f1" />
              </>
            )}
            <text x={t.x} y="86" className="qh-t2">{t.name}</text>
          </g>
        )
      })}
    </Card>
  )
}

// C6 · look-at: distance and up axis ---------------------------------------------------------

function LookAt({ ctx }: { ctx: HudCtx }) {
  const { el, dist } = ctx.cam
  const s = Math.sin(el * RAD)
  const c = Math.cos(el * RAD)
  let L = clamp(50 + 14 * dist, 60, 150)
  if (Math.abs(s) > 0.01) L = Math.min(L, 96 / Math.abs(s))
  const M = [116, 76]
  const E = [M[0] - (L / 2) * c, M[1] - (L / 2) * s]
  const T = [M[0] + (L / 2) * c, M[1] + (L / 2) * s]
  // dimension line on the far side from the up arrow
  const nx = -s
  const ny = c
  const o = 14
  const tk = 5
  const dim =
    `M${n1(E[0] + nx * o)} ${n1(E[1] + ny * o)}L${n1(T[0] + nx * o)} ${n1(T[1] + ny * o)}` +
    `M${n1(E[0] + nx * (o - tk))} ${n1(E[1] + ny * (o - tk))}L${n1(E[0] + nx * (o + tk))} ${n1(E[1] + ny * (o + tk))}` +
    `M${n1(T[0] + nx * (o - tk))} ${n1(T[1] + ny * (o - tk))}L${n1(T[0] + nx * (o + tk))} ${n1(T[1] + ny * (o + tk))}`
  const lx = M[0] + nx * (o + 10)
  const ly = M[1] + ny * (o + 10)
  return (
    <Card title="Look-at" value={`el ${fE(el)}`}>
      <line x1={n1(E[0])} y1={n1(E[1])} x2={n1(T[0])} y2={n1(T[1])} className="qh-k1" />
      <path d={dim} className="qh-k3" />
      <text x={n1(lx)} y={n1(ly)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${n1(el)} ${n1(lx)} ${n1(ly)})`} className="qh-t1">
        {'dist ' + dist.toFixed(2)}
      </text>
      <circle cx={n1(E[0])} cy={n1(E[1])} r="3.5" className="qh-f1" />
      <path d={`M${n1(E[0])} ${n1(E[1])}V${n1(E[1] - 26)}M${n1(E[0] - 4)} ${n1(E[1] - 20)}L${n1(E[0])} ${n1(E[1] - 26)}L${n1(E[0] + 4)} ${n1(E[1] - 20)}`} className="qh-k1" />
      <text x={n1(E[0] + 7)} y={n1(E[1] - 18)} className="qh-t2">up +z</text>
      <path d={cross(T[0], T[1])} className="qh-k1" />
    </Card>
  )
}

export const CAMERA_MODULES: HudModule[] = [
  { family: 'camera', id: 'c1', label: 'viewpoint', desc: 'Eye, view cone and target', slot: 'tr', render: (ctx) => <Viewpoint ctx={ctx} /> },
  { family: 'camera', id: 'c2', label: 'frustum plan', desc: 'Top view; grid bounds dashed', slot: 'tr', render: (ctx) => <FrustumPlan ctx={ctx} /> },
  { family: 'camera', id: 'c3', label: 'viewport', desc: 'Thirds, safe area, centre', slot: 'tr', render: (ctx) => <Viewport ctx={ctx} /> },
  {
    family: 'camera',
    id: 'c4',
    label: 'az / el chart',
    desc: 'Sphere unwrapped, presets as rings',
    slot: 'tr',
    interactive: true,
    render: (ctx) => <AzElChart ctx={ctx} />,
  },
  { family: 'camera', id: 'c5', label: 'three views', desc: 'Camera direction in plan and elevation', slot: 'tr', render: (ctx) => <ThreeViews ctx={ctx} /> },
  { family: 'camera', id: 'c6', label: 'look-at', desc: 'Distance and up axis', slot: 'tr', render: (ctx) => <LookAt ctx={ctx} /> },
]
