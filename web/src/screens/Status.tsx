// The status line on the drawer's row: what is running now and how far along (a bar under it: a share
// when the work reports one, Atlas tiles or Evolve turns; a moving band when it does not), how long it
// has taken, or what the workspace is waiting for; then the latest line of the runtime log.
import { useState } from 'react'
import { useStore } from '../store'
import { usePresent } from '../present'
import { useNow } from '../useNow'
import { passLength } from './animator'
import { Spinner } from './parts'

type Act = { id: string; t: string; busy: boolean; tone: 'busy' | 'wait' | 'idle'; share?: number | null }

function activity(s: ReturnType<typeof useStore.getState>, p: ReturnType<typeof usePresent.getState>, now: number): Act {
  const { busy, job, q, evolve: ev, auto, stale, model, grid, proc, report } = s
  const evolve = q.mode === 'nations'
  if (p.recording) return { id: 'rec', t: 'Recording the view', busy: true, tone: 'busy' }
  if (busy.model) return { id: 'model', t: 'Opening the model', busy: true, tone: 'busy' }
  if (busy.vox) return { id: 'vox', t: `Voxelising ${s.vox.n}³`, busy: true, tone: 'busy' }
  if (job?.status === 'running') return { id: 'atlas', t: `Running on Atlas · tile ${job.tiles_done} of ${job.tiles_total}`, busy: true, tone: 'busy', share: job.tiles_total ? job.tiles_done / job.tiles_total : null }
  if (busy.proc || busy.evolve) return { id: 'proc', t: evolve ? `Evolving ${q.k} nations over ${q.turns} turns` : `Running the ${q.mode === 'emulator' ? 'emulation' : q.mode === 'gaussian' ? 'Gaussian blur' : 'quantum step'}`, busy: true, tone: 'busy' }
  if (ev.loading) return { id: 'turns', t: 'Loading the Evolve turns', busy: true, tone: 'busy' }
  if (busy.mesh) return { id: 'mesh', t: `Building the mesh at level ${s.m.level.toFixed(2)}`, busy: true, tone: 'busy' }
  if (busy.export) return { id: 'export', t: 'Exporting the STL', busy: true, tone: 'busy' }
  if (ev.playing) return { id: 'play', t: `Playing turn ${ev.turn} of ${ev.turns}`, busy: true, tone: 'busy', share: ev.turns ? ev.turn / ev.turns : null }
  if (p.playing) {
    const len = passLength(p.tracks, p.stageReel, p.cycles), t = (now - p.playFrom) / 1000
    return { id: 'anim', t: `Animation playing${len ? ` · ${(t % len).toFixed(0)} of ${len.toFixed(0)} s` : ''}`, busy: true, tone: 'busy', share: len ? (t % len) / len : null }
  }
  if (!model) return { id: 'w0', t: 'Waiting · start from a shape or import a model', busy: false, tone: 'wait' }
  if (!grid) return { id: 'w1', t: auto ? 'Waiting for the grid' : 'Waiting · voxelise the model', busy: false, tone: 'wait' }
  if (stale.vox) return { id: 'w2', t: 'Waiting · settings changed: voxelise again', busy: false, tone: 'wait' }
  if (!proc) return { id: 'w3', t: q.mode === 'atlas' ? 'Waiting · run on Atlas' : `Waiting · run ${evolve ? 'Evolve' : 'the quantum step'}`, busy: false, tone: 'wait' }
  if (stale.proc) return { id: 'w4', t: `Waiting · settings changed: run ${evolve ? 'Evolve' : 'the quantum step'} again`, busy: false, tone: 'wait' }
  if (!report) return { id: 'w5', t: 'Waiting · build the mesh', busy: false, tone: 'wait' }
  if (stale.mesh) return { id: 'w6', t: 'Waiting · settings changed: build the mesh again', busy: false, tone: 'wait' }
  return { id: 'ready', t: 'Ready', busy: false, tone: 'idle' }
}

export function Status() {
  const s = useStore()
  const p = usePresent()
  const ticking = Object.values(s.busy).some(Boolean) || s.job?.status === 'running' || s.evolve.playing || s.evolve.loading || p.playing || p.recording
  const now = useNow(ticking, 250)
  const a = activity(s, p, now)
  // when this activity began, for the time it has taken
  const [since, setSince] = useState({ id: a.id, t: now })
  if (since.id !== a.id) setSince({ id: a.id, t: now })
  const secs = a.busy && a.id !== 'play' && a.id !== 'anim' ? Math.max(0, (now - since.t) / 1000) : null
  const last = [...s.log].reverse().find((l) => l.level !== 'net')
  return (
    <div className={'sl sl--' + a.tone} role="status" aria-live="polite">
      <span className="sl__mark">{a.busy ? <Spinner /> : <span className={'sl__dot sl__dot--' + a.tone} />}</span>
      <span className="sl__t">
        {a.t}
        {a.share != null && <em> · {Math.round(a.share * 100)} %</em>}
        {secs != null && secs >= 0.5 && <em> · {secs.toFixed(secs < 10 ? 1 : 0)} s</em>}
      </span>
      {last && <span className={'sl__log' + (last.level !== 'info' ? ' sl__log--warn' : '')} data-tip="Latest in the runtime log" data-tip-desc={last.text}>{last.text}</span>}
      {a.busy && <span className={'sl__bar' + (a.share == null ? ' sl__bar--ind' : '')}><span style={a.share != null ? { width: `${a.share * 100}%` } : undefined} /></span>}
    </div>
  )
}
