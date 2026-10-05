// Lab frame: registration dots, crosses, corner brackets and a safe area, drawn over the whole view.
// Ported from SculptorChrome (16px corners at 24px inset, 4px edge dots) and the onformative-style
// "research lab" mood: dots along the edges, small + crosses around the centre.
import type { CSSProperties, ReactNode } from 'react'
import type { HudCtx } from './types'
import './lab.css'

const INSET = 28
const n1 = (v: number) => Math.round(v * 2) / 2

/** Evenly spaced positions from a to b, about `step` apart, ends included. */
function spread(a: number, b: number, step: number): number[] {
  const len = b - a
  if (len <= 0) return []
  const k = Math.max(1, Math.round(len / step))
  return Array.from({ length: k + 1 }, (_, i) => a + (len * i) / k)
}

function Layer({ ctx, children }: { ctx: HudCtx; children: ReactNode }) {
  return (
    <svg className="qs-lab-layer" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} aria-hidden>
      {children}
    </svg>
  )
}

/** 4px square dots along all four edges, inset; corners left to the brackets. */
function edgeDots(w: number, h: number, step: number, inset: number, color: string, skip = 60): ReactNode {
  const s = 4
  const out: ReactNode[] = []
  const xs = spread(inset + skip, w - inset - skip, step)
  const ys = spread(inset + skip, h - inset - skip, step)
  xs.forEach((x, i) => {
    out.push(<rect key={`t${i}`} x={n1(x - s / 2)} y={inset - s / 2} width={s} height={s} style={{ fill: color }} />)
    out.push(<rect key={`b${i}`} x={n1(x - s / 2)} y={h - inset - s / 2} width={s} height={s} style={{ fill: color }} />)
  })
  ys.forEach((y, i) => {
    out.push(<rect key={`l${i}`} x={inset - s / 2} y={n1(y - s / 2)} width={s} height={s} style={{ fill: color }} />)
    out.push(<rect key={`r${i}`} x={w - inset - s / 2} y={n1(y - s / 2)} width={s} height={s} style={{ fill: color }} />)
  })
  return out
}

const cross = (x: number, y: number, arm: number) => `M${n1(x - arm)} ${n1(y)}H${n1(x + arm)}M${n1(x)} ${n1(y - arm)}V${n1(y + arm)}`

function brackets(w: number, h: number, inset: number, len: number) {
  const L = inset
  const R = w - inset
  const T = inset
  const B = h - inset
  return (
    `M${L} ${T + len}V${T}H${L + len}` +
    `M${R - len} ${T}H${R}V${T + len}` +
    `M${R} ${B - len}V${B}H${R - len}` +
    `M${L + len} ${B}H${L}V${B - len}`
  )
}

const stroke = (c: string, extra?: CSSProperties): CSSProperties => ({ fill: 'none', stroke: c, strokeWidth: 1, ...extra })

export function Registration({ ctx }: { ctx: HudCtx }) {
  const { w, h } = ctx
  let d = ''
  for (const fx of [1 / 3, 2 / 3]) for (const fy of [1 / 3, 2 / 3]) d += cross(w * fx, h * fy, 5)
  return (
    <Layer ctx={ctx}>
      {edgeDots(w, h, 64, INSET, 'var(--qs-ink3)')}
      <path d={d} shapeRendering="crispEdges" style={stroke('var(--qs-ink3)')} />
    </Layer>
  )
}

export function Brackets({ ctx }: { ctx: HudCtx }) {
  const { w, h } = ctx
  return (
    <Layer ctx={ctx}>
      <path d={brackets(w, h, INSET, 16)} shapeRendering="crispEdges" style={stroke('var(--qs-ink)')} />
      <path d={cross(w / 2, h / 2, 11)} shapeRendering="crispEdges" style={stroke('var(--qs-ink3)')} />
    </Layer>
  )
}

export function BracketDots({ ctx }: { ctx: HudCtx }) {
  const { w, h } = ctx
  return (
    <Layer ctx={ctx}>
      <path d={brackets(w, h, INSET, 14)} shapeRendering="crispEdges" style={stroke('var(--qs-ink3)')} />
      {edgeDots(w, h, 96, INSET, 'var(--qs-ink4)', 72)}
      <path d={cross(w / 2, h / 2, 6)} shapeRendering="crispEdges" style={stroke('var(--qs-ink4)')} />
    </Layer>
  )
}

export function SafeArea({ ctx }: { ctx: HudCtx }) {
  const { w, h } = ctx
  const l = w * 0.1
  const t = h * 0.1
  const sw = w * 0.8
  const sh = h * 0.8
  let thirds = ''
  for (const f of [1 / 3, 2 / 3]) thirds += `M${n1(l + sw * f)} ${n1(t)}V${n1(t + sh)}M${n1(l)} ${n1(t + sh * f)}H${n1(l + sw)}`
  return (
    <Layer ctx={ctx}>
      <path d={thirds} style={stroke('var(--qs-line)', { strokeDasharray: '2 3' })} />
      <rect x={n1(l)} y={n1(t)} width={n1(sw)} height={n1(sh)} style={stroke('var(--qs-ink3)', { strokeDasharray: '3 3' })} />
      <text x={n1(l + 6)} y={n1(t - 6)} style={{ fill: 'var(--qs-ink3)', font: '400 10px/1 var(--qs-mono)', fontVariantNumeric: 'tabular-nums' }}>
        safe area 80%
      </text>
    </Layer>
  )
}
