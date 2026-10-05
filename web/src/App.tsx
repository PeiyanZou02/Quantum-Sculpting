// Quantum Sculpting: an app for sculpting with quantum processes. Four tabs over one workspace:
// Lab makes the geometry (inputs left, the view, outputs right, the runtime drawer under it), Explore
// looks into the quantum step (the circuit, or Evolve's nations turn by turn), Compose composes the
// display and its output (Present mode), Notes holds the research. The view stays mounted throughout.
import { useEffect } from 'react'
import { useStore, type Stage as FocusStage } from './store'
import { onNet, onRestart } from './api'
import { useShell, type DrawerTab } from './shell'
import './styles/layout.css'
import { TopBar } from './screens/TopBar'
import { InputPane } from './screens/InputPane'
import { Stage } from './screens/Stage'
import { OutputPane } from './screens/OutputPane'
import { QuantumPanel } from './screens/QuantumPanel'
import { EvolvePanel } from './screens/EvolvePanel'
import { KeyDialog } from './screens/KeyDialog'
import { Toasts } from './screens/Toasts'
import { TooltipLayer } from './qs/Tooltip'
import { usePresent } from './present'
import { PresentBar } from './screens/PresentBar'
import { ComposeLeft, ComposeRight } from './screens/PresentPanel'
import { Drawer, NotesPage, Resizer } from './screens/Shell'
import './styles/system.css'
import './styles/bento.css'
import './styles/type.css'
import './ui/ui.css'
import './styles/app.css'

/** The drawer tab brought forward for each stage of the focus. */
function drawerFor(stage: FocusStage, mode: string): DrawerTab {
  return stage === 'evolve' ? 'evlog' : (stage === 'quantum' || stage === 'scan') && mode === 'atlas' ? 'atlas' : 'runtime'
}

export default function App() {
  const init = useStore((s) => s.init)
  const keyOpen = useStore((s) => s.keyOpen)
  const mode = useStore((s) => s.q.mode)
  const bare = usePresent((p) => p.bare)
  const sh = useShell()
  const tab = sh.tab

  // the drawer follows what you are working on
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.focus.stage === prev.focus.stage && s.q.mode === prev.q.mode) return
    const d = drawerFor(s.focus.stage, s.q.mode)
    if (d !== useShell.getState().drawer) useShell.setState({ drawer: d })   // switch, but leave a folded drawer folded
  }), [])
  // Explore looks at the quantum step
  useEffect(() => {
    if (tab !== 'explore') return
    const st = useStore.getState()
    st.setFocus(st.q.mode === 'nations' ? 'evolve' : 'quantum', 'Exploring the quantum step')
  }, [tab])

  useEffect(() => {
    const st = useStore.getState()
    st.setTheme(st.themePref)
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const follow = () => { const s = useStore.getState(); if (s.themePref === 'system') s.setTheme('system') }
    mq.addEventListener('change', follow)
    const offNet = onNet((e) => useStore.getState().pushLog(
      `${e.method.padEnd(4)} ${e.path.replace(/\?.*$/, '')}  ${e.status || (e.quiet ? 'cancelled' : 'failed')}  ${Math.round(e.ms)} ms`, 'net'))
    init()
    const offBoot = onRestart(() => {
      useStore.getState().pushLog('The local service restarted; reloading state', 'warn')
      init()
    })
    return () => { mq.removeEventListener('change', follow); offNet(); offBoot() }
  }, [init])

  const sides = tab !== 'notes' && !bare
  const left = tab === 'lab' ? <InputPane /> : tab === 'explore' ? <InputPane only="quantum" /> : tab === 'compose' ? <ComposeLeft /> : null
  const right = tab === 'lab' ? <OutputPane /> : tab === 'explore' ? (mode === 'nations' ? <EvolvePanel /> : <QuantumPanel />) : tab === 'compose' ? <ComposeRight /> : null
  return (
    <div className={`app ux ux--${tab}` + (tab === 'compose' ? ' app--present' : '') + (bare ? ' app--bare' : '')}>
      {!bare && <TopBar />}
      <div className="ux-body">
        {sides && (
          <aside className="ux-side ux-side--l" style={{ width: sh.left }}>
            {left}
            <Resizer edge="left" value={sh.left} min={240} max={520} set={(v) => sh.setSize({ left: v })} />
          </aside>
        )}
        <div className="ux-center">
          <div className="ux-view"><Stage /></div>
          {(tab === 'lab' || tab === 'explore') && !bare && <Drawer />}
        </div>
        {sides && (
          <aside className="ux-side ux-side--r" style={{ width: sh.right }}>
            <Resizer edge="right" value={sh.right} min={260} max={560} set={(v) => sh.setSize({ right: v })} />
            {right}
          </aside>
        )}
        {tab === 'notes' && <NotesPage />}
      </div>
      {tab === 'compose' && <PresentBar />}
      {keyOpen && <KeyDialog />}
      <Toasts />
      <TooltipLayer />
    </div>
  )
}
