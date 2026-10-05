// Infographic cards for Present: the same blocks as the Lab's Properties, drawn as figures with
// large numbers, and the section map with its cutting plane (display only; it animates with the
// slice sweep). They sit in the HUD's corners like any other mark.
import { useMemo } from 'react'
import { useStore } from '../store'
import { histogram, solidPerLayer } from '../qs/grid'
import { SectionMap } from '../screens/SectionMap'
import { useSliceScheme } from '../qs/sectionColor'
import { LevelHistogram } from '../qs/LevelHistogram'
import { PresentStyle } from '../screens/presentStyle'
import './cards.css'

export function SliceCard({ layers }: { layers?: boolean }) {
  const { procData, gridData, slice, m, grid } = useStore()
  const g = procData ?? gridData
  const counts = useMemo(() => (gridData && layers ? solidPerLayer(gridData, slice.axis) : []), [gridData, layers, slice.axis])
  const colors = useSliceScheme(!!procData)
  if (!g) return null
  const n = g.n, peak = Math.max(1, ...counts)
  return (
    <div className="hud-card">
      <div className="hud-card__head"><span className="hud-card__t">Slice</span><span className="hud-card__n">{slice.axis} {slice.index} / {n - 1}</span></div>
      <SectionMap size={232} grid={g} input={procData ? gridData : null} axis={slice.axis} index={slice.index} level={procData ? m.level : 0.5} scheme={colors.scheme} owner={colors.owner} />
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

export function Card({ children }: { children: React.ReactNode }) {
  return <PresentStyle.Provider value={true}><div className="hud-card hud-card--blocks">{children}</div></PresentStyle.Provider>
}

export function DensityCard() {
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
