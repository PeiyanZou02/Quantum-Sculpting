// The plate's title (meta v5): kicker, a display line, one sentence on what the plate shows, and the
// model, grid and run. In a file of its own, which exports only this component.
import { useStore } from '../store'
import { base, qubitsPerAxis } from './metaFmt'
import type { HudCtx } from './types'
import './lab.css'

/** The plate's title: what it shows, in a sentence, and where it came from in one line. Reads first. */
export function Title({ ctx }: { ctx: HudCtx }) {
  const q = useStore((s) => s.q)
  const history = useStore((s) => s.evolve.history)
  const mode = ctx.proc?.mode ?? ctx.q.mode
  const file = ctx.model ? base(ctx.model.file || ctx.model.name) : 'no model'
  const n = ctx.grid?.n ?? ctx.n
  const qa = qubitsPerAxis(n)
  const axes = Math.max(1, ctx.q.axes.length)
  let kicker: string, title: string, about: string
  if (mode === 'nations') {
    const k = history?.k ?? q.k, turns = history ? history.turns.length - 1 : q.turns
    kicker = 'Evolve'
    title = `${k} nations, ${turns} turns`
    about = `Each nation is a qubit, measured every turn. Nations grow, fortify and attack; wars crack borders, the strong annex the weak, and some split in two.`
  } else if (mode === 'gaussian') {
    kicker = 'Gaussian'
    title = `A blur, σ ${q.sigma}`
    about = 'The classical stand-in for the quantum blur: the same field, smoothed by a Gaussian.'
  } else {
    kicker = mode === 'atlas' ? 'Atlas' : 'Emulation'
    title = `Blurred on ${qa * axes} qubits`
    about = `Each axis of ${Math.min(n, 32)} cells is Gray-coded onto ${qa} qubits. Rx turns move value between neighbouring cells; measured, the field is cut at level ${ctx.level.toFixed(2)}.`
  }
  return (
    <div className="qs-lab-title">
      <span className="qs-lab-title__k">Quantum Sculpting · {kicker}</span>
      <span className="qs-lab-title__t">{title}</span>
      <p className="qs-lab-title__p">{about}</p>
      <span className="qs-lab-title__m">{file} · {n}³ · {ctx.proc?.run ?? ctx.q.run}</span>
    </div>
  )
}

