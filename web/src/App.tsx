// Quantum Sculptor: a fixed 1920 × 1080 layout (the design's coordinates are exact at that size)
// scaled to fit the window.
import { useEffect, useLayoutEffect, useState } from 'react'
import { useStore } from './store'
import { onRestart } from './api'
import { Chrome } from './screens/Chrome'
import { ViewPane } from './screens/ViewPane'
import { Rail } from './screens/Rail'
import { Inspector } from './screens/Inspector'
import { Floor } from './screens/Floor'
import { KeyDialog } from './screens/KeyDialog'

const W = 1920, H = 1080

function useFit() {
  const [s, setS] = useState(1)
  useLayoutEffect(() => {
    const fit = () => setS(Math.min(window.innerWidth / W, window.innerHeight / H))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return s
}

export default function App() {
  const s = useFit()
  const init = useStore((st) => st.init)
  const keyOpen = useStore((st) => st.keyOpen)

  useEffect(() => {
    init()
    return onRestart(() => {
      useStore.getState().pushLog('The local service restarted; reloading state', 'warn')
      init()
    })
  }, [init])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--qs-bg)', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', width: W, height: H,
          left: (window.innerWidth - W * s) / 2, top: (window.innerHeight - H * s) / 2,
          transform: `scale(${s})`, transformOrigin: '0 0',
        }}
      >
        <ViewPane />
        <Chrome />
        <Rail />
        <Inspector />
        <Floor />
        {keyOpen && <KeyDialog />}
      </div>
    </div>
  )
}
