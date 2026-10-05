// 00 Start: dot-grid view with a drop area.
import { useState } from 'react'
import { useStore } from '../store'
import { Corners } from './parts'

export const MODEL_EXT = ['.stl', '.obj', '.ply', '.glb', '.off']

export function StartView() {
  const upload = useStore((s) => s.upload)
  const busy = useStore((s) => s.busy.model)
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) upload(f)
      }}
      style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle,var(--qs-dot) 1px,transparent 1.5px) 12px 12px/24px 24px' }}
    >
      <div style={{ position: 'absolute', left: 248, top: 188, width: 560, height: 320, background: over ? 'var(--qs-faint)' : undefined, transition: 'background 150ms' }}>
        <Corners w={560} h={320} size={24} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span style={{ font: "400 24px/1.1 var(--qs-sans)" }}>{busy ? 'Opening…' : over ? 'Release to open' : 'Drop a model here'}</span>
          <span className="qs-mono" style={{ color: 'var(--qs-ink3)' }}>{MODEL_EXT.join(' ')}</span>
        </div>
      </div>
      <svg width="420" height="60" viewBox="0 0 420 60" style={{ position: 'absolute', left: 318, top: 538 }}>
        <ellipse cx="210" cy="30" rx="200" ry="22" fill="none" stroke="var(--qs-ink3)" strokeWidth="1" strokeDasharray="2 4" />
      </svg>
    </div>
  )
}
