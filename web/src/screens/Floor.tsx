// Floor: 432, 864, 1056 × 168. Data for the step.
import { useMemo } from 'react'
import { useStore } from '../store'
import { QDensity } from '../qs/QDensity'
import { QReadout } from '../qs/QReadout'
import { histogram, solidPerLayer } from '../qs/grid'
import { Abs, Col, SectionHead } from './parts'

export function Floor() {
  const step = useStore((s) => s.step)
  const meshTab = useStore((s) => s.meshTab)
  const q = useStore((s) => s.q)
  const job = useStore((s) => s.job)
  if (step < 0) return null
  return (
    <Abs x={432} y={step === 0 || (step === 3 && meshTab === 'export') ? 872 : step === 1 ? 868 : 862} w={1056}>
      {step === 0 && <Extents />}
      {step === 1 && <Layers />}
      {step === 2 && (q.mode === 'atlas' || job?.status === 'running' ? <AtlasJobs /> : <Density />)}
      {step === 3 && (meshTab === 'export' ? <RunSummary /> : <Density />)}
    </Abs>
  )
}

function Extents() {
  const model = useStore((s) => s.model)!
  const max = Math.max(100, Math.ceil(Math.max(...model.extents) / 50) * 50)
  return (
    <Col gap={14}>
      <SectionHead label="EXTENTS" note="mm · print height is set at export" />
      <div className="qs-mono" style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 80px', rowGap: 12, alignItems: 'center' }}>
        {model.extents.map((v, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span>{'XYZ'[i]}</span>
            <div style={{ position: 'relative', height: 8, background: 'repeating-linear-gradient(90deg,var(--qs-ink4) 0 1px,transparent 1px 10%)' }}>
              <div style={{ position: 'absolute', left: 0, top: 1, width: `${(v / max) * 100}%`, height: 6, background: 'var(--qs-ink)', transition: 'width 480ms cubic-bezier(.215,.61,.355,1)' }} />
            </div>
            <span style={{ textAlign: 'right' }}>{v.toFixed(1)}</span>
          </span>
        ))}
      </div>
      <div className="qs-small" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 80px 0 28px', color: 'var(--qs-ink3)' }}>
        <span>0</span><span>{max / 2}</span><span>{max} mm</span>
      </div>
    </Col>
  )
}

function Layers() {
  const g = useStore((s) => s.gridData)
  const slice = useStore((s) => s.slice)
  const setSlice = useStore((s) => s.setSlice)
  const counts = useMemo(() => (g ? solidPerLayer(g, slice.axis) : []), [g, slice.axis])
  const max = Math.max(1, ...counts)
  const nz = counts.filter(Boolean)
  return (
    <Col gap={10}>
      <SectionHead label="LAYERS" note={`solid cells per layer along ${slice.axis}${nz.length ? ` · ${Math.min(...nz)}–${Math.max(...nz)} per layer` : ''}`} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: counts.length > 64 ? 1 : 4, height: 110, borderBottom: '1px solid var(--qs-ink4)' }}>
        {counts.map((c, i) => (
          <span
            key={i}
            onClick={() => setSlice({ index: i })}
            style={{
              flex: 1, cursor: 'pointer', height: Math.max(1, Math.round((c / max) * 108)),
              background: i === slice.index ? 'var(--qs-ink)' : c ? 'var(--qs-ink3)' : 'var(--qs-ink4)',
            }}
          />
        ))}
      </div>
      <div className="qs-small" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--qs-ink3)' }}>
        <span>{slice.axis} 0</span><span style={{ color: 'var(--qs-ink)' }}>{slice.index}</span><span>{counts.length - 1}</span>
      </div>
    </Col>
  )
}

function Density() {
  const procData = useStore((s) => s.procData)
  const level = useStore((s) => s.m.level)
  const setM = useStore((s) => s.setM)
  const bins = useMemo(() => (procData ? histogram(procData, 48) : new Array(48).fill(0)), [procData])
  return <QDensity bins={bins} level={level} onLevel={(v) => setM({ level: +v.toFixed(2) })} w={1056} h={140} />
}

function AtlasJobs() {
  const jobs = useStore((s) => s.atlasJobs)
  const key = useStore((s) => s.key)
  const refresh = useStore((s) => s.refreshAtlasJobs)
  if (!key?.set) {
    return (
      <Col gap={12}>
        <SectionHead label="JOBS" note="Atlas account" />
        <span className="qs-body" style={{ color: 'var(--qs-ink2)' }}>Set an API key to see the jobs in your Atlas account.</span>
      </Col>
    )
  }
  const time = (s: string) => (s ? new Date(s).toTimeString().slice(0, 8) : '—')
  return (
    <Col gap={0}>
      <div className="qs-small" style={{ display: 'grid', gridTemplateColumns: '80px 110px minmax(0,1fr) 180px 90px', columnGap: 20, paddingBottom: 10, borderBottom: '1px solid var(--qs-ink)', color: 'var(--qs-ink3)' }}>
        <span>Submitted</span><span>Engine</span><span>Job</span><span>From</span>
        <button onClick={refresh} style={{ all: 'unset', cursor: 'pointer', textAlign: 'right' }}>Status ↻</button>
      </div>
      {jobs.slice(0, 5).map((j) => (
        <div key={j.job_id} className="qs-mono" style={{ display: 'grid', gridTemplateColumns: '80px 110px minmax(0,1fr) 180px 90px', columnGap: 20, padding: '8px 0', borderBottom: '1px solid var(--qs-line)' }}>
          <span>{time(j.created_at)}</span>
          <span style={{ color: 'var(--qs-ink2)' }}>{j.engine}</span>
          <span style={{ color: 'var(--qs-ink2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.job_id}</span>
          <span>{j.local ? `${j.local.run} · tile ${j.local.tile.join(',')}` : 'personal account'}</span>
          <span style={{ textAlign: 'right', color: j.status === 'completed' ? 'var(--qs-ink)' : 'var(--qs-ink2)' }}>{j.status}</span>
        </div>
      ))}
      {jobs.length === 0 && <span className="qs-mono" style={{ padding: '10px 0', color: 'var(--qs-ink3)' }}>No jobs yet · ↻ to refresh</span>}
    </Col>
  )
}

function RunSummary() {
  const { model, grid, proc, m, exported } = useStore()
  const p = (proc?.params ?? {}) as Record<string, unknown>
  const mode = { gaussian: 'gaussian', emulator: 'emulation', atlas: 'atlas' }[proc?.mode ?? 'emulator']
  return (
    <Col gap={14}>
      <SectionHead label="RUN" note={`${proc?.run} · ${proc?.seconds ?? '—'} s · ${proc?.mode === 'atlas' ? (proc.cached ? 'cache hit' : 'cache miss, written') : 'local'}${exported ? ` · wrote ${exported.folder}/${exported.file}` : ''}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', columnGap: 32 }}>
        <QReadout kw={60} w={240} rows={[{ k: 'Model', v: model?.builtin ? 'test cup' : model?.file }, { k: 'Up', v: model?.up.toUpperCase() }, { k: 'Extents', v: model?.extents.map((v) => v.toFixed(0)).join(' × ') }]} />
        <QReadout kw={60} w={240} rows={[{ k: 'Grid', v: `${grid?.n}³` }, { k: 'Fill', v: { holes: 'enclosed', capped: 'capped', none: 'shell' }[grid?.fill ?? 'holes'] }, { k: 'Values', v: grid?.values }]} />
        <QReadout kw={60} w={240} rows={proc?.mode === 'gaussian' ? [{ k: 'Mode', v: mode }, { k: 'Sigma', v: String(p.sigma) }] : [{ k: 'Mode', v: mode }, { k: 'Strength', v: Number(p.strength ?? 0).toFixed(2) }, { k: 'Reach', v: Number(p.reach ?? 0).toFixed(2) }]} />
        <QReadout kw={60} w={240} rows={[{ k: 'Mesh', v: m.method === 'advect' ? 'push' : 'threshold' }, { k: 'Level', v: m.level.toFixed(2) }, { k: 'Keep', v: m.keep }]} />
      </div>
    </Col>
  )
}
