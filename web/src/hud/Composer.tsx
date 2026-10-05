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

/** Present-mode compositions: display-first, for screenshots and recordings. `sketch` draws the thumbnail. */
export interface PresentPreset { id: string; title: string; desc: string; set: () => Composition; sketch: string[] }
export const PRESENT_PRESETS: PresentPreset[] = [
  {
    id: 'sheet', title: 'Lab sheet', desc: 'Registration frame, history and scene, the gimbal ring, the four stages and the result',
    set: () => ({ frame: pick('frame', 0), meta: pick('meta', 2), orbit: pick('orbit', 0), stages: pick('stages', 0), cards: pick('cards', 0) }),
    sketch: ['dots', 'tl-wide', 'ring', 'bottom-stages', 'br-card'],
  },
  {
    id: 'orbit', title: 'Orbit study', desc: 'Camera stations, the az / el chart and a tick ring',
    set: () => ({ frame: pick('frame', 1), meta: pick('meta', 1), orbit: pick('orbit', 2), camera: pick('camera', 3), dial: pick('dial', 0), focus: pick('focus', 0), steps: 'off', bounds: 'off', selection: 'off', callout: 'off', scan: 'off', captures: 'off' }),
    sketch: ['brackets', 'tr-block', 'tr-chart', 'ring-stations', 'br-dial'],
  },
  {
    id: 'measure', title: 'Measure', desc: 'Extents in mm, edge rulers, numbered callouts',
    set: () => ({ frame: pick('frame', 3), meta: pick('meta', 0), bounds: pick('bounds', 1), focus: pick('focus', 0), dial: pick('dial', 2), callout: pick('callout', 2), selection: pick('selection', 2), cards: pick('cards', 1) }),
    sketch: ['safe', 'tl-block', 'extents', 'rulers', 'br-card'],
  },
  {
    id: 'quantum', title: 'Quantum readout', desc: 'Qubit settings, the slice index, run scatter',
    set: () => ({ frame: pick('frame', 0), meta: pick('meta', 3), steps: pick('steps', 1), slicecard: pick('slicecard', 2), cards: pick('cards', 0), bounds: pick('bounds', 2), selection: pick('selection', 3), captures: pick('captures', 3) }),
    sketch: ['dots', 'top-rail', 'tr-block', 'bl-card', 'br-card', 'footprint', 'bottom-dots'],
  },
  {
    id: 'scan', title: 'Scan', desc: 'Layer stack, the cutting plane and a focus frame',
    set: () => ({ frame: pick('frame', 2), meta: pick('meta', 1), scan: pick('scan', 2), focus: pick('focus', 1), slicecard: pick('slicecard', 1) }),
    sketch: ['brackets', 'tr-block', 'right-stack', 'focus-frame', 'bl-card'],
  },
  {
    id: 'clean', title: 'Clean', desc: 'Just the object; an orbit ring appears only while it turns',
    set: () => ({ orbit: pick('orbit', 3), focus: pick('focus', 3) }),
    sketch: ['ring-faint'],
  },
]

/** Every family set: the preset's choices, everything else off. */
export function full(c: Composition): Record<string, string> {
  return Object.fromEntries(FAMILIES.map((f) => [f.id, c[f.id] ?? 'off']))
}

/** Which present preset a composition equals, or null. */
export function presentPresetOf(c: Composition): string | null {
  for (const p of PRESENT_PRESETS) {
    const want = p.set()
    if (FAMILIES.every((f) => same(want[f.id], c[f.id]))) return p.id
  }
  return null
}

/** A schematic thumbnail of a composition: frame, object, and where its pieces sit. */
export function Sketch({ parts, w = 112, h = 70 }: { parts: string[]; w?: number; h?: number }) {
  const has = (k: string) => parts.includes(k)
  const ink = 'var(--qs-ink)', ink3 = 'var(--qs-ink3)', ink4 = 'var(--qs-ink4)'
  const cx = w / 2, cy = h / 2 + 2
  const block = (x: number, y: number, bw: number, rows = 3) => (
    <g>{Array.from({ length: rows }, (_, i) => <line key={i} x1={x} x2={x + (i ? bw : bw * 0.5)} y1={y + i * 4} y2={y + i * 4} stroke={i ? ink3 : ink} strokeWidth={1.2} />)}</g>
  )
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sketch" aria-hidden>
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={8} fill="var(--qs-faint)" stroke="var(--qs-line)" />
      {has('dots') && Array.from({ length: 9 }, (_, i) => (
        <g key={i}><rect x={8 + i * 12} y={4} width={1.5} height={1.5} fill={ink3} /><rect x={8 + i * 12} y={h - 6} width={1.5} height={1.5} fill={ink3} /></g>
      ))}
      {(has('brackets') || has('dots')) && [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y + (y < h / 2 ? 5 : -5)}V${y}H${x + (x < w / 2 ? 5 : -5)}`} fill="none" stroke={has('brackets') ? ink : ink4} />
      ))}
      {has('safe') && <rect x={w * 0.1} y={h * 0.1} width={w * 0.8} height={h * 0.8} fill="none" stroke={ink3} strokeDasharray="2 2" />}
      {/* the object */}
      <ellipse cx={cx} cy={cy + 10} rx={10} ry={3} fill="none" stroke={ink4} />
      <rect x={cx - 10} y={cy - 12} width={20} height={22} rx={2} fill="var(--qs-ink4)" opacity={0.55} />
      {has('ring') && <ellipse cx={cx} cy={cy + 8} rx={26} ry={8} fill="none" stroke={ink} />}
      {has('ring-faint') && <ellipse cx={cx} cy={cy + 8} rx={26} ry={8} fill="none" stroke={ink4} strokeDasharray="2 2" />}
      {has('ring-stations') && <g><ellipse cx={cx} cy={cy + 8} rx={26} ry={8} fill="none" stroke={ink3} />{Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2; return <circle key={i} cx={cx + Math.cos(a) * 26} cy={cy + 8 + Math.sin(a) * 8} r={1.4} fill={ink} /> })}</g>}
      {has('focus-frame') && <rect x={cx - 16} y={cy - 17} width={32} height={32} fill="none" stroke={ink3} strokeDasharray="2 2" />}
      {has('extents') && <g stroke={ink}><line x1={cx - 10} x2={cx + 10} y1={cy - 17} y2={cy - 17} /><line x1={cx + 15} x2={cx + 15} y1={cy - 12} y2={cy + 10} /></g>}
      {has('footprint') && <ellipse cx={cx} cy={cy + 11} rx={16} ry={4} fill="none" stroke={ink} strokeDasharray="2 2" />}
      {has('rulers') && <g stroke={ink3}>{Array.from({ length: 14 }, (_, i) => <line key={i} x1={14 + i * 6} x2={14 + i * 6} y1={h - 9} y2={h - (i % 4 ? 11 : 13)} />)}{Array.from({ length: 7 }, (_, i) => <line key={'r' + i} x1={w - 9} x2={w - (i % 3 ? 11 : 13)} y1={14 + i * 6} y2={14 + i * 6} />)}</g>}
      {has('tl-wide') && <g>{block(10, 12, 18)}{block(32, 12, 18)}</g>}
      {has('tl-block') && block(10, 12, 20)}
      {has('tr-block') && block(w - 30, 12, 20)}
      {has('tr-chart') && <rect x={w - 30} y={26} width={20} height={12} fill="none" stroke={ink3} />}
      {has('br-dial') && <circle cx={w - 18} cy={h - 18} r={7} fill="none" stroke={ink3} strokeDasharray="1 1.5" />}
      {has('br-cube') && <path d={`M${w - 26} ${h - 14}h12v-10h-12zM${w - 26} ${h - 24}l4 -3h12l-4 3M${w - 14} ${h - 14}l4 -3v-10`} fill="none" stroke={ink3} />}
      {has('right-stack') && Array.from({ length: 6 }, (_, i) => <line key={i} x1={w - 18} x2={w - (i === 3 ? 6 : 12)} y1={22 + i * 5} y2={22 + i * 5} stroke={i === 3 ? ink : ink3} />)}
      {has('top-rail') && <g><line x1={cx - 22} x2={cx + 22} y1={9} y2={9} stroke={ink3} />{[0, 1, 2, 3].map((i) => <circle key={i} cx={cx - 22 + i * 14.6} cy={9} r={1.6} fill={i < 3 ? ink : 'var(--qs-bg)'} stroke={ink} />)}</g>}
      {has('bl-card') && <rect x={8} y={h - 26} width={24} height={18} rx={3} fill="none" stroke={ink3} />}
      {has('br-card') && <g><rect x={w - 32} y={h - 30} width={24} height={22} rx={3} fill="none" stroke={ink3} /><line x1={w - 28} x2={w - 18} y1={h - 24} y2={h - 24} stroke={ink} strokeWidth={1.4} />{[0, 1, 2, 3, 4].map((i) => <line key={i} x1={w - 28 + i * 4} x2={w - 28 + i * 4} y1={h - 12} y2={h - 12 - (5 - i) * 1.6} stroke={ink3} />)}</g>}
      {has('bottom-stages') && [0, 1, 2, 3].map((i) => <rect key={'st' + i} x={cx - 30 + i * 15.5} y={h - 16} width={13} height={9} rx={2} fill="none" stroke={i === 2 ? ink : ink3} />)}
      {has('bottom-dots') && [0, 1, 2, 3, 4].map((i) => <circle key={i} cx={cx - 12 + i * 6} cy={h - 12} r={1.8} fill={i < 2 ? ink3 : 'none'} stroke={ink3} />)}
    </svg>
  )
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

export interface Placement { x: number; y: number }
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

interface PieceProps {
  k: string; label: string; ctx: HudCtx; pos?: Placement; arrange: boolean; grab?: boolean; live?: boolean; slot?: string
  look?: Look; dim?: boolean; onMove?: (k: string, p: Placement | null) => void; children: ReactNode
}
/** A piece in a slot or at a dragged position. In arrange mode every piece shows its handle; in grab
 *  mode (Present) a piece shows it on hover and can be dragged by its body, or saved as a PNG. */
function Piece({ k, label, ctx, pos, arrange, grab, live, look, dim, onMove, children }: PieceProps) {
  const body = useRef<HTMLDivElement>(null)
  useStrokes(body, look)
  const start = (e: React.PointerEvent<HTMLElement>) => {
    if (!onMove || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const el = (e.currentTarget.closest('.hud-piece') as HTMLElement)
    const view = el.closest('.hud-layer') as HTMLElement
    const vr = view.getBoundingClientRect(), r = el.getBoundingClientRect()
    const dx = e.clientX - r.left, dy = e.clientY - r.top
    el.classList.add('hud-piece--dragging')
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(vr.width - r.width, ev.clientX - vr.left - dx)) / vr.width
      const y = Math.max(0, Math.min(vr.height - r.height, ev.clientY - vr.top - dy)) / vr.height
      onMove(k, { x, y })
    }
    const up = () => { el.classList.remove('hud-piece--dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const tier = look?.tier ?? 1
  const cls = 'hud-piece' + (live ? ' hud-mod--live' : '') + (arrange ? ' hud-piece--arrange' : '') + (grab && !arrange ? ' hud-piece--grab' : '') + (pos ? ' hud-piece--placed' : '')
  const bar = arrange || grab
  return (
    <div className={cls} data-hud={k} style={pos ? { left: pos.x * ctx.w, top: pos.y * ctx.h } : undefined}
      onPointerDown={grab && !live && !arrange ? start : undefined}>
      {bar && (
        <div className="hud-piece__bar" data-qs-probe-ui>
          <button className="hud-piece__handle" onPointerDown={start} onDoubleClick={() => onMove?.(k, null)}
            data-tip={`Drag ${label}`} data-tip-desc={pos ? 'Drag to place it. Double-click to send it back to its corner.' : 'Drag to place it anywhere.'}>
            <span className="hud-piece__grip" />{label}
          </button>
          <button className="hud-piece__btn" onClick={() => body.current && savePng(body.current, label)}
            data-tip="Save as PNG" data-tip-desc="This piece alone, transparent, at 3×, to place over anything.">PNG</button>
        </div>
      )}
      <div ref={body} className="hud-piece__body" style={{ opacity: TIER_OPACITY[tier] * (dim ? 0.16 : 1), zoom: look?.size && look.size !== 1 ? look.size : undefined }}>
        {children}
      </div>
    </div>
  )
}

/** Object and full-view marks: drawn over the whole view, styled like pieces but not draggable. */
function Free({ k, live, look, dim, children }: { k: string; live?: boolean; look?: Look; dim?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useStrokes(ref, look)
  return (
    <div ref={ref} className={'hud-free' + (live ? ' hud-free--live' : '')} data-hud={k} style={{ opacity: TIER_OPACITY[look?.tier ?? 1] * (dim ? 0.16 : 1) }}>
      {children}
    </div>
  )
}

/** Free text on the view: double-click to edit, drag to place. */
function TextPiece({ id, text, ctx, pos, onMove, onText, grab }: {
  id: string; text: string; ctx: HudCtx; pos: Placement; grab: boolean
  onMove?: (k: string, p: Placement | null) => void; onText?: (id: string, t: string | null) => void
}) {
  const [edit, setEdit] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!edit || !ref.current) return
    ref.current.focus()
    document.getSelection()?.selectAllChildren(ref.current)
  }, [edit])
  const k = `text:${id}`
  return (
    <Piece k={k} label="Text" ctx={ctx} pos={pos} arrange={false} grab={grab && !edit} onMove={onMove} live={edit}>
      <span ref={ref} className={'hud-text' + (edit ? ' hud-text--edit' : '')} contentEditable={edit} suppressContentEditableWarning
        onDoubleClick={() => grab && setEdit(true)}
        onBlur={(e) => { setEdit(false); const t = e.currentTarget.textContent?.trim() ?? ''; onText?.(id, t || null) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur() }}
        data-tip={grab && !edit ? 'Double-click to edit' : undefined}>{text}</span>
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
export function HudLayer({ ctx, compose, chrome, positions = {}, arrange = false, grab = false, looks = {}, hl = null, texts = [], onMove, onText }: {
  ctx: HudCtx; compose: Composition; chrome?: Partial<Record<(typeof SLOTS)[number], ReactNode>>
  positions?: Record<string, Placement>; arrange?: boolean; grab?: boolean; looks?: Record<string, Look>; hl?: string | null
  texts?: { id: string; text: string }[]
  onMove?: (k: string, p: Placement | null) => void; onText?: (id: string, t: string | null) => void
}) {
  const chosen = chosenOf(compose)
  const key = keyOf
  const free = chosen.filter((m) => m.slot === 'object' || m.slot === 'full')
  const placed = chosen.filter((m) => m.slot !== 'object' && m.slot !== 'full' && positions[key(m)])
  const slotted = (s: string) => chosen.filter((m) => m.slot === s && !positions[key(m)])
  const dim = (m: HudModule) => !!hl && hl !== key(m)
  const piece = (m: HudModule, pos?: Placement) => (
    <Piece key={key(m)} k={key(m)} label={m.label} ctx={ctx} pos={pos} arrange={arrange} grab={grab} onMove={onMove} live={m.interactive} look={looks[key(m)]} dim={dim(m)}>{m.render(ctx)}</Piece>
  )
  const chromeAt = (s: (typeof SLOTS)[number]) => (chrome?.[s] && !positions[`chrome:${s}`] ? (
    <Piece k={`chrome:${s}`} label="controls" ctx={ctx} arrange={arrange} onMove={onMove} live>{chrome[s]}</Piece>
  ) : null)
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => fitStrips(root.current))
  return (
    <div ref={root} className={'hud-layer' + (arrange ? ' hud-layer--arrange' : '') + (grab ? ' hud-layer--grab' : '')}>
      {free.map((m) => <Free key={key(m)} k={key(m)} live={m.interactive} look={looks[key(m)]} dim={dim(m)}>{m.render(ctx)}</Free>)}
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
      {texts.map((t) => (
        <TextPiece key={t.id} id={t.id} text={t.text} ctx={ctx} pos={positions[`text:${t.id}`] ?? { x: 0.42, y: 0.12 }} grab={grab || arrange} onMove={onMove} onText={onText} />
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

/** A live preview of a whole composition. */
export function CompThumb({ compose, ctx, bg, w = 148, h = 92 }: { compose: Composition; ctx: HudCtx; bg?: string | null; w?: number; h?: number }) {
  return (
    <Mini ctx={ctx} bg={bg} w={w} h={h} crop="frame">
      <HudLayer ctx={ctx} compose={compose} />
    </Mini>
  )
}
