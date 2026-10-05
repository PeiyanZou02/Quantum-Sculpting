import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { HudCtx, Vec3 } from './types'
import './marks.css'

/*
 * Selection — the probed cell, ctx.hover (QLMarks4 › Selection). Ink, because it is what you act on.
 * v1 square + tab · v2 lock-on · v3 target · v4 cell in slice.
 */

const INK = 'var(--qs-ink)'
const INK2 = 'var(--qs-ink2)'
const INK3 = 'var(--qs-ink3)'
const INK4 = 'var(--qs-ink4)'
const BG = 'var(--qs-bg)'
const FAINT = 'var(--qs-faint)'
const MONO = 'var(--qs-mono)'

const f = (v: number) => Math.round(v * 10) / 10
const stroke = (c: string): CSSProperties => ({ stroke: c, fill: 'none' })
const AX = ['x', 'y', 'z'] as const
const AI = { x: 0, y: 1, z: 2 } as const
/** In-plane axes of a slice, matching qs/grid `section`: z → (x, y); x → (y, z); y → (x, z). */
const PLANE = { z: [0, 1], x: [1, 2], y: [0, 2] } as const

function Hud({ ctx, children }: { ctx: HudCtx; children: ReactNode }) {
  return (
    <svg className="qs-hud" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {children}
    </svg>
  )
}

function T({ x, y, c = INK, size = 11, anchor, children }: { x: number; y: number; c?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; children: ReactNode }) {
  return (
    <text x={f(x)} y={f(y)} fontSize={size} textAnchor={anchor} className="qs-hud-halo" style={{ fill: c, fontFamily: MONO }}>
      {children}
    </text>
  )
}

/** The hovered cell on screen: centre and a square side covering its projected cube (clamped). */
function useCellSquare(ctx: HudCtx, min = 14, max = 64) {
  const { hover, project } = ctx
  return useMemo(() => {
    if (!hover) return null
    const [i, j, k] = hover.cell
    const c = project([i, j, k])
    if (!c) return null
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let b = 0; b < 8; b++) {
      const p: Vec3 = [i + (b & 1 ? 0.5 : -0.5), j + (b & 2 ? 0.5 : -0.5), k + (b & 4 ? 0.5 : -0.5)]
      const s = project(p)
      if (!s) continue
      x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1])
    }
    const raw = Number.isFinite(x0) ? Math.max(x1 - x0, y1 - y0) : min
    const s = Math.round(Math.min(max, Math.max(min, raw)))
    return { cx: c[0], cy: c[1], s }
  }, [hover, project, min, max])
}

/* ── v1 · square + tab ──────────────────────────────────────────────────────── */

export function SquareTab({ ctx }: { ctx: HudCtx }) {
  const sq = useCellSquare(ctx, 16)
  if (!sq || !ctx.hover) return null
  const { cx, cy, s } = sq
  const x0 = Math.round(cx - s / 2), y0 = Math.round(cy - s / 2)
  const ax = ctx.slice.axis
  const label = `${ax} ${ctx.hover.cell[AI[ax]]}`
  const tw = label.length * 6 + 10
  return (
    <Hud ctx={ctx}>
      <rect x={x0 + 0.75} y={y0 + 0.75} width={s - 1.5} height={s - 1.5} strokeWidth={1.5} style={stroke(INK)} />
      <rect x={x0} y={y0 - 16} width={tw} height={16} style={{ fill: INK }} />
      <text x={x0 + 5} y={y0 - 7.5} fontSize={11} dominantBaseline="central" style={{ fill: BG, fontFamily: MONO }}>
        {label}
      </text>
    </Hud>
  )
}

/* ── v2 · lock-on ───────────────────────────────────────────────────────────── */

export function LockOn({ ctx }: { ctx: HudCtx }) {
  const sq = useCellSquare(ctx, 20)
  if (!sq || !ctx.hover) return null
  const { cx, cy, s } = sq
  const l = cx - s / 2, r = cx + s / 2, t = cy - s / 2, b = cy + s / 2
  const L = Math.max(5, Math.min(12, s / 3))
  const d = `M${f(l)} ${f(t + L)}V${f(t)}H${f(l + L)}M${f(r - L)} ${f(t)}H${f(r)}V${f(t + L)}M${f(r)} ${f(b - L)}V${f(b)}H${f(r - L)}M${f(l + L)} ${f(b)}H${f(l)}V${f(b - L)}`
  return (
    <Hud ctx={ctx}>
      {/* keyed on the cell, so each newly hovered cell replays the 240 ms close-in */}
      <g key={ctx.hover.cell.join(',')} className="qs-hud-anim qs-hud-lock" style={{ transformOrigin: `${f(cx)}px ${f(cy)}px` }}>
        <path d={d} strokeWidth={1.5} style={stroke(INK)} />
      </g>
    </Hud>
  )
}

/* ── v3 · target ────────────────────────────────────────────────────────────── */

export function Target({ ctx }: { ctx: HudCtx }) {
  const sq = useCellSquare(ctx, 22, 48)
  if (!sq || !ctx.hover) return null
  const { cx, cy, s } = sq
  const h = s / 2, G = 6, L = 12
  const x = Math.round(cx) + 0.5, y = Math.round(cy) + 0.5
  const d = `M${x} ${f(cy - h - G - L)}v${L}M${x} ${f(cy + h + G)}v${L}M${f(cx - h - G - L)} ${y}h${L}M${f(cx + h + G)} ${y}h${L}`
  const ax = ctx.slice.axis
  const [ua, va] = PLANE[ax]
  const cell = ctx.hover.cell
  const flip = cx + h + 24 + 110 > ctx.w
  const tx = flip ? cx - h - 24 : cx + h + 24
  const anchor = flip ? 'end' : 'start'
  return (
    <Hud ctx={ctx}>
      <rect x={Math.round(cx - h) + 0.5} y={Math.round(cy - h) + 0.5} width={s - 1} height={s - 1} strokeWidth={1} style={stroke(INK)} />
      <path d={d} strokeWidth={1} style={stroke(INK)} />
      <T x={tx} y={cy - h - 4} anchor={anchor}>{`${AX[ua]} ${cell[ua]} · ${AX[va]} ${cell[va]}`}</T>
      <T x={tx} y={cy - h + 12} c={INK3} size={10} anchor={anchor}>{`${ax} ${cell[AI[ax]]}`}</T>
    </Hud>
  )
}

/* ── v4 · cell in slice ─────────────────────────────────────────────────────── */

/** A 5 × 5 map of the slice: the cell's coarse row and column tinted, its block in ink. */
const K = 5, C = 14, GRID = K * C

export function CellInSlice({ ctx }: { ctx: HudCtx }) {
  const { hover, n, w, h } = ctx
  if (!hover || n <= 0) return null
  const ax = ctx.slice.axis
  const [ua, va] = PLANE[ax]
  const bin = (v: number) => Math.min(K - 1, Math.max(0, Math.floor((v * K) / n)))
  const col = bin(hover.cell[ua])
  const row = K - 1 - bin(hover.cell[va]) // v runs up the page
  // Above-left of the cursor, clear of the probe's own flag (which sits above-right).
  let gx = hover.x - 22 - GRID, gy = hover.y - 22 - GRID
  if (gx < 8) gx = hover.x + 22
  if (gy < 22) gy = hover.y + 22
  gx = Math.round(Math.min(gx, w - GRID - 8))
  gy = Math.round(Math.min(gy, h - GRID - 8))
  let lines = ''
  for (let i = 0; i <= K; i++) lines += `M${gx + i * C + 0.5} ${gy}v${GRID + 1}M${gx} ${gy + i * C + 0.5}h${GRID + 1}`
  return (
    <Hud ctx={ctx}>
      <rect x={gx} y={gy} width={GRID + 1} height={GRID + 1} style={{ fill: BG }} />
      <rect x={gx + col * C} y={gy} width={C + 1} height={GRID + 1} style={{ fill: FAINT }} />
      <rect x={gx} y={gy + row * C} width={GRID + 1} height={C + 1} style={{ fill: FAINT }} />
      <path d={lines} strokeWidth={1} style={stroke(INK4)} />
      <rect x={gx + col * C} y={gy + row * C} width={C + 1} height={C + 1} style={{ fill: INK }} />
      <T x={gx} y={gy - 7} c={INK2} size={10}>{`${ax} ${hover.cell[AI[ax]]}`}</T>
    </Hud>
  )
}
