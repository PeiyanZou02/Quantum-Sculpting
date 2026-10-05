// Infographic cards for Present: the same blocks as the Lab's Properties, drawn as figures with
// large numbers, and the section map with its cutting plane (display only; it animates with the
// slice sweep). They sit in the HUD's corners like any other mark.
import { useMemo } from 'react'
import { useStore } from '../store'
import { histogram, solidPerLayer } from '../qs/grid'
import { SectionMap } from '../screens/SectionMap'
import { LevelHistogram } from '../qs/LevelHistogram'
import { GridOut, ModelOut, PresentStyle, PrintOut, QuantumOut } from '../screens/OutputPane'
import type { HudModule } from './types'
import './cards.css'

function SliceCard({ layers }: { layers?: boolean }) {
  const { procData, gridData, slice, m, grid } = useStore()
  const g = procData ?? gridData
  const counts = useMemo(() => (gridData && layers ? solidPerLayer(gridData, slice.axis) : []), [gridData, layers, slice.axis])
  if (!g) return null
  const n = g.n, peak = Math.max(1, ...counts)
  return (
    <div className="hud-card">
      <div className="hud-card__head"><span className="hud-card__t">Slice</span><span className="hud-card__n">{slice.axis} {slice.index} / {n - 1}</span></div>
      <SectionMap size={232} grid={g} input={procData ? gridData : null} axis={slice.axis} index={slice.index} level={procData ? m.level : 0.5} />
      <div className="hud-card__plane">
        <span className="hud-card__k">Cutting plane</span>
        <span className="hud-card__v">{slice.index} · {(slice.index * (grid?.voxel_size ?? 0)).toFixed(1)} mm</span>
        <span className="hud-card__bar"><span style={{ width: `${(slice.index / Math.max(1, n - 1)) * 100}%` }} /></span>
      </div>
      {layers && counts.length > 0 && (
        <svg width="232" height="34" viewBox={`0 0 ${counts.length} 34`} preserveAspectRatio="none" className="hud-card__spark">
          {counts.map((c, i) => <rect key={i} x={i + 0.15} width={0.7} y={34 - (c / peak) * 33} height={(c / peak) * 33} style={{ fill: i === slice.index ? 'var(--qs-ink)' : 'var(--qs-ink4)' }} />)}
        </svg>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <PresentStyle.Provider value={true}><div className="hud-card hud-card--blocks">{children}</div></PresentStyle.Provider>
}

function DensityCard() {
  const procData = useStore((s) => s.procData)
  const level = useStore((s) => s.m.level)
  const bins = useMemo(() => (procData ? histogram(procData, 48) : null), [procData])
  if (!bins) return null
  return (
    <div className="hud-card">
      <div className="hud-card__head"><span className="hud-card__t">Density</span><span className="hud-card__n">level {level.toFixed(2)}</span></div>
      <div style={{ pointerEvents: 'none' }}><LevelHistogram bins={bins} level={level} onLevel={() => {}} height={60} /></div>
    </div>
  )
}

export const SLICECARD_MODULES: HudModule[] = [
  { family: 'slicecard', id: 'v1', label: 'section', desc: 'The section map under the cutting plane', slot: 'bl', render: () => <SliceCard /> },
  { family: 'slicecard', id: 'v2', label: 'section + layers', desc: 'The section map and solid cells per layer', slot: 'bl', render: () => <SliceCard layers /> },
  { family: 'slicecard', id: 'v3', label: 'density', desc: 'Cells by value against the level', slot: 'bl', render: () => <DensityCard /> },
]

export const CARDS_MODULES: HudModule[] = [
  { family: 'cards', id: 'v1', label: 'quantum result', desc: 'Peak value, time and the density histogram', slot: 'br', render: () => <Card><QuantumOut /></Card> },
  { family: 'cards', id: 'v2', label: 'print check', desc: 'Volume, parts and the print checks', slot: 'br', render: () => <Card><PrintOut /></Card> },
  { family: 'cards', id: 'v3', label: 'model', desc: 'Size and faces of the original mesh', slot: 'br', render: () => <Card><ModelOut /></Card> },
  { family: 'cards', id: 'v4', label: 'grid', desc: 'Solid cells and voxel size', slot: 'br', render: () => <Card><GridOut /></Card> },
  { family: 'cards', id: 'v5', label: 'result + print', desc: 'The quantum result and the print check together', slot: 'right', render: () => <Card><QuantumOut /><PrintOut /></Card> },
]
