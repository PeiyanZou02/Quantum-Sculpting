// Right column: slice through the grid, the print check and the log.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Segmented } from '../qs/Segmented'
import { Slider } from '../qs/Slider'
import { QReadout } from '../qs/QReadout'
import type { Axis } from '../qs/grid'
import { SectionMap } from './SectionMap'
import { fmt } from './parts'

export function InspectorPane() {
  return (
    <aside className="insp" aria-label="Inspect">
      <SliceBlock />
      <PrintBlock />
      <LogBlock />
    </aside>
  )
}

function SliceBlock() {
  const st = useStore()
  const { slice, gridData, procData, m } = st
  const [src, setSrc] = useState<'input' | 'processed'>('input')
  const g = src === 'processed' && procData ? procData : gridData
  const n = g?.n ?? 32
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(280)
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(box.current!.clientWidth))
    ro.observe(box.current!)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { if (procData) setSrc('processed') }, [procData])
  useEffect(() => { if (slice.index > n - 1) st.setSlice({ index: Math.floor(n / 2) }) }, [n]) // eslint-disable-line react-hooks/exhaustive-deps
  const level = src === 'processed' ? m.level : 0.5
  return (
    <div className="blk">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="qs-label">Slice</span>
        <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>{slice.axis} {slice.index} / {n - 1} · contour {level.toFixed(2)}</span>
      </div>
      <div ref={box} style={{ width: '100%' }}>
        <SectionMap size={w} grid={g} input={src === 'processed' ? gridData : null} axis={slice.axis} index={slice.index} level={level} onIndex={(i) => st.setSlice({ index: i })} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <Segmented size="s" options={[{ value: 'input', label: 'Input' }, { value: 'processed', label: 'Processed', disabled: !procData }]} value={src} onChange={(v) => setSrc(v as 'input' | 'processed')} />
        <Segmented<Axis> size="s" options={[{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]} value={slice.axis} onChange={(a) => st.setSlice({ axis: a })} />
      </div>
      <Slider label="Position" value={slice.index} min={0} max={n - 1} step={1} ticks={8} onChange={(v) => st.setSlice({ index: v })}
        format={(v) => `${v} · ${(v * (st.grid?.voxel_size ?? 0)).toFixed(1)} mm`} />
      <p className="qs-help">Darker is a higher value. The ink line is the contour at the current level.</p>
    </div>
  )
}

function PrintBlock() {
  const r = useStore((s) => s.report)
  return (
    <div className="blk">
      <span className="qs-label">Print check</span>
      {!r ? (
        <p className="qs-help">After the quantum step, the check of the exported model appears here.</p>
      ) : (
        <QReadout w="100%" leader rows={[
          { k: 'Size (mm)', v: r.extents.map((v) => v.toFixed(1)).join(' × ') },
          { k: 'Watertight', v: r.watertight ? 'yes' : 'no', flag: r.watertight ? '✓' : '!' },
          { k: 'Volume', v: r.volume_cm3 != null ? `${r.volume_cm3} cm³` : '—' },
          { k: 'Parts', v: r.total_parts > r.parts ? `kept ${r.parts} of ${r.total_parts}` : String(r.parts), flag: r.parts === 1 ? '✓' : '!' },
          { k: 'Faces', v: fmt.int(r.faces) },
          { k: 'Quantum cell', v: `${r.voxel_mm} mm` },
          ...(r.refine > 1 ? [{ k: 'Fine cell', v: `${r.fine_voxel_mm} mm` }] : []),
        ]} />
      )}
      {r && !r.watertight && <p className="qs-help" style={{ color: 'var(--qs-ink)' }}>! Not watertight. Try closing gaps or a lower level before printing.</p>}
    </div>
  )
}

function LogBlock() {
  const log = useStore((s) => s.log)
  const time = (t: number) => new Date(t).toTimeString().slice(0, 8)
  const lines = log.slice(-12).reverse()
  return (
    <div className="blk" style={{ flex: 1, borderBottom: 0 }}>
      <span className="qs-label">Log</span>
      {lines.length === 0 && <p className="qs-help">Nothing yet.</p>}
      {lines.map((l, i) => (
        <span key={l.t + i} style={{ font: '400 11px/1.35 var(--qs-mono)', color: l.level === 'info' ? (i === 0 ? 'var(--qs-ink)' : 'var(--qs-ink2)') : 'var(--qs-ink)' }}>
          <span style={{ color: 'var(--qs-ink3)' }}>{time(l.t)}</span>  {l.level !== 'info' ? '! ' : ''}{l.text}
        </span>
      ))}
    </div>
  )
}
