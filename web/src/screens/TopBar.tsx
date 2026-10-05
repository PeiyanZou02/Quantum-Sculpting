// Top bar, kept quiet: mark and name, then Atlas status, theme and help.
import { MARK_DOTS, MARK_N } from '../mark'
import { TABS, useShell } from '../shell'
import { useStore } from '../store'
import { QPill } from '../qs/QPill'
import { IconButton } from '../qs/Icon'
import { Spinner } from './parts'

/** The mark (src/mark.ts): one point, blurred into its neighbours. */
export function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${MARK_N} ${MARK_N}`} aria-hidden className="top__mark">
      {MARK_DOTS.map(([x, y, r]) => <circle key={`${x}.${y}`} cx={x + 0.5} cy={y + 0.5} r={r} fill="var(--qs-ink)" />)}
    </svg>
  )
}

const NEXT = { system: 'light', light: 'dark', dark: 'system' } as const


/** What is loaded and what the service is doing, in one quiet line. */
function Now() {
  const model = useStore((s) => s.model)
  const grid = useStore((s) => s.grid)
  const busy = useStore((s) => s.busy)
  const job = useStore((s) => s.job)
  const log = useStore((s) => s.log)
  const last = [...log].reverse().find((l) => l.level !== 'net')
  const doing = busy.model ? 'Opening' : busy.vox ? 'Voxelising' : busy.proc ? 'Processing' : busy.mesh ? 'Meshing' : busy.export ? 'Exporting' : null
  if (!model) return <div className="top__now"><span className="top__event">No model loaded</span></div>
  const facts: [string, string][] = [
    ['Model', model.builtin ? 'test_cup.stl' : model.file],
    ['Faces', model.faces.toLocaleString()],
    ...(grid ? [['Grid', `${grid.n}³`], ['Solid', grid.solid.toLocaleString()]] as [string, string][] : []),
  ]
  return (
    <div className="top__now">
      <dl className="top__facts">
        {facts.map(([k, v]) => <div key={k} className="top__fact"><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {job?.status === 'running' && <span className="top__state"><Spinner /> Atlas {job.tiles_done}/{job.tiles_total} tiles</span>}
      {doing ? <span className="top__state"><Spinner /> {doing}</span>
        : last && <span className={'top__event' + (last.level !== 'info' ? ' top__event--warn' : '')} data-tip="Latest event" data-tip-desc="The full history is in the Runtime panel.">{last.level !== 'info' ? '! ' : ''}{last.text}</span>}
    </div>
  )
}

function Tabs() {
  const tab = useShell((s) => s.tab)
  const setTab = useShell((s) => s.setTab)
  return (
    <nav className="top__tabs" role="tablist" aria-label="Workspace">
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={'top__tab' + (tab === t.id ? ' top__tab--on' : '')} onClick={() => setTab(t.id)}
          data-tip={t.t} data-tip-desc={t.d}>{t.t}</button>
      ))}
    </nav>
  )
}

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
        <span className="top__name">Quantum Sculpting</span>
      </div>
      <Tabs />
      <Now />
      <div className="top__actions">
        <QPill kind={rejected ? 'line' : 'ghost'} size="s" dot={dot} label={label} title="Atlas API key" onClick={() => useStore.setState({ keyOpen: true })} />
        <IconButton name={themePref === 'system' ? 'auto' : themePref === 'light' ? 'sun' : 'moon'} title={`Theme: ${themePref === 'system' ? 'follows the system' : themePref} · click to change`} onClick={() => setTheme(NEXT[themePref])} />
        <IconButton name="help" title="Help · README" onClick={() => window.open('https://github.com/madebyrayz/quantum-sculptor#readme', '_blank')} />
      </div>
    </header>
  )
}
