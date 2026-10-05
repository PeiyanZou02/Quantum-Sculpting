// EVOLVE LOG: the runtime of an Evolve history, in the bottom drawer. One line per turn up to the
// turn on screen, so it streams as the turns play: what was asked, the tally of actions, and what
// happened (wars, breaches, annexations, splits, exile, alliances, deaths). Click a line to go there.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { NationAction, NationTurn } from '../api'
import { Nat, Say } from './EvolvePanel'
import type { Theme } from '../view/nations'
import { Spinner } from './parts'
import './evolve.css'

const TALLY: [NationAction, string][] = [
  ['attack', 'attack'], ['fortify', 'wall'], ['grow', 'grow'], ['flee', 'flee'], ['split', 'split'], ['wither', 'wither'], ['waver', 'no split'],
]

function tally(rec: NationTurn) {
  const n: Partial<Record<NationAction, number>> = {}
  for (const a of rec.action) if (a) n[a] = (n[a] ?? 0) + 1
  return TALLY.filter(([a]) => n[a]).map(([a, t]) => `${n[a]} ${t}`).join(' · ')
}

export function EvolveLog() {
  const ev = useStore((s) => s.evolve)
  const theme = useStore((s) => s.theme)
  const mode = useStore((s) => s.q.mode)
  const busy = useStore((s) => s.q.mode === 'nations' && !!s.busy.proc)
  const setTurn = useStore((s) => s.setTurn)
  const [eventsOnly, setEventsOnly] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const h = ev.history
  // follow the playhead
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [ev.turn, eventsOnly])

  if (!h) {
    return (
      <div className="panel evlog">
        <p className="evlog__empty">
          {busy || ev.loading ? <><Spinner /> Evolving the nations turn by turn…</>
            : mode === 'nations' ? 'No history yet. Voxelise a model; Evolve runs as soon as the grid is ready.'
            : 'The Evolve log fills when the quantum step is Evolve: one line per turn as the history plays.'}
        </p>
      </div>
    )
  }
  const rows = h.turns.slice(0, ev.turn + 1).filter((r) => !eventsOnly || r.turn === 0 || r.events.length > 0)
  const alive = (r: NationTurn) => r.size.filter((v) => v > 0).length
  return (
    <div className="panel evlog">
      <div className="rt-tools">
        <div className="rt-chips" role="group" aria-label="Show">
          <button className={'rt-chip' + (!eventsOnly ? ' rt-chip--on' : '')} onClick={() => setEventsOnly(false)}><span className="rt-chip__label">Every turn</span><span className="rt-chip__n">{ev.turn}</span></button>
          <button className={'rt-chip' + (eventsOnly ? ' rt-chip--on' : '')} onClick={() => setEventsOnly(true)}><span className="rt-chip__label">Events</span><span className="rt-chip__n">{h.turns.slice(1, ev.turn + 1).filter((r) => r.events.length).length}</span></button>
        </div>
        <span className="rt-tools__end evlog__state">
          {ev.playing ? 'playing' : ev.turn < ev.turns ? 'paused' : 'end of history'} · turn {ev.turn} / {ev.turns} · {alive(h.turns[Math.min(ev.turn, h.turns.length - 1)])} alive
        </span>
      </div>
      <div className="evlog__scroll" role="log" aria-label="Evolve log">
        {rows.map((r) => (
          <Line key={r.turn} r={r} k={h.k} theme={theme} on={r.turn === ev.turn} alive={alive(r)} onClick={() => setTurn(r.turn)} />
        ))}
        <div ref={end} />
      </div>
    </div>
  )
}

function Line({ r, k, theme, on, alive, onClick }: { r: NationTurn; k: number; theme: Theme; on: boolean; alive: number; onClick: () => void }) {
  const conflict = r.events.some((e) => e.type === 'war' || e.type === 'breach' || e.type === 'annex' || e.type === 'death')
  return (
    <button className={'evlog__row' + (on ? ' evlog__row--on' : '') + (conflict ? ' evlog__row--conflict' : '')} onClick={onClick}>
      <span className="evlog__t">T {String(r.turn).padStart(3, '0')}</span>
      <span className="evlog__alive">{alive} alive</span>
      <span className="evlog__msg">
        {r.turn === 0 ? <>Founded {k} nations, one qubit each.</>
          : <>
              <span className="evlog__tally">{tally(r) || 'nothing moved'}</span>
              {r.events.map((e, i) => <span key={i} className="evlog__ev"><Say e={e} theme={theme} /></span>)}
              {r.attacks.length > 0 && !r.events.length && (
                <span className="evlog__ev evlog__ev--quiet">{r.attacks.slice(0, 3).map(([a, b], i) => <span key={i}>{i > 0 && ', '}<Nat i={a} theme={theme} /> → <Nat i={b} theme={theme} /></span>)}{r.attacks.length > 3 ? ` +${r.attacks.length - 3}` : ''}</span>
              )}
            </>}
      </span>
    </button>
  )
}
