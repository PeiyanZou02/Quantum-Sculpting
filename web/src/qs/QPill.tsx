import type { CSSProperties, ReactNode } from 'react'
import './qs.css'

export type QPillKind = 'line' | 'hair' | 'ghost' | 'faint' | 'active' | 'commit' | 'disabled'
export type QPillSize = 's' | 'm' | 'l'
export type QPillDot = 'on' | 'off' | 'busy'

export interface QPillProps {
  label: ReactNode
  kind?: QPillKind
  size?: QPillSize
  dot?: QPillDot
  /** Show the → arrow. Defaults to true for kind 'commit', false otherwise. */
  arrow?: boolean
  /** Spinner before the label, ink2 text, clicks ignored. Pass the busy label yourself ("Submitting"). */
  loading?: boolean
  /** Sets aria-pressed (for toggle chips such as AxisToggle). */
  pressed?: boolean
  onClick?: () => void
  title?: string
  className?: string
  style?: CSSProperties
}

/** Quicksilver button: Geist Mono pill, 999px radius, 1px hairline, 150ms transitions. */
export function QPill({ label, kind = 'line', size = 'm', dot, arrow, loading = false, pressed, onClick, title, className, style }: QPillProps) {
  const disabled = kind === 'disabled'
  const showArrow = arrow ?? false
  const cls = ['qs-pill', `qs-pill--${size}`, `qs-pill--${kind}`, loading && 'qs-pill--loading', className].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      data-tip={title}
      style={style}
      onClick={() => { if (!loading && !disabled) onClick?.() }}
    >
      {loading ? <span className="qs-spin" aria-hidden /> : dot && <span className={`qs-pill__dot qs-pill__dot--${dot}`} aria-hidden />}
      <span>{label}</span>
      {showArrow && <span aria-hidden>→</span>}
    </button>
  )
}
