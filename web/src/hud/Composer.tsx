// The HUD composer. The view is composed from the Quicksilver mark families: per family, any number of
// variants (stored comma-separated, e.g. "v1,v3") or off. Presets set them together; anything changed by hand makes the composition "Custom".
// Modules that follow the object draw over the whole view; the rest sit in slots (corners, edges)
// stacked so they never overlap each other.
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { HudCtx, HudModule } from './types'
import { TIER_OPACITY, chosenOf, keyOf, savePng, settle, type Composition, type Placement } from './compose'
import type { Look } from '../present'
import './composer.css'

const SLOTS = ['tl', 'tr', 'bl', 'br', 'top', 'bottom', 'left', 'right'] as const

const SHAPES = 'line, path, circle, rect, polyline, polygon, ellipse'
/** Line weight and dash spacing as multiples of each mark's own: the marks keep their internal
 *  hierarchy (hairlines stay thinner than main lines). Originals are read once and kept on the node. */
function useStrokes(ref: RefObject<HTMLElement | null>, look?: Look) {
  const w = look?.weight ?? 1, d = look?.dash ?? 1
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const on = w !== 1 || d !== 1
    if (!on && !el.dataset.looked) return
    el.dataset.looked = on ? '1' : ''
    el.querySelectorAll<SVGElement>(SHAPES).forEach((s) => {
      if (!(s instanceof SVGElement)) return
      if (!on) { s.style.strokeWidth = ''; s.style.strokeDasharray = ''; return }
      const a = s.getAttribute('stroke-width')
      if (a != null) s.dataset.sw = a
      else if (s.dataset.sw == null) { s.style.strokeWidth = ''; s.dataset.sw = String(parseFloat(getComputedStyle(s).strokeWidth) || 1) }
      s.style.strokeWidth = String(+s.dataset.sw! * w)
      const da = s.getAttribute('stroke-dasharray')
      if (da != null) s.dataset.da = da
      else if (s.dataset.da == null) { s.style.strokeDasharray = ''; s.dataset.da = getComputedStyle(s).strokeDasharray }
      const src = s.dataset.da!
      if (!src || src === 'none') return
      let parts = src.split(/[\s,]+/).map(parseFloat).filter((x) => !Number.isNaN(x))
      if (parts.length % 2) parts = [...parts, ...parts]
      s.style.strokeDasharray = parts.map((x, i) => (i % 2 ? x * d : x * Math.max(0.5, w))).join(' ')
    })
  })
}

/** What compose mode can do to the pieces (Present). Without it, pieces stay where they are. */
export interface Edit { sel: string | null; onSelect: (k: string | null) => void; onRemove: (k: string) => void }

interface PieceProps {
  k: string; label: string; ctx: HudCtx; pos?: Placement; arrange: boolean; edit?: Edit; live?: boolean
  look?: Look; dim?: boolean; ghost?: boolean; onMove?: (k: string, p: Placement | null) => void; children: ReactNode
}
/** A piece in a slot or at a dragged position. In Lab's arrange mode every piece shows its handle. In
 *  compose mode a piece is selected by a click, dragged by its body or handle, saved as a PNG, deleted
 *  with ×, or dragged onto the compose panel to take it off. */
function Piece({ k, label, ctx, pos, arrange, edit, live, look, dim, ghost, onMove, children }: PieceProps) {
  const body = useRef<HTMLDivElement>(null)
  useStrokes(body, look)
  const start = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    edit?.onSelect(k)
    if (!onMove) return
    const el = (e.currentTarget.closest('.hud-piece') as HTMLElement)
    const view = el.closest('.hud-layer') as HTMLElement
    const vr = view.getBoundingClientRect(), r = el.getBoundingClientRect()
    const dx = e.clientX - r.left, dy = e.clientY - r.top, x0 = e.clientX, y0 = e.clientY
    const panel = edit ? document.querySelector<HTMLElement>('.pd') : null
    let moved = false, out = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return
      moved = true
      el.classList.add('hud-piece--dragging')
      const pr = panel?.getBoundingClientRect()
      out = !!pr && ev.clientX >= pr.left && ev.clientX <= pr.right && ev.clientY >= pr.top && ev.clientY <= pr.bottom
      panel?.classList.toggle('pd--drop', out)
      el.classList.toggle('hud-piece--out', out)
      const x = Math.max(0, Math.min(vr.width - r.width, ev.clientX - vr.left - dx)) / vr.width
      const y = Math.max(0, Math.min(vr.height - r.height, ev.clientY - vr.top - dy)) / vr.height
      onMove(k, { x, y })
    }
    const up = () => {
      el.classList.remove('hud-piece--dragging', 'hud-piece--out')
      panel?.classList.remove('pd--drop')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (out) edit?.onRemove(k)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const tier = look?.tier ?? 1
  const sel = edit?.sel === k
  const cls = 'hud-piece' + (live ? ' hud-mod--live' : '') + (arrange ? ' hud-piece--arrange' : '') + (edit ? ' hud-piece--edit' : '') + (sel ? ' hud-piece--sel' : '') + (pos ? ' hud-piece--placed' : '') + (ghost ? ' hud-piece--ghost' : '')
  const place = pos ? { left: pos.x * ctx.w, top: pos.y * ctx.h, transform: pos.c ? 'translate(-50%, -50%)' : undefined } : undefined
  const zoom = (look?.size ?? 1) * (pos?.z ?? 1)
  return (
    <div className={cls} data-hud={k} style={place} onPointerDown={edit && !live ? start : undefined}>
      {(arrange || edit) && (
        <div className="hud-piece__bar" data-qs-probe-ui>
          <button className="hud-piece__handle" onPointerDown={start} onDoubleClick={() => onMove?.(k, null)}
            data-tip={`Drag ${label}`} data-tip-desc={edit ? 'Drag it anywhere, or onto the compose panel to take it off. Double-click to send it back to its usual place.' : 'Drag to place it. Double-click to send it back.'}>
            <span className="hud-piece__grip" />{label}
          </button>
          {edit && <button className="hud-piece__btn" onClick={() => body.current && savePng(body.current, label)}
            data-tip="Save as PNG" data-tip-desc="This piece alone, transparent, at 3×, to place over anything.">PNG</button>}
          {edit && <button className="hud-piece__btn hud-piece__btn--x" onClick={() => edit.onRemove(k)} aria-label={`Remove ${label}`}
            data-tip="Remove" data-tip-key="⌫">×</button>}
        </div>
      )}
      <div ref={body} className="hud-piece__body" style={{ opacity: TIER_OPACITY[tier] * (dim ? 0.16 : 1), zoom: zoom !== 1 ? zoom : undefined }}>
        {children}
      </div>
    </div>
  )
}

/** Object and full-view marks: drawn over the whole view, styled like pieces but not draggable. */
function Free({ k, live, look, dim, ghost, children }: { k: string; live?: boolean; look?: Look; dim?: boolean; ghost?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useStrokes(ref, look)
  return (
    <div ref={ref} className={'hud-free' + (live ? ' hud-free--live' : '') + (ghost ? ' hud-free--ghost' : '')} data-hud={k} style={{ opacity: TIER_OPACITY[look?.tier ?? 1] * (dim ? 0.16 : 1) }}>
      {children}
    </div>
  )
}

/** Free text on the view: in compose mode, double-click to edit and drag to place. */
function TextPiece({ id, text, ctx, pos, look, dim, edit, onMove, onText }: {
  id: string; text: string; ctx: HudCtx; pos: Placement; look?: Look; dim?: boolean; edit?: Edit
  onMove?: (k: string, p: Placement | null) => void; onText?: (id: string, t: string | null) => void
}) {
  const [typing, setTyping] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!typing || !ref.current) return
    ref.current.focus()
    document.getSelection()?.selectAllChildren(ref.current)
  }, [typing])
  return (
    <Piece k={`text:${id}`} label="Text" ctx={ctx} pos={pos} arrange={false} edit={edit && !typing ? edit : undefined} onMove={onMove} live={typing} look={look} dim={dim}>
      <span ref={ref} className={'hud-text' + (typing ? ' hud-text--edit' : '')} contentEditable={typing} suppressContentEditableWarning
        onDoubleClick={() => edit && setTyping(true)}
        onBlur={(e) => { setTyping(false); onText?.(id, e.currentTarget.textContent?.trim() || null) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur() }}
        data-tip={edit && !typing ? 'Double-click to edit' : undefined}>{text}</span>
    </Piece>
  )
}

/** The top and bottom strips shrink (down to 55 %) rather than run into a piece in a corner beside them. */
function fitStrips(el: HTMLElement | null) {
  if (!el) return
  const vr = el.getBoundingClientRect()
  for (const [mid, a, b] of [['bottom', 'bl', 'br'], ['top', 'tl', 'tr']] as const) {
    const m = el.querySelector<HTMLElement>(`:scope > .hud-slot--${mid}`)
    if (!m) continue
    m.style.zoom = ''
    const mr = m.getBoundingClientRect()
    if (!mr.width) continue
    const side = (c: string) => {
      const r = el.querySelector(`:scope > .hud-slot--${c}`)?.getBoundingClientRect()
      return r && r.width && r.bottom > mr.top && r.top < mr.bottom ? r : null
    }
    const lr = side(a), rr = side(b)
    const left = lr ? lr.right + 16 : vr.left + 24, right = rr ? rr.left - 16 : vr.right - 24
    const c = vr.left + vr.width / 2
    const avail = m.classList.contains('hud-slot--lean-l') ? right - mr.left : m.classList.contains('hud-slot--lean-r') ? mr.right - left : 2 * Math.min(c - left, right - c)
    if (avail < mr.width) m.style.zoom = String(Math.max(0.55, avail / mr.width))
  }
}

/** Draws the chosen modules over the view. `chrome` lets the host put its own controls into slots. */
export function HudLayer({ ctx, compose, chrome, positions = {}, arrange = false, edit, looks = {}, hl = null, ghost = null, texts = [], autoArrange = false, onCrowded, tidyKey = 0, onMove, onText }: {
  ctx: HudCtx; compose: Composition; chrome?: Partial<Record<(typeof SLOTS)[number], ReactNode>>
  positions?: Record<string, Placement>; arrange?: boolean; edit?: Edit; looks?: Record<string, Look>; hl?: string | null
  /** The piece being previewed from the library (outlined, the rest dimmed). */
  ghost?: string | null
  /** Keep pieces apart: whenever pieces come or go, any that overlaps another moves to a free spot. */
  autoArrange?: boolean
  /** After settling: how many pieces found no room even at 55 %. */
  onCrowded?: (n: number) => void
  /** Bump to tidy up every piece on the view (pieces the user placed may move too). */
  tidyKey?: number
  texts?: { id: string; text: string }[]
  onMove?: (k: string, p: Placement | null) => void; onText?: (id: string, t: string | null) => void
}) {
  const key = keyOf
  const chosen = chosenOf(compose).filter((m) => !looks[key(m)]?.hidden)
  const free = chosen.filter((m) => m.slot === 'object' || m.slot === 'full')
  const placed = chosen.filter((m) => m.slot !== 'object' && m.slot !== 'full' && positions[key(m)])
  const slotted = (s: string) => chosen.filter((m) => m.slot === s && !positions[key(m)])
  const dim = (k: string) => !!hl && hl !== k
  const piece = (m: HudModule, pos?: Placement) => (
    <Piece key={key(m)} k={key(m)} label={m.label} ctx={ctx} pos={pos} arrange={arrange} edit={edit} onMove={onMove} live={m.interactive} look={looks[key(m)]} dim={dim(key(m))} ghost={ghost === key(m)}>{m.render(ctx)}</Piece>
  )
  const chromeAt = (s: (typeof SLOTS)[number]) => (chrome?.[s] && !positions[`chrome:${s}`] ? (
    <Piece k={`chrome:${s}`} label="controls" ctx={ctx} arrange={arrange} onMove={onMove} live>{chrome[s]}</Piece>
  ) : null)
  const root = useRef<HTMLDivElement>(null)
  // whenever pieces come or go, settle them (a piece only previewed does not count); slot stacks shift
  // as pieces move out of them, so settle again until nothing moves (a few passes at most)
  const sig = chosen.map(key).filter((k) => k !== ghost).join() + '|' + texts.map((t) => t.id).join()
  const settledSig = useRef('')
  const tidied = useRef(tidyKey)
  useLayoutEffect(() => {
    fitStrips(root.current)
    const all = tidyKey !== tidied.current
    if (!onMove || !root.current || (!all && (!autoArrange || sig === settledSig.current))) return
    tidied.current = tidyKey
    settledSig.current = sig
    const fixed = (k: string) => !all && !!positions[k] && !positions[k].auto
    let pass = 0
    const run = () => {
      if (!root.current) return
      const { moved, stuck } = settle(root.current, ctx.rect, onMove, fixed, (k) => positions[k]?.z ?? 1, ghost)
      if (moved && ++pass < 4) setTimeout(run, 60)
      else onCrowded?.(stuck)
    }
    run()
  })
  return (
    <div ref={root} className={'hud-layer' + (arrange ? ' hud-layer--arrange' : '') + (edit ? ' hud-layer--edit' : '')}>
      {free.map((m) => <Free key={key(m)} k={key(m)} live={m.interactive} look={looks[key(m)]} dim={dim(key(m))} ghost={ghost === key(m)}>{m.render(ctx)}</Free>)}
      {SLOTS.map((s) => {
        const mods = slotted(s)
        const c = chromeAt(s)
        if (!mods.length && !c) return null
        const first = s === 'tl' || s === 'top' || s === 'left'
        // the bottom strip leans away from an occupied corner instead of running into it
        const busy = (c: 'bl' | 'br') => slotted(c).length > 0 || !!chromeAt(c)
        const lean = s === 'bottom' && busy('br') !== busy('bl') ? (busy('br') ? ' hud-slot--lean-l' : ' hud-slot--lean-r') : ''
        return (
          <div key={s} className={`hud-slot hud-slot--${s}${lean}`}>
            {first && c}
            {mods.map((m) => piece(m))}
            {!first && c}
          </div>
        )
      })}
      {placed.map((m) => piece(m, positions[key(m)]))}
      {texts.filter((t) => !looks[`text:${t.id}`]?.hidden).map((t) => (
        <TextPiece key={t.id} id={t.id} text={t.text} ctx={ctx} pos={positions[`text:${t.id}`] ?? { x: 0.42, y: 0.12 }} look={looks[`text:${t.id}`]} dim={dim(`text:${t.id}`)}
          edit={edit} onMove={onMove} onText={onText} />
      ))}
      {SLOTS.filter((s) => chrome?.[s] && positions[`chrome:${s}`]).map((s) => (
        <Piece key={s} k={`chrome:${s}`} label="controls" ctx={ctx} pos={positions[`chrome:${s}`]} arrange={arrange} onMove={onMove} live>{chrome![s]}</Piece>
      ))}
    </div>
  )
}
