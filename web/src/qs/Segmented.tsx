import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { QPill } from './QPill'
import './qs.css'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
}

export interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  /** 'm' = 24px segments, 11px padding (Grid size, Fill, Mode). 's' = 22px, 10px padding (Style x / y / xy / yx). */
  size?: 's' | 'm'
  'aria-label'?: string
}

/** Single choice: 2px-padded pill with a ctl border; the selected segment has a 1px ink border and a sel fill. */
export function Segmented<T extends string>({ options, value, onChange, size = 'm', 'aria-label': ariaLabel }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    for (let k = 1; k <= options.length; k++) {
      const j = (i + d * k + options.length * k) % options.length
      if (!options[j].disabled) { onChange(options[j].value); refs.current[j]?.focus(); return }
    }
  }
  return (
    <div className={`qs-seg qs-seg--${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className={'qs-seg__item' + (on ? ' qs-seg__item--on' : '')}
            onClick={() => onChange(o.value)}
            onKeyDown={e => onKey(e, i)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export interface SegmentedMultiProps<T extends string> {
  options: SegmentOption<T>[]
  value: T[]
  onChange: (v: T[]) => void
  size?: 's' | 'm'
  /** Allow every segment to be off. Default false: the last selected segment cannot be turned off. */
  allowEmpty?: boolean
  'aria-label'?: string
}

const toggle = <T extends string>(options: SegmentOption<T>[], value: T[], v: T, allowEmpty: boolean): T[] | null => {
  const has = value.includes(v)
  if (has && value.length === 1 && !allowEmpty) return null
  const next = has ? value.filter(x => x !== v) : [...value, v]
  return options.map(o => o.value).filter(x => next.includes(x)) // keep option order
}

/** Multi choice with the segmented-control look: each segment toggles on and off. */
export function SegmentedMulti<T extends string>({ options, value, onChange, size = 'm', allowEmpty = false, 'aria-label': ariaLabel }: SegmentedMultiProps<T>) {
  return (
    <div className={`qs-seg qs-seg--${size}`} role="group" aria-label={ariaLabel}>
      {options.map(o => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            className={'qs-seg__item' + (on ? ' qs-seg__item--on' : '')}
            onClick={() => { const n = toggle(options, value, o.value, allowEmpty); if (n) onChange(n) }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export interface AxisToggleProps<T extends string> {
  /** Defaults to X / Y / Z. */
  options?: SegmentOption<T>[]
  value: T[]
  onChange: (v: T[]) => void
  allowEmpty?: boolean
}

const XYZ = [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }, { value: 'z', label: 'Z' }]

/**
 * Blur axes (Sc03Emulation): separate small QPills, 6px apart. On = kind 'active' (ink border, sel fill),
 * off = kind 'hair'; a disabled option is kind 'disabled'.
 */
export function AxisToggle<T extends string = 'x' | 'y' | 'z'>({ options, value, onChange, allowEmpty = false }: AxisToggleProps<T>) {
  const opts = options ?? (XYZ as SegmentOption<T>[])
  return (
    <div className="qs-axes" role="group">
      {opts.map(o => {
        const on = value.includes(o.value)
        return (
          <QPill
            key={o.value}
            size="s"
            kind={o.disabled ? 'disabled' : on ? 'active' : 'hair'}
            pressed={on}
            label={o.label}
            onClick={() => { const n = toggle(opts, value, o.value, allowEmpty); if (n) onChange(n) }}
          />
        )
      })}
    </div>
  )
}
