// Top bar, kept quiet: mark and name, then Atlas status, theme and help.
import { MARK_DOTS, MARK_N } from '../mark'
import { TABS, useShell } from '../shell'
import { useStore } from '../store'
import { IconButton } from '../qs/Icon'

/** The mark (src/mark.ts): one point, blurred into its neighbours. */
export function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${MARK_N} ${MARK_N}`} aria-hidden className="top__mark">
      {MARK_DOTS.map(([x, y, r]) => <circle key={`${x}.${y}`} cx={x + 0.5} cy={y + 0.5} r={r} fill="var(--qs-ink)" />)}
    </svg>
  )
}

const NEXT = { system: 'light', light: 'dark', dark: 'system' } as const


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

/** Atlas: green when a key is set (blinking while a run is going), red when the key was rejected. */
export function AtlasStatus() {
  const key = useStore((s) => s.key)
  const job = useStore((s) => s.job)
  const error = useStore((s) => s.error)
  const rejected = !!error && /401|unauthor/i.test(error)
  const state = rejected ? 'bad' : job?.status === 'running' ? 'busy' : key?.set ? 'ok' : 'off'
  const label = rejected ? 'Atlas · key rejected' : job?.status === 'running' ? 'Atlas · running' : key?.set ? 'Atlas · live' : 'Atlas · no key'
  return (
    <button className="ux-status" onClick={() => useStore.setState({ keyOpen: true })} data-tip="Atlas API key" data-tip-desc="Set, test or clear the key.">
      <span className={`ux-dot ux-dot--${state}`} />{label}
    </button>
  )
}

export function ThemeButton() {
  const themePref = useStore((s) => s.themePref)
  const setTheme = useStore((s) => s.setTheme)
  return <IconButton size={28} name={themePref === 'system' ? 'auto' : themePref === 'light' ? 'sun' : 'moon'} title={`Theme: ${themePref === 'system' ? 'follows the system' : themePref} · click to change`} onClick={() => setTheme(NEXT[themePref])} />
}

/** The top bar: the mark, the name and the tabs; Atlas, theme and help on the right. What is loaded
 *  and the latest event live on the drawer row. */
export function TopBar() {
  const setHomeAsk = useShell((s) => s.setHomeAsk)
  const setTab = useShell((s) => s.setTab)
  return (
    <header className="top">
      <button className="top__brand" onClick={() => (useStore.getState().model ? setHomeAsk(true) : setTab('lab'))}
        data-tip="Back to the start" data-tip-desc="The start page: what Quantum Sculptor is, and the ways in.">
        <Mark size={18} />
        <span className="top__name">Quantum Sculptor</span>
      </button>
      <Tabs />
      <div className="top__actions">
        <AtlasStatus />
        <ThemeButton />
        <IconButton name="help" size={28} title="Help · README" onClick={() => window.open('https://github.com/madebyrayz/quantum-sculptor#readme', '_blank')} />
      </div>
    </header>
  )
}
