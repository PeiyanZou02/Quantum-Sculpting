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
import { StatusBar, RuntimePanel, AtlasPanel } from './screens/Terminal'
import { KeyDialog } from './screens/KeyDialog'
import { Toasts } from './screens/Toasts'
import { TooltipLayer } from './qs/Tooltip'
import { Dock, type PanelDef } from './dock/Dock'
import { loadLayout, saveLayout, type DockLayout } from './dock/layout'

const PANELS: PanelDef[] = [
  { id: 'params', title: 'Parameters', icon: 'sliceTool', render: () => <InputPane /> },
  { id: 'scene', title: 'Scene', icon: 'layers', render: () => <ScenePanel /> },
  { id: 'props', title: 'Properties', icon: 'model', render: () => <OutputPane /> },
  { id: 'runtime', title: 'Runtime', icon: 'terminal', render: () => <RuntimePanel /> },
  { id: 'atlas', title: 'Atlas jobs', icon: 'atlas', render: () => <AtlasPanel /> },
]
const IDS = PANELS.map((p) => p.id)
const DEFAULT_LAYOUT: DockLayout = {
  zones: {
    left: [{ id: 'a-params', tabs: ['params'], active: 'params', size: 1 }],
    right: [
      { id: 'a-scene', tabs: ['scene'], active: 'scene', size: 0.62 },
      { id: 'a-props', tabs: ['props'], active: 'props', size: 1.38 },
    ],
    bottom: [{ id: 'a-runtime', tabs: ['runtime', 'atlas'], active: 'runtime', size: 1 }],
  },
  width: { left: 320, right: 330 },
  height: { bottom: 190 },
}
const KEY = 'qs-dock-v2'

export default function App() {
  const init = useStore((s) => s.init)
  const keyOpen = useStore((s) => s.keyOpen)
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
    <div className="app">
      <TopBar />
      <div className="app__dock">
        <Dock panels={PANELS} layout={layout} onLayout={onLayout} center={<Stage />}
          onReset={() => onLayout(structuredClone(DEFAULT_LAYOUT))} />
      </div>
      <StatusBar />
      {keyOpen && <KeyDialog />}
      <Toasts />
      <TooltipLayer />
    </div>
  )
}
