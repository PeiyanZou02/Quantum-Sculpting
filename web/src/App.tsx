// Quantum Sculpting: an app for sculpting with quantum processes. Three tabs over one workspace:
// Lab makes the geometry and looks into it (parameters, the view, properties, the drawer), Compose
// composes the display and its output (Present mode), Notes holds the research. The view stays
// mounted throughout. Columns fold and swap sides; the drawer docks under the view or full width.
import { useEffect } from 'react'
import { useStore, type Stage as FocusStage } from './store'
import { onNet, onRestart } from './api'
import { useShell, type DrawerTab } from './shell'
import './styles/layout.css'
import { TopBar } from './screens/TopBar'
import { InputPane } from './screens/InputPane'
import { Stage } from './screens/Stage'
import { OutputPane } from './screens/OutputPane'
import { KeyDialog } from './screens/KeyDialog'
import { Toasts } from './screens/Toasts'
import { TooltipLayer } from './qs/Tooltip'
import { usePresent } from './present'
import { PresentBar } from './screens/PresentBar'
import { ComposeLeft, ComposeRight } from './screens/PresentPanel'
import { Column, Drawer, NotesPage } from './screens/Shell'
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
  const bare = usePresent((p) => p.bare)
  const sh = useShell()
  const tab = sh.tab

  // the drawer follows what you are working on
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.focus.stage === prev.focus.stage && s.q.mode === prev.q.mode) return
    const d = drawerFor(s.focus.stage, s.q.mode)
    if (d !== useShell.getState().drawer) useShell.setState({ drawer: d })   // switch, but leave a folded drawer folded
  }), [])

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
  const lab = tab === 'lab'
  // Lab: Parameters | view | Properties (or swapped). Compose: what goes on | view | how it leaves.
  const cols = lab
    ? [{ t: 'Parameters', icon: 'sliceTool', body: <InputPane /> }, { t: 'Properties', icon: 'model', body: <OutputPane /> }]
    : [{ t: 'Compose', icon: 'layers', body: <ComposeLeft /> }, { t: 'Output', icon: 'export', body: <ComposeRight /> }]
  const [a, b] = sh.swap ? [cols[1], cols[0]] : cols
  const full = sh.dock === 'full' || !lab
  return (
    <div className={`app ux ux--${tab}` + (tab === 'compose' ? ' app--present' : '') + (bare ? ' app--bare' : '')}>
      {!bare && <TopBar />}
      <div className="ux-body">
        {sides && (
          <Column side="left" title={a.t} icon={a.icon} open={sh.leftOpen} width={sh.left} onWidth={(v) => sh.setSize({ left: v })}
            onFold={(v) => sh.setLayout({ leftOpen: v })} onSwap={() => sh.setLayout({ swap: !sh.swap })}>{a.body}</Column>
        )}
        <div className="ux-center">
          <div className="ux-view"><Stage /></div>
          {!full && !bare && <Drawer />}
        </div>
        {sides && (
          <Column side="right" title={b.t} icon={b.icon} open={sh.rightOpen} width={sh.right} onWidth={(v) => sh.setSize({ right: v })}
            onFold={(v) => sh.setLayout({ rightOpen: v })} onSwap={() => sh.setLayout({ swap: !sh.swap })}>{b.body}</Column>
        )}
        {tab === 'notes' && <NotesPage />}
      </div>
      {full && !bare && <div className="ux-foot"><Drawer content={lab} /></div>}
      {tab === 'compose' && <PresentBar />}
      {keyOpen && <KeyDialog />}
      <Toasts />
      <TooltipLayer />
    </div>
  )
}
