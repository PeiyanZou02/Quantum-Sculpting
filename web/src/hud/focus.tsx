import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { HudCtx, HudModule, Rect } from './types'
import './marks.css'

/*
 * Focus — what the view camera is looking at (QLMarks4 › Focus). Always grey: focus is context,
 * selection is ink, so the two never read alike.
 * v1 grey corners · v2 frame + tag · v3 depth band · v4 refocusing.
 */

const INK = 'var(--qs-ink)'
const INK2 = 'var(--qs-ink2)'
const INK3 = 'var(--qs-ink3)'
const BG = 'var(--qs-bg)'
const MONO = 'var(--qs-mono)'

const f = (v: number) => Math.round(v * 10) / 10
const stroke = (c: string): CSSProperties => ({ stroke: c, fill: 'none' })

function Hud({ ctx, children }: { ctx: HudCtx; children: ReactNode }) {
  return (
    <svg className="qs-hud" width={ctx.w} height={ctx.h} viewBox={`0 0 ${ctx.w} ${ctx.h}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {children}
    </svg>
  )
}

/** The focus frame: the object's screen rect pushed out a little. */
const OUT = 10
const frameOf = (r: Rect): Rect => ({ l: r.l - OUT, r: r.r + OUT, t: r.t - OUT, b: r.b + OUT })

/** Four L corners, `len` arms, as one path. */
function cornerPath({ l, r, t, b }: Rect, len: number) {
  const L = Math.min(len, (r - l) / 3, (b - t) / 3)
  return (
    `M${f(l)} ${f(t + L)}V${f(t)}H${f(l + L)}M${f(r - L)} ${f(t)}H${f(r)}V${f(t + L)}` +
    `M${f(r)} ${f(b - L)}V${f(b)}H${f(r - L)}M${f(l + L)} ${f(b)}H${f(l)}V${f(b - L)}`
  )
}

/* ── v1 · grey corners ──────────────────────────────────────────────────────── */

function GreyCorners({ ctx }: { ctx: HudCtx }) {
  if (!ctx.rect) return null
  return (
    <Hud ctx={ctx}>
      <path d={cornerPath(frameOf(ctx.rect), 18)} strokeWidth={1.5} style={stroke(INK3)} />
    </Hud>
  )
}

/* ── v2 · frame + tag ───────────────────────────────────────────────────────── */

function FrameTag({ ctx }: { ctx: HudCtx }) {
  if (!ctx.rect) return null
  const { l, r, t, b } = frameOf(ctx.rect)
  const label = 'focus · auto'
  const tw = label.length * 6 + 16
  const ty = Math.max(4, t - 24)
  return (
    <Hud ctx={ctx}>
      <rect x={f(l) + 0.5} y={f(t) + 0.5} width={Math.max(0, f(r - l) - 1)} height={Math.max(0, f(b - t) - 1)} strokeWidth={1} strokeDasharray="3 3" style={stroke(INK3)} />
      <rect x={f(l - 2) + 0.5} y={f(ty) + 0.5} width={tw} height={18} rx={9} strokeWidth={1} style={{ stroke: INK3, fill: BG }} />
      <text x={f(l - 2 + tw / 2)} y={f(ty + 9.5)} fontSize={10} textAnchor="middle" dominantBaseline="central" style={{ fill: INK2, fontFamily: MONO }}>
        {label}
      </text>
    </Hud>
  )
}

/* ── v3 · depth band ────────────────────────────────────────────────────────── */

function DepthBand({ ctx }: { ctx: HudCtx }) {
  if (!ctx.rect) return null
  const { l, r, t, b } = frameOf(ctx.rect)
  const H = 8
  // Seen from above the floor, the top of the frame is the far edge and the bottom the near one.
  const d = `M${f(l) + 0.5} ${f(t + H)}V${f(t) + 0.5}H${f(r) - 0.5}V${f(t + H)}M${f(l) + 0.5} ${f(b - H)}V${f(b) - 0.5}H${f(r) - 0.5}V${f(b - H)}`
  const tx = { fontFamily: MONO } as const
  return (
    <Hud ctx={ctx}>
      <path d={d} strokeWidth={1} strokeDasharray="3 3" style={stroke(INK3)} />
      <text x={f(r + 6)} y={f(t + 3.5)} fontSize={9} className="qs-hud-halo" style={{ ...tx, fill: INK3 }}>far</text>
      <text x={f(r + 6)} y={f(b + 3)} fontSize={9} className="qs-hud-halo" style={{ ...tx, fill: INK3 }}>near</text>
      <text x={f((l + r) / 2)} y={f((t + b) / 2)} fontSize={11} textAnchor="middle" dominantBaseline="central" className="qs-hud-halo" style={{ ...tx, fill: INK }}>
        {`dist ${ctx.cam.dist.toFixed(2)}`}
      </text>
    </Hud>
  )
}

/* ── v4 · refocusing ────────────────────────────────────────────────────────── */

/** How long `tick` must stay still before the camera counts as settled. */
const SETTLE_MS = 160

interface Snap { az: number; el: number; dist: number; cx: number; cy: number; s: number }

function bigMove(a: Snap, b: Snap, w: number, h: number) {
  const daz = Math.abs(((b.az - a.az + 540) % 360) - 180)
  return (
    daz > 30 ||
    Math.abs(b.el - a.el) > 15 ||
    Math.abs(b.dist - a.dist) > 0.15 * Math.max(a.dist, 1e-3) ||
    Math.hypot(b.cx - a.cx, b.cy - a.cy) > 0.12 * Math.min(w, h) ||
    Math.abs(b.s - a.s) > 0.15 * Math.max(a.s, 1)
  )
}

function Refocusing({ ctx }: { ctx: HudCtx }) {
  const [beat, setBeat] = useState(0)
  const last = useRef<Snap | null>(null)
  const { tick, rect, cam, w, h } = ctx
  // Each tick restarts the timer; when it fires the view has settled. Compare with the last settled
  // view and breathe once after a reset or any large move.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!rect) return
      const cur: Snap = { az: cam.az, el: cam.el, dist: cam.dist, cx: (rect.l + rect.r) / 2, cy: (rect.t + rect.b) / 2, s: Math.max(rect.r - rect.l, rect.b - rect.t) }
      const prev = last.current
      last.current = cur
      if (prev && bigMove(prev, cur, w, h)) setBeat((n) => n + 1)
    }, SETTLE_MS)
    return () => window.clearTimeout(id)
    // Only tick drives this; the closure holds the matching rect and camera.
  }, [tick])
  if (!rect) return null
  const fr = frameOf(rect)
  const cx = (fr.l + fr.r) / 2, cy = (fr.t + fr.b) / 2
  return (
    <Hud ctx={ctx}>
      <g key={beat} className={beat ? 'qs-hud-anim qs-hud-breathe' : undefined} style={{ transformOrigin: `${f(cx)}px ${f(cy)}px` }}>
        <path d={cornerPath(fr, 18)} strokeWidth={1.5} style={stroke(INK3)} />
      </g>
    </Hud>
  )
}

export const FOCUS_MODULES: HudModule[] = [
  { family: 'focus', id: 'v1', label: 'grey corners', desc: 'Never confused with selection', slot: 'object', render: (ctx) => <GreyCorners ctx={ctx} /> },
  { family: 'focus', id: 'v2', label: 'frame + tag', desc: 'For the processed and result views', slot: 'object', render: (ctx) => <FrameTag ctx={ctx} /> },
  { family: 'focus', id: 'v3', label: 'depth band', desc: 'Near and far edges of the frame', slot: 'object', render: (ctx) => <DepthBand ctx={ctx} /> },
  { family: 'focus', id: 'v4', label: 'refocusing', desc: 'Breathes once after reset view', slot: 'object', render: (ctx) => <Refocusing ctx={ctx} /> },
]
