import { useStore } from '../store'
import { QPill } from '../qs/QPill'
import { fmt } from './parts'

const MODE = { gaussian: 'gaussian', emulator: 'emulation', atlas: 'atlas' } as const

function useRunLine(): string[] {
  const { model, grid, proc, q, m, job } = useStore()
  if (!model) return ['No model loaded']
  const out = [model.builtin ? 'test cup' : model.file]
  if (grid) out.push(`${grid.n}³ ${grid.values}`)
  if (job?.status === 'running') out.push(`atlas · ${job.tiles_done} of ${job.tiles_total} tiles`)
  else if (proc) out.push(proc.mode === 'gaussian' ? `gaussian σ ${q.sigma}` : `${MODE[proc.mode]} · strength ${fmt.f2(q.strength)} · reach ${fmt.f2(q.reach)}`)
  if (proc) out.push(m.method === 'advect' ? `push ${m.amount} · ×${m.refine}` : `level ${fmt.f2(m.level)}`)
  return out
}

export function TopBar() {
  const key = useStore((s) => s.key)
  const job = useStore((s) => s.job)
  const error = useStore((s) => s.error)
  const run = useRunLine()
  const rejected = !!error && /401|unauthor/i.test(error)
  const pill = rejected
    ? { kind: 'line' as const, dot: 'off' as const, label: 'Key rejected · 401' }
    : job?.status === 'running'
      ? { kind: 'hair' as const, dot: 'busy' as const, label: 'Atlas · running' }
      : key?.set
        ? { kind: 'hair' as const, dot: 'on' as const, label: `Atlas key${key.hint ? ` ···${key.hint}` : ' set'}` }
        : { kind: 'hair' as const, dot: 'off' as const, label: 'Set API key' }
  return (
    <header className="top">
      <div className="top__brand">
        <span className="qs-app">Quantum Sculptor</span>
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>voxels × Quantum Blur Core</span>
      </div>
      <div className="top__run qs-mono">
        {run.map((t, i) => (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span style={{ color: 'var(--qs-ink4)' }}>/</span>}
            <span style={{ color: i === 0 ? 'var(--qs-ink)' : 'var(--qs-ink2)' }}>{t}</span>
          </span>
        ))}
      </div>
      <div className="top__actions">
        <QPill kind={pill.kind} size="s" dot={pill.dot} label={pill.label} onClick={() => useStore.setState({ keyOpen: true })} />
        <QPill kind="ghost" size="s" label="Help" onClick={() => window.open('https://github.com/madebyrayz/quantum-sculptor#readme', '_blank')} />
      </div>
    </header>
  )
}
