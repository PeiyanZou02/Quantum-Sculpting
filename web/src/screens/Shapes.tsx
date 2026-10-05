// Shapes to start from: the test cup and a few primitives, as line drawings with their names.
import { useStore } from '../store'
import { SHAPES, shapeFile, type ShapeId } from '../primitives'

/** A shape drawn in one line weight, on a 24 grid. */
function ShapeIcon({ id, size = 24 }: { id: ShapeId; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {id === 'cup' && <><path {...p} d="M5 6h11v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" /><path {...p} d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16" /></>}
      {id === 'sphere' && <><circle {...p} cx="12" cy="12" r="8.5" /><ellipse {...p} cx="12" cy="12" rx="8.5" ry="3" /></>}
      {id === 'cube' && <><path {...p} d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z" /><path {...p} d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5" /></>}
      {id === 'pyramid' && <><path {...p} d="M12 3.5L3.5 17l8.5 3.5 8.5-3.5z" /><path {...p} d="M12 3.5v17" /></>}
      {id === 'cylinder' && <><ellipse {...p} cx="12" cy="6" rx="7" ry="2.5" /><path {...p} d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" /></>}
      {id === 'cone' && <><path {...p} d="M12 3.5L5 18M12 3.5L19 18" /><ellipse {...p} cx="12" cy="18" rx="7" ry="2.5" /></>}
      {id === 'torus' && <><ellipse {...p} cx="12" cy="12" rx="9" ry="5" /><path {...p} d="M8.5 11.5c1.8 1.4 5.2 1.4 7 0M9.6 12.3c1.4-.9 3.4-.9 4.8 0" /></>}
    </svg>
  )
}

/** The shapes as a grid of tiles; a click opens one as the model. */
export function ShapePicker({ big }: { big?: boolean }) {
  const testCup = useStore((s) => s.useTestCup)
  const upload = useStore((s) => s.upload)
  const busy = useStore((s) => s.busy.model)
  // the built-in shapes are small: their steps run by themselves
  const open = (id: ShapeId) => (id === 'cup' ? testCup() : upload(shapeFile(id), '+z', true))
  return (
    <div className={'shapes' + (big ? ' shapes--big' : '')} role="group" aria-label="Start from a shape">
      {SHAPES.map((s) => (
        <button key={s.id} className="shapes__b" disabled={busy} onClick={() => open(s.id)} data-tip={s.id === 'cup' ? 'Test cup' : s.t} data-tip-desc={s.id === 'cup' ? '80 × 80 × 90 mm, built in.' : 'About 80 mm across.'}>
          <ShapeIcon id={s.id} size={big ? 32 : 24} />
          <span>{s.t}</span>
        </button>
      ))}
    </div>
  )
}
