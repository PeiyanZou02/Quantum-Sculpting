// More navigation, from design/handoff/QLNav4.dc.html ("06 Navigation", E–K), fed from the live HudCtx.
// E and E2 time the last run from the runtime log: every request line ("POST /api/voxelize  200  18 ms") is
// stamped when the request ends, so it covers [t − ms, t]. G tabs, H segmented progress and I breadcrumb
// follow the view and switch it with ctx.goStep; J ruler index and K expanding index open a step's settings.
// F (command line) is an input proposal, not a readout, and is not ported: I already reads the parameters.
// Timings are the sheet's: underline 350 ms, fills 300 ms, ruler 300 ms, replay 12 s.
import { useMemo, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react'
import type { FamilyDef, HudCtx, HudModule } from './types'
import './navmore.css'

// ---------------------------------------------------------------- shared

const MODE: Record<string, string> = { gaussian: 'gaussian', emulator: 'emulation', atlas: 'atlas', nations: 'evolve' }
const modeName = (m: string) => MODE[m] ?? m
const FIELD: Record<string, string> = { threshold: 'toward result', difference: 'difference', gradient: 'gradient' }
const VIEW_STEP: Record<HudCtx['view'], number> = { model: 0, voxels: 1, processed: 2, scan: 2, result: 3 }
/** Atlas tiles run three at a time (ATLAS_PARALLEL in app/server.py); the first one runs alone. */
const SLOTS = 3

const fmt = (n: number) => n.toLocaleString('en-US')
const f2 = (v: number) => v.toFixed(2)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const base = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)
const pad2 = (i: number) => String(i + 1).padStart(2, '0')

/** 18 ms, 2.4 s, 3 min 12 s */
function dur(ms: number) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)} min ${s % 60} s`
}
/** 00:24.0 */
function clock(ms: number) {
  const s = Math.max(0, ms) / 1000
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`
}

type Param = [string, string]
interface Step { i: number; num: string; title: string; value: string; params: Param[]; done: boolean; cur: boolean; reached: boolean }

const isRunning = (ctx: HudCtx) => ctx.job?.status === 'running'

/** Tiles of the quantum step: done / total, from the running job, the result, or the grid's plan. */
function tilesOf(ctx: HudCtx) {
  const j = ctx.job
  if (j && j.status === 'running') return { done: j.tiles_done, total: Math.max(1, j.tiles_total) }
  const total = Math.max(1, ctx.proc?.tiles?.jobs ?? ctx.grid?.tiles?.[ctx.q.tiling as 'cube' | 'layers']?.jobs ?? 1)
  return { done: ctx.proc ? total : 0, total }
}

/** The four steps with a one-line value and their settings. `cur` is the step of the view. */
function stepsOf(ctx: HudCtx): { list: Step[]; cur: number } {
  const labels = ctx.steps.labels
  const cur = clamp(VIEW_STEP[ctx.view] ?? 0, 0, Math.max(0, labels.length - 1))
  const { model: md, grid: g, report: r } = ctx
  const tl = tilesOf(ctx)
  const mode = ctx.proc?.mode ?? ctx.q.mode
  const quantumOn = !!ctx.proc || isRunning(ctx)
  const level = r?.level ?? ctx.level
  const values = [
    md ? base(md.file || md.name) : '—',
    g ? `${g.n}³ · ${g.values}` : '—',
    quantumOn ? `${modeName(mode)} · ${f2(ctx.q.strength)}` : '—',
    r ? (r.method === 'advect' ? `push ${f2(r.amount)}` : `level ${f2(level)}`) : '—',
  ]
  const params: Param[][] = [
    [['Up axis', md?.up ?? '—'], ['Faces', md ? fmt(md.faces) : '—'], ['Watertight', md ? (md.watertight ? 'yes' : 'no') : '—']],
    [['Grid', g ? `${g.n}³` : '—'], ['Fill', g?.fill ?? '—'], ['Values', g?.values ?? '—']],
    [['Mode', modeName(mode)], ['Strength', f2(ctx.q.strength)], ['Tiles', `${tl.done} of ${tl.total}`]],
    r && r.method === 'advect'
      ? [['Method', 'push'], ['Field', FIELD[r.field] ?? r.field], ['Amount', f2(r.amount)]]
      : [['Method', r ? 'threshold' : '—'], ['Level', f2(level)], ['Faces', r ? fmt(r.faces) : '—']],
  ]
  const list = labels.map(([title], i) => {
    const done = !!ctx.steps.done[i]
    return { i, num: pad2(i), title, value: values[i] ?? '—', params: params[i] ?? [], done, cur: i === cur, reached: done || i === cur }
  })
  return { list, cur }
}

/** "01 Model": the number in mono, the name in sans. */
const Name = ({ s, cls = 'qn-t', color }: { s: Step; cls?: string; color?: string }) => (
  <span className={cls} style={{ color: color ?? (s.reached ? 'var(--qs-ink)' : 'var(--qs-ink3)') }}>
    <span className="qn-num">{s.num}</span>
    {s.title}
  </span>
)

function Rows({ params, style }: { params: Param[]; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, ...style }}>
      {params.map(([k, v]) => (
        <div key={k} className="qn-row">
          <span className="qn-row__k">{k}</span>
          <span className="qn-row__dots" />
          <span className={'qn-row__v' + (v === '—' ? ' qn-row__v--dim' : '')}>{v}</span>
        </div>
      ))}
    </div>
  )
}

/** A step as a button: goes to its view when that view exists. */
function stepBtn(ctx: HudCtx, s: Step, extra?: () => void) {
  return {
    type: 'button' as const,
    'aria-disabled': !s.done || undefined,
    'aria-current': s.cur ? ('step' as const) : undefined,
    'data-tip': s.title,
    'data-tip-desc': `${s.value === '—' ? '' : `${s.value} · `}${s.cur ? 'shown' : s.done ? 'done' : 'not run yet'}`,
    onClick: () => {
      extra?.()
      if (s.done) ctx.goStep(s.i)
    },
  }
}

/** Local open step that follows the view whenever the view changes (J, K). */
function useFollow(cur: number) {
  const [open, setOpen] = useState(cur)
  const [seen, setSeen] = useState(cur)
  if (seen !== cur) {
    setSeen(cur)
    setOpen(cur)
  }
  return [open, setOpen] as const
}

// ---------------------------------------------------------------- the runtime log as timings

interface Req { method: string; path: string; a: number; b: number }
const NET = /^(\w+)\s+(\S+)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*ms$/

/** Successful requests from the log, oldest first. */
function requestsOf(log: HudCtx['log']): Req[] {
  const out: Req[] = []
  for (const l of log) {
    if (l.level !== 'net') continue
    const m = NET.exec(l.text.trim())
    if (!m || !/^2\d\d$/.test(m[3])) continue
    out.push({ method: m[1], path: m[2], a: l.t - +m[4], b: l.t })
  }
  return out.sort((x, y) => x.a - y.a)
}

/** Which step a request belongs to, or −1 (key, state, model list, Evolve frames, Atlas list). */
function stepOf(path: string): number {
  if (path.startsWith('/api/model/')) return 0
  if (path === '/api/voxelize' || path === '/api/grid/input') return 1
  if (path === '/api/process' || /^\/api\/process\/[^/]+(\/preview)?$/.test(path) || path === '/api/grid/processed' || path === '/api/nations/history') return 2
  if (path === '/api/mesh') return 3
  return -1
}
const isPoll = (r: Req) => r.method === 'GET' && /^\/api\/process\/[^/]+$/.test(r.path)

interface Span { step: number; a: number; b: number }

/** Consecutive requests of one step merge into a span; requests of no step don't break it. */
function spansOf(reqs: Req[]): Span[] {
  const out: Span[] = []
  for (const r of reqs) {
    const s = stepOf(r.path)
    if (s < 0) continue
    const last = out[out.length - 1]
    if (last && last.step === s) last.b = Math.max(last.b, r.b)
    else out.push({ step: s, a: r.a, b: r.b })
  }
  return out
}

/** The last run: the newest span, then for each earlier step the newest span that began before it. */
function lastRun(spans: Span[], n: number): (Span | null)[] {
  const chain: (Span | null)[] = Array.from({ length: n }, () => null)
  const last = spans[spans.length - 1]
  if (!last || last.step >= n) return chain
  chain[last.step] = last
  let bound = last.a
  for (let s = last.step - 1; s >= 0; s--) {
    for (let j = spans.length - 1; j >= 0; j--) {
      if (spans[j].step === s && spans[j].a <= bound) {
        chain[s] = spans[j]
        bound = spans[j].a
        break
      }
    }
  }
  return chain
}

// ---------------------------------------------------------------- E run timeline

const E_W = 600

function RunTimeline({ ctx }: { ctx: HudCtx }) {
  const reqs = useMemo(() => requestsOf(ctx.log), [ctx.log])
  const { list } = stepsOf(ctx)
  const chain = lastRun(spansOf(reqs), list.length)
  const timed = chain.filter((s): s is Span => !!s)
  const running = isRunning(ctx)
  const now = Date.now()
  // not to scale: every step keeps a readable share, longer ones get more (log of the duration)
  const ms = chain.map((s, i) => (s ? (running && i === 2 && s === timed[timed.length - 1] ? now : s.b) - s.a : 0))
  const raw = ms.map((d) => 1 + Math.log10(1 + d / 10))
  const sum = raw.reduce((a, v) => a + v, 0) || 1
  const share = raw.map((v) => Math.max(0.18, v / sum))
  const k = share.reduce((a, v) => a + v, 0)
  let acc = 0
  const segs = list.map((s, i) => {
    const l = acc
    const w = (share[i] / k) * 100
    acc += w
    return { s, l, w, span: chain[i], d: ms[i] }
  })
  // the run's length is the time its steps took, without the idle time between them
  const total = ms.reduce((a, v) => a + v, 0)
  const empty = !timed.length
  return (
    <div className="qn" style={{ width: E_W, height: 72 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 34, height: 1, background: 'var(--qs-ink4)' }} />
      {segs.map(({ s, l, w, span, d }) => (
        <div key={s.i} style={{ position: 'absolute', left: `${l}%`, width: `${w}%`, top: 24, height: 20, borderLeft: `1px solid ${span ? 'var(--qs-ink3)' : 'var(--qs-ink4)'}` }}>
          <span style={{ position: 'absolute', left: 6, top: -14, display: 'flex', alignItems: 'baseline', gap: 6, maxWidth: 'calc(100% - 10px)' }}>
            <span className="qn-t qn-t--s" style={{ color: span ? 'var(--qs-ink2)' : 'var(--qs-ink3)' }}>{s.title}</span>
            <span className="qn-v qn-cut" style={{ color: 'var(--qs-ink3)' }}>{span ? dur(d) : '—'}</span>
          </span>
        </div>
      ))}
      {empty ? (
        <span className="qn-t qn-t--note" style={{ position: 'absolute', left: 0, right: 0, top: 44, textAlign: 'center' }}>No run timed yet. The steps fill in as they run.</span>
      ) : (
        <div className={running ? undefined : 'qn-play'} style={{ position: 'absolute', top: 18, height: 34, width: 1, left: '100%', background: 'var(--qs-ink)' }}>
          <span className="qn-t qn-t--s" style={{ position: 'absolute', left: 5, top: 24 }}>{running ? 'now' : 'replay'}</span>
        </div>
      )}
      <span className="qn-v" style={{ position: 'absolute', left: 0, top: 60, color: 'var(--qs-ink3)' }}>00:00</span>
      <span className="qn-v" style={{ position: 'absolute', right: 0, top: 60, color: 'var(--qs-ink3)' }}>{empty ? '—' : clock(total)}</span>
    </div>
  )
}

// ---------------------------------------------------------------- E2 run timeline with tiles

interface Seg { lane: number; lab: string; a: number; b: number; open?: boolean }

/** Tile completions seen while a job runs (per job id, for this page): the job only reports counts. */
const SEEN = new Map<string, { t0: number; done: number[] }>()
function observe(job: HudCtx['job']) {
  if (!job || (job.status !== 'running' && !SEEN.has(job.job_id))) return
  let rec = SEEN.get(job.job_id)
  if (!rec) SEEN.set(job.job_id, (rec = { t0: Date.now() - job.elapsed * 1000, done: [] }))
  while (rec.done.length < job.tiles_done) rec.done.push(Date.now())
}

/** Tile lanes rebuilt from completion times: tile 1 alone, then three at a time, a free slot taking the next. */
function schedule(t0: number, ends: number[], total: number, now: number): Seg[] {
  if (!ends.length) return [{ lane: 1, lab: 'tile 1', a: t0, b: now, open: true }]
  const out: Seg[] = [{ lane: 1, lab: 'tile 1', a: t0, b: ends[0] }]
  let next = 1
  const run: { tile: number; a: number; slot: number }[] = []
  for (let s = 0; s < SLOTS && next < total; s++) run.push({ tile: next++, a: ends[0], slot: s })
  for (let k = 1; k < ends.length && run.length; k++) {
    const r = run.shift()!
    out.push({ lane: 1 + r.slot, lab: `tile ${r.tile + 1}`, a: r.a, b: ends[k] })
    if (next < total) run.push({ tile: next++, a: ends[k], slot: r.slot })
  }
  for (const r of run) out.push({ lane: 1 + r.slot, lab: `tile ${r.tile + 1}`, a: r.a, b: now, open: true })
  return out
}

/** Atlas rows of this run (submitted → done), placed in the first free slot. */
function fromRows(rows: { a: number; b: number; tile: number }[]): Seg[] {
  const free = Array.from({ length: SLOTS }, () => -Infinity)
  return rows
    .sort((x, y) => x.a - y.a)
    .map((r) => {
      let s = free.findIndex((e) => e <= r.a + 250)
      if (s < 0) s = free.indexOf(Math.min(...free))
      free[s] = r.b
      return { lane: 1 + s, lab: `tile ${r.tile}`, a: r.a, b: r.b }
    })
}

function localLabel(r: Req, mode: string, method?: string): string | null {
  const p = r.path
  if (isPoll(r)) return null
  if (p === '/api/model/orient') return 'orient'
  if (p.startsWith('/api/model/')) return 'load'
  if (p === '/api/voxelize' || p === '/api/grid/input') return 'voxelise'
  if (p === '/api/process') return mode === 'atlas' ? 'submit' : mode === 'emulator' ? 'emulate' : mode === 'nations' ? 'evolve' : 'blur'
  if (p.endsWith('/preview')) return 'preview'
  if (p === '/api/grid/processed') return mode === 'atlas' ? 'stitch' : 'result'
  if (p === '/api/nations/history') return 'history'
  if (p === '/api/mesh') return method === 'advect' ? 'push' : 'level set'
  if (p === '/api/export') return 'export'
  return null
}

interface TilesData {
  win: { a: number; b: number } | null
  segs: Seg[]
  polls: number[]
  atlas: boolean
  total: number
  tiled: boolean
}

function tilesData(ctx: HudCtx, reqs: Req[], now: number): TilesData {
  const mode = ctx.proc?.mode ?? ctx.q.mode
  const job = ctx.job && (ctx.job.status === 'running' || (ctx.proc?.mode === 'atlas' && ctx.proc.run === ctx.job.run)) ? ctx.job : null
  const atlas = !!job || mode === 'atlas'
  const total = job ? Math.max(1, job.tiles_total) : tilesOf(ctx).total
  // the window: the last burst of step requests (idle gaps over 4 s end it; polls keep an Atlas run whole)
  const rel = reqs.filter((r) => stepOf(r.path) >= 0 || r.path === '/api/export')
  let win: TilesData['win'] = null
  if (rel.length) {
    let a = rel[rel.length - 1].a
    for (let j = rel.length - 2; j >= 0; j--) {
      if (rel[j].b < a - 4000) break
      a = Math.min(a, rel[j].a)
    }
    win = { a, b: Math.max(...rel.filter((r) => r.a >= a).map((r) => r.b)) }
  }
  if (job?.status === 'running') win = { a: Math.min(win?.a ?? now, now - job.elapsed * 1000), b: now }
  if (!win) return { win, segs: [], polls: [], atlas, total, tiled: false }
  const w = win
  const inWin = (r: Req) => r.b >= w.a && r.a <= w.b
  // local lane: consecutive requests with the same label merge
  const segs: Seg[] = []
  for (const r of reqs) {
    if (!inWin(r)) continue
    const lab = localLabel(r, mode, ctx.report?.method)
    if (!lab) continue
    const last = segs[segs.length - 1]
    if (last && last.lab === lab && r.a - last.b < 60) last.b = Math.max(last.b, r.b)
    else segs.push({ lane: 0, lab, a: r.a, b: r.b })
  }
  // tile lanes: Atlas rows of this run when the service listed them, else completions seen live
  let tiles: Seg[] = []
  const run = job?.run ?? ctx.proc?.run
  if (atlas && run) {
    const rows = ctx.atlasJobs
      .filter((j) => j.local && j.local.run === run)
      .map((j) => {
        const a = Date.parse(j.created_at)
        const sec = j.local!.seconds
        return { a, b: sec ? a + sec * 1000 : Date.parse(j.updated_at), tile: 1 + (j.local!.tile?.reduce((x, v) => x + v, 0) ?? 0) }
      })
      .filter((x) => Number.isFinite(x.a) && Number.isFinite(x.b) && x.b >= w.a - 5000 && x.a <= w.b + 5000)
    tiles = fromRows(rows).map((s, i) => ({ ...s, lab: `tile ${i + 1}` }))
    if (!tiles.length && job) {
      const rec = SEEN.get(job.job_id)
      if (rec) tiles = schedule(rec.t0, rec.done, total, job.status === 'running' ? now : rec.done[rec.done.length - 1] ?? now)
    }
  }
  for (const t of tiles) {
    t.a = clamp(t.a, w.a, w.b)
    t.b = clamp(t.b, t.a, w.b)
  }
  const polls = reqs.filter((r) => isPoll(r) && inWin(r)).map((r) => r.b)
  return { win, segs: [...segs, ...tiles], polls, atlas, total, tiled: tiles.length > 0 }
}

/** A tick step that gives at most five intervals. */
function tickStep(L: number) {
  for (const s of [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]) if (L / s <= 5) return s
  return 3600
}
const tickLabel = (v: number, step: number) => `${step < 0.1 ? v.toFixed(2) : step < 1 ? v.toFixed(1) : Math.round(v)} s`

const NAMES_W = 92
const PLOT_W = 520
const LANE_H = 34
const LANES = ['Local', 'Atlas slot 1', 'Atlas slot 2', 'Atlas slot 3']

function RunTiles({ ctx }: { ctx: HudCtx }) {
  const reqs = useMemo(() => requestsOf(ctx.log), [ctx.log])
  // a cache write, not a state change: the same job and count record nothing twice
  observe(ctx.job)
  const now = Date.now()
  const d = tilesData(ctx, reqs, now)
  const [scrub, setScrub] = useState<{ key: number; t: number } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const L = d.win ? Math.max(0.02, (d.win.b - d.win.a) / 1000) : 1
  const t = d.win && scrub && scrub.key === d.win.a ? clamp(scrub.t, 0, L) : L
  const T = (d.win?.a ?? 0) + t * 1000
  const X = (ms: number) => (d.win ? ((ms - d.win.a) / 1000 / L) * PLOT_W : 0)
  const step = tickStep(L)
  const ticks: number[] = []
  for (let v = 0; v <= L + 1e-9; v += step) ticks.push(+v.toFixed(6))
  if (L - ticks[ticks.length - 1] > step * 0.4) ticks.push(L)
  const n = ctx.grid?.n ?? ctx.n
  const mode = ctx.proc?.mode ?? ctx.q.mode
  const head = d.atlas ? `${n}³ in ${d.total} ${d.total === 1 ? 'tile' : 'tiles'}, ${SLOTS} at a time` : `${n}³, ${modeName(mode)} on this computer`
  const active = [...new Set(d.segs.filter((s) => s.a <= T && (T < s.b || (s.open && T <= s.b))).map((s) => s.lab))]
  // without tile times, the polls still show when the run was waiting on Atlas
  if (d.atlas && !d.tiled && d.polls.length && T >= d.polls[0] - 2500 && T <= d.polls[d.polls.length - 1]) active.push('waiting on Atlas')
  const tilesDone = d.segs.filter((s) => s.lane > 0 && !s.open && s.b <= T).length
  const atEnd = t >= L - 1e-6 && !isRunning(ctx)
  const read = !d.win ? '—' : `${active.length ? active.join(', ') : atEnd ? 'done' : 'idle'}${d.tiled ? ` · tiles done ${tilesDone} / ${d.total}` : d.atlas ? ` · ${d.total} ${d.total === 1 ? 'tile' : 'tiles'}` : ''}`
  const note = !d.win
    ? 'No run in this session yet'
    : !d.atlas
      ? 'No Atlas tiles: this run stayed on this computer'
      : !d.tiled
        ? ctx.proc?.cached ? 'Read from the cache; no tiles ran' : 'Tile times were not kept for this run'
        : null
  const at = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * L
  }
  const end = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDrag(null)
  }
  return (
    <div className="qn" style={{ width: NAMES_W + 16 + PLOT_W, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span className="qn-t qn-t--head">Run timeline</span>
          <span className="qn-t qn-t--s qn-cut" style={{ color: 'var(--qs-ink3)' }}>{head}</span>
        </span>
        <span className="qn-v qn-v--l qn-cut">{read}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `${NAMES_W}px ${PLOT_W}px`, columnGap: 16, paddingTop: 26 }}>
        <div style={{ position: 'relative', height: 176 }}>
          {[...LANES, 'Polls · 2 s'].map((name, i) => (
            <span key={name} className="qn-t qn-t--s" style={{ position: 'absolute', left: 0, top: i < LANES.length ? i * LANE_H + 14 : 140, color: 'var(--qs-ink2)' }}>
              {name}
            </span>
          ))}
        </div>
        <div
          className={d.win ? 'qn-scrub' : undefined}
          style={{ position: 'relative', height: 176 }}
          onPointerDown={(e) => {
            if (e.button !== 0 || !d.win) return
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag(e.pointerId)
            setScrub({ key: d.win.a, t: at(e) })
          }}
          onPointerMove={(e) => {
            if (e.pointerId === drag && d.win) setScrub({ key: d.win.a, t: at(e) })
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onDoubleClick={() => setScrub(null)}
        >
          {d.win &&
            ticks.map((v) => (
              <div key={v}>
                <div style={{ position: 'absolute', left: (v / L) * PLOT_W, top: 0, height: 156, borderLeft: '1px dashed var(--qs-ink4)' }} />
                <span className="qn-v" style={{ position: 'absolute', left: (v / L) * PLOT_W, top: 162, transform: 'translateX(-50%)', color: 'var(--qs-ink3)' }}>
                  {tickLabel(v, step)}
                </span>
              </div>
            ))}
          {d.segs.map((s, i) => {
            const x = X(s.a)
            const w = Math.max(0, X(s.b) - x)
            const started = T > s.a
            const p = T >= s.b && !s.open ? 100 : started ? Math.round(((T - s.a) / Math.max(1, s.b - s.a)) * 100) : 0
            const live = started && (T < s.b || !!s.open)
            return (
              <div key={i}>
                {w > 50 && (
                  <span className="qn-t qn-t--s" style={{ position: 'absolute', left: x, top: s.lane * LANE_H, color: live ? 'var(--qs-ink)' : started ? 'var(--qs-ink2)' : 'var(--qs-ink3)' }}>
                    {s.lab}
                  </span>
                )}
                <div
                  data-tip={s.lab}
                  data-tip-desc={`${dur(s.b - s.a)}${s.open ? ' so far' : ''}`}
                  style={{ position: 'absolute', left: x, top: s.lane * LANE_H + 15, width: Math.max(2, w - 2), height: 10, boxSizing: 'border-box', border: `1px solid ${started ? 'var(--qs-ink)' : 'var(--qs-ink4)'}` }}
                >
                  <div style={{ width: `${s.open ? 0 : p}%`, height: '100%', background: 'var(--qs-ink)' }} />
                </div>
              </div>
            )
          })}
          {note && (
            <span className="qn-t qn-t--note" style={{ position: 'absolute', left: 0, top: d.win ? LANE_H + 14 : 14 }}>
              {note}
            </span>
          )}
          {d.polls.map((pt, i) => (
            <span key={i} style={{ position: 'absolute', left: X(pt), top: 140, width: 1, height: 10, background: pt <= T ? 'var(--qs-ink)' : 'var(--qs-ink4)' }} />
          ))}
          {d.win && (
            <div style={{ position: 'absolute', left: (t / L) * PLOT_W, top: 0, height: 162, width: 1, background: 'var(--qs-ink)', pointerEvents: 'none' }}>
              <span className="qn-pill" style={{ position: 'absolute', left: 0, top: -21, transform: 'translateX(-50%)' }}>
                {L < 1 ? t.toFixed(2) : t.toFixed(1)} s
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- G tabs with a sliding underline

const TAB_W = 130

function Tabs({ ctx }: { ctx: HudCtx }) {
  const { list, cur } = stepsOf(ctx)
  return (
    <div className="qn" role="tablist" style={{ display: 'flex' }}>
      {list.map((s) => (
        <button key={s.i} role="tab" aria-selected={s.cur} className="qn-btn" {...stepBtn(ctx, s)} style={{ width: TAB_W, display: 'flex', flexDirection: 'column', gap: 7, paddingBottom: 11 }}>
          <span className="qn-t qn-t--l qn-fade" style={{ color: s.cur ? 'var(--qs-ink)' : s.reached ? 'var(--qs-ink2)' : 'var(--qs-ink3)', fontWeight: s.cur ? 500 : 400 }}>
            {s.title}
          </span>
          <span className="qn-v qn-cut" style={{ color: 'var(--qs-ink3)', maxWidth: TAB_W - 8 }}>{s.value}</span>
        </button>
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'var(--qs-ink4)' }} />
      <div className="qn-slide" style={{ position: 'absolute', bottom: 0, height: 2, left: cur * TAB_W, width: TAB_W - 20, background: 'var(--qs-ink)' }} />
    </div>
  )
}

// ---------------------------------------------------------------- H segmented progress

function Segmented({ ctx }: { ctx: HudCtx }) {
  const { list } = stepsOf(ctx)
  const running = isRunning(ctx)
  const tl = tilesOf(ctx)
  const live = running ? 2 : clamp(ctx.steps.live, 0, list.length - 1)
  return (
    <div className="qn" style={{ display: 'flex', gap: 6, width: 600 }}>
      {list.map((s) => {
        const frac = s.i < live ? 1 : s.i === live ? (running ? tl.done / tl.total : s.done ? 1 : 0) : 0
        const sub = s.i < live ? 'done' : s.i === live ? (running ? `${Math.round(frac * 100)}% · ${tl.done} of ${tl.total} tiles` : s.done ? 'done' : '—') : '—'
        const lit = s.i <= live && (s.done || running)
        return (
          <button key={s.i} className="qn-btn" {...stepBtn(ctx, s)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Name s={s} cls="qn-t qn-fade" color={lit ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
            <span style={{ position: 'relative', display: 'block', width: '100%', height: 4, background: 'var(--qs-ink4)' }}>
              <span className="qn-grow" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${frac * 100}%`, background: 'var(--qs-ink)' }} />
            </span>
            <span className="qn-v qn-cut" style={{ color: 'var(--qs-ink3)', maxWidth: '100%' }}>{sub}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- I breadcrumb with values

// Reads as one sentence, so it drops the step numbers, the file extension and the dots inside values to
// stay within 640 px.
const crumbValue = (s: Step) => (s.i === 0 ? s.value.replace(/\.[a-z0-9]+$/i, '') : s.value.replace(' · ', ' '))

function Breadcrumb({ ctx }: { ctx: HudCtx }) {
  const { list } = stepsOf(ctx)
  return (
    <div className="qn" style={{ display: 'flex', alignItems: 'center', gap: 3, maxWidth: 640 }}>
      {list.map((s) => (
        <span key={s.i} style={{ display: 'contents' }}>
          <button className={'qn-btn qn-crumb qn-fade' + (s.cur ? ' is-cur' : '')} {...stepBtn(ctx, s)}>
            <span className="qn-t qn-t--s" style={{ color: s.reached ? 'var(--qs-ink)' : 'var(--qs-ink3)' }}>{s.title}</span>
            <span className="qn-v qn-cut" style={{ color: 'var(--qs-ink3)', maxWidth: s.i === 0 ? 84 : 104 }}>{crumbValue(s)}</span>
          </button>
          {s.i < list.length - 1 && <span className="qn-v qn-v--l" style={{ color: 'var(--qs-ink4)' }}>/</span>}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- J ruler index

const J_GAP = 77
const J_W = 290

function Ruler({ ctx }: { ctx: HudCtx }) {
  const { list, cur } = stepsOf(ctx)
  const [open, setOpen] = useFollow(cur)
  const o = list[open] ?? list[0]
  const rows = Math.max(1, ...list.map((s) => s.params.length))
  // the scale ends just past the last step, as drawn; the last step's settings hang below it
  const R = (list.length - 1) * J_GAP + 12
  const H = (list.length - 1) * J_GAP + 16 + rows * 18
  return (
    <div className="qn" style={{ width: J_W, height: H }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1, height: R - 1, background: 'var(--qs-ink4)' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 7, height: R, background: 'repeating-linear-gradient(180deg, var(--qs-ink4) 0 1px, transparent 1px 11px)' }} />
      {list.map((s) => {
        const on = s.i === open
        return (
          <button
            key={s.i}
            className="qn-btn"
            {...stepBtn(ctx, s, () => setOpen(s.i))}
            aria-disabled={undefined}
            style={{ position: 'absolute', left: 0, top: s.i * J_GAP, marginTop: -5, display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <span className="qn-tick" style={{ width: on ? 30 : 14, height: 1, background: on ? 'var(--qs-ink)' : 'var(--qs-ink3)' }} />
            <Name s={s} cls="qn-t qn-fade" color={on ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
          </button>
        )
      })}
      {o && <Rows params={o.params} style={{ position: 'absolute', left: 44, top: o.i * J_GAP + 16, width: J_W - 54 }} />}
    </div>
  )
}

// ---------------------------------------------------------------- K expanding index

function Expanding({ ctx }: { ctx: HudCtx }) {
  const { list, cur } = stepsOf(ctx)
  const [open, setOpen] = useFollow(cur)
  return (
    <div className="qn" style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {list.map((s) => {
        const on = s.i === open
        return (
          <div key={s.i} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button className="qn-btn" {...stepBtn(ctx, s, () => setOpen(s.i))} aria-disabled={undefined} aria-expanded={on} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Name s={s} cls="qn-t qn-fade" color={s.reached || on ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
              <span className="qn-v qn-v--l" style={{ color: 'var(--qs-ink3)' }}>{on ? '−' : '+'}</span>
            </button>
            {on && <Rows params={s.params} style={{ paddingLeft: 16, borderLeft: '1px solid var(--qs-ink)' }} />}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- families

const TIMELINE: HudModule[] = [
  {
    family: 'timeline',
    id: 'v1',
    label: 'run timeline',
    desc: 'Steps as time ranges, for reviewing a finished run. Not to scale.',
    slot: 'bottom',
    render: (ctx) => <RunTimeline ctx={ctx} />,
  },
  {
    family: 'timeline',
    id: 'v2',
    label: 'with tiles',
    desc: 'Local work, the three Atlas slots and the 2 s polls, to scale. Drag to scrub.',
    slot: 'bottom',
    interactive: true,
    render: (ctx) => <RunTiles ctx={ctx} />,
  },
]

const BARS: HudModule[] = [
  {
    family: 'bars',
    id: 'v1',
    label: 'tabs',
    desc: 'Values sit under each tab, so the bar is also a summary. The underline moves in 350 ms.',
    slot: 'top',
    interactive: true,
    render: (ctx) => <Tabs ctx={ctx} />,
  },
  {
    family: 'bars',
    id: 'v2',
    label: 'segmented progress',
    desc: 'The live step fills with its own progress, here tiles returned.',
    slot: 'bottom',
    interactive: true,
    render: (ctx) => <Segmented ctx={ctx} />,
  },
  {
    family: 'bars',
    id: 'v3',
    label: 'breadcrumb',
    desc: 'Reads as one sentence about the run. The current step is outlined in ink.',
    slot: 'top',
    interactive: true,
    render: (ctx) => <Breadcrumb ctx={ctx} />,
  },
]

const INDEXES: HudModule[] = [
  {
    family: 'indexes',
    id: 'v1',
    label: 'ruler index',
    desc: 'Steps as long ticks on a scale. The live step lists its settings.',
    slot: 'left',
    interactive: true,
    render: (ctx) => <Ruler ctx={ctx} />,
  },
  {
    family: 'indexes',
    id: 'v2',
    label: 'expanding index',
    desc: 'One step open at a time; a line, not a box, holds its settings.',
    slot: 'right',
    interactive: true,
    render: (ctx) => <Expanding ctx={ctx} />,
  },
]

export const NAV_FAMILIES: FamilyDef[] = [
  { id: 'timeline', title: 'Run timeline', desc: 'The last run, step by step and tile by tile', modules: TIMELINE },
  { id: 'bars', title: 'Bars', desc: 'Tabs, progress and a breadcrumb through the steps', modules: BARS },
  { id: 'indexes', title: 'Indexes', desc: 'Step indexes that open onto their settings', modules: INDEXES },
]
