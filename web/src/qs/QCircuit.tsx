const MONO = 'var(--qs-mono)'

export type QGate = 'x' | 'y' | 'xy' | 'yx'

export interface QCircuitProps {
  /** Qubits per axis. Default 5. */
  per?: number
  /** Blur axes as a string, e.g. 'xyz'. */
  axes?: string
  /** Rotation style. */
  gate?: QGate
  /** 0–1: how much the higher qubits keep turning (0 = halves per qubit). */
  reach?: number
  /** Base rotation in units of π (the Strength dial). Default 0.30. */
  strength?: number
  /** Alias of `strength`, as a number (×π) or a string like '0.30π'. Wins over `strength`. */
  theta?: number | string
  /** Width. Default 540. */
  w?: number
  /** Row pitch. Default 16. */
  rowH?: number
  title?: string
  /** Sub line; defaults to `15 qubits · style xy · strength 0.30 · reach 0.25`. */
  sub?: string
}

/** QCircuit — the per-axis rotation circuit: encode pill, Rx/Ry gate pills per qubit, measure. */
export function QCircuit({ per = 5, axes = 'xyz', gate = 'xy', reach = 0.25, strength = 0.3, theta, w: W = 540, rowH: rh = 16, title = 'Circuit', sub }: QCircuitProps) {
  const st = theta == null ? strength : typeof theta === 'number' ? theta : parseFloat(theta) || 0
  const top = 34
  const gl = gate === 'x' ? ['Rx'] : gate === 'y' ? ['Ry'] : gate === 'xy' ? ['Rx', 'Ry'] : ['Ry', 'Rx']
  const rows: { y: number; ty: number; q: string }[] = []
  const gates: { x: number; y: number; w: number; t: string }[] = []
  const groups: { y: number; h: number; ly: number; t: string }[] = []
  let q = 0
  for (const ax of axes.split('')) {
    const y0 = top + q * rh
    for (let k = 0; k < per; k++) {
      const y = top + q * rh
      rows.push({ y, ty: y - 4, q: 'q' + q })
      const th = (st * ((1 - reach) * Math.pow(2, -k) + reach)).toFixed(2)
      gl.forEach((g, gi) => gates.push({ x: 120 + gi * 92, y: y - 7, w: 84, t: `${g} ${th}π` }))
      gates.push({ x: W - 30, y: y - 7, w: 28, t: 'M' })
      q++
    }
    groups.push({ y: y0 - 6, h: (per - 1) * rh + 12, ly: y0 + ((per - 1) * rh) / 2 - 5, t: ax.toUpperCase() })
  }
  const H = top + Math.max(0, q - 1) * rh + 14
  const subT = sub || `${q} qubits · style ${gate} · strength ${st.toFixed(2)} · reach ${reach.toFixed(2)}`

  return (
    <div style={{ position: 'relative', width: W, height: H, color: 'var(--qs-ink)', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', justifyContent: 'space-between', gap: 16, font: `400 10px/1 ${MONO}` }}>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <span style={{ color: 'var(--qs-ink3)' }}>{subT}</span>
      </div>
      {groups.map((g, i) => (
        <div key={'g' + i}>
          <div style={{ position: 'absolute', left: 0, top: g.y, width: 5, height: g.h, border: '1px solid var(--qs-ink3)', borderRight: 'none', boxSizing: 'content-box' }} />
          <span style={{ position: 'absolute', left: 10, top: g.ly, font: `500 10px/1 ${MONO}` }}>{g.t}</span>
        </div>
      ))}
      {rows.map((r, i) => (
        <div key={'r' + i}>
          <span style={{ position: 'absolute', left: 28, top: r.ty, font: `400 9px/1 ${MONO}`, color: 'var(--qs-ink3)' }}>{r.q}</span>
          <div style={{ position: 'absolute', left: 58, right: 0, top: r.y, height: 1, background: 'var(--qs-ink4)' }} />
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: top - 8,
          width: 30,
          height: Math.max(0, q - 1) * rh + 16,
          border: '1px solid var(--qs-ink)',
          borderRadius: 0,
          background: 'var(--qs-bg)',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', font: `400 9px/1 ${MONO}`, letterSpacing: '.06em' }}>ENCODE |ψ⟩</span>
      </div>
      {gates.map((g, i) => (
        <div
          key={'q' + i}
          style={{
            position: 'absolute',
            left: g.x,
            top: g.y,
            width: g.w,
            height: 14,
            border: '1px solid var(--qs-ink)',
            borderRadius: 0,
            background: 'var(--qs-bg)',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: `400 9px/1 ${MONO}`,
          }}
        >
          {g.t}
        </div>
      ))}
    </div>
  )
}
