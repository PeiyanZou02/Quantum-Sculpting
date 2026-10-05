// Evolve for Present: Peiyan's nations (app/nations.py) as HUD figures. Each follows the turn on screen,
// so they play with the history: the roster, territory over the whole history, the chronicle, the
// relationships, and the record. Nation colour is never alone: every nation carries its letter.
import { useMemo } from 'react'
import { useStore } from '../store'
import type { NationEvent, NationsHistory } from '../api'
import { nationColor, nationName, type Theme } from '../view/nations'
import './evolve.css'

function useEvolve() {
  const history = useStore((s) => (s.proc?.mode === 'nations' ? s.evolve.history : null))
  const turn = useStore((s) => s.evolve.turn)
  const theme = useStore((s) => s.theme)
  return { history, turn: history ? Math.min(turn, history.turns.length - 1) : 0, theme }
}

const Chip = ({ i, theme }: { i: number; theme: Theme }) => (
  <span className="hev-chip"><i style={{ background: nationColor(i, theme) }} />{nationName(i)}</span>
)

function Head({ t, n }: { t: string; n?: string }) {
  return <div className="hev-head"><span className="hev-t">{t}</span>{n && <span className="hev-n">{n}</span>}</div>
}

const Empty = () => (
  <div className="hev"><Head t="Evolve" /><p className="hev-empty">Run Evolve (Quantum → Evolve) to show the nations.</p></div>
)

/** Totals over the history up to `turn`. */
function tally(h: NationsHistory, turn: number) {
  const c = { war: 0, annex: 0, split: 0, death: 0, exile: 0, ally: 0, breach: 0 }
  for (const t of h.turns.slice(1, turn + 1)) for (const e of t.events) if (e.type in c) c[e.type as keyof typeof c]++
  return c
}

/** An event as a sentence: nations (numbers) and words, in reading order. */
function text(e: NationEvent): (number | string)[] {
  switch (e.type) {
    case 'war': return [e.who, 'and', e.whom, 'at war']
    case 'breach': return [...e.who, 'broke through', e.whom]
    case 'annex': return [e.who, 'annexed', e.whom]
    case 'split': return [e.whom, 'broke away from', e.who]
    case 'death': return [e.who, e.cause === 'conquered' ? 'was conquered' : e.cause === 'withered' ? 'withered away' : e.cause === 'war' ? 'fell in war' : e.cause === 'fled' ? 'vanished fleeing' : 'disappeared']
    case 'exile': return [e.who, 'left the continent']
    case 'ally': return [e.who, 'and', e.whom, 'allied']
    case 'rift': return [e.who, 'and', e.whom, 'fell out']
  }
}

// ── nations: the roster for this turn ────────────────────────────────────────────────────────────
export function Nations() {
  const { history: h, turn, theme } = useEvolve()
  if (!h) return <Empty />
  const rec = h.turns[turn]
  const alive = rec.size.map((v, i) => [i, v] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const big = Math.max(1, ...alive.map(([, v]) => v))
  const shown = alive.slice(0, 12)
  return (
    <div className="hev hev--nations">
      <Head t="Nations" n={`turn ${turn} / ${h.turns.length - 1}`} />
      <div className="hev-roster">
        {shown.map(([i, v]) => (
          <div key={i} className="hev-row">
            <Chip i={i} theme={theme} />
            <span className="hev-bar"><span style={{ width: `${(100 * v) / big}%`, background: nationColor(i, theme) }} /></span>
            <span className="hev-v">{v.toLocaleString()}</span>
            <span className="hev-act">{rec.action[i] ?? ''}</span>
          </div>
        ))}
      </div>
      <div className="hev-foot">{alive.length} alive · {h.total - alive.length} gone{alive.length > shown.length ? ` · ${alive.length - shown.length} more` : ''}</div>
    </div>
  )
}

// ── territory: each nation's share over the whole history, a playhead on this turn ──────────────
const W = 480, H = 96, MARK = 14
export function Territory() {
  const { history: h, turn, theme } = useEvolve()
  const paths = useMemo(() => {
    if (!h) return null
    const T = h.turns.length, n = h.total
    const x = (t: number) => (t / Math.max(1, T - 1)) * W
    const totals = h.turns.map((r) => Math.max(1, r.size.reduce((a, v) => a + v, 0)))
    const base = new Array(T).fill(0)
    const out: { i: number; d: string }[] = []
    for (let i = 0; i < n; i++) {
      const top = h.turns.map((r, t) => base[t] + ((r.size[i] ?? 0) / totals[t]) * H)
      if (top.every((v, t) => v - base[t] < 0.01)) continue
      const up = top.map((v, t) => `${x(t).toFixed(1)},${(H - v).toFixed(1)}`).join(' L')
      const down = base.map((v, t) => `${x(t).toFixed(1)},${(H - v).toFixed(1)}`).reverse().join(' L')
      out.push({ i, d: `M${up} L${down} Z` })
      top.forEach((v, t) => { base[t] = v })
    }
    const marks = h.turns.flatMap((r, t) => r.events.filter((e) => e.type === 'war' || e.type === 'annex' || e.type === 'split').map((e) => ({ t, type: e.type, x: x(t) })))
    return { out, marks, x }
  }, [h])
  if (!h || !paths) return <Empty />
  const px = paths.x(turn)
  return (
    <div className="hev hev--territory">
      <Head t="Territory" n={`share of the cells per nation · ${h.turns.length - 1} turns`} />
      <svg width={W} height={H + MARK + 16} viewBox={`0 0 ${W} ${H + MARK + 16}`} className="hev-svg">
        {paths.out.map((p) => <path key={p.i} d={p.d} fill={nationColor(p.i, theme)} opacity={0.9} />)}
        <rect x={px} width={W - px} height={H} fill="var(--qs-bg)" opacity={0.62} />
        <line x1={px} x2={px} y1={-2} y2={H + MARK} stroke="var(--qs-ink)" />
        {paths.marks.map((m, k) => m.type === 'war'
          ? <path key={k} d={`M${m.x} ${H + 4}l3 6h-6z`} fill={m.x <= px ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
          : m.type === 'annex'
            ? <rect key={k} x={m.x - 2.5} y={H + 5} width={5} height={5} fill={m.x <= px ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />
            : <circle key={k} cx={m.x} cy={H + 7.5} r={2.6} fill="none" stroke={m.x <= px ? 'var(--qs-ink)' : 'var(--qs-ink3)'} />)}
        {(() => {
          // the playhead's label sits under it; an end label it would touch gives way
          const end = h.turns.length - 1, lx = Math.min(Math.max(px, 24), W - 24), room = 56
          return (
            <>
              {lx > room && <text x={0} y={H + MARK + 13} className="hev-ax">T 0</text>}
              <text x={lx} y={H + MARK + 13} textAnchor="middle" className="hev-ax hev-ax--on">T {turn}</text>
              {lx < W - room && <text x={W} y={H + MARK + 13} textAnchor="end" className="hev-ax">T {end}</text>}
            </>
          )
        })()}
      </svg>
      <div className="hev-legend"><span><svg width="8" height="7"><path d="M4 0l4 7H0z" /></svg>war</span><span><svg width="7" height="7"><rect width="7" height="7" /></svg>annex</span><span><svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="none" stroke="currentColor" /></svg>split</span></div>
    </div>
  )
}

// ── chronicle: the latest events up to this turn ─────────────────────────────────────────────────
export function Chronicle() {
  const { history: h, turn, theme } = useEvolve()
  if (!h) return <Empty />
  const rows = h.turns.slice(1, turn + 1).flatMap((r) => r.events.filter((e) => e.type !== 'ally' && e.type !== 'rift').map((e) => ({ t: r.turn, e }))).slice(-7).reverse()
  return (
    <div className="hev hev--chronicle">
      <Head t="Chronicle" n={`to turn ${turn}`} />
      {rows.length ? (
        <ol className="hev-log">
          {rows.map(({ t, e }, k) => (
            <li key={k}>
              <span className="hev-lt">T {String(t).padStart(3, '0')}</span>
              <span className="hev-lw">{text(e).map((w, j) => (typeof w === 'number' ? <Chip key={j} i={w} theme={theme} /> : <span key={j}>{w}</span>))}</span>
            </li>
          ))}
        </ol>
      ) : <p className="hev-empty">No wars, annexations or splits yet.</p>}
    </div>
  )
}

// ── relations: nations on a ring, alliances and this turn's attacks ─────────────────────────────
const R = 88, S = 220
export function Relations() {
  const { history: h, turn, theme } = useEvolve()
  if (!h) return <Empty />
  const rec = h.turns[turn]
  const alive = rec.size.map((v, i) => [i, v] as const).filter(([, v]) => v > 0)
  const big = Math.max(1, ...alive.map(([, v]) => v))
  const at = new Map(alive.map(([i], k) => {
    const a = (k / Math.max(1, alive.length)) * Math.PI * 2 - Math.PI / 2
    return [i, [S / 2 + R * Math.cos(a), S / 2 + R * Math.sin(a)] as const]
  }))
  const allies = rec.ties.filter(([, , t]) => t >= 0.5).length
  return (
    <div className="hev hev--relations">
      <Head t="Relations" n={`${allies} alliance${allies === 1 ? '' : 's'} · ${rec.attacks.length} attack${rec.attacks.length === 1 ? '' : 's'}`} />
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="hev-svg">
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="var(--qs-line)" strokeDasharray="2 4" />
        {rec.ties.map(([i, j, t]) => {
          const a = at.get(i), b = at.get(j)
          if (!a || !b || t < 0.15) return null
          return <line key={`${i}-${j}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--qs-ink)" strokeWidth={t >= 0.5 ? 2 : 0.75} opacity={t >= 0.5 ? 1 : 0.35} />
        })}
        {rec.attacks.map(([i, j], k) => {
          const a = at.get(i), b = at.get(j)
          if (!a || !b) return null
          const mx = (a[0] + b[0]) / 2 + (S / 2 - (a[0] + b[0]) / 2) * 0.35, my = (a[1] + b[1]) / 2 + (S / 2 - (a[1] + b[1]) / 2) * 0.35
          return <path key={`a${k}`} d={`M${a[0]} ${a[1]} Q${mx} ${my} ${b[0]} ${b[1]}`} fill="none" stroke="var(--qs-ink)" strokeDasharray="3 3" markerEnd="url(#hev-arrow)" />
        })}
        <defs><marker id="hev-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6z" fill="var(--qs-ink)" /></marker></defs>
        {alive.map(([i, v]) => {
          const p = at.get(i)!
          const r = 5 + 9 * Math.sqrt(v / big)
          return (
            <g key={i}>
              <circle cx={p[0]} cy={p[1]} r={r} fill={nationColor(i, theme)} stroke="var(--qs-bg)" strokeWidth={1.5} />
              <text x={p[0]} y={p[1] + 4} textAnchor="middle" className="hev-node">{nationName(i)}</text>
            </g>
          )
        })}
      </svg>
      <div className="hev-legend"><span><svg width="14" height="6"><line x1="0" x2="14" y1="3" y2="3" stroke="currentColor" strokeWidth="2" /></svg>alliance</span><span><svg width="14" height="6"><line x1="0" x2="14" y1="3" y2="3" stroke="currentColor" strokeDasharray="3 3" /></svg>attack</span></div>
    </div>
  )
}

// ── record: the history in figures ───────────────────────────────────────────────────────────────
export function Record() {
  const { history: h, turn } = useEvolve()
  if (!h) return <Empty />
  const c = tally(h, turn)
  const alive = h.turns[turn].size.filter((v) => v > 0).length
  const figs: [string, number, string][] = [
    ['Alive', alive, `of ${h.total} so far`], ['Wars', c.war, `${c.breach} breaches`],
    ['Annexed', c.annex, `${c.death} fell`], ['Splits', c.split, `${c.exile} left the continent`],
  ]
  return (
    <div className="hev hev--record">
      <Head t="Record" n={`${h.k} founded · to turn ${turn}`} />
      <div className="hev-figs">
        {figs.map(([k, v, note]) => (
          <div key={k} className="hev-fig"><span className="hev-k">{k}</span><span className="hev-big">{v}</span><span className="hev-note">{note}</span></div>
        ))}
      </div>
    </div>
  )
}

// ── log: the turns up to this one, as the drawer's Evolve log tells them ────────────────────────
const ACTS: [string, string][] = [['attack', 'attack'], ['fortify', 'wall'], ['grow', 'grow'], ['flee', 'flee'], ['split', 'split'], ['wither', 'wither']]
export function Log() {
  const { history: h, turn, theme } = useEvolve()
  if (!h) return <Empty />
  const rows = h.turns.slice(Math.max(0, turn - 7), turn + 1).reverse()
  return (
    <div className="hev hev--log">
      <Head t="Evolve log" n={`turn ${turn} / ${h.turns.length - 1}`} />
      <ol className="hev-log">
        {rows.map((r) => {
          const n: Record<string, number> = {}
          for (const a of r.action) if (a) n[a] = (n[a] ?? 0) + 1
          const tally = ACTS.filter(([a]) => n[a]).map(([a, t]) => `${n[a]} ${t}`).join(' · ')
          const e = r.events.find((x) => x.type !== 'ally' && x.type !== 'rift') ?? r.events[0]
          return (
            <li key={r.turn}>
              <span className="hev-lt">T {String(r.turn).padStart(3, '0')}</span>
              <span className="hev-lw">
                {r.turn === 0 ? <span>founded {h.k} nations</span>
                  : e ? text(e).map((w, j) => (typeof w === 'number' ? <Chip key={j} i={w} theme={theme} /> : <span key={j}>{w}</span>))
                  : <span>{tally || 'nothing moved'}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ── one nation: the picked one (click it in the view), else the largest ─────────────────────────
export function Picked() {
  const { history: h, turn, theme } = useEvolve()
  const sel = useStore((s) => s.evolveSel)
  if (!h) return <Empty />
  const rec = h.turns[turn]
  const big = rec.size.reduce((b, v, i) => (v > rec.size[b] ? i : b), 0)
  const i = sel != null && sel < h.total ? sel : big
  const total = Math.max(1, rec.size.reduce((a, v) => a + v, 0))
  const sizes = h.turns.map((r) => r.size[i] ?? 0)
  const top = Math.max(1, ...sizes)
  const w = 200, ht = 36
  const d = sizes.map((v, t) => `${t ? 'L' : 'M'}${((t / Math.max(1, sizes.length - 1)) * w).toFixed(1)},${(ht - (v / top) * ht).toFixed(1)}`).join(' ')
  const px = (turn / Math.max(1, sizes.length - 1)) * w
  const mine = h.turns.slice(1, turn + 1).flatMap((r) => r.events.filter((e) => text(e).includes(i))).length
  return (
    <div className="hev hev--picked">
      <Head t="Nation" n={sel == null ? 'largest · click one in the view' : 'picked'} />
      <div className="hev-pick">
        <Chip i={i} theme={theme} />
        <span className="hev-v">{(rec.size[i] ?? 0).toLocaleString()} cells · {Math.round((100 * (rec.size[i] ?? 0)) / total)} %</span>
        <span className="hev-act">{rec.action[i] ?? (rec.size[i] ? '' : 'gone')}</span>
      </div>
      <svg width={w} height={ht + 2} viewBox={`0 -1 ${w} ${ht + 2}`} className="hev-svg">
        <path d={d} fill="none" stroke={nationColor(i, theme)} strokeWidth={1.5} />
        <line x1={px} x2={px} y1={0} y2={ht} stroke="var(--qs-ink)" />
      </svg>
      <div className="hev-foot">{mine} events so far · territory over {h.turns.length - 1} turns</div>
    </div>
  )
}
