import { Fragment } from 'react'
import type { ReactNode } from 'react'
import './qs.css'

export interface QReadoutRow {
  k: ReactNode
  v: ReactNode
  /** Third column in ink3, e.g. a ✓ or a share. */
  flag?: ReactNode
  /** Key and value in ink3. */
  dim?: boolean
}

export interface QReadoutProps {
  /** Rendered as a capitals section label (600 10px, .04em). */
  title?: string
  rows: QReadoutRow[]
  /** Dotted ink4 leaders between key and value (key column width is then natural). */
  leader?: boolean
  /** Key column width, px. Default 88. */
  kw?: number
  /** Total width. Default 260. */
  w?: number | string
}

/** Key / value table in Geist Mono 10px. */
export function QReadout({ title, rows, leader = false, kw = 88, w = 260 }: QReadoutProps) {
  const dim = (r: QReadoutRow) => (r.dim ? 'qs-readout__dim' : undefined)
  return (
    <div className="qs-readout" style={{ width: w }}>
      {title && <span className="qs-readout__title">{title}</span>}
      {leader ? (
        <div className="qs-readout__lead">
          {rows.map((r, i) => (
            <div key={i} className="qs-readout__row">
              <span className={dim(r)}>{r.k}</span>
              <span className="qs-readout__dots" />
              <span className={'qs-readout__val ' + dim(r)}>{r.v}</span>
              <span className="qs-readout__e">{r.flag}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="qs-readout__grid" style={{ gridTemplateColumns: `${kw}px minmax(0,1fr) auto` }}>
          {rows.map((r, i) => (
            <Fragment key={i}>
              <span className={dim(r)}>{r.k}</span>
              <span className={'qs-readout__v' + (r.dim ? ' qs-readout__dim' : '')}>{r.v}</span>
              <span className="qs-readout__e">{r.flag}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
