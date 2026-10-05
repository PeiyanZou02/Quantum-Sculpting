// Small layout pieces repeated across the screens (labels, step headers, field rows).
import type { CSSProperties, ReactNode } from 'react'

export const ink = { ink: 'var(--qs-ink)', ink2: 'var(--qs-ink2)', ink3: 'var(--qs-ink3)', ink4: 'var(--qs-ink4)' }

export function Abs({ x, y, w, h, children, style }: { x: number; y: number; w?: number; h?: number; children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, ...style }}>{children}</div>
}

export function Col({ gap, children, style }: { gap: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>{children}</div>
}

export function Row({ gap = 0, children, style, between }: { gap?: number; children: ReactNode; style?: CSSProperties; between?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, justifyContent: between ? 'space-between' : undefined, ...style }}>
      {children}
    </div>
  )
}

/** "Step 02" / title / prose block at the top of the rail. */
export function StepHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <Col gap={10}>
      <span className="qs-mono" style={{ color: ink.ink3 }}>{kicker}</span>
      <span className="qs-title">{title}</span>
      {children && <span className="qs-body" style={{ color: ink.ink2, textWrap: 'pretty' }}>{children}</span>}
    </Col>
  )
}

/** Field label above a control. */
export function Field({ label, children, note, gap = 10 }: { label: ReactNode; children: ReactNode; note?: ReactNode; gap?: number }) {
  return (
    <Col gap={gap}>
      <span className="qs-mono" style={{ color: ink.ink3 }}>{label}</span>
      <div style={{ display: 'flex' }}>{children}</div>
      {note && <span className="qs-mono" style={{ lineHeight: 1.4, color: ink.ink3 }}>{note}</span>}
    </Col>
  )
}

/** Label left, control right. */
export function InlineField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Row between>
      <span className="qs-mono" style={{ color: ink.ink3 }}>{label}</span>
      {children}
    </Row>
  )
}

/** Capitals section label with an optional right-hand note. */
export function SectionHead({ label, note, rule }: { label: string; note?: ReactNode; rule?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: rule ? 9 : 0, borderBottom: rule ? '1px solid var(--qs-ink)' : undefined }}>
      <span className="qs-label">{label}</span>
      {note != null && <span className="qs-mono" style={{ color: ink.ink3 }}>{note}</span>}
    </div>
  )
}

/** A group separated from the one above by a 1px rule. */
export function Group({ children, gap = 12, pad = 20 }: { children: ReactNode; gap?: number; pad?: number }) {
  return <Col gap={gap} style={{ paddingTop: pad, borderTop: '1px solid var(--qs-line)' }}>{children}</Col>
}

export function Corner({ x, y, size = 18, pos }: { x: number; y: number; size?: number; pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const b = '1px solid var(--qs-ink)'
  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: size, height: size, pointerEvents: 'none',
      borderLeft: pos[1] === 'l' ? b : undefined, borderRight: pos[1] === 'r' ? b : undefined,
      borderTop: pos[0] === 't' ? b : undefined, borderBottom: pos[0] === 'b' ? b : undefined,
    }} />
  )
}

export function Corners({ w, h, size = 18 }: { w: number; h: number; size?: number }) {
  return (
    <>
      <Corner x={0} y={0} size={size} pos="tl" />
      <Corner x={w - size} y={0} size={size} pos="tr" />
      <Corner x={0} y={h - size} size={size} pos="bl" />
      <Corner x={w - size} y={h - size} size={size} pos="br" />
    </>
  )
}

export function Dot({ live, blink }: { live?: boolean; blink?: boolean }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flex: 'none', boxSizing: 'border-box',
      background: live ? 'var(--qs-ink)' : 'transparent', border: live ? undefined : '1px solid var(--qs-ink3)',
      animation: blink ? 'qs-blink 1.2s ease-in-out infinite' : undefined,
    }} />
  )
}

export function Spinner() {
  return (
    <span style={{
      width: 9, height: 9, borderRadius: '50%', border: '1px solid currentColor', borderRightColor: 'transparent',
      boxSizing: 'border-box', animation: 'qs-spin .9s linear infinite', flex: 'none',
    }} />
  )
}

export function Bang() {
  return (
    <span style={{
      flex: 'none', width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--qs-ink)', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center', font: "500 9px/1 var(--qs-mono)",
    }}>!</span>
  )
}

export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('en-US'),
  f2: (v: number) => v.toFixed(2),
  f1: (v: number) => v.toFixed(1),
  pct: (v: number) => `${Math.round(v * 100)}%`,
  up: (u: string) => `${u[0]}${u[1].toUpperCase()}`,
}
