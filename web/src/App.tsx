// Quantum Sculptor: an app for sculpting with quantum processes. Two tabs: Lab is the one workspace
// (parameters, the view with the HUD composed over it, properties from the model to the output, the
// drawer); Research holds the research. Columns fold and swap sides; the drawer docks under the view or
// along the whole window.
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
import { BarePeek } from './screens/PresentBar'
import { Column, Drawer, ResearchPage } from './screens/Shell'
import { Home } from './screens/Home'
import { HomeDialog } from './screens/HomeDialog'
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
  const hasModel = useStore((s) => !!s.model)
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

  const lab = tab === 'lab'
  // no model open: the start page takes the whole window under the top bar
  const home = lab && !hasModel
  const sides = lab && !bare && !home
  // Parameters | view | Properties, or swapped
  const cols = [{ t: 'Parameters', icon: 'sliceTool', body: <InputPane /> }, { t: 'Properties', icon: 'model', body: <OutputPane /> }]
  const [a, b] = sh.swap ? [cols[1], cols[0]] : cols
  const full = sh.dock === 'full' && !home
  return (
    <div className={`app ux ux--${tab}` + (bare ? ' app--bare' : '')}>
      {!bare && <TopBar />}
      <div className="ux-body">
        {sides && (
          <Column side="left" title={a.t} icon={a.icon} open={sh.leftOpen} width={sh.left} onWidth={(v) => sh.setSize({ left: v })}
            onFold={(v) => sh.setLayout({ leftOpen: v })} onSwap={() => sh.setLayout({ swap: !sh.swap })}>{a.body}</Column>
        )}
        <div className="ux-center">
          <div className="ux-view"><Stage /></div>
          {!full && !bare && !home && <Drawer />}
        </div>
        {sides && (
          <Column side="right" title={b.t} icon={b.icon} open={sh.rightOpen} width={sh.right} onWidth={(v) => sh.setSize({ right: v })}
            onFold={(v) => sh.setLayout({ rightOpen: v })} onSwap={() => sh.setLayout({ swap: !sh.swap })}>{b.body}</Column>
        )}
        {tab === 'research' && <ResearchPage />}
        {home && <Home />}
      </div>
      {full && !bare && <div className="ux-foot"><Drawer /></div>}
      <BarePeek />
      {keyOpen && <KeyDialog />}
      {sh.homeAsk && <HomeDialog />}
      <Toasts />
      <TooltipLayer />
    </div>
  )
}
