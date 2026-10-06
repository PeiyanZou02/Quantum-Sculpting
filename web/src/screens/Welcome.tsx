// The website's first screen over the Lab: the app runs in the visitor's browser, so it says so while
// the engine loads, then asks for a Moth Atlas key for the one engine that needs it. Once per visit.
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { engineState, onEngine, startEngine } from '../engine'
import { Dot } from './parts'

export const GET_KEY = 'https://platform.mothquantum.com/signin'
const SEEN = 'qs-welcome'

export function Welcome() {
  const [engine, setEngine] = useState(engineState)
  const key = useStore((s) => s.key)
  const [open, setOpen] = useState(() => { try { return !sessionStorage.getItem(SEEN) } catch { return true } })
  useEffect(() => { startEngine(); return onEngine(setEngine) }, [])
  if (!open || key?.set) return null
  const close = () => { try { sessionStorage.setItem(SEEN, '1') } catch { /* private mode */ } setOpen(false) }
  const addKey = () => { close(); useStore.setState({ keyOpen: true }) }
  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="kd" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <header className="kd__head">
          <span className="kd__label">Quantum Sculptor</span>
          <span id="welcome-title" className="kd__title">Runs in your browser</span>
          <button className="kd__close" onClick={close} aria-label="Close" data-tip="Close" data-tip-key="Esc">×</button>
        </header>
        <div className="kd__body">
          <p className="kd__p">
            Start from a shape or import your own model. Voxelising, Gauss, Emulate, Evolve and the mesh all run
            here, on your computer, with nothing to install.
          </p>
          <p className="kd__p">
            To send the grid to Moth's Quantum Blur Core on Atlas, add your own Moth API key. Get one from
            the Moth platform, then come back and paste it.
          </p>
          <span className="kd__test">
            <Dot live={engine.ready} /> {engine.failed ? `The engine did not start: ${engine.text}` : engine.ready ? 'Engine ready' : `Starting the engine · ${engine.text}`}
          </span>
          <a className="kd__link" href={GET_KEY} target="_blank" rel="noreferrer">Get a Moth API key ↗</a>
        </div>
        <footer className="kd__foot">
          <button className="kd__btn" onClick={close}>Explore without a key</button>
          <button className="kd__btn kd__btn--primary" onClick={addKey}>Add my key</button>
        </footer>
      </div>
    </div>
  )
}
