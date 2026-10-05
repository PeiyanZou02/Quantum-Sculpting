// Compact density histogram with a draggable level line, sized for a sidebar column.
// sqrt-scaled bars; bars at or above the level are ink, the rest ink4.
import { useRef, useState } from 'react'

export function LevelHistogram({ bins, level, onLevel, height = 72, min = 0.05, max = 0.95 }: {
  bins: number[]; level: number; onLevel: (v: number) => void; height?: number; min?: number; max?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const peak = Math.sqrt(Math.max(1, ...bins))
  const n = bins.length
  const total = bins.reduce((a, b) => a + b, 0)
  const keeps = bins.reduce((a, b, i) => ((i + 0.5) / n >= level ? a + b : a), 0)
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(max, Math.max(min, +((x - r.left) / r.width).toFixed(2)))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="qs-field-head" style={{ marginBottom: 16 }}>
        <span>Density</span>
        <output>keeps {keeps.toLocaleString()} / {total.toLocaleString()}</output>
      </div>
      <div
        ref={ref}
        style={{ position: 'relative', height, cursor: 'ew-resize', touchAction: 'none' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); onLevel(at(e.clientX)) }}
        onPointerMove={(e) => { if (drag) onLevel(at(e.clientX)); else setHover(at(e.clientX)) }}
        onPointerUp={() => setDrag(false)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width="100%" height={height} viewBox={`0 0 ${n} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          {bins.map((b, i) => {
            const h = (Math.sqrt(b) / peak) * (height - 2)
            return <rect key={i} x={i + 0.12} y={height - h} width={0.76} height={h} fill={(i + 0.5) / n >= level ? 'var(--qs-ink)' : 'var(--qs-ink4)'} />
          })}
          <line x1="0" x2={n} y1={height - 0.5} y2={height - 0.5} stroke="var(--qs-ink4)" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover != null && !drag && (
          <div style={{ position: 'absolute', left: `${hover * 100}%`, top: 0, bottom: 0, borderLeft: '1px dashed var(--qs-ink3)', pointerEvents: 'none' }} />
        )}
        <div style={{ position: 'absolute', left: `${level * 100}%`, top: -4, bottom: 0, width: 1, background: 'var(--qs-ink)', pointerEvents: 'none' }}>
          <span className="qs-small" style={{
            position: 'absolute', top: -14, left: 0, transform: 'translateX(-50%)', padding: '2px 6px', borderRadius: 999,
            border: '1px solid var(--qs-ink)', background: drag ? 'var(--qs-ink)' : 'var(--qs-bg)', color: drag ? 'var(--qs-bg)' : 'var(--qs-ink)',
          }}>{level.toFixed(2)}</span>
        </div>
      </div>
      <div className="qs-small" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--qs-ink3)' }}>
        <span>0</span><span>0.5</span><span>1</span>
      </div>
    </div>
  )
}
