import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react'

/** Orbit camera: azimuth in degrees 0–360, elevation 0–89, dolly distance 0.6–8. */
export interface Camera {
  az: number
  el: number
  dist: number
}

export interface QCamProps {
  value: Camera
  onChange: (c: Camera) => void
  /** Double-click target. Defaults to the library's 035° / 22° / 2.40. */
  home?: Camera
  /** Hide the readout and the station pills. */
  bare?: boolean
}

export const QCAM_HOME: Camera = { az: 35, el: 22, dist: 2.4 }

export const QCAM_STATIONS: ReadonlyArray<{ label: string; az: number; el: number }> = [
  { label: 'Front', az: 0, el: 0 },
  { label: 'Side', az: 90, el: 0 },
  { label: 'Top', az: 0, el: 89 },
  { label: 'Iso', az: 45, el: 35 },
]

const INK = '#151618'
const INK2 = '#55575D'
const INK3 = '#8B8D93'
const INK4 = '#B3B5BB'
const CTL = 'rgba(21,22,24,.26)'
const SEL = '#CBCCD0'
const EDGE = 'rgba(20,22,28,.3)'
const MONO = "var(--qs-mono, 'Geist Mono', monospace)"

const SNAP_MS = 480
const W = 188
const H = 150

const wrap360 = (v: number) => ((v % 360) + 360) % 360
/** Signed shortest-arc difference b − a in (−180, 180]. */
const dArc = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const n1 = (v: number) => v.toFixed(1)
const fA = (v: number) => String(Math.round(wrap360(v)) % 360).padStart(3, '0') + '°'
const sg = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)) + '°'

type V3 = [number, number, number]
type V2 = [number, number]

// Turntable seen from above at a tilt with sin = .34.
const CX = 94
const CY = 94
const R = 62
const S_T = 0.34
const C_T = 0.9404
const RAD = Math.PI / 180
const P = (v: V3): V2 => [CX + R * v[0], CY - R * (v[2] * C_T + v[1] * S_T)]
/** Point on the floor ring at azimuth t, scaled by k. */
const G = (t: number, k = 1): V3 => [k * Math.sin(t * RAD), -k * Math.cos(t * RAD), 0]
/** Point on the sphere at azimuth a, elevation e, scaled by k. */
const Qa = (a: number, e: number, k = 1): V3 => [
  k * Math.cos(e * RAD) * Math.sin(a * RAD),
  -k * Math.cos(e * RAD) * Math.cos(a * RAD),
  k * Math.sin(e * RAD),
]
const pt = (v: V3) => {
  const q = P(v)
  return n1(q[0]) + ' ' + n1(q[1])
}
const poly = (fn: (t: number) => V3, a: number, b: number, n: number) => {
  let d = ''
  for (let i = 0; i <= n; i++) d += (i ? 'L' : 'M') + pt(fn(a + ((b - a) * i) / n))
  return d
}
const half = (front: boolean) => {
  const a = R
  const b = R * S_T
  return front
    ? `M${CX + a} ${CY}A${a} ${n1(b)} 0 0 1 ${CX - a} ${CY}`
    : `M${CX - a} ${CY}A${a} ${n1(b)} 0 0 1 ${CX + a} ${CY}`
}
const RING_B = half(false)
const RING_F = half(true)
const TICKS = Array.from({ length: 24 }, (_, i) => {
  const t = i * 15
  const mj = t % 90 === 0
  const a = P(G(t, 1.08))
  const b = P(G(t, mj ? 1.22 : 1.14))
  return { x1: n1(a[0]), y1: n1(a[1]), x2: n1(b[0]), y2: n1(b[1]), c: mj ? INK : Math.cos(t * RAD) < -0.01 ? INK4 : INK3 }
})
const RING_LABELS = [0, 90, 180, 270].map((t) => {
  const a = P(G(t, 1.4))
  return { x: a[0], y: a[1], t: String(t).padStart(3, '0') }
})
const CUBE = (() => {
  const h = 0.15
  const z = 0.32
  const V = (
    [
      [-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0],
      [-h, -h, z], [h, -h, z], [h, h, z], [-h, h, z],
    ] as V3[]
  ).map(P)
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  return E.map(([a, b]) => `M${n1(V[a][0])} ${n1(V[a][1])}L${n1(V[b][0])} ${n1(V[b][1])}`).join('')
})()
const C_PT = P([0, 0, 0.16])

const label9: CSSProperties = {
  position: 'absolute',
  font: `400 9px/1 ${MONO}`,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

interface Drag {
  id: number
  x0: number
  y0: number
  a0: number
  e0: number
  d0: number
}

interface Snap {
  az: number
  el: number
  from: number
}

/** QCam, the orbit gimbal (188 × 150) with an optional Camera readout and station pills. Controlled. */
export function QCam({ value, onChange, home = QCAM_HOME, bare = false }: QCamProps) {
  const uid = useId().replace(/:/g, '')
  const gM = `qc-m-${uid}`
  const gB = `qc-b-${uid}`
  const gS = `qc-sh-${uid}`

  const [hover, setHover] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [snapTo, setSnapTo] = useState<Snap | null>(null)
  const [pillHover, setPillHover] = useState(-1)

  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const raf = useRef(0)
  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  })
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const snap = (a: number, e: number, d?: number) => {
    cancelAnimationFrame(raf.current)
    const c = valueRef.current
    const da = dArc(c.az, a)
    const t0 = performance.now()
    setSnapTo({ az: a, el: e, from: c.az })
    setDrag(null)
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / SNAP_MS)
      const q = 1 - Math.pow(1 - k, 3)
      const next: Camera = {
        az: wrap360(c.az + da * q),
        el: c.el + (e - c.el) * q,
        dist: d == null ? valueRef.current.dist : c.dist + (d - c.dist) * q,
      }
      valueRef.current = next
      onChangeRef.current(next)
      if (k < 1) raf.current = requestAnimationFrame(step)
      else setSnapTo(null)
    }
    raf.current = requestAnimationFrame(step)
  }

  const { az, el, dist } = value
  const dragging = drag != null
  const hov = dragging || hover

  // Geometry that follows the camera.
  const aS = az > 180 ? az - 360 : az
  const et = hov
    ? [15, 30, 45, 60, 75, 90].map((e) => {
        const a = P(Qa(az, e, 1.08))
        const b = P(Qa(az, e, e % 45 ? 1.14 : 1.22))
        return { x1: n1(a[0]), y1: n1(a[1]), x2: n1(b[0]), y2: n1(b[1]) }
      })
    : []
  const B = P(Qa(az, el))
  const F = P(G(az, Math.cos(el * RAD)))
  const dx = C_PT[0] - B[0]
  const dy = C_PT[1] - B[1]
  const L = Math.hypot(dx, dy) || 1
  const ux = dx / L
  const uy = dy / L
  const fr = (a: number) => {
    const c = Math.cos(a)
    const si = Math.sin(a)
    return `M${n1(B[0])} ${n1(B[1])}l${n1((ux * c - uy * si) * 18)} ${n1((ux * si + uy * c) * 18)}`
  }
  const frus = fr(0.3) + fr(-0.3)
  const azArc = Math.abs(aS) > 0.5 ? poly((t) => G(t), 0, aS, 24) : ''
  const yoke = poly((e) => Qa(az, e), 0, 180, 36)
  const elArc = el > 0.5 ? poly((e) => Qa(az, e, 0.88), 0, el, 14) : ''

  let ghost: { x: number; y: number; trail: string } | null = null
  if (snapTo) {
    const g = P(Qa(snapTo.az, snapTo.el))
    const d = dArc(snapTo.from, snapTo.az)
    ghost = { x: g[0], y: g[1], trail: Math.abs(d) > 0.5 ? poly((t) => G(t), snapTo.from, snapTo.from + d, 18) : '' }
  }

  const azL = P(G(aS / 2, 0.74))
  const elL = P(Qa(az, el / 2, 0.66))

  const rows: [string, string, string][] = drag
    ? [
        ['Az', fA(az), sg(dArc(drag.a0, az))],
        ['El', Math.round(el) + '°', sg(el - drag.e0)],
        ['Dist', dist.toFixed(2), ''],
      ]
    : [
        ['Az', fA(az), ''],
        ['El', Math.round(el) + '°', ''],
        ['Dist', dist.toFixed(2), ''],
      ]

  // Pointer handling: capture so a drag survives leaving the gimbal.
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    cancelAnimationFrame(raf.current)
    setSnapTo(null)
    e.currentTarget.setPointerCapture(e.pointerId)
    const c = valueRef.current
    setDrag({ id: e.pointerId, x0: e.clientX, y0: e.clientY, a0: c.az, e0: c.el, d0: c.dist })
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.id) return
    const rc = e.currentTarget.getBoundingClientRect()
    const k = W / (rc.width || W)
    const mx = (e.clientX - drag.x0) * k
    const my = (e.clientY - drag.y0) * k
    const c = valueRef.current
    const next: Camera = e.shiftKey
      ? { ...c, dist: clamp(drag.d0 + my * 0.02, 0.6, 8) }
      : { ...c, az: wrap360(drag.a0 + mx * 1.2), el: clamp(drag.e0 - my * 0.8, 0, 89) }
    valueRef.current = next
    onChange(next)
  }
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag || e.pointerId !== drag.id) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }

  const gimbal = (
    <div
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={() => snap(home.az, home.el, home.dist)}
      style={{
        position: 'relative',
        flex: 'none',
        width: W,
        height: H,
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id={gM} gradientUnits="userSpaceOnUse" x1="20" y1="10" x2="170" y2="140">
            <stop offset="0" stopColor="#A9ABB0" />
            <stop offset=".28" stopColor="#F1F2F3" />
            <stop offset=".5" stopColor="#C6C8CC" />
            <stop offset=".72" stopColor="#F5F6F7" />
            <stop offset="1" stopColor="#A2A4A9" />
          </linearGradient>
          <radialGradient id={gB} cx=".4" cy=".32" r=".75">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset=".38" stopColor="#E4E5E8" />
            <stop offset=".78" stopColor="#C3C5CA" />
            <stop offset="1" stopColor="#AEB0B5" />
          </radialGradient>
          <radialGradient id={gS}>
            <stop offset="0" stopColor="#14161C" stopOpacity=".1" />
            <stop offset="1" stopColor="#14161C" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="94" cy="100" rx="80" ry="27" fill={`url(#${gS})`} />
        <path d={RING_B} fill="none" stroke={EDGE} strokeWidth="7.2" />
        <path d={RING_B} fill="none" stroke={`url(#${gM})`} strokeWidth="6" />
        {TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.c} strokeWidth="1" />
        ))}
        <path d="M84 94H104" fill="none" stroke={INK4} strokeWidth="1" />
        <path d={CUBE} fill="none" stroke={INK3} strokeWidth="1" />
        {azArc && <path d={azArc} fill="none" stroke={INK} strokeWidth={hov ? 1.6 : 1} />}
        {ghost && (
          <>
            {ghost.trail && <path d={ghost.trail} fill="none" stroke={INK} strokeWidth="1" strokeDasharray="2 3" />}
            <circle cx={n1(ghost.x)} cy={n1(ghost.y)} r="6.5" fill="none" stroke={INK} strokeWidth="1" strokeDasharray="2 2" />
          </>
        )}
        <path d={yoke} fill="none" stroke={EDGE} strokeWidth="5.4" />
        <path d={yoke} fill="none" stroke={`url(#${gM})`} strokeWidth="4.2" />
        {elArc && <path d={elArc} fill="none" stroke={INK} strokeWidth="1" />}
        {et.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={INK3} strokeWidth="1" />
        ))}
        <line x1={n1(B[0])} y1={n1(B[1])} x2={n1(F[0])} y2={n1(F[1])} stroke={INK3} strokeWidth="1" strokeDasharray="1 2.5" />
        <circle cx={n1(F[0])} cy={n1(F[1])} r="1.6" fill={INK3} />
        <line x1={n1(B[0])} y1={n1(B[1])} x2={n1(C_PT[0])} y2={n1(C_PT[1])} stroke={INK} strokeWidth="1" />
        <path d={frus} fill="none" stroke={INK} strokeWidth="1" />
        <path d={RING_F} fill="none" stroke={EDGE} strokeWidth="7.2" />
        <path d={RING_F} fill="none" stroke={`url(#${gM})`} strokeWidth="6" />
        <circle
          cx={n1(B[0])}
          cy={n1(B[1])}
          r="11.5"
          fill="none"
          stroke={dragging ? INK : INK3}
          strokeWidth="1"
          strokeDasharray={dragging ? undefined : '2 2'}
          opacity={hov ? 1 : 0}
        />
        <circle cx={n1(B[0])} cy={n1(B[1])} r={dragging ? 7.5 : 6.5} fill={`url(#${gB})`} stroke="rgba(20,22,28,.4)" strokeWidth=".75" />
      </svg>
      {hov &&
        RING_LABELS.map((l) => (
          <span key={l.t} style={{ ...label9, left: +n1(l.x), top: +n1(l.y), transform: 'translate(-50%,-50%)', color: INK2 }}>
            {l.t}
          </span>
        ))}
      {hov && (
        <>
          <span style={{ ...label9, left: +n1(azL[0]), top: +n1(azL[1]), transform: 'translate(-50%,-50%)', color: INK }}>
            {'az ' + fA(az)}
          </span>
          <span style={{ ...label9, left: +n1(elL[0] + 8), top: +n1(elL[1]), transform: 'translate(0,-50%)', color: INK }}>
            {'el ' + Math.round(el) + '°'}
          </span>
        </>
      )}
    </div>
  )

  if (bare) return gimbal

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, color: INK }}>
      {gimbal}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 22 }}>
        <CamReadout rows={rows} />
        <div style={{ display: 'flex', gap: 4 }}>
          {QCAM_STATIONS.map((s, i) => {
            const on = Math.abs(dArc(s.az, az)) < 1 && Math.abs(el - s.el) < 1
            const hot = pillHover === i
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => snap(s.az, s.el)}
                onPointerEnter={() => setPillHover(i)}
                onPointerLeave={() => setPillHover(-1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 20,
                  padding: '0 8px',
                  margin: 0,
                  borderRadius: 999,
                  border: `1px solid ${on || hot ? INK : CTL}`,
                  background: on ? SEL : 'transparent',
                  color: on || hot ? INK : INK2,
                  font: `400 10px/1 ${MONO}`,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  transition: 'color 150ms, border-color 150ms, background-color 150ms',
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** QReadout, grid form: title "Camera", kw 44, w 150. */
function CamReadout({ rows }: { rows: [string, string, string][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 150 }}>
      <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: '.04em', textTransform: 'uppercase', color: INK }}>Camera</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px minmax(0,1fr) auto',
          columnGap: 14,
          rowGap: 4,
          font: `400 10px/1.3 ${MONO}`,
          fontVariantNumeric: 'tabular-nums',
          color: INK,
        }}
      >
        {rows.map(([k, v, e]) => (
          <div key={k} style={{ display: 'contents' }}>
            <span>{k}</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
            <span style={{ color: INK3 }}>{e}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
