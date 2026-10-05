// Quantum Sculptor. Research layout after Peiyan's Quantum Sculpting interface, drawn with our design
// system and split by role: INPUT (left), DISPLAY (centre), OUTPUT (right), runtime terminal (bottom).
import { useEffect } from 'react'
import { useStore } from './store'
import { onNet, onRestart } from './api'
import './styles/layout.css'
import { TopBar } from './screens/TopBar'
import { InputPane } from './screens/InputPane'
import { Stage } from './screens/Stage'
import { OutputPane } from './screens/OutputPane'
import { Terminal } from './screens/Terminal'
import { KeyDialog } from './screens/KeyDialog'
import { Toasts } from './screens/Toasts'

export default function App() {
  const init = useStore((s) => s.init)
  const keyOpen = useStore((s) => s.keyOpen)

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
      <InputPane />
      <Stage />
      <OutputPane />
      <Terminal />
      {keyOpen && <KeyDialog />}
      <Toasts />
    </div>
  )
}
