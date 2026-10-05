// Quantum Sculptor. Research layout after Peiyan's Quantum Sculpting interface, drawn with our
// design system: options left, volumetric workspace centre, inspection right, job status bottom.
import { useEffect } from 'react'
import { useStore } from './store'
import { onRestart } from './api'
import './styles/layout.css'
import { TopBar } from './screens/TopBar'
import { Sidebar } from './screens/Sidebar'
import { Stage } from './screens/Stage'
import { InspectorPane } from './screens/InspectorPane'
import { StatusBar } from './screens/StatusBar'
import { KeyDialog } from './screens/KeyDialog'
import { Toasts } from './screens/Toasts'

export default function App() {
  const init = useStore((s) => s.init)
  const keyOpen = useStore((s) => s.keyOpen)

  useEffect(() => {
    init()
    return onRestart(() => {
      useStore.getState().pushLog('The local service restarted; reloading state', 'warn')
      init()
    })
  }, [init])

  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <Stage />
      <InspectorPane />
      <StatusBar />
      {keyOpen && <KeyDialog />}
      <Toasts />
    </div>
  )
}
