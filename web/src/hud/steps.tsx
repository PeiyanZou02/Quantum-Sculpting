// Pipeline navigation through the four steps (QLNav4, "Navigation" A–D).
// Clicking a step calls ctx.goStep(i). Timings are part of the spec: pill 350 ms, rail 500 ms,
// side bar 300 ms, needle 450 ms, live ping 1.8 s.
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { HudCtx } from './types'
import './lab.css'

const MONO11: CSSProperties = { font: '400 11px/1 var(--qs-mono)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const SANS12: CSSProperties = { font: '400 12px/1.3 var(--qs-sans)', color: 'var(--qs-ink3)', whiteSpace: 'nowrap' }

interface Item { i: number; num: string; title: string; detail: string; done: boolean; live: boolean; reached: boolean }

function items(ctx: HudCtx): { list: Item[]; live: number } {
  const labels = ctx.steps.labels
  const live = Math.max(0, Math.min(labels.length - 1, ctx.steps.live))
  const list = labels.map(([title, detail], i) => {
    const done = !!ctx.steps.done[i]
    return { i, num: String(i + 1).padStart(2, '0'), title, detail, done, live: i === live, reached: done || i <= live }
  })
  return { list, live }
}

const status = (it: Item) => (it.live ? 'live' : it.done ? 'done' : '—')
const fg = (it: Item) => (it.reached ? 'var(--qs-ink)' : 'var(--qs-ink3)')

// ---------------------------------------------------------------- A index bar, sliding pill

export function IndexBar({ ctx }: { ctx: HudCtx }) {
  const { list, live } = items(ctx)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ l: number; w: number } | null>(null)
  const key = list.map((it) => it.title).join('|')
  useLayoutEffect(() => {
    const el = refs.current[live]
    if (el) setPill({ l: el.offsetLeft, w: el.offsetWidth })
  }, [live, key])
  return (
    <div role="tablist" style={{ position: 'relative', display: 'flex', height: 30, ...MONO11 }}>
      {pill && (
        <div
          className="qs-lab-slide"
          style={{ position: 'absolute', top: 0, height: 30, left: pill.l, width: pill.w, borderRadius: 999, border: '1px solid var(--qs-ink)', background: 'var(--qs-sel)', boxSizing: 'border-box' }}
        />
      )}
      {list.map((it) => (
        <button
          key={it.i}
          ref={(el) => {
            refs.current[it.i] = el
          }}
          type="button"
          role="tab"
          aria-selected={it.live}
          className="qs-lab-btn qs-lab-fade"
          data-tip={it.title}
          data-tip-desc={`${it.detail} · ${status(it)}`}
          onClick={() => ctx.goStep(it.i)}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 30, padding: '0 14px', color: fg(it) }}
        >
          {it.num} {it.title}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- B rail with nodes

export function Rail({ ctx }: { ctx: HudCtx }) {
  const { list, live } = items(ctx)
  const cols = Math.max(1, list.length)
  const span = ((cols - 1) / cols) * 100
  const prog = cols > 1 ? (live / (cols - 1)) * span : 0
  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, width: Math.min(600, Math.max(360, ctx.w - 560)) }}>
      <div style={{ position: 'absolute', left: 5, width: `${span}%`, top: 5, height: 1, background: 'var(--qs-ink4)' }} />
      <div className="qs-lab-grow" style={{ position: 'absolute', left: 5, width: `${prog}%`, top: 5, height: 1, background: 'var(--qs-ink)' }} />
      {list.map((it) => (
        <button
          key={it.i}
          type="button"
          className="qs-lab-btn"
          aria-current={it.live ? 'step' : undefined}
          data-tip={it.title}
          data-tip-desc={`${it.detail} · ${status(it)}`}
          onClick={() => ctx.goStep(it.i)}
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', minWidth: 0 }}
        >
          <span
            className="qs-lab-fade"
            style={{
              position: 'relative',
              width: 11,
              height: 11,
              borderRadius: '50%',
              boxSizing: 'border-box',
              border: `1px solid ${it.reached ? 'var(--qs-ink)' : 'var(--qs-ink4)'}`,
              background: it.done && !it.live ? 'var(--qs-ink)' : 'var(--qs-bg)',
            }}
          >
            {it.live && <span className="qs-lab-ping" />}
          </span>
          <span className="qs-lab-fade" style={{ ...MONO11, color: fg(it) }}>
            {it.num} {it.title}
          </span>
          <span style={{ ...SANS12, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{it.detail}</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- C side index

export function SideIndex({ ctx }: { ctx: HudCtx }) {
  const { list, live } = items(ctx)
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16, width: 200, paddingLeft: 20, boxSizing: 'border-box', ...MONO11 }}>
      <div style={{ position: 'absolute', left: 0, top: -4, bottom: -4, width: 1, background: 'var(--qs-ink4)' }} />
      <div className="qs-lab-move" style={{ position: 'absolute', left: -1.5, top: live * 27 - 6.5, width: 4, height: 24, background: 'var(--qs-ink)' }} />
      {list.map((it) => (
        <button
          key={it.i}
          type="button"
          className="qs-lab-btn qs-lab-fade"
          aria-current={it.live ? 'step' : undefined}
          data-tip={it.title}
          data-tip-desc={it.detail}
          data-tip-side="right"
          onClick={() => ctx.goStep(it.i)}
          style={{ display: 'flex', justifyContent: 'space-between', height: 11, alignItems: 'center', color: fg(it) }}
        >
          <span>
            {it.num} {it.title}
          </span>
          <span style={{ color: it.live ? 'var(--qs-ink)' : 'var(--qs-ink3)' }}>{status(it)}</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- D step ring

const RING_POS: [number, number][] = [
  [120, 22],
  [212, 100],
  [120, 178],
  [28, 100],
]

export function StepRing({ ctx }: { ctx: HudCtx }) {
  const { list, live } = items(ctx)
  const n = Math.max(1, list.length)
  const pos = (i: number): [number, number] => {
    if (n === 4) return RING_POS[i]
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return [120 + Math.cos(a) * 92, 100 + Math.sin(a) * 78]
  }
  return (
    <div style={{ position: 'relative', width: 240, height: 200 }}>
      <div style={{ position: 'absolute', left: 60, top: 40, width: 120, height: 120, borderRadius: '50%', border: '1px solid var(--qs-ink4)', boxSizing: 'border-box' }} />
      <div className="qs-lab-turn" style={{ position: 'absolute', left: 60, top: 40, width: 120, height: 120, transform: `rotate(${(live * 360) / n}deg)` }}>
        <div style={{ position: 'absolute', left: 59.5, top: 0, width: 1, height: 60, background: 'var(--qs-ink)' }} />
        <div style={{ position: 'absolute', left: 56, top: -4, width: 8, height: 8, borderRadius: '50%', background: 'var(--qs-ink)' }} />
      </div>
      <span className="qs-lab-pill" style={{ position: 'absolute', left: 120, top: 100, transform: 'translate(-50%,-50%)', height: 20, padding: '0 8px', border: 0 }}>
        Step {live + 1} / {n}
      </span>
      {list.map((it) => {
        const [x, y] = pos(it.i)
        return (
          <button
            key={it.i}
            type="button"
            className="qs-lab-btn qs-lab-fade"
            aria-current={it.live ? 'step' : undefined}
            data-tip={it.title}
            data-tip-desc={`${it.detail} · ${status(it)}`}
            onClick={() => ctx.goStep(it.i)}
            style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)', ...MONO11, color: it.live ? 'var(--qs-ink)' : 'var(--qs-ink3)' }}
          >
            {it.title}
          </button>
        )
      })}
    </div>
  )
}
