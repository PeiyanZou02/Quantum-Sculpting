// The HUD composer. The view is composed from the Quicksilver mark families: per family, any number of
// variants (stored comma-separated, e.g. "v1,v3") or off. Presets set them together; anything changed by hand makes the composition "Custom".
// Modules that follow the object draw over the whole view; the rest sit in slots (corners, edges)
// stacked so they never overlap each other.
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Family, HudCtx, HudModule } from './types'
import { ORBIT_MODULES } from './orbit'
import { CAMERA_MODULES } from './camera'
import { DIAL_MODULES } from './dial'
import { BOUNDS_MODULES } from './bounds'
import { FOCUS_MODULES } from './focus'
import { SELECTION_MODULES } from './selection'
import { CALLOUT_MODULES } from './callout'
import { FRAME_MODULES } from './frame'
import { META_MODULES } from './meta'
import { SCAN_MODULES } from './scan'
import { STEPS_MODULES } from './steps'
import { CAPTURES_MODULES } from './captures'
import { CARDS_MODULES, SLICECARD_MODULES } from './cards'
import { STAGES_MODULES } from './stages'
import { usePresent, type Look } from '../present'
import './composer.css'

export const FAMILIES: { id: Family; title: string; desc: string; modules: HudModule[] }[] = [
  { id: 'frame', title: 'Frame', desc: 'Registration marks around the view', modules: FRAME_MODULES },
  { id: 'meta', title: 'Readouts', desc: 'History and scene blocks in the corners', modules: META_MODULES },
  { id: 'steps', title: 'Steps', desc: 'Where you are in the pipeline', modules: STEPS_MODULES },
  { id: 'orbit', title: 'Orbit rings', desc: 'Where the view camera is, and where it can go', modules: ORBIT_MODULES },
  { id: 'camera', title: 'Camera', desc: 'The view camera as a diagram', modules: CAMERA_MODULES },
  { id: 'dial', title: 'Orbit, abstracted', desc: 'Position as numbers on scales', modules: DIAL_MODULES },
  { id: 'bounds', title: 'Bounds', desc: 'The grid volume and the print size', modules: BOUNDS_MODULES },
  { id: 'focus', title: 'Focus', desc: 'What the view camera is looking at', modules: FOCUS_MODULES },
  { id: 'selection', title: 'Selection', desc: 'The probed cell', modules: SELECTION_MODULES },
  { id: 'callout', title: 'Callouts', desc: 'Data attached to a point', modules: CALLOUT_MODULES },
  { id: 'scan', title: 'Scan and slice', desc: 'The layer being read or printed', modules: SCAN_MODULES },
  { id: 'captures', title: 'Captures', desc: 'Runs or shots this session', modules: CAPTURES_MODULES },
  { id: 'slicecard', title: 'Slice card', desc: 'The section under the cutting plane', modules: SLICECARD_MODULES },
  { id: 'cards', title: 'Data cards', desc: 'Quantum result, print check, model, grid', modules: CARDS_MODULES },
  { id: 'stages', title: 'Stages', desc: 'Model, voxels, quantum and mesh side by side', modules: STAGES_MODULES },
]

export type Composition = Partial<Record<Family, string>>   // variant ids, comma-separated, or 'off'

/** The variants of a family that are on. */
export const variantsOf = (c: Record<string, string | undefined>, f: string): string[] => (c[f] ?? 'off').split(',').filter((v) => v && v !== 'off')
/** The family's value with `id` toggled on or off (others in the family stay). */
export function toggleVariant(c: Record<string, string | undefined>, f: string, id: string): string {
  const cur = variantsOf(c, f)
  const next = cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]
  return next.length ? next.join(',') : 'off'
}
const same = (a: string | undefined, b: string | undefined) => variantsOf({ x: a }, 'x').sort().join() === variantsOf({ x: b }, 'x').sort().join()

const pick = (f: Family, i: number) => FAMILIES.find((x) => x.id === f)?.modules[i]?.id ?? 'off'
export const PRESETS: { id: string; title: string; desc: string; set: () => Composition }[] = [
  {
    id: 'lab', title: 'Lab', desc: 'Registration frame, readouts, steps, orbit ring, captures',
    set: () => ({ frame: pick('frame', 0), meta: pick('meta', 2), steps: pick('steps', 1), orbit: pick('orbit', 0), bounds: pick('bounds', 0), focus: 'off', selection: pick('selection', 2), callout: pick('callout', 1), scan: 'off', captures: pick('captures', 0), camera: 'off', dial: 'off' }),
  },
  {
    id: 'camera', title: 'Camera', desc: 'Stations, the az/el chart and a tick ring',
    set: () => ({ frame: pick('frame', 1), meta: pick('meta', 1), steps: 'off', orbit: pick('orbit', 2), camera: pick('camera', 3), dial: pick('dial', 0), bounds: 'off', focus: pick('focus', 0), selection: 'off', callout: 'off', scan: 'off', captures: 'off' }),
  },
  {
    id: 'measure', title: 'Measure', desc: 'Extents, numbered callouts and a safe area',
    set: () => ({ frame: pick('frame', 3), meta: pick('meta', 0), steps: 'off', orbit: 'off', camera: 'off', dial: pick('dial', 2), bounds: pick('bounds', 1), focus: pick('focus', 0), selection: pick('selection', 0), callout: pick('callout', 2), scan: 'off', captures: 'off' }),
  },
  {
    id: 'quantum', title: 'Quantum', desc: 'Quantum readouts, the slice index and run history',
    set: () => ({ frame: pick('frame', 0), meta: pick('meta', 3), steps: pick('steps', 1), orbit: 'off', camera: 'off', dial: 'off', bounds: pick('bounds', 2), focus: 'off', selection: pick('selection', 3), callout: pick('callout', 3), scan: pick('scan', 1), captures: pick('captures', 3) }),
  },
  {
    id: 'clean', title: 'Clean', desc: 'Only the steps; nothing over the object',
    set: () => ({ frame: 'off', meta: 'off', steps: pick('steps', 1), orbit: 'off', camera: 'off', dial: 'off', bounds: 'off', focus: 'off', selection: pick('selection', 2), callout: pick('callout', 1), scan: 'off', captures: 'off' }),
  },
]

/** Every family set: the preset's choices, everything else off. */
export function full(c: Composition): Record<string, string> {
  return Object.fromEntries(FAMILIES.map((f) => [f.id, c[f.id] ?? 'off']))
}

export const DEFAULT_COMPOSITION = (): Composition => PRESETS[0].set()

/** Which preset a composition equals, or null (custom). */
export function presetOf(c: Composition): string | null {
  for (const p of PRESETS) {
    const want = p.set()
    if (FAMILIES.every((f) => same(want[f.id], c[f.id]))) return p.id
  }
  return null
}

const SLOTS = ['tl', 'tr', 'bl', 'br', 'top', 'bottom', 'left', 'right'] as const

export interface Placement { x: number; y: number; c?: boolean }
export const TIER_OPACITY = { 1: 1, 2: 0.58, 3: 0.3 } as const

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

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
/** Saves an element as a transparent PNG at 3×, leaving out handles and other controls. */
export async function savePng(el: HTMLElement, name: string, scale = 3) {
  const { toPng } = await import('html-to-image')
  const pi = usePresent.getState().pngInk   // as shown, or forced dark (for light grounds) or light (for dark ones)
  const ink = pi === 'auto' ? null : 'ink-' + pi
  if (ink) el.classList.add(ink)   // re-resolves the theme tokens inside the piece for the capture
  const url = await toPng(el, {
    pixelRatio: scale,
    style: { background: 'none', zoom: el.style.zoom, opacity: el.style.opacity },
    filter: (n) => !(n instanceof Element && n.matches('.hud-piece__bar, [data-no-export], canvas, [data-hud^="chrome:"], .stage__drop, .landing')),
  }).finally(() => { if (ink) el.classList.remove(ink) })
  const a = document.createElement('a')
  a.href = url
  a.download = `quantum-sculptor-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stamp()}.png`
  a.click()
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
      <div ref={body} className="hud-piece__body" style={{ opacity: TIER_OPACITY[tier] * (dim ? 0.16 : 1), zoom: look?.size && look.size !== 1 ? look.size : undefined }}>
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

export const keyOf = (m: HudModule) => `${m.family}:${m.id}`
/** Every module a composition turns on, in family order. */
export function chosenOf(compose: Record<string, string | undefined>): HudModule[] {
  return FAMILIES.flatMap((f) => variantsOf(compose, f.id).map((v) => f.modules.find((m) => m.id === v)).filter((m): m is HudModule => !!m))
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
export function HudLayer({ ctx, compose, chrome, positions = {}, arrange = false, edit, looks = {}, hl = null, ghost = null, texts = [], onMove, onText }: {
  ctx: HudCtx; compose: Composition; chrome?: Partial<Record<(typeof SLOTS)[number], ReactNode>>
  positions?: Record<string, Placement>; arrange?: boolean; edit?: Edit; looks?: Record<string, Look>; hl?: string | null
  /** The piece being previewed from the library: drawn with a "Preview" tag. */
  ghost?: string | null
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
  useLayoutEffect(() => fitStrips(root.current))
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

/** The view frame scaled into a tile: a still of the geometry with marks drawn over it. `crop` picks the
 *  window to show: the whole frame, or the rectangle the content occupies (measured after the first paint). */
function Mini({ ctx, bg, w, h, crop, children }: { ctx: HudCtx; bg?: string | null; w: number; h: number; crop: 'frame' | 'corner' | 'content' | 'object'; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null)
  const s0 = Math.min(w / ctx.w, h / ctx.h)
  const [fit, setFit] = useState<{ s: number; x: number; y: number }>({ s: s0, x: (w - ctx.w * s0) / 2, y: (h - ctx.h * s0) / 2 })
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    let r: { l: number; t: number; r: number; b: number } = { l: 0, t: 0, r: ctx.w, b: ctx.h }
    if (crop === 'corner') r = { l: 0, t: 0, r: ctx.w * 0.5, b: ctx.h * 0.5 }
    else if (crop === 'object' && ctx.rect) {
      const R = ctx.rect, mx = (R.r - R.l) * 0.45 + 40, my = (R.b - R.t) * 0.45 + 40
      r = { l: R.l - mx, r: R.r + mx, t: R.t - my, b: R.b + my }
    } else if (crop === 'content') {
      const fr = el.getBoundingClientRect(), k = fr.width / ctx.w || 1
      const kids = el.querySelectorAll('.hud-slot > *, .hud-free > *')
      if (kids.length) {
        r = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity }
        kids.forEach((c) => {
          const b = c.getBoundingClientRect()
          if (!b.width && !b.height) return
          r = { l: Math.min(r.l, (b.left - fr.left) / k), t: Math.min(r.t, (b.top - fr.top) / k), r: Math.max(r.r, (b.right - fr.left) / k), b: Math.max(r.b, (b.bottom - fr.top) / k) }
        })
        if (!Number.isFinite(r.l)) r = { l: 0, t: 0, r: ctx.w, b: ctx.h }
        const px = 28
        r = { l: r.l - px, t: r.t - px, r: r.r + px, b: r.b + px }
      }
    }
    const cw = Math.max(40, r.r - r.l), ch = Math.max(30, r.b - r.t)
    const s = Math.min(w / cw, h / ch, 0.9)
    setFit({ s, x: w / 2 - ((r.l + r.r) / 2) * s, y: h / 2 - ((r.t + r.b) / 2) * s })
  }, [ctx.w, ctx.h, crop, w, h, ctx.rect?.l, ctx.rect?.t]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mini" style={{ width: w, height: h }} aria-hidden>
      <div ref={frame} className="mini__frame" inert style={{ width: ctx.w, height: ctx.h, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})` }}>
        {bg && <img className="mini__bg" src={bg} alt="" />}
        <div className="hud-layer">{children}</div>
      </div>
    </div>
  )
}

/** A live preview of one mark, cropped to where it draws. Marks over the whole view show their top-left
 *  quarter (frames and rulers are symmetric); lines are thickened as the tile shrinks so they stay visible. */
export function MarkThumb({ m, ctx, bg, w = 148, h = 92, look }: { m: HudModule; ctx: HudCtx; bg?: string | null; w?: number; h?: number; look?: Look }) {
  const crop = m.slot === 'full' ? 'corner' : m.slot === 'object' ? 'object' : 'content'
  const s = crop === 'corner' ? (w / ctx.w) * 2 : crop === 'object' && ctx.rect ? w / ((ctx.rect.r - ctx.rect.l) * 1.9 + 80) : 0.5
  look = { ...look, weight: (look?.weight ?? 1) * Math.min(3, Math.max(1, 0.3 / s)) }
  const node = m.slot === 'object' || m.slot === 'full'
    ? <Free k={keyOf(m)} look={look}>{m.render(ctx)}</Free>
    : <div className={`hud-slot hud-slot--${m.slot}`}><Piece k={keyOf(m)} label={m.label} ctx={ctx} arrange={false} look={look}>{m.render(ctx)}</Piece></div>
  return <Mini ctx={ctx} bg={bg} w={w} h={h} crop={crop}>{node}</Mini>
}

/** A live preview of a whole composition, with its positions, looks and text. */
export function CompThumb({ compose, ctx, bg, w = 148, h = 92, positions, looks, texts }: {
  compose: Composition; ctx: HudCtx; bg?: string | null; w?: number; h?: number
  positions?: Record<string, Placement>; looks?: Record<string, Look>; texts?: { id: string; text: string }[]
}) {
  return (
    <Mini ctx={ctx} bg={bg} w={w} h={h} crop="frame">
      <HudLayer ctx={ctx} compose={compose} positions={positions} looks={looks} texts={texts} />
    </Mini>
  )
}
