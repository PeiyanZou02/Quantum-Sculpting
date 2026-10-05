import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { HudCtx, Vec3 } from './types'
import './marks.css'

/*
 * Bounds — the grid volume and the print size (QLMarks4 › Bounds).
 * v1 corners in 3D · v2 extents · v3 footprint · v4 drop area.
 */

const INK = 'var(--qs-ink)'
const INK3 = 'var(--qs-ink3)'
const INK4 = 'var(--qs-ink4)'
const MONO = 'var(--qs-mono)'
const SANS = 'var(--qs-sans)'

const f = (v: number) => Math.round(v * 10) / 10
const stroke = (c: string): CSSProperties => ({ stroke: c, fill: 'none' })

function Hud({ ctx, children }: { ctx: HudCtx; children: ReactNode }) {
  return (
    <svg className="qs-hud" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {children}
    </svg>
  )
}

function T({ x, y, c = INK, size = 10, sans, anchor, children }: { x: number; y: number; c?: string; size?: number; sans?: boolean; anchor?: 'start' | 'middle' | 'end'; children: ReactNode }) {
  return (
    <text x={f(x)} y={f(y)} fontSize={size} textAnchor={anchor} className="qs-hud-halo" style={{ fill: c, fontFamily: sans ? SANS : MONO }}>
      {children}
    </text>
  )
}

/** Extents in mm: the result mesh in the result view, else the model; null if neither. */
function extentsOf(ctx: HudCtx): [number, number, number] | null {
  if (ctx.view === 'result' && ctx.report) return ctx.report.extents
  if (ctx.model) return ctx.model.extents
  if (ctx.box) {
    const { min, max } = ctx.box
    return [(max[0] - min[0]) * ctx.mm, (max[1] - min[1]) * ctx.mm, (max[2] - min[2]) * ctx.mm]
  }
  return null
}
const mmText = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 0 : 1))

/* ── v1 · corners in 3D ─────────────────────────────────────────────────────── */

const ARM = 0.06 // fraction of each edge
const ARM_MIN = 7, ARM_MAX = 24 // px

export function Corners3D({ ctx }: { ctx: HudCtx }) {
  const { box, project } = ctx
  const geo = useMemo(() => {
    if (!box) return null
    const { min, max } = box
    const at = (b: number): Vec3 => [b & 1 ? max[0] : min[0], b & 2 ? max[1] : min[1], b & 4 ? max[2] : min[2]]
    const pts = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => ({ b, p: at(b), s: project(at(b)) }))
    if (pts.some((q) => !q.s)) return null
    const len = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
    const corners = pts.map(({ b, p, s }) => {
      const [sx, sy] = s!
      let d = ''
      let score = 0
      for (let a = 0; a < 3; a++) {
        if (len[a] <= 0) continue
        const nb = pts[b ^ (1 << a)]
        const q: Vec3 = [p[0], p[1], p[2]]
        q[a] += (nb.p[a] - p[a]) * ARM
        const e = project(q)
        if (!e) continue
        let dx = e[0] - sx, dy = e[1] - sy
        const L = Math.hypot(dx, dy)
        score += L / (len[a] * ARM) // px per grid unit: larger = nearer the camera
        if (L < 1e-3) continue
        const k = Math.min(ARM_MAX, Math.max(ARM_MIN, L)) / L
        dx *= k
        dy *= k
        d += `M${f(sx)} ${f(sy)}L${f(sx + dx)} ${f(sy + dy)}`
      }
      return { d, score }
    })
    // The farthest corner (smallest perspective scale) sits behind the volume: grey.
    let far = 0
    corners.forEach((c, i) => {
      if (c.score < corners[far].score) far = i
    })
    return {
      front: corners.filter((_, i) => i !== far).map((c) => c.d).join(''),
      back: corners[far].d,
    }
  }, [box, project])
  if (!geo) return null
  return (
    <Hud ctx={ctx}>
      <path d={geo.back} strokeWidth={1} style={stroke(INK3)} />
      <path d={geo.front} strokeWidth={1} style={stroke(INK)} />
    </Hud>
  )
}

/* ── v2 · extents ───────────────────────────────────────────────────────────── */

export function Extents({ ctx }: { ctx: HudCtx }) {
  const { rect } = ctx
  const ext = extentsOf(ctx)
  if (!rect || !ext) return null
  const { l, r, t, b } = rect
  const yD = Math.min(ctx.h - 24, b + 14) // dimension line under the rect
  const xD = Math.min(ctx.w - 56, r + 18) // dimension line beside it
  const d =
    `M${f(l)} ${f(yD) + 0.5}H${f(r)}M${f(l) + 0.5} ${f(yD - 5)}V${f(yD + 5)}M${f(r) - 0.5} ${f(yD - 5)}V${f(yD + 5)}` +
    `M${f(xD) + 0.5} ${f(t)}V${f(b)}M${f(xD - 5)} ${f(t) + 0.5}H${f(xD + 5)}M${f(xD - 5)} ${f(b) - 0.5}H${f(xD + 5)}`
  return (
    <Hud ctx={ctx}>
      <rect x={f(l) + 0.5} y={f(t) + 0.5} width={Math.max(0, f(r - l) - 1)} height={Math.max(0, f(b - t) - 1)} strokeWidth={1} style={stroke(INK4)} />
      <path d={d} strokeWidth={1} style={stroke(INK)} />
      <T x={(l + r) / 2} y={yD + 16} anchor="middle">{`${mmText(ext[0])} mm`}</T>
      <T x={xD + 10} y={(t + b) / 2 + 3.5}>{`${mmText(ext[2])} mm`}</T>
    </Hud>
  )
}

/* ── v3 · footprint ─────────────────────────────────────────────────────────── */

export function Footprint({ ctx }: { ctx: HudCtx }) {
  const { box, project } = ctx
  const ext = extentsOf(ctx)
  const geo = useMemo(() => {
    if (!box) return null
    const { min, max } = box
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2
    const rad = Math.max(max[0] - min[0], max[1] - min[1]) / 2
    const bot = project([cx, cy, min[2]]), top = project([cx, cy, max[2]])
    if (!bot || !top) return null
    let d = ''
    let right: [number, number] = bot
    const N = 64
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2
      const s = project([cx + rad * Math.cos(a), cy + rad * Math.sin(a), min[2]])
      if (!s) continue
      d += `${d ? 'L' : 'M'}${f(s[0])} ${f(s[1])}`
      if (s[0] > right[0]) right = s
    }
    return { d, bot, top, right }
  }, [box, project])
  if (!geo || !ext) return null
  const { bot, top, right } = geo
  return (
    <Hud ctx={ctx}>
      <path d={geo.d} strokeWidth={1} strokeDasharray="2 3" style={stroke(INK3)} />
      <path d={`M${f(bot[0])} ${f(bot[1])}L${f(top[0])} ${f(top[1])}M${f(top[0] - 8)} ${f(top[1])}H${f(top[0] + 8)}`} strokeWidth={1} style={stroke(INK)} />
      <circle cx={f(bot[0])} cy={f(bot[1])} r={2.5} style={{ fill: INK }} />
      <T x={top[0] + 12} y={top[1] + 3.5}>{`h ${mmText(ext[2])} mm`}</T>
      <T x={right[0] + 8} y={right[1] + 3.5} c={INK3}>{`Ø ${mmText(Math.max(ext[0], ext[1]))}`}</T>
    </Hud>
  )
}

/* ── v4 · drop area ─────────────────────────────────────────────────────────── */

export function DropArea({ ctx }: { ctx: HudCtx }) {
  const { w, h, rect, model } = ctx
  if (model && rect) {
    // A model is in: the dashed corners close in on it once, then stay as context.
    const { l, r, t, b } = rect
    const L = Math.min(12, (r - l) / 3, (b - t) / 3)
    const cs = [
      { d: `M${f(l)} ${f(t + L)}V${f(t)}H${f(l + L)}`, dx: -24, dy: -24 },
      { d: `M${f(r - L)} ${f(t)}H${f(r)}V${f(t + L)}`, dx: 24, dy: -24 },
      { d: `M${f(r)} ${f(b - L)}V${f(b)}H${f(r - L)}`, dx: 24, dy: 24 },
      { d: `M${f(l + L)} ${f(b)}H${f(l)}V${f(b - L)}`, dx: -24, dy: 24 },
    ]
    return (
      <Hud ctx={ctx}>
        <g key={`${model.model_id}:${model.file}`}>
          {cs.map((c, i) => (
            <path
              key={i}
              className="qs-hud-anim qs-hud-close"
              d={c.d}
              strokeWidth={1}
              strokeDasharray="3 3"
              style={{ ...stroke(INK3), ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px` } as CSSProperties}
            />
          ))}
        </g>
      </Hud>
    )
  }
  if (model) return null
  // No model: dashed corners and a floor ellipse, no box.
  const bw = Math.min(360, w * 0.5), bh = Math.min(300, h * 0.56)
  const cx = w / 2, cy = h / 2
  const l = cx - bw / 2, r = cx + bw / 2, t = cy - bh / 2, b = cy + bh / 2
  const L = 12
  const d = `M${f(l)} ${f(t + L)}V${f(t)}H${f(l + L)}M${f(r - L)} ${f(t)}H${f(r)}V${f(t + L)}M${f(r)} ${f(b - L)}V${f(b)}H${f(r - L)}M${f(l + L)} ${f(b)}H${f(l)}V${f(b - L)}`
  return (
    <Hud ctx={ctx}>
      <path d={d} strokeWidth={1} strokeDasharray="3 3" style={stroke(INK3)} />
      <ellipse cx={f(cx)} cy={f(cy + bh * 0.3)} rx={f(bw * 0.38)} ry={f(bw * 0.075)} strokeWidth={1} style={stroke(INK4)} />
      <T x={cx} y={cy - 6} size={11} sans anchor="middle">drop model here</T>
      <T x={cx} y={cy + 12} c={INK3} anchor="middle">.stl .obj .ply .glb .off</T>
    </Hud>
  )
}
