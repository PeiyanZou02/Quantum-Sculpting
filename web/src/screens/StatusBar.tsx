// Bottom: task status. The current run's progress, and the Atlas jobs panel (after Peiyan's).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { api, type AtlasJobRow } from '../api'
import { Segmented } from '../qs/Segmented'
import { QPill } from '../qs/QPill'
import { Dot, Spinner } from './parts'

type Filter = 'all' | 'active' | 'completed' | 'failed'
const DONE = new Set(['completed', 'succeeded', 'done'])
const FAILED = new Set(['failed', 'error', 'cancelled', 'canceled'])

export function StatusBar() {
  const key = useStore((s) => s.key)
  const job = useStore((s) => s.job)
  const log = useStore((s) => s.log)
  const busy = useStore((s) => s.busy)
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState<AtlasJobRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const running = job?.status === 'running'

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

  // every 3 s during a run, 30 s otherwise; nothing while collapsed or hidden
  useEffect(() => {
    if (!open || !key?.set) return
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), running ? 3000 : 30000)
    return () => clearInterval(t)
  }, [open, key?.set, running]) // eslint-disable-line react-hooks/exhaustive-deps

  const day = useMemo(() => jobs.filter((j) => Date.now() - Date.parse(j.created_at) < 864e5).length, [jobs])
  const shown = jobs.filter((j) => filter === 'all' || (filter === 'completed' ? DONE.has(j.status) : filter === 'failed' ? FAILED.has(j.status) : !DONE.has(j.status) && !FAILED.has(j.status)))
  const last = log[log.length - 1]
  const anyBusy = Object.values(busy).some(Boolean)

  return (
    <section className="status">
      <div className="status__bar">
        <QPill kind="ghost" size="s" label={`Atlas jobs ${open ? '▾' : '▸'}`} onClick={() => setOpen(!open)} />
        <span style={{ color: 'var(--qs-ink3)' }}>
          {!key?.set ? 'no API key' : jobs.length ? `${day} in the last 24 h` : open ? (loading ? 'loading…' : '') : 'open to list your account’s jobs'}
        </span>
        {running && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 260 }}>
            <Dot live blink />
            <span style={{ color: 'var(--qs-ink)' }}>{job.run} · {job.tiles_done} of {job.tiles_total} tiles · {job.atlas_status}</span>
            <span className="bar" style={{ width: 120 }}><span style={{ width: `${(job.tiles_done / Math.max(1, job.tiles_total)) * 100}%` }} /></span>
          </span>
        )}
        {job?.status === 'failed' && <span style={{ color: 'var(--qs-ink)' }}>! {job.run} failed · {job.error}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {anyBusy && <Spinner />}
          {last && <span style={{ color: last.level === 'info' ? 'var(--qs-ink2)' : 'var(--qs-ink)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last.level !== 'info' ? '! ' : ''}{last.text}</span>}
        </span>
      </div>
      {open && (
        <div className="status__body">
          <div className="status__tools">
            <Segmented<Filter> size="s" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' },
            ]} />
            <span style={{ flex: 1 }} />
            {err && <span className="qs-mono" style={{ color: 'var(--qs-ink)' }}>! {err}</span>}
            <QPill kind="hair" size="s" label={loading ? 'Refreshing' : 'Refresh'} loading={loading} onClick={() => load()} />
          </div>
          <div className="status__table">
            {!key?.set ? (
              <p className="qs-help" style={{ paddingTop: 8 }}>Set an Atlas API key (top right) to list the jobs in your account.</p>
            ) : (
              <>
                <div className="jobrow jobrow--head"><span>#</span><span>Submitted</span><span>Engine</span><span>Job</span><span>From</span><span style={{ textAlign: 'right' }}>Status</span></div>
                {shown.map((j, i) => (
                  <div key={j.job_id} className="jobrow">
                    <span style={{ color: 'var(--qs-ink3)' }}>{i + 1}</span>
                    <span>{fmtTime(j.created_at)}</span>
                    <span style={{ color: 'var(--qs-ink2)' }}>{j.engine}</span>
                    <span style={{ color: 'var(--qs-ink2)' }} title={j.job_id}>{j.job_id}</span>
                    <span>{j.local ? `${j.local.run} · tile ${j.local.tile.join(',')}` : <span style={{ color: 'var(--qs-ink3)' }}>personal account</span>}</span>
                    <span style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, color: FAILED.has(j.status) ? 'var(--qs-ink)' : DONE.has(j.status) ? 'var(--qs-ink2)' : 'var(--qs-ink)' }}>
                      {!DONE.has(j.status) && !FAILED.has(j.status) && <Dot live blink />}
                      {FAILED.has(j.status) ? `! ${j.status}` : j.status}
                    </span>
                  </div>
                ))}
                {shown.length === 0 && !loading && <p className="qs-help" style={{ paddingTop: 10 }}>No jobs{filter !== 'all' ? ` ${filter}` : ''}.</p>}
                {cursor && <div style={{ paddingTop: 10 }}><QPill kind="hair" size="s" label="Load more" onClick={() => load(true)} /></div>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function fmtTime(s: string) {
  if (!s) return '—'
  const d = new Date(s)
  const today = new Date().toDateString() === d.toDateString()
  return today ? d.toTimeString().slice(0, 5) : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${d.toTimeString().slice(0, 5)}`
}
