// CAPTURES: past processing runs this session as dots (filled = taken, ring = current), after the
// lab-HUD mood reference; plus a timeline and a strength × reach scatter of the same runs.
import type { CSSProperties } from 'react'
import type { HudCtx } from './types'
import { useNow } from '../useNow'
import './lab.css'

type Run = HudCtx['runs'][number]

const PER_ROW = 10
const MAX_ROWS = 3
const D = 7 // dot size
const GAP = 9

const MONO10: CSSProperties = { font: '400 10px/1 var(--qs-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

/** Run time in ms. Runs are stamped with Date.now(); seconds are accepted too. */
const ms = (t: number) => (t < 1e11 ? t * 1000 : t)

function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - ms(t)) / 1000))
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}

const clock = (t: number) => {
  const d = new Date(ms(t))
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const runDesc = (r: Run) => `${r.mode} · strength ${r.strength.toFixed(2)} · reach ${r.reach.toFixed(2)} · ${clock(r.t)}`

function Dot({ kind, tip, desc }: { kind: 'past' | 'now' | 'empty'; tip?: string; desc?: string }) {
  const base: CSSProperties = { position: 'relative', width: D + 4, height: D + 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }
  const inner =
    kind === 'past' ? (
      <span style={{ width: D, height: D, borderRadius: '50%', background: 'var(--qs-ink3)' }} />
    ) : kind === 'now' ? (
      <span style={{ width: D + 4, height: D + 4, borderRadius: '50%', border: '1px solid var(--qs-ink)', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--qs-ink)' }} />
      </span>
    ) : (
      <span style={{ width: D, height: D, borderRadius: '50%', border: '1px solid var(--qs-ink4)', boxSizing: 'border-box' }} />
    )
  if (tip)
    return (
      <span className="qs-lab-hit" data-tip={tip} data-tip-desc={desc} tabIndex={0} style={{ ...base, cursor: 'default' }}>
        {inner}
      </span>
    )
  return <span style={base}>{inner}</span>
}

function Title({ count, total }: { count: number; total?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span className="qs-lab-label">Captures</span>
      <span style={{ ...MONO10, color: 'var(--qs-ink3)' }}>{total != null ? `${count} / ${total}` : count}</span>
    </div>
  )
}

/** v1 / v2: rows of ten dots, newest as ring + dot, empty rings fill the row. */
export function Dots({ ctx, labels }: { ctx: HudCtx; labels: boolean }) {
  const runs = ctx.runs.slice(-PER_ROW * MAX_ROWS)
  const slots = Math.max(PER_ROW, Math.ceil(runs.length / PER_ROW) * PER_ROW)
  const rows: number[][] = []
  for (let r = 0; r < slots / PER_ROW; r++) rows.push(Array.from({ length: PER_ROW }, (_, c) => r * PER_ROW + c))
  const last = runs.length - 1
  const newest = runs[last]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
      <Title count={ctx.runs.length} total={slots} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP - 4 }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: GAP - 4 }}>
            {row.map((i) => {
              const r = runs[i]
              const kind = !r ? 'empty' : i === last ? 'now' : 'past'
              return <Dot key={i} kind={kind} tip={labels && r ? r.label : undefined} desc={labels && r ? runDesc(r) : undefined} />
            })}
          </div>
        ))}
      </div>
      {labels && newest && (
        <span style={{ ...MONO10, color: 'var(--qs-ink2)', alignSelf: 'center' }}>
          {newest.label} <span style={{ color: 'var(--qs-ink3)' }}>· {newest.mode}</span>
        </span>
      )}
    </div>
  )
}

/** v3: runs on a time axis from the first run to now. */
export function Timeline({ ctx }: { ctx: HudCtx }) {
  const W = 360
  const runs = ctx.runs
  // `now` comes from the newest run, not the wall clock, so the axis only moves when a run lands.
  const t1 = runs.length ? ms(runs[runs.length - 1].t) : 0
  const t0 = runs.length ? ms(runs[0].t) : 0
  const span = Math.max(60_000, t1 - t0)
  const x = (t: number) => (runs.length < 2 ? W : ((ms(t) - t0) / span) * W)
  const last = runs.length - 1
  const now = useNow()   // for "… s ago"
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
      <Title count={runs.length} />
      <div style={{ position: 'relative', width: W, height: 34 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 1, background: 'var(--qs-ink4)' }} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <div key={f} style={{ position: 'absolute', left: f * W, top: 3, width: 1, height: 7, background: 'var(--qs-ink4)' }} />
        ))}
        {runs.map((r, i) => (
          <span key={r.id} style={{ position: 'absolute', left: x(r.t), top: 6, transform: 'translate(-50%,-50%)', display: 'flex' }}>
            <Dot kind={i === last ? 'now' : 'past'} tip={r.label} desc={runDesc(r)} />
          </span>
        ))}
        <span style={{ ...MONO10, position: 'absolute', left: 0, top: 22, color: 'var(--qs-ink3)' }}>{runs.length ? clock(runs[0].t) : '—'}</span>
        <span style={{ ...MONO10, position: 'absolute', right: 0, top: 22, color: 'var(--qs-ink3)' }}>
          {runs.length ? `${clock(runs[last].t)} · ${ago(runs[last].t, now)}` : 'no runs yet'}
        </span>
      </div>
    </div>
  )
}

/** v4: past runs on strength (x) × reach (y), with the current settings as a cross. */
export function Scatter({ ctx }: { ctx: HudCtx }) {
  const S = 96
  const runs = ctx.runs
  const xMax = Math.max(1, ctx.q.strength, ...runs.map((r) => r.strength))
  const yMax = Math.max(1, ctx.q.reach, ...runs.map((r) => r.reach))
  const X = (v: number) => (v / xMax) * S
  const Y = (v: number) => S - (v / yMax) * S
  const last = runs.length - 1
  const cx = X(ctx.q.strength)
  const cy = Y(ctx.q.reach)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
      <Title count={runs.length} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...MONO10, color: 'var(--qs-ink3)' }}>reach</span>
        <div style={{ position: 'relative', width: S, height: S }}>
          <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
            <path d={`M0 0V${S}H${S}`} style={{ fill: 'none', stroke: 'var(--qs-ink3)', strokeWidth: 1 }} shapeRendering="crispEdges" />
            <path d={`M${S / 2} 0V${S}M0 ${S / 2}H${S}`} style={{ fill: 'none', stroke: 'var(--qs-line)', strokeWidth: 1, strokeDasharray: '2 3' }} />
            <path d={`M${cx - 5} ${cy}H${cx + 5}M${cx} ${cy - 5}V${cy + 5}`} style={{ fill: 'none', stroke: 'var(--qs-ink)', strokeWidth: 1 }} />
          </svg>
          {runs.map((r, i) => (
            <span key={r.id} style={{ position: 'absolute', left: X(r.strength), top: Y(r.reach), transform: 'translate(-50%,-50%)', display: 'flex' }}>
              <Dot kind={i === last ? 'now' : 'past'} tip={r.label} desc={runDesc(r)} />
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: S, ...MONO10, color: 'var(--qs-ink3)' }}>
          <span>strength</span>
          <span>{xMax.toFixed(0)}</span>
        </div>
      </div>
    </div>
  )
}
