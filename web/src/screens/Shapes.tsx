// Shapes to start from: three primitives and four Calabi-Yau cross-sections, as line drawings with their names.
import { useStore } from '../store'
import { SHAPES, cyDegree, shapeFile, type ShapeId } from '../primitives'

/** A shape drawn in one line weight, on a 24 grid. */
function ShapeIcon({ id, size = 24 }: { id: ShapeId; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {id === 'sphere' && <><circle {...p} cx="12" cy="12" r="8.5" /><ellipse {...p} cx="12" cy="12" rx="8.5" ry="3" /></>}
      {id === 'cube' && <><path {...p} d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z" /><path {...p} d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5" /></>}
      {id === 'pyramid' && <><path {...p} d="M12 3.5L3.5 17l8.5 3.5 8.5-3.5z" /><path {...p} d="M12 3.5v17" /></>}
      {/* Calabi-Yau of degree n: n petals round the centre, as the patches meet in the projection */}
      {cyDegree(id) > 0 && Array.from({ length: cyDegree(id) }, (_, k) => (
        <ellipse key={k} {...p} cx="12" cy="12" rx="8.5" ry={8.5 / cyDegree(id) + 1} transform={`rotate(${(180 / cyDegree(id)) * k} 12 12)`} />
      ))}
    </svg>
  )
}

/** The shapes as a grid of tiles; a click opens one as the model. */
export function ShapePicker({ big }: { big?: boolean }) {
  const upload = useStore((s) => s.upload)
  const busy = useStore((s) => s.busy.model)
  // the built-in shapes are small: their steps run by themselves
  const open = (id: ShapeId) => upload(shapeFile(id), '+z', true)
  return (
    <div className={'shapes' + (big ? ' shapes--big' : '')} role="group" aria-label="Start from a shape">
      {SHAPES.map((s) => (
        <button key={s.id} className="shapes__b" disabled={busy} onClick={() => open(s.id)} data-tip={s.t} data-tip-desc={s.d}>
          <ShapeIcon id={s.id} size={big ? 32 : 24} />
          <span>{s.t}</span>
        </button>
      ))}
    </div>
  )
}
