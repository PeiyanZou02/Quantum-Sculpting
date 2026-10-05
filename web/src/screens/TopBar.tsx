// Top bar, kept quiet: mark and name, then Atlas status, theme and help.
import { useStore } from '../store'
import { QPill } from '../qs/QPill'

export function Mark({ size = 18 }: { size?: number }) {
  const o = [0.22, 0.5, 0.22, 0.5, 1, 0.5, 0.22, 0.5, 0.22]
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="2.5" y="2.5" width="27" height="27" fill="none" stroke="var(--qs-ink)" />
      {o.map((a, i) => <rect key={i} x={6 + (i % 3) * 7} y={6 + Math.floor(i / 3) * 7} width="6" height="6" fill="var(--qs-ink)" opacity={a} />)}
    </svg>
  )
}

const NEXT = { system: 'light', light: 'dark', dark: 'system' } as const

export function TopBar() {
  const key = useStore((s) => s.key)
  const job = useStore((s) => s.job)
  const error = useStore((s) => s.error)
  const themePref = useStore((s) => s.themePref)
  const setTheme = useStore((s) => s.setTheme)
  const rejected = !!error && /401|unauthor/i.test(error)
  const dot = rejected ? 'off' : job?.status === 'running' ? 'busy' : key?.set ? 'on' : 'off'
  const label = rejected ? 'Atlas · key rejected' : job?.status === 'running' ? 'Atlas · running' : key?.set ? 'Atlas' : 'Atlas · no key'
  return (
    <header className="top">
      <div className="top__brand">
        <Mark />
        <span className="qs-app" style={{ fontSize: 17 }}>Quantum Sculptor</span>
      </div>
      <span style={{ flex: 1 }} />
      <div className="top__actions">
        <QPill kind={rejected ? 'line' : 'ghost'} size="s" dot={dot} label={label} title="Atlas API key" onClick={() => useStore.setState({ keyOpen: true })} />
        <QPill kind="ghost" size="s" label={themePref === 'system' ? 'Auto' : themePref === 'light' ? 'Light' : 'Dark'} title="Theme: auto, light or dark" onClick={() => setTheme(NEXT[themePref])} />
        <QPill kind="ghost" size="s" label="Help" onClick={() => window.open('https://github.com/madebyrayz/quantum-sculptor#readme', '_blank')} />
      </div>
    </header>
  )
}
