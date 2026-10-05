// SculptorChrome: frame corners, edge dots, top bar, run line and step rail.
import { useStore, type Step } from '../store'
import { QPill } from '../qs/QPill'
import { fmt } from './parts'

const STEPS = ['01 Model', '02 Voxelise', '03 Quantum', '04 Mesh']
const MODE = { gaussian: 'gaussian', emulator: 'emulation', atlas: 'atlas' } as const

function useRunLine(): string[] {
  const st = useStore()
  const { model, grid, proc, step, q, m, job } = st
  if (!model) return ['No model loaded']
  const file = model.builtin ? 'test cup' : model.file
  if (step <= 0) {
    const [x, y, z] = model.extents
    return [file, model.builtin ? 'built-in' : `${fmt.int(model.faces)} faces`, `${x.toFixed(0)} × ${y.toFixed(0)} × ${z.toFixed(0)} mm`, `up ${fmt.up(model.up)}`]
  }
  if (step === 1 && grid) return [file, `${grid.n}³`, grid.values, { holes: 'enclosed', capped: 'capped', none: 'shell' }[grid.fill], `pad ${grid.pad}`]
  if (step === 2) {
    const n = grid ? `${grid.n}³ ${grid.values}` : ''
    if (job?.status === 'running') return [job.run, n, 'atlas', `${job.tiles_total} tiles`, `${job.tiles_done} done`]
    if (q.mode === 'gaussian') return [q.run, n, 'gaussian', `sigma ${q.sigma.toFixed(1)}`]
    return [q.run, n, MODE[q.mode], `strength ${fmt.f2(q.strength)}`, `reach ${fmt.f2(q.reach)}`]
  }
  const r = proc?.run ?? q.run
  if (st.meshTab === 'export') return [r, `${m.method === 'advect' ? 'push' : 'threshold'} ${fmt.f2(m.level)}`, `${m.height} mm`, st.exported?.file ?? 'not exported']
  if (m.method === 'advect') return [r, `${grid?.n}³ → ${(grid?.n ?? 0) * m.refine}³ fine`, `push ${m.amount.toFixed(1)}`, m.field]
  return [r, `${grid?.n}³ ${grid?.values}`, proc ? MODE[proc.mode] : '', `threshold ${fmt.f2(m.level)}`]
}

export function Chrome() {
  const step = useStore((s) => s.step)
  const goStep = useStore((s) => s.goStep)
  const key = useStore((s) => s.key)
  const job = useStore((s) => s.job)
  const error = useStore((s) => s.error)
  const model = useStore((s) => s.model), grid = useStore((s) => s.grid), proc = useStore((s) => s.proc)
  const run = useRunLine()
  const reachable = [!!model, !!grid, !!proc, !!proc]

  const running = job?.status === 'running'
  const rejected = !!error && /401|unauthor/i.test(error)
  const pill = rejected
    ? { kind: 'line' as const, dot: 'off' as const, label: 'Key rejected · 401' }
    : running
      ? { kind: 'hair' as const, dot: 'busy' as const, label: `Atlas · ${Math.min(3, job!.tiles_total - job!.tiles_done)} jobs running` }
      : key?.set
        ? { kind: 'hair' as const, dot: 'on' as const, label: 'Atlas key set' }
        : { kind: 'hair' as const, dot: 'off' as const, label: 'Set API key' }

  const b = '1px solid var(--qs-ink)'
  const frame = { position: 'absolute', width: 16, height: 16, pointerEvents: 'none' } as const
  const dots = (side: 'left' | 'right') => (
    <div style={{ position: 'absolute', [side]: 30, top: 200, bottom: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
      {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 4, height: 4, background: 'var(--qs-ink3)' }} />)}
    </div>
  )

  return (
    <>
      <div style={{ ...frame, left: 24, top: 24, borderLeft: b, borderTop: b }} />
      <div style={{ ...frame, right: 24, top: 24, borderRight: b, borderTop: b }} />
      <div style={{ ...frame, left: 24, bottom: 24, borderLeft: b, borderBottom: b }} />
      <div style={{ ...frame, right: 24, bottom: 24, borderRight: b, borderBottom: b }} />
      {dots('left')}
      {dots('right')}

      <div style={{ position: 'absolute', left: 48, top: 36, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span className="qs-app">Quantum Sculptor</span>
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>local · {location.host}</span>
      </div>

      <div className="qs-mono" style={{ position: 'absolute', left: 432, top: 41, display: 'flex', alignItems: 'center', gap: 10 }}>
        {run.filter(Boolean).map((t, i, a) => (
          <span key={i} style={{ display: 'contents' }}>
            <span style={{ color: i === 0 ? 'var(--qs-ink)' : 'var(--qs-ink2)' }}>{t}</span>
            {i < a.length - 1 && <span style={{ color: 'var(--qs-ink4)' }}>/</span>}
          </span>
        ))}
      </div>

      <div style={{ position: 'absolute', right: 48, top: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        <QPill kind={pill.kind} size="s" dot={pill.dot} label={pill.label} onClick={() => useStore.setState({ keyOpen: true })} />
        <QPill kind="ghost" size="s" label="Help" onClick={() => window.open('https://github.com/madebyrayz/quantum-sculptor#readme', '_blank')} />
      </div>

      {/* step rail */}
      <div className="qs-mono" style={{ position: 'absolute', left: 48, top: 112, width: 344, display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 20 }}>
        <div style={{ position: 'absolute', left: 0, top: -4, bottom: -4, width: 1, background: 'var(--qs-ink4)' }} />
        {step >= 0 && (
          <div style={{ position: 'absolute', left: -1.5, top: step * 27 - 6.5, width: 4, height: 24, background: 'var(--qs-ink)', transition: 'top 480ms cubic-bezier(.215,.61,.355,1)' }} />
        )}
        {STEPS.map((t, i) => {
          const state = step < 0 ? '—' : i < step ? 'done' : i === step ? 'live' : '—'
          const can = reachable[i] && i !== step
          return (
            <button
              key={t}
              onClick={() => can && goStep(i as Step)}
              style={{
                all: 'unset', display: 'flex', justifyContent: 'space-between', cursor: can ? 'pointer' : 'default',
                color: step >= 0 && i <= step ? 'var(--qs-ink)' : reachable[i] ? 'var(--qs-ink2)' : 'var(--qs-ink3)',
                font: "400 11px/1 var(--qs-mono)",
              }}
            >
              {t}
              <span style={{ color: i === step ? 'var(--qs-ink)' : 'var(--qs-ink3)' }}>{state}</span>
            </button>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 48, top: 236, width: 344, height: 1, background: 'var(--qs-line)' }} />
    </>
  )
}
