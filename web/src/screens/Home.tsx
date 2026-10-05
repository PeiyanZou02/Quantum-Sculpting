// The start page, the whole window: what Quantum Sculptor is, how a model goes through it, and the ways
// in (a built-in shape, your own model, a recent file). Shown whenever no model is open; the title in
// the top bar brings it back.
import { useRef, useState } from 'react'
import { useStore } from '../store'
import { Icon } from '../qs/Icon'
import { MARK_DOTS, MARK_N } from '../mark'
import { MODEL_EXT } from './modelExt'
import { ShapePicker } from './Shapes'

const STEPS: { icon: string; t: string; d: string }[] = [
  { icon: 'model', t: 'Model', d: 'Start from a built-in shape or your own mesh, and set which way is up.' },
  { icon: 'grid', t: 'Voxelise', d: 'The model becomes a grid of cells, 16³ to 256³; each cell holds how much of it the model fills.' },
  { icon: 'quantum', t: 'Quantum', d: 'Each axis of the grid is written onto qubits and turned by rotations that mix neighbouring cells: the Quantum Blur Core, emulated here or run on Atlas. Or Evolve: the model splits into nations, one qubit each, that grow, fortify and attack turn by turn.' },
  { icon: 'print', t: 'Mesh', d: 'A printable surface is cut from the result at the level you choose, checked and exported as STL.' },
  { icon: 'layers', t: 'Compose', d: 'Marks, readouts and quantum glyphs around the object, animated, recorded and exported as images, video or 3D.' },
]

export function Home() {
  const st = useStore()
  const file = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div className={'home' + (over ? ' home--over' : '')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false) }}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) st.upload(f) }}>
      <div className="home__grid">
        <section className="home__intro">
          <svg className="home__mark" width="88" height="88" viewBox={`0 0 ${MARK_N} ${MARK_N}`} aria-hidden>
            {MARK_DOTS.map(([x, y, r]) => <circle key={`${x}.${y}`} cx={x + 0.5} cy={y + 0.5} r={r} fill="var(--qs-ink)" />)}
          </svg>
          <h1 className="home__title">{over ? 'Release to open the model' : 'Quantum Sculptor'}</h1>
          <p className="home__lead">Sculpting with quantum processes. A model is voxelised, its grid passes through a quantum circuit, and a printable form is cut from what comes out.</p>

          <div className="home__start">
            <span className="home__k">Start from a shape</span>
            <ShapePicker big />
            <span className="home__k">Or your own model</span>
            <button className={'landing__import' + (over ? ' landing__import--over' : '')} onClick={() => file.current?.click()}>
              <Icon name="upload" size={24} />
              <span className="landing__ct">Import a model</span>
              <span className="landing__ext">{MODEL_EXT.join(' ')} · or drop it here</span>
            </button>
            <input ref={file} type="file" hidden accept={MODEL_EXT.join(',')} onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) st.upload(f)
              e.target.value = ''
            }} />
            {st.recent.length > 0 && (
              <>
                <span className="home__k">Recent</span>
                <div className="landing__recent">
                  {st.recent.slice(0, 6).map((r) => <button key={r.name} className="landing__file" onClick={() => st.openRecent(r.name)}>{r.name}</button>)}
                </div>
              </>
            )}
            {st.busy.model && <span className="home__k">Opening…</span>}
          </div>
        </section>

        <section className="home__how" aria-label="How it works">
          <span className="home__k">How it works</span>
          <ol className="home__steps">
            {STEPS.map((s, i) => (
              <li key={s.t} className="home__step">
                <Icon name={s.icon} size={24} />
                <span className="home__no">{String(i + 1).padStart(2, '0')}</span>
                <span className="home__st">{s.t}</span>
                <p className="home__sd">{s.d}</p>
              </li>
            ))}
          </ol>
          <p className="home__note">The built-in shapes run every step by themselves. Your own models wait for each step's Run, since they can be large.</p>
        </section>
      </div>
    </div>
  )
}
