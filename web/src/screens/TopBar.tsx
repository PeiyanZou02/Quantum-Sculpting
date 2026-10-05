// Top bar, kept quiet: mark and name, then Atlas status, theme and help.
import { useStore } from '../store'
import { QPill } from '../qs/QPill'
import { IconButton } from '../qs/Icon'
import { Popover, PopSection, Check } from '../qs/Popover'
import { Spinner } from './parts'
import { usePresent } from '../present'

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

export interface PanelToggle { id: string; title: string; icon: string; shown: boolean }

/** What is loaded and what the service is doing, in one quiet line. */
function Now() {
  const model = useStore((s) => s.model)
  const grid = useStore((s) => s.grid)
  const busy = useStore((s) => s.busy)
  const job = useStore((s) => s.job)
  const log = useStore((s) => s.log)
  const last = [...log].reverse().find((l) => l.level !== 'net')
  const doing = busy.model ? 'Opening' : busy.vox ? 'Voxelising' : busy.proc ? 'Processing' : busy.mesh ? 'Meshing' : busy.export ? 'Exporting' : null
  if (!model) return <div className="top__now"><span className="top__dim">No model loaded</span></div>
  return (
    <div className="top__now">
      <span className="top__file">{model.builtin ? 'test_cup.stl' : model.file}</span>
      <span className="top__dim">{model.faces.toLocaleString()} faces{grid ? ` · ${grid.n}³ · ${grid.solid.toLocaleString()} solid` : ''}</span>
      {job?.status === 'running' && <span className="top__state"><Spinner /> Atlas · {job.tiles_done}/{job.tiles_total} tiles</span>}
      {doing ? <span className="top__state"><Spinner /> {doing}…</span>
        : last && <span className={'top__last' + (last.level !== 'info' ? ' top__last--warn' : '')} data-tip="Latest event" data-tip-desc="The full history is in the Runtime panel.">{last.level !== 'info' ? '! ' : ''}{last.text}</span>}
    </div>
  )
}

function ModeSwitch() {
  const mode = usePresent((p) => p.mode)
  const setMode = usePresent((p) => p.setMode)
  return (
    <div className="modes" role="tablist" aria-label="Mode">
      <button role="tab" aria-selected={mode === 'lab'} className={'modes__b' + (mode === 'lab' ? ' modes__b--on' : '')} onClick={() => setMode('lab')}
        data-tip="Lab" data-tip-desc="The research workspace: parameters, algorithms and panels.">Lab</button>
      <button role="tab" aria-selected={mode === 'present'} className={'modes__b' + (mode === 'present' ? ' modes__b--on' : '')} onClick={() => setMode('present')}
        data-tip="Present" data-tip-desc="The display: the geometry in a composed HUD, for screenshots and recordings.">Present</button>
    </div>
  )
}

function PanelsMenu({ panels, onToggle }: { panels: PanelToggle[]; onToggle: (id: string) => void }) {
  return (
    <Popover icon="layers" title="Panels" desc="Show or hide each panel. Drag a panel's tab to move it." width={240} onIcon={undefined}>
      <PopSection>
        {panels.map((p) => (
          <Check key={p.id} label={p.title} note={p.shown ? 'shown' : 'hidden'} checked={p.shown} onChange={() => onToggle(p.id)} />
        ))}
      </PopSection>
    </Popover>
  )
}

export function TopBar({ panels, onTogglePanel }: { panels: PanelToggle[]; onTogglePanel: (id: string) => void }) {
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
      <ModeSwitch />
      <Now />
      <div className="top__actions">
        <PanelsMenu panels={panels} onToggle={onTogglePanel} />
        <QPill kind={rejected ? 'line' : 'ghost'} size="s" dot={dot} label={label} title="Atlas API key" onClick={() => useStore.setState({ keyOpen: true })} />
        <IconButton name={themePref === 'system' ? 'auto' : themePref === 'light' ? 'sun' : 'moon'} title={`Theme: ${themePref === 'system' ? 'follows the system' : themePref} · click to change`} onClick={() => setTheme(NEXT[themePref])} />
        <IconButton name="help" title="Help · README" onClick={() => window.open('https://github.com/madebyrayz/quantum-sculptor#readme', '_blank')} />
      </div>
    </header>
  )
}
