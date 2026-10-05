// Runtime log and Atlas jobs panels, plus the bottom status bar.
// Runtime: events, every request to the service with its timing, errors. Atlas: the account's jobs
// (only in Atlas mode or during a run, as in Peiyan's interface: no Atlas requests otherwise).
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useStore, type LogLine } from '../store'
import { api, type AtlasJobRow } from '../api'
import { QPill } from '../qs/QPill'
import { ScrollArea } from '../qs/ScrollArea'
import { IconButton } from '../qs/Icon'
import { Dot, Spinner } from './parts'
import './terminal.css'

type Filter = 'all' | 'events' | 'net' | 'errors'
type JobFilter = 'all' | 'active' | 'completed' | 'failed'
const DONE = new Set(['completed', 'succeeded', 'success', 'done'])
const FAILED = new Set(['failed', 'error', 'cancelled', 'canceled'])
const CANCELLED = new Set(['cancelled', 'canceled'])

/** Bottom status bar (after Blender's): busy state, the current Atlas run, the last event. */
export function StatusBar() {
  const job = useStore((s) => s.job)
  const log = useStore((s) => s.log)
  const busy = useStore((s) => s.busy)
  const running = job?.status === 'running'
  const last = [...log].reverse().find((l) => l.level !== 'net')
  const anyBusy = Object.values(busy).some(Boolean)
  return (
    <footer className="statusbar">
      {running && (
        <span className="term__run">
          <Dot live blink />
          <span>{job.run} · {job.kind === 'qrng' ? 'random numbers' : `${job.tiles_done}/${job.tiles_total} tiles`} · {job.atlas_status}</span>
          <span className="bar" style={{ width: 120 }}><span style={{ width: `${(job.tiles_done / Math.max(1, job.tiles_total)) * 100}%` }} /></span>
        </span>
      )}
      <span className="term__last" style={{ marginLeft: running ? undefined : 0 }}>
        {anyBusy && <Spinner />}
        {last && <span style={{ color: last.level === 'info' ? 'var(--qs-ink2)' : 'var(--qs-ink)' }}>{last.level !== 'info' ? '! ' : ''}{last.text}</span>}
      </span>
      <span className="statusbar__right">{log.filter((l) => l.level === 'error').length ? `${log.filter((l) => l.level === 'error').length} errors in the log` : ''}</span>
    </footer>
  )
}

export function RuntimePanel() {
  const log = useStore((s) => s.log)
  return <div className="panel"><Runtime log={log} /></div>
}

/** Atlas jobs. As in Peiyan's interface, nothing is asked of Atlas unless Atlas mode is on or a run is going. */
export function AtlasPanel() {
  const job = useStore((s) => s.job)
  const mode = useStore((s) => s.q.mode)
  const running = job?.status === 'running'
  if (mode !== 'atlas' && !running) {
    return (
      <div className="panel">
        <div className="aj-empty aj-empty--panel">
          <p>The Atlas jobs list appears in Atlas mode (Quantum step) or while a run is going. In local modes the app makes no requests to Atlas.</p>
        </div>
      </div>
    )
  }
  return <div className="panel"><AtlasJobs running={running} /></div>
}

/* ───────────────────────── shared bits ───────────────────────── */

/** Hairline glyphs this panel needs that the shared icon set lacks (same 16 × 16, 1px language). */
const GLYPH = {
  copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  check: 'M3 8.5 6.5 12 13 4.5',
  search: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9M10.3 10.3l4.2 4.2',
  refresh: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.6h-2.6',
}

function Glyph({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={{ display: 'block', flex: 'none' }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Same look as IconButton (qs-ib), for the glyphs above. */
function GlyphButton({ d, tip, desc, onClick, disabled, spin, size = 26 }: {
  d: string; tip: string; desc?: string; onClick: () => void; disabled?: boolean; spin?: boolean; size?: number
}) {
  return (
    <button type="button" className={'qs-ib' + (spin ? ' rt-spin' : '')} style={{ width: size, height: size }} aria-label={tip}
      data-tip={tip} data-tip-desc={desc} data-tip-side="bottom" onClick={onClick} disabled={disabled}>
      <Glyph d={d} />
    </button>
  )
}

/** Filter chips: pill per option with a count; the selected one takes the sel fill and an ink edge. */
function Chips<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; count: number }[]; label: string
}) {
  return (
    <div className="rt-chips" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on}
            className={'rt-chip' + (on ? ' rt-chip--on' : '') + (o.count === 0 ? ' rt-chip--zero' : '')}
            onClick={() => onChange(o.value)}>
            <span className="rt-chip__label">{o.label}</span>
            <span className="rt-chip__n">{o.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function useCopied(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = useCallback((key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(null), 1400)
    }, () => {})
  }, [])
  return [copied, copy]
}

/* ───────────────────────── Runtime ───────────────────────── */

interface Net { method: string; path: string; status: string; ms: number }
interface Row { line: LogLine; n: number; net: Net | null; key: string }

const NET_RE = /^([A-Z]+)\s+(\S+)\s{2,}(\S+)\s{2,}(\d+(?:\.\d+)?)\s*ms\s*$/
function parseNet(text: string): Net | null {
  const m = NET_RE.exec(text)
  return m ? { method: m[1], path: m[2], status: m[3], ms: Number(m[4]) } : null
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const hms = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const msOf = (t: number) => pad(new Date(t).getMilliseconds(), 3)
const LEVEL: Record<NonNullable<LogLine['level']>, string> = { info: 'info', net: 'net', warn: 'warn', error: 'error' }
const lvl = (l: LogLine) => l.level ?? 'info'

function matches(l: LogLine, f: Filter) {
  const v = lvl(l)
  return f === 'all' ? true : f === 'net' ? v === 'net' : f === 'errors' ? v === 'error' || v === 'warn' : v !== 'net'
}

function statusKind(s: string): 'ok' | 'bad' | 'cancel' | 'other' {
  if (s === 'cancelled' || s === 'canceled') return 'cancel'
  if (s === 'failed') return 'bad'
  const n = Number(s)
  if (!Number.isFinite(n)) return 'other'
  return n >= 400 ? 'bad' : n >= 200 && n < 400 ? 'ok' : 'other'
}

function fmtMs(ms: number) {
  if (ms < 1000) return { n: String(Math.round(ms)), u: 'ms' }
  return { n: (ms / 1000).toFixed(ms < 10000 ? 2 : 1), u: 's' }
}
/** 1 ms → 0, 30 s → 1 on a log scale, so slow calls stand out without the fast ones vanishing. */
const barFrac = (ms: number) => Math.max(0.04, Math.min(1, Math.log10(Math.max(1, ms)) / Math.log10(30000)))

export function Runtime({ log }: { log: LogLine[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const [atBottom, setAtBottom] = useState(true)
  const [seenT, setSeenT] = useState(0)
  const [copied, copy] = useCopied()
  const wrap = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const searched = useMemo(() => (q ? log.filter((l) => l.text.toLowerCase().includes(q)) : log), [log, q])
  const counts = useMemo(() => {
    const c = { all: searched.length, events: 0, net: 0, errors: 0 }
    for (const l of searched) {
      const v = lvl(l)
      if (v === 'net') c.net++; else c.events++
      if (v === 'error' || v === 'warn') c.errors++
    }
    return c
  }, [searched])
  const lines = useMemo(() => searched.filter((l) => matches(l, filter)), [searched, filter])

  // runs of identical consecutive request lines collapse into one row with a count
  const rows = useMemo(() => {
    const out: Row[] = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const prev = out[out.length - 1]
      if (prev && lvl(l) === 'net' && lvl(prev.line) === 'net' && prev.line.text === l.text) {
        prev.n++
        prev.line = l
        continue
      }
      out.push({ line: l, n: 1, net: lvl(l) === 'net' ? parseNet(l.text) : null, key: `${l.t}-${i}` })
    }
    return out
  }, [lines])

  // track whether the reader is at the end of the log (ScrollArea keeps following only there)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const on = (e: Event) => {
      const t = e.target as HTMLElement
      if (!t.classList?.contains('qs-scroll__box')) return
      setAtBottom(t.scrollTop + t.clientHeight >= t.scrollHeight - 8)
    }
    el.addEventListener('scroll', on, true)
    return () => el.removeEventListener('scroll', on, true)
  }, [])

  const live = follow && atBottom
  // a resize (docking, dragging the drawer) keeps the end of the log in view while following
  const liveRef = useRef(live)
  useEffect(() => { liveRef.current = live }, [live])
  useEffect(() => {
    const b = wrap.current?.querySelector<HTMLElement>('.qs-scroll__box')
    if (!b) return
    const ro = new ResizeObserver(() => { if (liveRef.current) b.scrollTop = b.scrollHeight })
    ro.observe(b)
    return () => ro.disconnect()
  }, [])
  const lastT = log.length ? log[log.length - 1].t : 0
  // while following, everything shown counts as seen
  if (live && seenT !== lastT) setSeenT(lastT)
  const fresh = live ? 0 : lines.reduce((n, l) => n + (l.t > seenT ? 1 : 0), 0)

  const box = () => wrap.current?.querySelector<HTMLElement>('.qs-scroll__box') ?? null
  const jump = () => {
    setFollow(true)
    const b = box()
    if (b) b.scrollTop = b.scrollHeight
    setAtBottom(true)
  }
  const toggleFollow = () => {
    if (follow) { setFollow(false); return }
    jump()
  }
  const clear = () => { useStore.setState({ log: [] }); setSeenT(0) }
  const copyLog = () => copy('log', lines.map((l) => `${hms(l.t)}.${msOf(l.t)}  ${LEVEL[lvl(l)].padEnd(5)}  ${l.text}`).join('\n'))

  const filtered = !!q || filter !== 'all'

  return (
    <div className="rt" ref={wrap}>
      <div className="rt-tools">
        <Chips<Filter> label="Show" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'events', label: 'Events', count: counts.events },
          { value: 'net', label: 'Requests', count: counts.net },
          { value: 'errors', label: 'Errors', count: counts.errors },
        ]} />
        <div className="rt-tools__end">
          <label className={'rt-search' + (query ? ' rt-search--on' : '')}>
            <Glyph d={GLYPH.search} size={14} />
            <input type="text" value={query} placeholder="Filter lines" aria-label="Filter lines by text" spellCheck={false}
              onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }} />
            {query && (
              <button type="button" className="rt-search__x" aria-label="Clear the filter" data-tip="Clear the filter" onClick={() => setQuery('')}>
                <Glyph d="M4.5 4.5l7 7M11.5 4.5l-7 7" size={12} />
              </button>
            )}
          </label>
          <div className="rt-icons">
            <IconButton name={follow ? 'pause' : 'play'} size={26} side="bottom" on={!follow}
              title={follow ? 'Pause following' : 'Follow new lines'}
              desc={follow ? 'Keep the view where it is while lines arrive' : 'Jump to the latest line and keep up with new ones'}
              onClick={toggleFollow} />
            <GlyphButton d={copied === 'log' ? GLYPH.check : GLYPH.copy} tip={copied === 'log' ? 'Copied' : 'Copy log'}
              desc={copied === 'log' ? undefined : filtered ? `The ${lines.length} visible lines, as text` : 'Every line, as text'}
              onClick={copyLog} disabled={!lines.length} />
            <IconButton name="clear" size={26} side="bottom" title="Clear the log" onClick={clear} disabled={!log.length} />
          </div>
        </div>
      </div>

      <ScrollArea follow={follow} className="rt-scroll">
        <div className="rt-log" role="log" aria-live="off">
          {rows.length > 0 && (
            <div className="rt-row rt-row--head" aria-hidden>
              <span className="rt-t">Time</span>
              <span className="rt-lv">Level</span>
              <span className="rt-msg">Message</span>
              <span className="rt-st">Status</span>
              <span className="rt-dur">Duration</span>
            </div>
          )}
          {rows.map((r) => <LogRow key={r.key} row={r} />)}
          {rows.length === 0 && (
            <div className="rt-empty">
              {log.length === 0 ? (
                <>
                  <p className="rt-empty__title">Waiting for events</p>
                  <p>Requests to the service, their timings and any errors appear here as you work. Load a model to get started.</p>
                </>
              ) : (
                <>
                  <p className="rt-empty__title">Nothing matches</p>
                  <p>{q ? <>No {filter === 'all' ? '' : filterName(filter) + ' '}lines contain “{query.trim()}”.</> : <>No {filterName(filter)} in the log.</>}</p>
                  <QPill kind="hair" size="s" label="Show everything" onClick={() => { setQuery(''); setFilter('all') }} />
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {!live && (
        <div className="rt-foot">
          <span className="rt-foot__note">{follow ? 'Scrolled back' : 'Following paused'}</span>
          <button type="button" className={'rt-jump' + (fresh ? ' rt-jump--new' : '')} onClick={jump}>
            {fresh > 0 && <><span className="rt-jump__n">{fresh}</span><span>new</span><span className="rt-jump__sep">·</span></>}
            <span>jump to latest</span>
            <Glyph d="M8 3.5v9M4.5 9 8 12.5 11.5 9" size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

const filterName = (f: Filter) => (f === 'net' ? 'requests' : f === 'errors' ? 'errors or warnings' : f === 'events' ? 'events' : 'lines')

function LogRow({ row }: { row: Row }) {
  const { line, n, net } = row
  const v = lvl(line)
  const time = (
    <span className="rt-t" data-tip={new Date(line.t).toLocaleString()}>
      {hms(line.t)}<span className="rt-t__ms">.{msOf(line.t)}</span>
    </span>
  )
  const badge = <span className={`rt-lv`}><span className={`rt-badge rt-badge--${v}`}>{LEVEL[v]}</span></span>
  const count = n > 1 && <span className="rt-times" data-tip={`${n} identical requests in a row`}>×{n}</span>

  if (net) {
    const sk = statusKind(net.status)
    const d = fmtMs(net.ms)
    const slow = net.ms >= 1000
    return (
      <div className={`rt-row rt-row--net${slow ? ' rt-row--slow' : ''}`}>
        {time}
        {badge}
        <span className="rt-msg rt-req">
          <span className="rt-method">{net.method}</span>
          <span className="rt-path">{net.path}</span>
          {count}
        </span>
        <span className="rt-st"><span className={`rt-status rt-status--${sk}`}>{net.status}</span></span>
        <span className="rt-dur">
          <span className="rt-dur__n">{d.n}<span className="rt-dur__u"> {d.u}</span></span>
          <span className="rt-bar" aria-hidden><span style={{ width: `${barFrac(net.ms) * 100}%` }} /></span>
        </span>
      </div>
    )
  }
  return (
    <div className={`rt-row rt-row--plain rt-row--${v}`}>
      {time}
      {badge}
      <span className="rt-msg">{line.text}{count}</span>
    </div>
  )
}

/* ───────────────────────── Atlas jobs ───────────────────────── */

const jobKind = (s: string): Exclude<JobFilter, 'all'> => (DONE.has(s) ? 'completed' : FAILED.has(s) ? 'failed' : 'active')

export function AtlasJobs({ running }: { running: boolean }) {
  const key = useStore((s) => s.key)
  const [jobs, setJobs] = useState<AtlasJobRow[]>([])
  const [jobsAt, setJobsAt] = useState(0)   // when the list last arrived, for "last 24 h"
  const [cursor, setCursor] = useState<string | null>(null)
  const [filter, setFilter] = useState<JobFilter>('all')
  const [err, setErr] = useState<string | null>(null)
  // pending while a request is out (an async transition), so a poll from the effect sets no state itself
  const [loading, startLoad] = useTransition()
  const [loaded, setLoaded] = useState(false)
  const [copied, copy] = useCopied()

  const load = useCallback((more = false) => {
    if (!key?.set) return
    startLoad(async () => {
      try {
        const res = await api.atlasJobs(50, more ? cursor ?? undefined : undefined)
        setJobs((j) => (more ? [...j, ...res.jobs] : res.jobs))
        setJobsAt(Date.now())
        setCursor(res.next_cursor)
        setErr(null)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoaded(true)
      }
    })
  }, [key?.set, cursor])

  // every 3 s during a run, 30 s otherwise, nothing while the tab is hidden
  // the latest load (and its cursor) without restarting the timer each time a page arrives
  const poll = useEffectEvent(() => { load() })
  useEffect(() => {
    if (!key?.set) return
    poll()
    const t = setInterval(() => document.visibilityState === 'visible' && poll(), running ? 3000 : 30000)
    return () => clearInterval(t)
  }, [key?.set, running])

  const day = useMemo(() => jobs.filter((j) => jobsAt - Date.parse(j.created_at) < 864e5).length, [jobs, jobsAt])
  const counts = useMemo(() => {
    const c = { all: jobs.length, active: 0, completed: 0, failed: 0 }
    for (const j of jobs) c[jobKind(j.status)]++
    return c
  }, [jobs])
  const shown = filter === 'all' ? jobs : jobs.filter((j) => jobKind(j.status) === filter)

  if (!key?.set) {
    return <div className="aj-empty aj-empty--panel"><p>Set an Atlas API key (top right) to list the jobs in your account.</p></div>
  }
  return (
    <div className="aj">
      <div className="rt-tools">
        <Chips<JobFilter> label="Show" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'completed', label: 'Completed', count: counts.completed },
          { value: 'failed', label: 'Failed', count: counts.failed },
        ]} />
        <div className="rt-tools__end">
          <span className="aj-day"><span className="aj-day__n">{day}</span> in the last 24 h</span>
          <GlyphButton d={GLYPH.refresh} tip={loading ? 'Refreshing' : 'Refresh'}
            desc={running ? 'Updates every 3 s during a run' : 'Updates every 30 s'} spin={loading} onClick={() => load()} />
        </div>
      </div>
      {err && (
        <div className="aj-err" role="alert">
          <span className="rt-badge rt-badge--error">error</span>
          <span className="aj-err__msg">{err}</span>
        </div>
      )}
      <ScrollArea className="rt-scroll">
        <div className="aj-list">
          {shown.length > 0 && (
            <div className="aj-row aj-row--head" aria-hidden>
              <span className="aj-st">Status</span>
              <span className="aj-t">Submitted</span>
              <span className="aj-en">Engine</span>
              <span className="aj-id">Job</span>
              <span className="aj-src">Source</span>
            </div>
          )}
          {shown.map((j) => (
            <JobRow key={j.job_id} j={j} copied={copied === j.job_id} onCopy={() => copy(j.job_id, j.job_id)} />
          ))}
          {shown.length === 0 && (
            <div className="aj-empty">
              {!loaded || (loading && !jobs.length) ? <p>Loading jobs…</p>
                : jobs.length === 0 ? <><p className="rt-empty__title">No jobs yet</p><p>Jobs submitted with this key appear here, newest first.</p></>
                : <p>No {filter} jobs among the {jobs.length} loaded.</p>}
            </div>
          )}
          {cursor && (
            <div className="aj-more">
              <QPill kind="hair" size="s" label={loading ? 'Loading' : 'Load more'} loading={loading} onClick={() => load(true)} />
              <span className="aj-more__note"><span className="aj-day__n">{jobs.length}</span> loaded</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function JobRow({ j, copied, onCopy }: { j: AtlasJobRow; copied: boolean; onCopy: () => void }) {
  const kind = jobKind(j.status)
  const cancelled = CANCELLED.has(j.status)
  const short = j.job_id.length > 12 ? `${j.job_id.slice(0, 8)}…` : j.job_id
  let source: ReactNode = <span className="aj-src__personal">personal account</span>
  if (j.local) source = <><span className="aj-src__run">{j.local.run}</span><span className="aj-src__sep"> · </span><span>tile {j.local.tile.join(',')}</span></>
  return (
    <div className={`aj-row aj-row--${kind}`}>
      <span className="aj-st">
        <span className={`aj-status aj-status--${cancelled ? 'cancelled' : kind}`} data-tip={j.progress ? `${j.status} · ${j.progress}` : undefined}>
          {kind === 'active' && <span className="aj-status__dot" aria-hidden />}
          {j.status}
        </span>
      </span>
      <span className="aj-t" data-tip={j.created_at ? new Date(j.created_at).toLocaleString() : undefined}>{fmtTime(j.created_at)}</span>
      <span className="aj-en">{j.engine}</span>
      <span className="aj-id">
        <button type="button" className={'aj-idbtn' + (copied ? ' aj-idbtn--copied' : '')} onClick={onCopy}
          data-tip={copied ? 'Copied' : j.job_id} data-tip-desc={copied ? undefined : 'Click to copy the job id'} aria-label={`Copy job id ${j.job_id}`}>
          {copied ? 'copied' : short}
        </button>
      </span>
      <span className="aj-src">{source}</span>
    </div>
  )
}

function fmtTime(s: string) {
  if (!s) return '—'
  const d = new Date(s)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toTimeString().slice(0, 5) : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${d.toTimeString().slice(0, 5)}`
}
