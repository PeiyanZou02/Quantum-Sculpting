// Pieces for the view made of settings and feeds: any parameter as a readout (its name, its value, where
// it sits in its range), and the Atlas jobs of the account.
import { useStore } from '../store'
import { paramOf } from './paramDefs'
import { useTween } from './tween'
import type { HudCtx } from './types'
import './params.css'

/** One setting as a readout: name and value, and a rule with the value marked on its range. */
export function Param({ id }: { id: string }) {
  const s = useStore()
  const p = paramOf(id)
  const raw = p?.get(s) ?? null
  // the value counts to where it is going (its bar eases by CSS)
  const eased = useTween(raw ?? 0, 300)
  if (!p) return null
  const v = raw == null ? null : Math.abs(eased - raw) < p.step / 2 ? raw : eased
  const lo = p.min(s), hi = p.max(s)
  const f = raw == null ? 0 : Math.min(1, Math.max(0, (raw - lo) / (hi - lo || 1)))
  return (
    <div className={'hpar' + (v == null ? ' hpar--off' : '')}>
      <div className="hpar__head"><span className="hpar__t">{p.t}</span><span className="hpar__v">{v == null ? '—' : p.fmt(v, s)}</span></div>
      <div className="hpar__rule"><span className="hpar__fill" style={{ width: `${f * 100}%` }} /><span className="hpar__mark" style={{ left: `${f * 100}%` }} /></div>
      <div className="hpar__ends"><span>{p.fmt(lo, s)}</span><span>{p.fmt(hi, s)}</span></div>
    </div>
  )
}

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  return s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`
}

/** The account's latest Atlas jobs: id, state, when. */
export function AtlasJobs({ ctx }: { ctx: HudCtx }) {
  const key = useStore((s) => s.key)
  const rows = ctx.atlasJobs.slice(0, 8)
  return (
    <div className="hpar hpar--jobs">
      <div className="hpar__head"><span className="hpar__t">Atlas jobs</span><span className="hpar__v">{rows.length ? `${ctx.atlasJobs.length} latest` : ''}</span></div>
      {!key?.set ? <p className="hpar__empty">No Atlas key on this computer.</p>
        : !rows.length ? <p className="hpar__empty">No jobs yet.</p>
        : (
          <ol className="hpar__jobs">
            {rows.map((j) => (
              <li key={j.job_id}>
                <span className="hpar__id">{j.job_id.slice(0, 8)}</span>
                <span className={'hpar__st hpar__st--' + (/done|complete|succ/i.test(j.status) ? 'ok' : /fail|error|cancel/i.test(j.status) ? 'bad' : 'run')}>{j.status.toLowerCase()}</span>
                <span className="hpar__when">{ago(j.updated_at || j.created_at)}</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  )
}
