// Runtime terminal: a drawer along the bottom of the workspace. Drag its top edge to resize.
// Runtime: events, every request to the service with its timing, errors. Atlas: the account's jobs
// (only in Atlas mode or during a run, as in Peiyan's interface: no Atlas requests otherwise).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore, type LogLine } from '../store'
import { api, type AtlasJobRow } from '../api'
import { Segmented } from '../qs/Segmented'
import { QPill } from '../qs/QPill'
import { ScrollArea } from '../qs/ScrollArea'
import { Dot, Spinner } from './parts'

type Tab = 'runtime' | 'atlas'
type Filter = 'all' | 'events' | 'net' | 'errors'
const DONE = new Set(['completed', 'succeeded', 'success', 'done'])
const FAILED = new Set(['failed', 'error', 'cancelled', 'canceled'])

function usePref<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init } catch { return init }
  })
  return [v, (n: T) => { setV(n); try { localStorage.setItem(key, JSON.stringify(n)) } catch { /* per-viewer */ } }]
}

export function Terminal() {
  const st = useStore()
  const { job, log, q, key, busy } = st
  const [open, setOpen] = usePref('qs-term-open', true)
  const [height, setHeight] = usePref('qs-term-h', 220)
  const [tab, setTab] = useState<Tab>('runtime')
  const running = job?.status === 'running'
  const atlasOn = q.mode === 'atlas' || running
  useEffect(() => { if (!atlasOn && tab === 'atlas') setTab('runtime') }, [atlasOn, tab])

  const startDrag = (e: React.PointerEvent) => {
    const y0 = e.clientY, h0 = open ? height : 0
    if (!open) setOpen(true)
    const move = (ev: PointerEvent) => setHeight(Math.max(120, Math.min(window.innerHeight * 0.6, h0 + (y0 - ev.clientY))))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const last = [...log].reverse().find((l) => l.level !== 'net')
  const anyBusy = Object.values(busy).some(Boolean)
  return (
    <section className="term">
      <div className="term__grip" onPointerDown={startDrag} title="Drag to resize" />
      <div className="term__bar">
        <QPill kind="ghost" size="s" label={open ? '▾' : '▸'} title={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)} />
        <Segmented<Tab> size="s" value={tab} onChange={(t) => { setTab(t); setOpen(true) }} options={[
          { value: 'runtime', label: 'Runtime' },
          { value: 'atlas', label: running ? 'Atlas · live' : 'Atlas', disabled: !atlasOn },
        ]} />
        {running && (
          <span className="term__run">
            <Dot live blink />
            <span>{job.run} · {job.tiles_done}/{job.tiles_total} tiles · {job.atlas_status}</span>
            <span className="bar" style={{ width: 120 }}><span style={{ width: `${(job.tiles_done / Math.max(1, job.tiles_total)) * 100}%` }} /></span>
          </span>
        )}
        <span className="term__last">
          {anyBusy && <Spinner />}
          {last && <span style={{ color: last.level === 'info' ? 'var(--qs-ink2)' : 'var(--qs-ink)' }}>{last.level !== 'info' ? '! ' : ''}{last.text}</span>}
        </span>
        {!key?.set && <QPill kind="ghost" size="s" dot="off" label="No Atlas key" onClick={() => st.set({ keyOpen: true })} />}
      </div>
      {open && (
        <div className="term__body" style={{ height }}>
          {tab === 'runtime' ? <Runtime log={log} /> : <AtlasJobs running={running} />}
        </div>
      )}
    </section>
  )
}

function Runtime({ log }: { log: LogLine[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const clear = () => useStore.setState({ log: [] })
  const lines = log.filter((l) =>
    filter === 'all' ? true : filter === 'net' ? l.level === 'net' : filter === 'errors' ? l.level === 'error' || l.level === 'warn' : l.level !== 'net')
  const time = (t: number) => {
    const d = new Date(t)
    return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`
  }
  return (
    <>
      <div className="term__tools">
        <Segmented<Filter> size="s" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All' }, { value: 'events', label: 'Events' }, { value: 'net', label: 'Requests' }, { value: 'errors', label: 'Errors' },
        ]} />
        <span style={{ flex: 1 }} />
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>{lines.length} lines</span>
        <QPill kind="ghost" size="s" label="Clear" onClick={clear} />
      </div>
      <ScrollArea follow className="term__scroll">
        <div className="term__log">
          {lines.length === 0 && <span className="term__line" style={{ color: 'var(--qs-ink3)' }}>—  waiting for events</span>}
          {lines.map((l, i) => (
            <div key={i} className={`term__line term__line--${l.level ?? 'info'}`}>
              <span className="term__t">{time(l.t)}</span>
              <span className="term__lv">{l.level === 'net' ? 'net' : l.level === 'error' ? 'err' : l.level === 'warn' ? 'warn' : 'info'}</span>
              <span className="term__msg">{l.text}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </>
  )
}

function AtlasJobs({ running }: { running: boolean }) {
  const key = useStore((s) => s.key)
  const [jobs, setJobs] = useState<AtlasJobRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (more = false) => {
    if (!key?.set) return
    setLoading(true)
    try {
      const res = await api.atlasJobs(50, more ? cursor ?? undefined : undefined)
      setJobs((j) => (more ? [...j, ...res.jobs] : res.jobs))
      setCursor(res.next_cursor)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [key?.set, cursor])

  // every 3 s during a run, 30 s otherwise, nothing while the tab is hidden
  useEffect(() => {
    if (!key?.set) return
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), running ? 3000 : 30000)
    return () => clearInterval(t)
  }, [key?.set, running]) // eslint-disable-line react-hooks/exhaustive-deps

  const day = useMemo(() => jobs.filter((j) => Date.now() - Date.parse(j.created_at) < 864e5).length, [jobs])
  const shown = jobs.filter((j) => filter === 'all' || (filter === 'completed' ? DONE.has(j.status) : filter === 'failed' ? FAILED.has(j.status) : !DONE.has(j.status) && !FAILED.has(j.status)))
  if (!key?.set) return <p className="qs-help" style={{ padding: 16 }}>Set an Atlas API key (top right) to list the jobs in your account.</p>
  return (
    <>
      <div className="term__tools">
        <Segmented size="s" value={filter} onChange={(v) => setFilter(v as typeof filter)} options={[
          { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' },
        ]} />
        <span style={{ flex: 1 }} />
        {err && <span className="qs-mono" style={{ color: 'var(--qs-ink)' }}>! {err}</span>}
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>{day} in the last 24 h</span>
        <QPill kind="hair" size="s" label="Refresh" loading={loading} onClick={() => load()} />
      </div>
      <ScrollArea className="term__scroll">
        <div style={{ padding: '0 16px 12px' }}>
          <div className="jobrow jobrow--head"><span>#</span><span>Submitted</span><span>Engine</span><span>Job</span><span>From</span><span style={{ textAlign: 'right' }}>Status</span></div>
          {shown.map((j, i) => (
            <div key={j.job_id} className="jobrow">
              <span style={{ color: 'var(--qs-ink3)' }}>{i + 1}</span>
              <span>{fmtTime(j.created_at)}</span>
              <span style={{ color: 'var(--qs-ink2)' }}>{j.engine}</span>
              <span style={{ color: 'var(--qs-ink2)' }} title={j.job_id}>{j.job_id}</span>
              <span>{j.local ? `${j.local.run} · tile ${j.local.tile.join(',')}` : <span style={{ color: 'var(--qs-ink3)' }}>personal account</span>}</span>
              <span style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                {!DONE.has(j.status) && !FAILED.has(j.status) && <Dot live blink />}
                {FAILED.has(j.status) ? `! ${j.status}` : j.status}
              </span>
            </div>
          ))}
          {shown.length === 0 && !loading && <p className="qs-help" style={{ paddingTop: 10 }}>No jobs.</p>}
          {cursor && <div style={{ paddingTop: 10 }}><QPill kind="hair" size="s" label="Load more" onClick={() => load(true)} /></div>}
        </div>
      </ScrollArea>
    </>
  )
}

function fmtTime(s: string) {
  if (!s) return '—'
  const d = new Date(s)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toTimeString().slice(0, 5) : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${d.toTimeString().slice(0, 5)}`
}
