// Quantum Sculptor: a modular workspace, after Blender's, for sculpting with quantum processes.
// Panels (parameters, properties, scene, runtime, Atlas jobs) dock left, right or under the viewport;
// drag a tab to move it. The layout is saved per browser.
import { useEffect, useState } from 'react'
import { useStore } from './store'
import { onNet, onRestart } from './api'
import './styles/layout.css'
import { TopBar } from './screens/TopBar'
import { InputPane } from './screens/InputPane'
import { Stage } from './screens/Stage'
import { OutputPane } from './screens/OutputPane'
import { ScenePanel } from './screens/ScenePanel'
import { QuantumPanel } from './screens/QuantumPanel'
import { EvolvePanel } from './screens/EvolvePanel'
import { RuntimePanel, AtlasPanel } from './screens/Terminal'
import { KeyDialog } from './screens/KeyDialog'
import { Toasts } from './screens/Toasts'
import { TooltipLayer } from './qs/Tooltip'
import { usePresent } from './present'
import { PresentBar } from './screens/PresentBar'
import { PresentPanel } from './screens/PresentPanel'
import { Dock, type PanelDef } from './dock/Dock'
import { closePanel, findPanel, loadLayout, movePanel, saveLayout, type DockLayout } from './dock/layout'
import './styles/system.css'
import './styles/bento.css'

const PANELS: PanelDef[] = [
  { id: 'params', title: 'Parameters', icon: 'sliceTool', render: () => <InputPane /> },
  { id: 'scene', title: 'Scene', icon: 'layers', render: () => <ScenePanel /> },
  { id: 'props', title: 'Properties', icon: 'model', render: () => <OutputPane /> },
  { id: 'quantum', title: 'Quantum', icon: 'quantum', render: () => <QuantumPanel /> },
  { id: 'evolve', title: 'Evolve', icon: 'entangle', render: () => <EvolvePanel /> },
  { id: 'runtime', title: 'Runtime', icon: 'terminal', render: () => <RuntimePanel /> },
  { id: 'atlas', title: 'Atlas jobs', icon: 'atlas', render: () => <AtlasPanel /> },
]
const IDS = PANELS.map((p) => p.id)
const DEFAULT_LAYOUT: DockLayout = {
  zones: {
    left: [{ id: 'a-params', tabs: ['params'], active: 'params', size: 1 }],
    right: [
      { id: 'a-scene', tabs: ['scene'], active: 'scene', size: 0.62 },
      { id: 'a-props', tabs: ['props', 'quantum', 'evolve'], active: 'props', size: 1.38 },
    ],
    bottom: [{ id: 'a-runtime', tabs: ['runtime', 'atlas'], active: 'runtime', size: 1 }],
  },
  width: { left: 320, right: 330 },
  height: { bottom: 190 },
}
const KEY = 'qs-dock-v3'

export default function App() {
  const init = useStore((s) => s.init)
  const keyOpen = useStore((s) => s.keyOpen)
  const mode = usePresent((p) => p.mode)
  const bare = usePresent((p) => p.bare)
  const drawer = usePresent((p) => p.drawer)
  const [layout, setLayout] = useState(() => loadLayout(KEY, DEFAULT_LAYOUT, IDS))
  const onLayout = (l: DockLayout) => { setLayout(l); saveLayout(KEY, l) }

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

  return (
    <div className={'app' + (mode === 'present' ? ' app--present' : '') + (bare ? ' app--bare' : '') + (mode === 'present' && drawer && !bare ? ' app--drawer' : '')}>
      <TopBar
        panels={PANELS.map((p) => ({ id: p.id, title: p.title, icon: p.icon, shown: !!findPanel(layout, p.id) }))}
        onTogglePanel={(id) => {
          if (findPanel(layout, id)) return onLayout(closePanel(layout, id))
          // show it where the default layout keeps it
          const home = findPanel(DEFAULT_LAYOUT, id)
          onLayout(movePanel(layout, id, home && layout.zones[home.zone].length ? { zone: home.zone, area: layout.zones[home.zone][0].id } : { zone: home?.zone ?? 'right', index: 0 }))
        }}
      />
      <div className="app__dock">
        <Dock panels={PANELS} layout={layout} onLayout={onLayout} center={<Stage />}
          onReset={() => onLayout(structuredClone(DEFAULT_LAYOUT))} />
      </div>
      {mode === 'present' && <PresentBar />}
      {mode === 'present' && drawer && !bare && <PresentPanel />}
      {keyOpen && <KeyDialog />}
      <Toasts />
      <TooltipLayer />
    </div>
  )
}
