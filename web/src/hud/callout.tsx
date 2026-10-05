import { useMemo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { HudCtx, HudModule, HudPin } from './types'
import './marks.css'

/*
 * Callouts — data attached to a point, drawn for each of ctx.pins (QLMarks4 › Callouts).
 * v1 dot leader · v2 elbow · v3 numbered · v4 value flag.
 */

const INK = 'var(--qs-ink)'
const INK3 = 'var(--qs-ink3)'
const BG = 'var(--qs-bg)'
const MONO = 'var(--qs-mono)'

const f = (v: number) => Math.round(v * 10) / 10
const stroke = (c: string): CSSProperties => ({ stroke: c, fill: 'none' })
/** Approximate advance of TWK Everett Mono: 0.6 em. */
const adv = (s: string, size: number) => s.length * size * 0.6

function Hud({ ctx, children }: { ctx: HudCtx; children: ReactNode }) {
  return (
    <svg className="qs-hud" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {children}
    </svg>
  )
}

function T({ x, y, c = INK, size = 11, anchor, base, halo = true, children }: { x: number; y: number; c?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; base?: 'central'; halo?: boolean; children: ReactNode }) {
  return (
    <text x={f(x)} y={f(y)} fontSize={size} textAnchor={anchor} dominantBaseline={base} className={halo ? 'qs-hud-halo' : undefined} style={{ fill: c, fontFamily: MONO }}>
      {children}
    </text>
  )
}

/** The pin's value: the last decimal number in its readout (second line first), or null. */
function valueOf(p: HudPin): string | null {
  for (const s of [p.lines[1], p.lines[0]]) {
    const m = s?.match(/-?\d*\.\d+(?!.*\d)/)
    if (m) return m[0]
  }
  return null
}

type Placed = HudPin & { x: number; y: number; sg: 1 | -1 }

/** On-screen pins, each with the side its label runs to (flips left near the right edge). */
function usePlaced(ctx: HudCtx, room: number): Placed[] {
  const { pins, w } = ctx
  return useMemo(
    () =>
      pins.flatMap((p) => (p.x == null || p.y == null ? [] : [{ ...p, x: p.x, y: p.y, sg: (p.x > w - room ? -1 : 1) as 1 | -1 }])),
    [ctx.tick, w, ctx.h, pins, room],
  )
}

/* ── v1 · dot leader ────────────────────────────────────────────────────────── */

function DotLeader({ ctx }: { ctx: HudCtx }) {
  const pins = usePlaced(ctx, 220)
  if (!pins.length) return null
  return (
    <Hud ctx={ctx}>
      {pins.map((p) => {
        const ex = p.x + p.sg * 56, ey = p.y - 48
        const v = valueOf(p)
        return (
          <g key={p.n}>
            <line x1={f(p.x)} y1={f(p.y)} x2={f(ex)} y2={f(ey)} strokeWidth={1} strokeDasharray="1 3" style={stroke(INK)} />
            <circle cx={f(p.x)} cy={f(p.y)} r={2.5} style={{ fill: INK }} />
            <T x={ex + p.sg * 4} y={ey} anchor={p.sg < 0 ? 'end' : 'start'} base="central">
              {`cell[${p.cell.join(',')}]${v ? ' ' + v : ''}`}
            </T>
          </g>
        )
      })}
    </Hud>
  )
}

/* ── v2 · elbow ─────────────────────────────────────────────────────────────── */

function Elbow({ ctx }: { ctx: HudCtx }) {
  const pins = usePlaced(ctx, 240)
  if (!pins.length) return null
  return (
    <Hud ctx={ctx}>
      {pins.map((p) => {
        const ex = p.x + p.sg * 40, ey = p.y - 46
        const shelf = Math.max(120, Math.max(adv(p.lines[0], 11), adv(p.lines[1], 10)) + 16)
        const anchor = p.sg < 0 ? 'end' : 'start'
        return (
          <g key={p.n}>
            <polyline points={`${f(p.x)},${f(p.y)} ${f(ex)},${f(ey)} ${f(ex + p.sg * shelf)},${f(ey)}`} strokeWidth={1} style={stroke(INK)} />
            <circle cx={f(p.x)} cy={f(p.y)} r={2.5} style={{ fill: INK }} />
            <T x={ex + p.sg * 8} y={ey - 8} anchor={anchor}>{p.lines[0]}</T>
            <T x={ex + p.sg * 8} y={ey + 16} c={INK3} size={10} anchor={anchor}>{p.lines[1]}</T>
          </g>
        )
      })}
    </Hud>
  )
}

/* ── v3 · numbered ──────────────────────────────────────────────────────────── */

function Numbered({ ctx }: { ctx: HudCtx }) {
  const placed = usePlaced(ctx, 0)
  const { pins, rect, w } = ctx
  if (!pins.length) return null
  // Legend beside the object (right, or left when there is no room), else at the right edge.
  const longest = Math.max(...pins.map((p) => adv(`${p.n} ${p.lines[0]}`, 11)))
  let lx = w - 24 - longest, ly = 80, anchor: 'start' | 'end' = 'start'
  if (rect) {
    ly = Math.max(24, rect.t + 8)
    if (rect.r + 40 + longest < w - 16) lx = rect.r + 40
    else if (rect.l - 40 - longest > 16) {
      lx = rect.l - 40
      anchor = 'end'
    }
  }
  return (
    <Hud ctx={ctx}>
      {placed.map((p) => (
        <g key={p.n}>
          <circle cx={f(p.x)} cy={f(p.y)} r={8.5} strokeWidth={1} style={{ stroke: INK, fill: BG }} />
          <T x={p.x} y={p.y + 0.5} size={10} anchor="middle" base="central" halo={false}>{String(p.n)}</T>
        </g>
      ))}
      {pins.map((p, i) => (
        <T key={p.n} x={lx} y={ly + i * 19} anchor={anchor} c={p.x == null ? INK3 : INK}>
          {`${p.n} ${p.lines[0]}`}
        </T>
      ))}
    </Hud>
  )
}

/* ── v4 · value flag ────────────────────────────────────────────────────────── */

function ValueFlag({ ctx }: { ctx: HudCtx }) {
  const pins = usePlaced(ctx, 0)
  if (!pins.length) return null
  return (
    <Hud ctx={ctx}>
      {pins.map((p) => {
        const label = valueOf(p) ?? p.lines[0]
        const pw = Math.round(adv(label, 11) + 18)
        const top = p.y - 30 - 20
        const x = Math.round(p.x) + 0.5
        return (
          <g key={p.n}>
            <path d={`M${x} ${f(p.y - 3)}V${f(p.y - 30)}`} strokeWidth={1} style={stroke(INK)} />
            <circle cx={f(p.x)} cy={f(p.y)} r={3} style={{ fill: INK }} />
            <rect x={f(p.x - pw / 2) + 0.5} y={f(top) + 0.5} width={pw} height={20} rx={10} strokeWidth={1} style={{ stroke: INK, fill: BG }} />
            <T x={p.x} y={top + 11} anchor="middle" base="central" halo={false}>{label}</T>
          </g>
        )
      })}
    </Hud>
  )
}

export const CALLOUT_MODULES: HudModule[] = [
  { family: 'callout', id: 'v1', label: 'dot leader', desc: 'Code label, lowercase', slot: 'object', render: (ctx) => <DotLeader ctx={ctx} /> },
  { family: 'callout', id: 'v2', label: 'elbow', desc: 'Two lines of data on a shelf', slot: 'object', render: (ctx) => <Elbow ctx={ctx} /> },
  { family: 'callout', id: 'v3', label: 'numbered', desc: 'Keeps labels off a busy object', slot: 'object', render: (ctx) => <Numbered ctx={ctx} /> },
  { family: 'callout', id: 'v4', label: 'value flag', desc: 'Pill flag for a probed value', slot: 'object', render: (ctx) => <ValueFlag ctx={ctx} /> },
]
