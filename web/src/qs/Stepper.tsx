import type { ReactNode } from 'react'
import './qs.css'

export interface StepperProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  /** Default 1. */
  step?: number
  /** How the value is drawn. Default String(value). */
  format?: (v: number) => ReactNode
  /** Width of the value column, px. Default 24. */
  valueWidth?: number
  disabled?: boolean
  'aria-label'?: string
}

/** − value + in a 30px ctl-hairline pill, 13px mono (Sc02Voxelise "Padding · cells"). */
export function Stepper({ value, onChange, min = -Infinity, max = Infinity, step = 1, format, valueWidth = 24, disabled = false, 'aria-label': ariaLabel }: StepperProps) {
  const set = (n: number) => onChange(Math.round(Math.max(min, Math.min(max, n)) * 1e6) / 1e6)
  return (
    <div className="qs-stepper" role="group" aria-label={ariaLabel}>
      <button type="button" className="qs-stepper__btn" disabled={disabled || value <= min} aria-label="Decrease" onClick={() => set(value - step)}>−</button>
      <span className="qs-stepper__val" style={{ width: valueWidth, color: disabled ? 'var(--qs-ink4)' : undefined }} aria-live="polite">{format ? format(value) : String(value)}</span>
      <button type="button" className="qs-stepper__btn" disabled={disabled || value >= max} aria-label="Increase" onClick={() => set(value + step)}>+</button>
    </div>
  )
}
