// 03b: the job strip across the top of the view while an Atlas run is going.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Dot } from './parts'

export function JobStrip() {
  const job = useStore((s) => s.job)!
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [])
  // elapsed comes from the last poll; tick it forward locally between polls
  const [base] = useState(() => ({ at: Date.now(), elapsed: job.elapsed }))
  const elapsed = Math.max(job.elapsed, base.elapsed + (now - base.at) / 1000)
  const mm = Math.floor(elapsed / 60), ss = (elapsed % 60).toFixed(1).padStart(4, '0')
  const total = Math.max(1, job.tiles_total)
  const shape = job.tile_shape.join(' × ')
  const tiles = Array.from({ length: total }, (_, i) => i < job.tiles_done ? 'done' : i < job.tiles_done + 3 ? 'running' : 'queued')
  const show = tiles.length <= 12 ? tiles : null

  return (
    <div style={{ position: 'absolute', left: 472, top: 128, width: 620, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="qs-mono" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dot live blink /> Atlas · {total} tile{total > 1 ? 's' : ''} of {shape} · 3 at a time
        </span>
        <span style={{ color: 'var(--qs-ink2)' }}>{String(mm).padStart(2, '0')}:{ss} · {job.atlas_status}</span>
      </div>
      {show ? (
        <div style={{ display: 'flex', gap: 4 }}>
          {show.map((s, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                height: 4,
                background: s === 'done' ? 'var(--qs-ink)' : s === 'running' ? 'linear-gradient(90deg,var(--qs-ink) 0 30%,var(--qs-ink4) 30%)' : 'var(--qs-ink4)',
                animation: s === 'running' ? 'qs-blink 1.2s ease-in-out infinite' : undefined,
              }} />
              <span className="qs-small" style={{ color: s === 'done' ? 'var(--qs-ink)' : 'var(--qs-ink2)' }}>
                Tile {i + 1} · {s === 'done' ? (i < job.tiles_cached ? 'cached' : 'done') : s}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 4, background: `linear-gradient(90deg,var(--qs-ink) ${job.tiles_done / total * 100}%,var(--qs-ink4) 0)` }} />
          <span className="qs-small" style={{ color: 'var(--qs-ink2)' }}>{job.tiles_done} of {total} tiles · {job.tiles_cached} cached</span>
        </div>
      )}
    </div>
  )
}
