// Leaving the model for the start page: says what goes and what stays, and offers to export the mesh
// first. A Carbon modal: header, body, and three buttons edge to edge (stay, export then go, go).
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useShell } from '../shell'

export function HomeDialog() {
  const st = useStore()
  const setAsk = useShell((s) => s.setHomeAsk)
  const setTab = useShell((s) => s.setTab)
  const [busy, setBusy] = useState(false)
  const close = () => setAsk(false)
  const go = () => { st.goHome(); setTab('lab'); setAsk(false) }
  const exportThenGo = async () => {
    setBusy(true)
    try {
      await st.exportStl()
      const f = useStore.getState().exported?.file
      if (f) window.open(`/api/download/${encodeURIComponent(f)}`)
      go()
    } finally { setBusy(false) }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsk(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [setAsk])
  const name = st.model ? (st.model.builtin ? 'the test cup' : st.model.file) : 'this model'
  const atlas = st.job?.status === 'running'
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="kd" role="alertdialog" aria-modal="true" aria-labelledby="home-title" aria-describedby="home-body">
        <header className="kd__head">
          <span className="kd__label">Quantum Sculptor</span>
          <span id="home-title" className="kd__title">Back to the start?</span>
          <button className="kd__close" onClick={close} aria-label="Stay" data-tip="Stay" data-tip-key="Esc">×</button>
        </header>
        <div className="kd__body" id="home-body">
          <p className="kd__p">You leave {name} and what was made from it: the grid, the {st.q.mode === 'nations' ? 'Evolve history' : 'quantum result'} and the mesh.</p>
          <ul className="kd__list">
            <li>The model stays under Recent, so you can open it again; its steps would run again.</li>
            <li>Settings, compositions and animations are kept. Atlas results come back from the cache.</li>
            {atlas && <li>The Atlas run going now carries on there; its result is cached when it is done.</li>}
            {st.report && <li>To keep the mesh, export it first.</li>}
          </ul>
        </div>
        <footer className={'kd__foot' + (st.report ? ' kd__foot--3' : '')}>
          <button className="kd__btn kd__btn--ghost" onClick={close} autoFocus>Stay</button>
          {st.report && <button className="kd__btn" disabled={busy} onClick={() => { exportThenGo().catch(() => {}) }}>{busy ? 'Exporting…' : 'Export, then go'}</button>}
          <button className="kd__btn kd__btn--danger" disabled={busy} onClick={go}>Go to the start</button>
        </footer>
      </div>
    </div>
  )
}
