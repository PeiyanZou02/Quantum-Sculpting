// Numbers that count to their value. `Num` takes a number; `Count` takes the text a piece already shows
// ("2,869", "0.53", "−1.20 mm") and counts the number in it, keeping its decimals, separators and units.
import type { ReactNode } from 'react'
import { useTween } from './tween'

export function Num({ v, d = 0, ms }: { v: number; d?: number; ms?: number }) {
  const t = useTween(v, ms)
  return <>{d ? t.toFixed(d) : Math.round(t).toLocaleString()}</>
}

// text before the number, its sign, the number, text after
const NUM = /^([^\d−+-]*)([−+-]?)(\d[\d,]*(?:\.\d+)?|\.\d+)(.*)$/s

export function Count({ children, ms }: { children: ReactNode; ms?: number }) {
  const s = typeof children === 'number' ? String(children) : typeof children === 'string' ? children : null
  const m = s == null ? null : NUM.exec(s)
  const v = m ? (m[2] === '−' || m[2] === '-' ? -1 : 1) * parseFloat(m[3].replace(/,/g, '')) : 0
  const t = useTween(v, ms)
  if (!m) return <>{children}</>
  const dec = m[3].split('.')[1]?.length ?? 0
  const a = Math.abs(t)
  const body = m[3].includes(',') ? a.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : a.toFixed(dec)
  const zero = !/[1-9]/.test(body)
  const sign = t < 0 && !zero ? (m[2] === '-' ? '-' : '−') : m[2] === '+' && !zero ? '+' : ''
  return <>{m[1]}{sign}{body}{m[4]}</>
}
