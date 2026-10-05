// EVOLVE: Peiyan's "nations" mode (app/nations.py). The model is split into regions; each is a nation
// and one qubit, the voxels its territory. Every turn each nation is asked one question (attack,
// defend or explore) and all are measured together; yes and no each leave their own mark on the shape.
// This panel follows the turn on screen: the turn player, each nation's question, odds and answer,
// the relationship graph, and the chronicle of the whole history.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useStore, TURNS_PER_SECOND, type Morph } from '../store'
import type { NationAction, NationAsk, NationEvent, NationsHistory, NationTurn } from '../api'
import { Panel } from '../ui/Panel'
import { Slider } from '../qs/Slider'
import { Icon } from '../qs/Icon'
import { Spinner } from './parts'
import { fmt } from './fmt'
import { nationColor, nationName, type Theme } from '../view/nations'
import './evolve.css'

const MORPH_NEXT: Record<Morph, Morph> = { off: 'short', short: 'long', long: 'off' }
const MORPH_LABEL: Record<Morph, string> = { off: 'Snap', short: 'Morph', long: 'Slow' }

const ALLIED = 0.5 // nations.ALLIED: a tie this strong is an alliance

// ── words ────────────────────────────────────────────────────────────────────────────────────────
const QUESTION: Record<NationAsk, string> = { attack: 'Attack?', defend: 'Defend?', explore: 'Explore?' }
const QUESTION_DESC: Record<NationAsk, string> = {
  attack: 'Yes takes the front layer of its least friendly neighbour; no makes it flee one voxel outward.',
  defend: 'Yes builds a wall near its borders; no splits off its far half as a new nation, if it is big enough.',
  explore: 'Yes heals gaps and grows outward in a cone; no makes its outermost voxels fall off.',
}
const DID: Record<NationAction, string> = {
  attack: 'Attacked', fortify: 'Built a wall', grow: 'Grew outward', flee: 'Fled outward',
  split: 'Split', wither: 'Withered', waver: 'Too small to split',
}
const TALLY: [NationAction, string][] = [
  ['attack', 'attack'], ['fortify', 'wall'], ['grow', 'grow'], ['flee', 'flee'], ['split', 'split'], ['wither', 'wither'], ['waver', 'no split'],
]

type Kind = 'all' | 'conflict' | 'diplomacy' | 'movement'
const KIND: Record<NationEvent['type'], Exclude<Kind, 'all'>> = {
  war: 'conflict', breach: 'conflict', annex: 'conflict', death: 'conflict',
  ally: 'diplomacy', rift: 'diplomacy', split: 'movement', exile: 'movement',
}
const KINDS: { value: Kind; label: string; desc: string }[] = [
  { value: 'all', label: 'All', desc: 'Every event of the history' },
  { value: 'conflict', label: 'Conflict', desc: 'Wars, broken defences, annexations and deaths' },
  { value: 'diplomacy', label: 'Diplomacy', desc: 'Alliances made and broken' },
  { value: 'movement', label: 'Splits and exile', desc: 'New nations breaking away, nations leaving the continent' },
]

/** "A", "A and B", "A, B and C" with nation chips. */
function list(ids: number[], theme: Theme): ReactNode {
  return ids.map((i, k) => (
    <span key={i}>{k > 0 && (k === ids.length - 1 ? ' and ' : ', ')}<Nat i={i} theme={theme} /></span>
  ))
}

/** One event as a sentence. */
export function Say({ e, theme }: { e: NationEvent; theme: Theme }): ReactNode {
  const N = (i: number) => <Nat i={i} theme={theme} />
  switch (e.type) {
    case 'annex': return <>{N(e.who)} annexed {N(e.whom)}.</>
    case 'split': return <>{N(e.whom)} broke away from {N(e.who)}.</>
    case 'exile': return <>{N(e.who)} left the continent.</>
    case 'ally': return <>{N(e.who)} and {N(e.whom)} became allies.</>
    case 'rift': return <>{N(e.who)} and {N(e.whom)} fell out.</>
    case 'war': return <>{N(e.who)} and {N(e.whom)} attacked each other; the border cracked open.</>
    case 'breach': return <>{list(e.who, theme)} broke through the defences of {N(e.whom)}.</>
    case 'death':
      if (e.cause === 'conquered') return <>{N(e.who)} was conquered{e.by?.length ? <> by {list(e.by, theme)}</> : null}.</>
      if (e.cause === 'withered') return <>{N(e.who)} withered away.</>
      if (e.cause === 'war') return <>{N(e.who)} was destroyed in war.</>
      if (e.cause === 'fled') return <>{N(e.who)} vanished while fleeing.</>
      return <>{N(e.who)} disappeared.</>
  }
}
/** Plain-text version, for tooltips. */
function sayText(e: NationEvent): string {
  const n = nationName
  switch (e.type) {
    case 'annex': return `${n(e.who)} annexed ${n(e.whom)}`
    case 'split': return `${n(e.whom)} broke away from ${n(e.who)}`
    case 'exile': return `${n(e.who)} left the continent`
    case 'ally': return `${n(e.who)} and ${n(e.whom)} became allies`
    case 'rift': return `${n(e.who)} and ${n(e.whom)} fell out`
    case 'war': return `${n(e.who)} and ${n(e.whom)} attacked each other`
    case 'breach': return `${e.who.map(n).join(' and ')} broke the defences of ${n(e.whom)}`
    case 'death': return e.cause === 'conquered' ? `${n(e.who)} was conquered` : e.cause === 'withered' ? `${n(e.who)} withered away`
      : e.cause === 'war' ? `${n(e.who)} was destroyed in war` : e.cause === 'fled' ? `${n(e.who)} vanished while fleeing` : `${n(e.who)} disappeared`
  }
}

// ── derived from the whole history (once per history) ───────────────────────────────────────────
interface Saga {
  /** Turn each nation first appears, and how its story ended (turn and sentence). */
  born: number[]
  end: ({ turn: number; text: string } | null)[]
  /** Slot of each nation on the relationship circle: ordered by where it sits around the model. */
  slot: number[]
  /** Turns that have events, newest first. */
  log: { turn: number; events: NationEvent[] }[]
  counts: Record<'split' | 'annex' | 'death' | 'war' | 'exile' | 'ally', number>
}

function digest(h: NationsHistory): Saga {
  const total = h.total
  const born = new Array<number>(total).fill(0)
  const end = new Array<{ turn: number; text: string } | null>(total).fill(null)
  const birthHome: ([number, number, number] | null)[] = new Array(total).fill(null)
  const counts = { split: 0, annex: 0, death: 0, war: 0, exile: 0, ally: 0 }
  const log: Saga['log'] = []
  for (const t of h.turns) {
    t.home.forEach((p, i) => { if (p && !birthHome[i]) { birthHome[i] = p; born[i] = t.turn } })
    for (const e of t.events) {
      if (e.type in counts) counts[e.type as keyof typeof counts]++
      if (e.type === 'death' && !end[e.who]) end[e.who] = { turn: t.turn, text: sayText(e) }
      if (e.type === 'annex' && !end[e.whom]) end[e.whom] = { turn: t.turn, text: sayText(e) }
    }
    if (t.events.length) log.push({ turn: t.turn, events: t.events })
  }
  log.reverse()
  // order around the model's vertical axis (z is up), so neighbours sit next to each other on the circle
  const f = h.turns[0]?.home.filter((p): p is [number, number, number] => !!p) ?? []
  const cx = f.reduce((a, p) => a + p[0], 0) / Math.max(1, f.length)
  const cy = f.reduce((a, p) => a + p[1], 0) / Math.max(1, f.length)
  const order = Array.from({ length: total }, (_, i) => i)
    .sort((a, b) => azimuth(birthHome[a], cx, cy, a) - azimuth(birthHome[b], cx, cy, b))
  const slot = new Array<number>(total).fill(0)
  order.forEach((id, k) => { slot[id] = k })
  return { born, end, slot, log, counts }
}
const azimuth = (p: [number, number, number] | null, cx: number, cy: number, i: number) =>
  p ? Math.atan2(p[1] - cy, p[0] - cx) : 10 + i

// ── small parts ──────────────────────────────────────────────────────────────────────────────────
function useWidth() {
  const [w, setW] = useState(0)
  // measured from the ref callback as the box mounts (before paint), then followed
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    setW(Math.floor(el.getBoundingClientRect().width))
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function Blk({ id, label, note, tools, children }: { id: string; label: string; note?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  return <Panel id={id} title={label} aside={note} tools={tools}>{children}</Panel>
}

function Hero({ k, v, unit, note }: { k: string; v: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div className="hero">
      <span className="hero__k">{k}</span>
      <span className="hero__v">{v}{unit && <small>{unit}</small>}</span>
      {note != null && <span className="hero__n">{note}</span>}
    </div>
  )
}

function Pill({ on, tip, desc, onClick, children, num, disabled, label }: {
  on?: boolean; tip: string; desc?: string; onClick: () => void; children: ReactNode; num?: boolean; disabled?: boolean; label?: string
}) {
  return (
    <button type="button" className={'ev-pill' + (on ? ' ev-pill--on' : '') + (num ? ' ev-pill--num' : '')} data-tip={tip} data-tip-desc={desc}
      aria-pressed={on} aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

/** A nation: its colour and letter. Colour is never alone. */
export function Nat({ i, theme, gone }: { i: number; theme: Theme; gone?: boolean }) {
  return (
    <span className={'ev-nat' + (gone ? ' ev-nat--gone' : '')}>
      <i style={{ background: nationColor(i, theme) }} />{nationName(i)}
    </span>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="qs-help">{children}</p>

// ── panel ────────────────────────────────────────────────────────────────────────────────────────
/** Evolve's sections, for the Properties column: the turn, the picked nation, the roster, the
 *  relationships and the chronicle. The picked nation is shared with the view and the graph. */
export function EvolveSections() {
  const history = useStore((s) => s.evolve.history)
  const turn = useStore((s) => s.evolve.turn)
  const theme = useStore((s) => s.theme)
  const focus = useStore((s) => s.evolveSel)
  const setFocus = useStore((s) => s.setEvolveSel)
  const saga = useMemo(() => (history ? digest(history) : null), [history])
  const rec = history ? history.turns[Math.min(turn, history.turns.length - 1)] : null
  if (!history || !saga || !rec) return <EmptyState />
  return (
    <>
      <TurnBlk rec={rec} history={history} theme={theme} />
      {focus != null && focus < history.total && <NationBlk i={focus} history={history} saga={saga} turn={rec.turn} theme={theme} onClose={() => setFocus(null)} />}
      <NationsBlk rec={rec} history={history} saga={saga} theme={theme} focus={focus} setFocus={setFocus} />
      <RelationsBlk rec={rec} history={history} saga={saga} theme={theme} focus={focus} setFocus={setFocus} />
      <ChronicleBlk history={history} saga={saga} theme={theme} />
    </>
  )
}

/** Whether an event names nation `i` (as actor, target or conqueror). */
function involves(e: NationEvent, i: number): boolean {
  const who = (e as { who: number | number[] }).who
  if (Array.isArray(who) ? who.includes(i) : who === i) return true
  if ('whom' in e && e.whom === i) return true
  return 'by' in e && !!e.by?.includes(i)
}

/** One nation, picked: who it is, its territory over the whole history, what it is doing now, its
 *  ties, and what happened to it. */
function NationBlk({ i, history, saga, turn, theme, onClose }: { i: number; history: NationsHistory; saga: Saga; turn: number; theme: Theme; onClose: () => void }) {
  const rec = history.turns[turn]
  const sizes = history.turns.map((t) => t.size[i] ?? 0)
  const peak = Math.max(1, ...sizes)
  const W = 240, H = 40
  const path = sizes.map((v, t) => `${t ? 'L' : 'M'}${((t / Math.max(1, sizes.length - 1)) * W).toFixed(1)},${(H - (v / peak) * H).toFixed(1)}`).join('')
  const x = (turn / Math.max(1, sizes.length - 1)) * W
  const parent = history.parent[i]
  const ties = rec.ties.filter(([a, b]) => a === i || b === i).map(([a, b, t]) => [a === i ? b : a, t] as const).sort((p, q) => q[1] - p[1])
  const events = history.turns.slice(1, turn + 1).flatMap((t) => t.events.filter((e) => involves(e, i)).map((e) => ({ t: t.turn, e }))).slice(-5).reverse()
  const alive = (rec.size[i] ?? 0) > 0
  return (
    <Blk id="ev-nation" label="Picked nation" tools={<button className="ev-close" onClick={onClose} aria-label="Unpick">×</button>}>
      <div className="ev-pick">
        <span className="ev-pick__n"><Nat i={i} theme={theme} gone={!alive} /></span>
        <span className="ev-pick__s">{alive ? `${fmt.int(rec.size[i])} voxels` : saga.end[i]?.text ?? 'gone'}</span>
      </div>
      <div className="ux-fact"><span className="ux-fact__k">Origin</span><span className="ux-fact__v">{parent == null ? 'founded at the start' : <>broke away from <Nat i={parent} theme={theme} /> in turn {saga.born[i]}</>}</span></div>
      {alive && rec.asked?.[i] && (
        <div className="ux-fact"><span className="ux-fact__k">This turn</span><span className="ux-fact__v">{QUESTION[rec.asked[i]!]} {rec.said?.[i] ? 'yes' : 'no'} · {rec.action[i] ? DID[rec.action[i]!].toLowerCase() : '—'}</span></div>
      )}
      {alive && rec.odds?.[i] != null && (
        <div className="ux-fact"><span className="ux-fact__k">Odds of yes</span><span className="ux-fact__v">{Math.round(rec.odds[i]! * 100)}% · certainty {rec.certainty?.[i]?.toFixed(2) ?? '—'}</span></div>
      )}
      <svg width="100%" viewBox={`0 -4 ${W} ${H + 8}`} className="ev-pick__spark" aria-label="Territory over the history">
        <path d={path} fill="none" stroke={nationColor(i, theme)} strokeWidth={1.5} />
        <line x1={x} x2={x} y1={-4} y2={H + 4} stroke="var(--qs-ink)" />
      </svg>
      {ties.length > 0 && (
        <div className="ux-fact"><span className="ux-fact__k">Ties</span><span className="ux-fact__v ev-pick__ties">
          {ties.slice(0, 4).map(([j, t]) => <span key={j}><Nat i={j} theme={theme} /> {t.toFixed(2)}{t >= ALLIED ? ' ally' : ''}</span>)}
        </span></div>
      )}
      {events.length > 0 && (
        <ul className="ev-pick__log">
          {events.map(({ t, e }, k) => <li key={k}><span>T {t}</span><span><Say e={e} theme={theme} /></span></li>)}
        </ul>
      )}
    </Blk>
  )
}

function EmptyState() {
  const grid = useStore((s) => s.grid)
  const mode = useStore((s) => s.q.mode)
  const loading = useStore((s) => s.evolve.loading || (s.q.mode === 'nations' && !!s.busy.proc))
  const setQ = useStore((s) => s.setQ)
  const off = mode !== 'nations'
  return (
    <Blk id="ev-turn" label="Evolve" note={loading ? <Spinner /> : undefined}>
      {loading ? <Empty>Evolving the nations turn by turn…</Empty>
        : !grid ? <Empty>Voxelise a model first. Evolve then splits it into nations, one qubit each, that attack, defend and explore turn by turn.</Empty>
        : off ? <Empty>Evolve is not the quantum mode. Choose it to split the model into nations that evolve turn by turn; their history plays here.</Empty>
        : <Empty>Nothing evolved yet. Change a setting under Quantum, or check the runtime log for an error.</Empty>}
      {!loading && grid && off && (
        <div className="ev-row">
          <Pill tip="Use Evolve" desc="Switch the quantum step to Evolve and run it on this grid" onClick={() => setQ({ mode: 'nations' })}>Use Evolve</Pill>
        </div>
      )}
      <ul className="ev-rules">
        <li><b>Attack?</b> Yes takes a neighbour's front layer; no flees outward.</li>
        <li><b>Defend?</b> Yes builds a wall; no splits off a new nation.</li>
        <li><b>Explore?</b> Yes grows outward; no withers.</li>
      </ul>
    </Blk>
  )
}

// 1 · Turn ───────────────────────────────────────────────────────────────────────────────────────
function TurnBlk({ rec, history, theme }: { rec: NationTurn; history: NationsHistory; theme: Theme }) {
  const ev = useStore((s) => s.evolve)
  const morph = useStore((s) => s.morph)
  const { setTurn, play, pause, setMorph } = useStore.getState()
  const alive = rec.size.filter((v) => v > 0).length
  const voxels = rec.size.reduce((a, v) => a + v, 0)
  const atEnd = ev.turn >= ev.turns
  const go = (t: number) => { pause(); setTurn(t) }
  const tally = TALLY.map(([a, label]) => [label, rec.action.filter((x) => x === a).length] as const).filter(([, c]) => c > 0)
  return (
    <Blk id="ev-turn" label="Turn" note={ev.playing ? `playing · ${TURNS_PER_SECOND} turns/s` : ev.frameTurn !== ev.turn ? 'loading the territory' : undefined}>
      <div className="heroes">
        <Hero k="Turn" v={ev.turn} unit={`/ ${ev.turns}`} note={ev.turn === 0 ? `founding · ${history.k} nations` : `${fmt.int(voxels)} voxels`} />
        <Hero k="Alive" v={alive} note={`of ${rec.size.length} so far · ${history.total} in all`} />
      </div>
      <Slider label="Scrub" value={ev.turn} min={0} max={Math.max(1, ev.turns)} step={1} ticks={Math.min(Math.max(1, ev.turns), 12)}
        format={(v) => `${v} / ${ev.turns}`} onChange={(v) => go(v)} />
      <div className="ev-row">
        <span className="ev-transport">
          <Pill tip="Previous turn" desc="Step one turn back" label="Previous turn" disabled={ev.turn <= 0} onClick={() => go(ev.turn - 1)}>
            <Icon name="chevRight" size={12} style={{ transform: 'scaleX(-1)' }} />
          </Pill>
          <Pill on={ev.playing} tip={ev.playing ? 'Pause' : atEnd ? 'Replay' : 'Play'} desc={`Play the turns at ${TURNS_PER_SECOND} a second`}
            onClick={() => (ev.playing ? pause() : play())}>
            <Icon name={ev.playing ? 'pause' : atEnd ? 'replay' : 'play'} size={12} />
            {ev.playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          </Pill>
          <Pill tip="Next turn" desc="Step one turn forward" label="Next turn" disabled={atEnd} onClick={() => go(ev.turn + 1)}>
            <Icon name="chevRight" size={12} />
          </Pill>
        </span>
        <Pill on={morph !== 'off'} tip={`Between turns: ${MORPH_LABEL[morph].toLowerCase()}`} desc="Snap, morph, or slow morph from one turn to the next"
          onClick={() => setMorph(MORPH_NEXT[morph])}>
          {MORPH_LABEL[morph]}
        </Pill>
        {tally.length > 0 && (
          <span className="ev-tally">
            {tally.map(([label, c]) => <span key={label} className="ev-tag"><span>{label}</span><b>{c}</b></span>)}
          </span>
        )}
      </div>
      <div className="ev-col">
        <span className="ev-k">{ev.turn === 0 ? 'Founding' : 'This turn'}</span>
        <ul className="ev-said">
          {ev.turn === 0 && <li>The model was split into {history.k} nations. Before any measurement each is in a superposition of doing and not doing.</li>}
          {rec.events.map((e, i) => <li key={i}><Say e={e} theme={theme} /></li>)}
          {ev.turn > 0 && !rec.events.length && <li className="ev-quiet">A quiet turn: borders moved, but no alliance, war, split or death.</li>}
        </ul>
      </div>
    </Blk>
  )
}

// 2 · Nations ────────────────────────────────────────────────────────────────────────────────────
function NationsBlk({ rec, history, saga, theme, focus, setFocus }: {
  rec: NationTurn; history: NationsHistory; saga: Saga; theme: Theme; focus: number | null; setFocus: (i: number | null) => void
}) {
  const ids = rec.size.map((_, i) => i)
  const alive = ids.filter((i) => rec.size[i] > 0)
  const gone = ids.filter((i) => rec.size[i] === 0)
  const biggest = Math.max(1, ...rec.size)
  const founding = rec.turn === 0
  const target = new Map(rec.attacks.map(([a, b]) => [a, b]))
  const child = new Map(rec.events.flatMap((e) => (e.type === 'split' ? [[e.who, e.whom] as const] : [])))
  return (
    <Blk id="ev-nations" label="Nations" note={`${alive.length} alive${gone.length ? ` · ${gone.length} gone` : ''}`}>
      <div className="ev-nations" aria-label="Nations this turn">
        <div className="ev-nrow ev-nrow--head" aria-hidden>
          <span className="ev-c-name">Nation</span><span className="ev-c-terr">Territory</span>
          <span className="ev-c-q">Question</span><span className="ev-c-odds">Odds of yes</span><span className="ev-c-ans">Answer</span>
        </div>
        {alive.map((i) => {
          const asked = rec.asked?.[i] ?? null
          const odds = rec.odds?.[i] ?? null
          const said = rec.said?.[i] ?? null
          const act = rec.action[i]
          const cert = rec.certainty?.[i] ?? null
          const parent = history.parent[i]
          const t = target.get(i)
          return (
            <div key={i} className={'ev-nrow' + (focus === i ? ' ev-nrow--focus' : focus != null ? ' ev-nrow--dim' : '')}>
              <button type="button" className="ev-nrow__name" onClick={() => setFocus(focus === i ? null : i)}
                data-tip={`Nation ${nationName(i)}`} aria-pressed={focus === i}
                data-tip-desc={`${parent == null ? 'Founded at the start' : `Broke away from ${nationName(parent)} in turn ${saga.born[i]}`}${rec.exiled.includes(i) ? ' · has left the continent' : ''} · click to pick it out in the graph`}>
                <Nat i={i} theme={theme} />
                {rec.exiled.includes(i) && <span className="ev-mini">exiled</span>}
              </button>
              <span className="ev-terr" data-tip={`${fmt.int(rec.size[i])} voxels`} data-tip-desc={`${fmt.pct(rec.size[i] / Math.max(1, rec.size.reduce((a, v) => a + v, 0)))} of all territory this turn`}>
                <span className="ev-bar"><span style={{ width: `${(100 * rec.size[i]) / biggest}%`, background: nationColor(i, theme) }} /></span>
                <span className="ev-num">{fmt.int(rec.size[i])}</span>
              </span>
              {founding || !asked ? (
                <span className="ev-q ev-q--none">{founding ? 'Founded' : '—'}</span>
              ) : (
                <span className="ev-q" data-tip={QUESTION[asked]} data-tip-desc={QUESTION_DESC[asked]}>{QUESTION[asked]}</span>
              )}
              {odds == null ? <span className="ev-odds" /> : (
                <span className="ev-odds" data-tip={`${Math.round(odds * 100)}% yes before the measurement`}
                  data-tip-desc={cert != null && cert < 0.98 ? `Certainty ${cert.toFixed(2)}: entangled with an ally, so its odds lean toward a coin flip` : 'Not entangled this turn: its odds are its own'}>
                  <span className="ev-bar ev-bar--odds"><span style={{ width: `${odds * 100}%` }} /></span>
                  <span className="ev-num">{Math.round(odds * 100)}%</span>
                </span>
              )}
              <span className="ev-ans">
                {said != null && <span className={'ev-yn' + (said ? ' ev-yn--yes' : '')}>{said ? 'yes' : 'no'}</span>}
                {act && (
                  <span className="ev-did">
                    {act === 'attack' ? (t != null ? <>Attacked <Nat i={t} theme={theme} /></> : 'Attacked; no neighbour')
                      : act === 'split' && child.has(i) ? <>Split off <Nat i={child.get(i)!} theme={theme} /></>
                      : DID[act]}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {gone.length > 0 && (
        <div className="ev-gone">
          <span className="ev-k">Gone</span>
          {gone.map((i) => {
            const end = saga.end[i]
            return (
              <span key={i} className="ev-gone__n" data-tip={`Nation ${nationName(i)} is gone`} data-tip-desc={end ? `Turn ${end.turn}: ${end.text}` : 'No territory left'}>
                <Nat i={i} theme={theme} gone />
              </span>
            )
          })}
        </div>
      )}
      <p className="qs-help">Each turn every nation is asked one thing. The odds are its chance of yes before the measurement; the answer is what was measured.</p>
    </Blk>
  )
}

// 3 · Relationships ──────────────────────────────────────────────────────────────────────────────
function RelationsBlk({ rec, history, saga, theme, focus, setFocus }: {
  rec: NationTurn; history: NationsHistory; saga: Saga; theme: Theme; focus: number | null; setFocus: (i: number | null) => void
}) {
  const [ref, w] = useWidth()
  const W = Math.max(0, w), H = Math.round(Math.min(Math.max(W * 0.86, 220), 400))
  const cx = W / 2, cy = H / 2
  const R = Math.max(40, Math.min(W, H) / 2 - 34)
  const total = Math.max(1, history.total)
  const alive = rec.size.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)
  const biggest = Math.max(1, ...rec.size)
  const unit = Math.min(1, R / 130)
  const rad = (i: number) => (4 + 12 * Math.sqrt(rec.size[i] / biggest)) * Math.max(0.7, unit)
  const pos = (i: number): [number, number] => {
    const a = -Math.PI / 2 + (2 * Math.PI * saga.slot[i]) / total
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)]
  }
  const live = new Set(alive)
  const tie = new Map(rec.ties.map(([i, j, t]) => [`${Math.min(i, j)}-${Math.max(i, j)}`, t]))
  const border = new Set(rec.borders.map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`))
  const pairs = new Set([...border, ...rec.ties.filter(([, , t]) => t >= 0.05).map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`)])
  const touches = (i: number, j: number) => focus == null || focus === i || focus === j
  const allies = rec.ties.filter(([, , t]) => t >= ALLIED).length
  const curve = (a: [number, number], b: [number, number], ra: number, rb: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1
    const ux = dx / d, uy = dy / d
    const s: [number, number] = [a[0] + ux * (ra + 2), a[1] + uy * (ra + 2)]
    const e: [number, number] = [b[0] - ux * (rb + 4), b[1] - uy * (rb + 4)]
    const bend = Math.min(26, d * 0.16)
    const c: [number, number] = [(s[0] + e[0]) / 2 - uy * bend, (s[1] + e[1]) / 2 + ux * bend]
    // arrowhead along the curve's end tangent
    const tx = e[0] - c[0], ty = e[1] - c[1], tl = Math.hypot(tx, ty) || 1
    const hx = tx / tl, hy = ty / tl, L = 7, Wd = 3.6
    const head = `M${e[0] + hx * 2},${e[1] + hy * 2} L${e[0] - hx * L - hy * Wd},${e[1] - hy * L + hx * Wd} L${e[0] - hx * L + hy * Wd},${e[1] - hy * L - hx * Wd}Z`
    return { d: `M${s[0]},${s[1]} Q${c[0]},${c[1]} ${e[0]},${e[1]}`, head }
  }
  return (
    <Blk id="ev-relations" label="Relationships" note={rec.turn === 0 ? 'at the founding' : `turn ${rec.turn}`}>
      <div ref={ref} className="ev-graph" onClick={() => setFocus(null)}>
        {W > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Nations as a graph: borders, alliances and this turn's attacks">
            <circle cx={cx} cy={cy} r={R} className="ev-g__ring" />
            {[...pairs].map((key) => {
              const [i, j] = key.split('-').map(Number)
              if (!live.has(i) || !live.has(j)) return null
              const t = tie.get(key) ?? 0
              const shared = border.has(key)
              const a = pos(i), b = pos(j)
              const kind = t >= ALLIED ? 'ally' : shared ? 'border' : 'fading'
              return (
                <g key={key} className={'ev-g__edge ev-g__edge--' + kind + (touches(i, j) ? '' : ' ev-g--dim')}
                  data-tip={`${nationName(i)} and ${nationName(j)}`}
                  data-tip-desc={`${kind === 'ally' ? 'Allies' : shared ? 'Neighbours' : 'No longer touching'} · tie ${t.toFixed(2)}${shared ? ' · share a border' : ''}${t >= ALLIED ? ' · they agree on the question they are asked' : ''}`}>
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="ev-g__hit" />
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeWidth={kind === 'ally' ? 2 + 2.5 * t : 1 + 2 * t} />
                </g>
              )
            })}
            {rec.attacks.map(([i, j]) => {
              if (!live.has(i) && !live.has(j)) return null
              const { d, head } = curve(pos(i), pos(j), live.has(i) ? rad(i) : 4, live.has(j) ? rad(j) : 4)
              const mutual = rec.attacks.some(([a, b]) => a === j && b === i)
              const c = nationColor(i, theme)
              return (
                <g key={`a${i}-${j}`} className={'ev-g__attack' + (touches(i, j) ? '' : ' ev-g--dim')}
                  data-tip={`${nationName(i)} attacked ${nationName(j)}`}
                  data-tip-desc={mutual ? 'Both attacked: both front lines are gone and the border cracked open' : (rec.broken ?? []).includes(j) ? `${nationName(j)} defended, but more than one attacked` : 'Takes the layer of the target that touches it'}>
                  <path d={d} className="ev-g__hit" />
                  <path d={d} fill="none" stroke={c} strokeWidth={1.75} strokeDasharray={mutual ? '4 3' : undefined} />
                  <path d={head} fill={c} />
                </g>
              )
            })}
            {alive.map((i) => {
              const [x, y] = pos(i)
              const r = rad(i)
              const ex = rec.exiled.includes(i)
              const dx = x - cx, dy = y - cy, dl = Math.hypot(dx, dy) || 1
              const lx = x + (dx / dl) * (r + 10), ly = y + (dy / dl) * (r + 10)
              const asked = rec.asked?.[i], said = rec.said?.[i]
              return (
                <g key={i} className={'ev-g__node' + (focus === i ? ' ev-g__node--focus' : focus != null && !partnersOf(rec, focus).has(i) ? ' ev-g--dim' : '')}
                  role="button" tabIndex={0} aria-label={`Nation ${nationName(i)}`} aria-pressed={focus === i}
                  onClick={(e) => { e.stopPropagation(); setFocus(focus === i ? null : i) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(focus === i ? null : i) } }}
                  data-tip={`${nationName(i)} · ${fmt.int(rec.size[i])} voxels`}
                  data-tip-desc={`${asked && said != null ? `${QUESTION[asked]} ${Math.round((rec.odds?.[i] ?? 0) * 100)}% → ${said ? 'yes' : 'no'}` : 'Founding'}${ex ? ' · has left the continent' : ''} · click to pick it out`}>
                  <circle cx={x} cy={y} r={r + 8} className="ev-g__hit" />
                  {ex && <circle cx={x} cy={y} r={r + 4} className="ev-g__exile" />}
                  <circle cx={x} cy={y} r={r} fill={nationColor(i, theme)} className="ev-g__dot" />
                  <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central">{nationName(i)}</text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <div className="ev-legend">
        <span><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" className="ev-lg ev-lg--border" /></svg>borders<b>{rec.borders.length}</b></span>
        <span><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" className="ev-lg ev-lg--ally" /></svg>alliances<b>{allies}</b></span>
        <span><svg width="18" height="8"><path d="M1 4H12M17 4 11 1V7Z" className="ev-lg ev-lg--attack" /></svg>attacks<b>{rec.attacks.length}</b></span>
        <span><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" className="ev-lg ev-lg--fading" /></svg>fading tie</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" className="ev-lg ev-lg--exile" /></svg>left the continent<b>{rec.exiled.filter((i) => live.has(i)).length}</b></span>
      </div>
      <p className="qs-help">Circles are nations, sized by territory and placed in the order they sit around the model. A thicker line is a closer tie; allies agree on the question they are asked, so they often act together.</p>
    </Blk>
  )
}
/** The nation and everyone it touches this turn (borders, ties, attacks). */
function partnersOf(rec: NationTurn, i: number) {
  const s = new Set<number>([i])
  for (const [a, b] of rec.borders) { if (a === i) s.add(b); if (b === i) s.add(a) }
  for (const [a, b] of rec.ties) { if (a === i) s.add(b); if (b === i) s.add(a) }
  for (const [a, b] of rec.attacks) { if (a === i) s.add(b); if (b === i) s.add(a) }
  return s
}

// 4 · Chronicle ──────────────────────────────────────────────────────────────────────────────────
function ChronicleBlk({ history, saga, theme }: { history: NationsHistory; saga: Saga; theme: Theme }) {
  const turn = useStore((s) => s.evolve.turn)
  const { setTurn, pause } = useStore.getState()
  const [kind, setKind] = useState<Kind>('all')
  const [more, setMore] = useState(false)
  const groups = saga.log
    .map((g) => ({ turn: g.turn, events: g.events.filter((e) => kind === 'all' || KIND[e.type] === kind) }))
    .filter((g) => g.events.length)
  const LIMIT = 60
  const shown = more ? groups : groups.slice(0, LIMIT)
  const c = saga.counts
  const last = history.turns[history.turns.length - 1]
  return (
    <Blk id="ev-chronicle" label="Chronicle" note={`${history.turns.length - 1} turns`}>
      <div className="heroes ev-heroes--small">
        <Hero k="Nations" v={history.total} note={`${history.k} founded · ${c.split} broke away`} />
        <Hero k="At the end" v={last.size.filter((v) => v > 0).length} note={`alive · ${c.annex} annexed · ${c.death} died`} />
        <Hero k="Wars" v={c.war} note={`${c.ally} alliances · ${c.exile} exiles`} />
      </div>
      <div className="ev-filter" role="group" aria-label="Show events">
        {KINDS.map((k) => (
          <Pill key={k.value} on={kind === k.value} tip={k.label} desc={k.desc} onClick={() => setKind(k.value)}>{k.label}</Pill>
        ))}
      </div>
      {!groups.length ? <Empty>No such events in this history.</Empty> : (
        <ol className="ev-log">
          {shown.map((g) => (
            <li key={g.turn} className={'ev-log__turn' + (g.turn > turn ? ' ev-log__turn--later' : '') + (g.turn === turn ? ' ev-log__turn--now' : '')}>
              <Pill num on={g.turn === turn} tip={`Go to turn ${g.turn}`} desc={g.turn > turn ? 'Not reached yet on screen' : 'Show the territory at the end of this turn'}
                onClick={() => { pause(); setTurn(g.turn) }}>{g.turn}</Pill>
              <ul>{g.events.map((e, k) => <li key={k}><Say e={e} theme={theme} /></li>)}</ul>
            </li>
          ))}
        </ol>
      )}
      {groups.length > LIMIT && (
        <div className="ev-row">
          <Pill tip={more ? 'Show fewer' : 'Show the whole chronicle'} desc={`${groups.length} turns with events`} onClick={() => setMore(!more)}>
            {more ? 'Show fewer' : `Show all ${groups.length} turns`}
          </Pill>
        </div>
      )}
      <p className="qs-help">Newest first. Turns after the one on screen are dimmed; click a turn to go there.</p>
    </Blk>
  )
}
