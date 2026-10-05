// Lab · Properties · Compose and Output: the HUD composed over the view, and everything that leaves the
// app. Compose: presets (one list), what the view's own controls show, the component library by
// category, annotations and saved compositions. Output: the frame and its export (image, video, 3D)
// and motion (shots, turntable, slice sweep).
import { useState, type ReactNode } from 'react'
import { useStore, type Tool } from '../store'
import { clockOf, isDirty, usePresent, type Sweep } from '../present'
import { CATEGORIES } from '../hud/registry'
import { countOn, sameComposition, savePng } from '../hud/compose'
import { Icon, IconButton } from '../qs/Icon'
import { Segmented } from '../qs/Segmented'
import { Panel, Button, Buttons, Checkbox, Note } from '../ui/Panel'
import { Slider, Select } from '../qs/Slider'
import { Check } from '../qs/Popover'
import { useLive } from '../live'
import { exportFrame, exportGlb, renderStill, screenshot, toggleRecording } from './capture'
import { FRAMES, frameOf, type FrameId } from '../frames'
import { CURATED, TIDY_LEVELS, presetCompose } from '../hud/tidy'
import { DEFAULT_COMPOSITION, DEFAULT_HUD, DEFAULT_ID } from '../hud/defaultComposition'
import { FloorSize, LibRow, MarkLibrary } from './MarkLibrary'
import { PRESENT_TOOLS } from './presentTools'
import { PARAMS, paramOf } from '../hud/paramDefs'
import { passLength, recordPass, storySegments } from './animator'
import { useNow } from '../useNow'
import type { Track } from '../present'

/** The library's categories as tabs: the scene's own guides and text first, then the Quicksilver sheets. */
// built on first use: the registry imports Properties' cards, which import this file
const cats = () => [{ id: 'scene', short: 'Scene' }, ...CATEGORIES.map((c) => ({ id: c.id, short: c.id === 'glyphs' ? 'Glyphs' : c.id === 'data' ? 'Data' : c.title }))]

/** A group within a page: a small heading and its controls. */
function Group({ label, children }: { label?: string; children: ReactNode }) {
  if (label) return <Panel id={`cmp-${label.toLowerCase().replace(/\W+/g, '-')}`} title={label} sub>{children}</Panel>
  return <section className="pd-sec">{children}</section>
}

/** A labelled group of pills, one of which is on. */
function Pills<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { id: T; t: string; off?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="pd-field">
      {label && <span className="pd-k">{label}</span>}
      <div className="pd-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} disabled={o.off} className={'pd-chip pd-chip--s' + (value === o.id ? ' pd-chip--on' : '')} onClick={() => onChange(o.id)}>{o.t}</button>
        ))}
      </div>
    </div>
  )
}

/** Tabs within a page, with a count each. */
function SubTabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; t: string; n?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pd-subtabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={'pd-subtab' + (value === o.id ? ' pd-subtab--on' : '')} onClick={() => onChange(o.id)}>
          {o.t}{o.n ? <span className={'mk-count' + (o.n > 1 ? ' mk-count--many' : '')}>{o.n}</span> : null}
        </button>
      ))}
    </div>
  )
}

/** The composition on the view (name, save, start clean) and the saved ones, one row each. */
function Compositions() {
  const p = usePresent()
  const cur = p.saved.find((x) => x.id === p.current)
  const dirty = isDirty(p)
  const [name, setName] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  const startClean = () => { if (dirty && !ask) { setAsk(true); return } setAsk(false); p.clear() }
  return (
    <Group>
      <div className="pd-now">
        <input className="pd-in" value={name ?? cur?.name ?? ''} placeholder="Untitled composition" aria-label="Composition name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name != null && cur && name.trim()) p.rename(cur.id, name.trim()); if (cur || !name?.trim()) setName(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} />
        <button className="pd-chip pd-chip--ink" disabled={!dirty} onClick={() => { p.save(name ?? undefined); setName(null) }}>Save</button>
      </div>
      {p.saved.length > 0 && (
        <div className="pd-list">
          {p.saved.map((c, i) => (
            <div key={c.id} role="button" tabIndex={0} className={'pd-save' + (c.id === p.current ? ' pd-save--on' : '')}
              onClick={() => p.load(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') p.load(c.id) }}>
              <span className="pd-save__n">{i + 1}</span>
              <span className="pd-save__t">{c.name}{c.id === p.current && dirty ? ' · changed' : ''}</span>
              <span onClick={(e) => e.stopPropagation()}><IconButton name="clear" size={22} title="Delete" onClick={() => p.removeSaved(c.id)} /></span>
            </div>
          ))}
        </div>
      )}
      <div className="pd-row">
        {cur && <button className="pd-chip pd-chip--s" onClick={() => { p.saveNew(`${cur.name} copy`); setName(null) }}>Save as new</button>}
        <span className="pd-grow" />
        {ask
          ? <><button className="pd-chip pd-chip--s" onClick={startClean}>Discard changes</button><button className="pd-chip pd-chip--s" onClick={() => setAsk(false)}>Keep</button></>
          : <button className="pd-chip pd-chip--s" onClick={startClean}>Start clean</button>}
      </div>
    </Group>
  )
}

/** Lay the pieces out again for the frame, at three degrees of keeping. */
function TidyRow() {
  const p = usePresent()
  return (
    <div className="pd-tidy">
      <span className="pd-tidy__k">Lay out again for {frameOf(p.frame).t.toLowerCase()}</span>
      <Buttons>
        {TIDY_LEVELS.map((l) => <Button key={l.id} onClick={() => p.tidy(l.id)} tip={l.t} desc={l.d}>{l.t}</Button>)}
      </Buttons>
    </div>
  )
}

/** The presets, one per row: put one on and it lays itself out around the object, which stays in the centre. */
function Presets() {
  const p = usePresent()
  const mode = useStore((s) => s.q.mode)
  const evolve = mode === 'nations'
  const hasGrid = useStore((s) => !!s.grid)
  const setQ = useStore((s) => s.setQ)
  return (
    <>
      <div className="pd-plist" role="radiogroup" aria-label="Presets">
        <button role="radio" aria-checked={p.current === DEFAULT_ID && sameComposition(p.compose, DEFAULT_COMPOSITION.compose)} className={'pd-prow' + (sameComposition(p.compose, DEFAULT_COMPOSITION.compose) ? ' pd-prow--on' : '')}
          onClick={() => { p.applyDefault(); useStore.getState().setHud(DEFAULT_HUD) }}>
          <span className="pd-prow__t">Default</span>
          <span className="pd-prow__d">Lab's own layout: readouts down the sides, steps on top, the run underneath.</span>
        </button>
        {CURATED.map((c) => {
          const on = sameComposition(p.compose, presetCompose(c, mode))
          const off = c.mode === 'nations' ? !evolve : c.mode === 'blur' ? evolve : false
          return (
            <button key={c.id} role="radio" aria-checked={on} className={'pd-prow' + (on ? ' pd-prow--on' : '')} onClick={() => p.applyCurated(c.id)}>
              <span className="pd-prow__t">{c.title}{off && <span className="pd-prow__k">{c.mode === 'nations' ? 'Evolve runs' : 'blur runs'}</span>}</span>
              <span className="pd-prow__d">{c.desc}</span>
            </button>
          )
        })}
      </div>
      {!evolve && CURATED.some((c) => c.mode === 'nations' && sameComposition(p.compose, presetCompose(c, mode))) && (
        <div className="pd-need">
          <Note>These pieces read an Evolve run. The quantum step is set to another engine.</Note>
          <Buttons><Button kind="primary" disabled={!hasGrid} onClick={() => { setQ({ mode: 'nations' }); if (!useStore.getState().auto) useStore.getState().process() }} tip="Run Evolve" desc="Switch the quantum step to Evolve; it runs on the voxel grid straight away.">Run Evolve</Button></Buttons>
        </div>
      )}
      {p.crowded > 0 && <Note warn>{p.crowded === 1 ? 'One piece has' : `${p.crowded} pieces have`} no free room left and overlap others. Remove some, or make them smaller.</Note>}
      {p.leftOut > 0 && <Note warn>{p.leftOut === 1 ? 'One piece is' : `${p.leftOut} pieces are`} left out of this frame for want of room. A larger frame shows {p.leftOut === 1 ? 'it' : 'them'}.</Note>}
      <TidyRow />
      <Buttons>
        <Button active={p.composing} onClick={() => p.setComposing(!p.composing)} tip={p.composing ? 'Done arranging' : 'Arrange on the view'}
          desc="Drag pieces around the view, resize them by the corner, select and remove them. Key: C">{p.composing ? 'Done' : 'Arrange'}</Button>
        <Button onClick={p.clear} tip="Start clean" desc="Take every piece off the view (notes too).">Clear</Button>
      </Buttons>
    </>
  )
}

/** The view's own controls and the scene guides: what is drawn besides the composed pieces. */
function OnTheView() {
  const hud = useStore((s) => s.hud)
  const setHud = useStore((s) => s.setHud)
  const p = usePresent()
  return (
    <>
      <Panel id="cmp-controls" title="Controls" sub>
        <div className="pd-checks">
          <Checkbox label="Tool shelf" tip="Navigate, probe, annotate, measure and slice, on the left of the view." checked={hud.tools} onChange={(v) => setHud({ tools: v })} />
          <Checkbox label="Navigation" tip="Zoom, pan, orbit and reset, on the right of the view." checked={hud.nav} onChange={(v) => setHud({ nav: v })} />
          <Checkbox label="Axis gizmo" tip="Click an axis to look along it." checked={hud.axes} onChange={(v) => setHud({ axes: v })} />
          <Checkbox label="Camera" tip="Azimuth and elevation under the gizmo." checked={hud.camera} onChange={(v) => setHud({ camera: v })} />
          <Checkbox label="Info" tip="What the view shows, top left." checked={hud.caption} onChange={(v) => setHud({ caption: v })} />
          <Checkbox label="Value scale" tip="In the shaded views, bottom right." checked={hud.legend} onChange={(v) => setHud({ legend: v })} />
          <Checkbox label="Corners" tip="The view's corner marks, when no frame piece is on." checked={hud.frame} onChange={(v) => setHud({ frame: v })} />
          <Checkbox label="Explanations in pieces" tip="Captions and notes inside the pieces. Off, they show data only." checked={p.notes} onChange={p.setNotes} />
        </div>
      </Panel>
      <Panel id="cmp-guides" title="Guides" sub>
        <div className="pd-checks">
          <Checkbox label="Grid box" tip="The dashed n³ outline of the grid." checked={p.guides.box} onChange={(v) => p.setGuides({ box: v })} />
          <Checkbox label="Print grid" tip="Lines on the floor under the model." checked={p.guides.floor} onChange={(v) => p.setGuides({ floor: v })} />
          <Checkbox label="Cutting plane" tip="The slice through the grid." checked={hud.slice} onChange={(v) => setHud({ slice: v })} />
        </div>
        {p.guides.floor && <FloorSize />}
      </Panel>
    </>
  )
}

function LibraryPage({ hover }: { hover: (k: string | null, on: boolean) => void }) {
  const p = usePresent()
  const counts: Record<string, number> = { scene: p.texts.length + +p.guides.box + +p.guides.floor }
  for (const c of CATEGORIES) counts[c.id] = countOn(p.compose, c.fams)
  const CATS = cats()
  const cat = CATS.some((c) => c.id === p.libCat) ? p.libCat : 'marks'
  const guide = (g: 'box' | 'floor', name: string) => (
    <LibRow on={p.guides[g]} name={name}
      onToggle={() => { p.setGuides({ [g]: !p.guides[g] }); hover(`guide:${g}`, !p.guides[g]) }}
      onHover={(h) => hover(h ? `guide:${g}` : null, p.guides[g])} />
  )
  return (
    <>
      <SubTabs label="Library categories" value={cat} onChange={p.setLibCat} options={CATS.map((c) => ({ id: c.id, t: c.short, n: counts[c.id] }))} />
      {cat === 'scene' ? (
        <Group>
          <div className="mk">
            <div className="mk-fam mk-fam--open">
              <span className="mk-fam__h mk-fam__h--static"><span className="mk-fam__t">Guides</span></span>
              {guide('box', 'Bounding box')}
              {guide('floor', 'Print grid')}
              {p.guides.floor && <div className="mk-sub"><FloorSize /></div>}
            </div>
            <div className="mk-fam mk-fam--open">
              <span className="mk-fam__h mk-fam__h--static"><span className="mk-fam__t">Text</span>{p.texts.length > 0 && <span className="mk-count">{p.texts.length} on</span>}</span>
              <LibRow on={false} name="Add text" drag="text" onToggle={() => p.addText()} onDragStart={() => p.setComposing(true)} />
            </div>
          </div>
        </Group>
      ) : (
        <Group>
          <MarkLibrary compose={p.compose} cats={[cat]} drag opened={p.opened} onOpen={p.toggleOpened}
            onToggle={(f, id, now) => (now ? p.place(f, id) : p.removePiece(`${f}:${id}`))}
            onPreview={hover}
            onDragStart={() => { p.setPreview(null); p.setHl(null); p.setComposing(true) }} />
        </Group>
      )}
    </>
  )
}

function NotesPage() {
  const st = useStore()
  const lv = useLive()
  const pins = lv.probe?.pins ?? []
  const rename = (i: number, t: string) => lv.probe?.setPins(pins.map((q, j) => (j === i ? { ...q, hit: { ...q.hit, lines: [t, q.hit.lines[1]] as [string, string] } } : q)))
  return (
    <Group label="Tool">
      <Segmented<Tool> size="s" value={st.tool} onChange={st.setTool} options={PRESENT_TOOLS.map((t) => ({ value: t.id, label: t.t }))} />
      <div className="pd-row">
        <button className="pd-chip pd-chip--s" disabled={!st.gridData} onClick={() => { lv.autoAnnotate?.() }}
          data-tip="Auto-annotate" data-tip-desc="Pins the peak value, the top, the widest layer, the base and the most changed cell.">Auto-annotate</button>
        {pins.length > 0 && <button className="pd-chip pd-chip--s" onClick={() => lv.probe?.clear()}>Clear pins</button>}
      </div>
      {pins.length > 0 && (
        <ol className="pd-notes">
          {pins.map((q, i) => (
            <li key={i} className="pd-note">
              <span className="pd-note__n">{i + 1}</span>
              <span className="pd-note__body">
                <input className="pd-note__in" value={q.hit.lines[0]} onChange={(e) => rename(i, e.target.value)} aria-label={`Note ${i + 1}`} />
                <span className="pd-note__info">{q.hit.lines[1]}</span>
              </span>
              <IconButton name="clear" size={22} title="Remove the pin" onClick={() => lv.probe?.setPins(pins.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ol>
      )}
    </Group>
  )
}

/** The slice sweep: on or off, where the plane is now, the range it covers, the step, how long a pass takes, direction. */
function SweepSettings() {
  const p = usePresent()
  const grid = useStore((s) => s.grid)
  const slice = useStore((s) => s.slice)
  const setSlice = useStore((s) => s.setSlice)
  const n = grid?.n ?? 32, mm = grid?.voxel_size ?? 1
  const c = p.sweepCfg
  const at = (f: number) => Math.round(f * (n - 1))
  const layer = (i: number) => `${i} · ${(i * mm).toFixed(0)} mm`
  return (
    <Group label="Slice sweep">
      <Check label="Sweep" checked={p.sweep} disabled={!grid} onChange={p.setSweep} />
      <Slider label="Plane" value={slice.index} min={0} max={n - 1} step={1} ticks={8} format={layer} onChange={(v) => setSlice({ index: v })} />
      <Slider label="From" value={at(c.from)} min={0} max={n - 1} step={1} ticks={8} format={layer} onChange={(v) => p.setSweepCfg({ from: v / (n - 1) })} />
      <Slider label="To" value={at(c.to)} min={0} max={n - 1} step={1} ticks={8} format={layer} onChange={(v) => p.setSweepCfg({ to: v / (n - 1) })} />
      <Slider label="Step" value={c.step} min={1} max={8} step={1} ticks={8} format={(v) => `${v} layer${v === 1 ? '' : 's'}`} onChange={(v) => p.setSweepCfg({ step: v })} />
      <Slider label="One pass" value={c.sec} min={1} max={30} step={1} ticks={7} format={(v) => `${v} s`} onChange={(v) => p.setSweepCfg({ sec: v })} />
      <Pills<Sweep['mode']> value={c.mode} onChange={(v) => p.setSweepCfg({ mode: v })}
        options={[{ id: 'bounce', t: 'Up and down' }, { id: 'up', t: 'Up' }, { id: 'down', t: 'Down' }]} />
    </Group>
  )
}

function MotionPage() {
  const p = usePresent()
  const lv = useLive()
  return (
    <>
      <Group label="Shots">
        <div className="pd-chips">
          {p.shots.map((_, i) => (
            <button key={i} className={'pd-shot pd-shot--s' + (p.shot === i ? ' pd-shot--on' : '')} onClick={() => p.setShot(i)} aria-label={`Shot ${i + 1}`}>{i + 1}</button>
          ))}
          <button className="pd-chip pd-chip--s" disabled={p.shots.length >= 10} onClick={() => { const e = lv.engine; if (!e) return; const a = e.angles(), l = e.lens(); p.addShot({ az: a.az, el: a.el, dist: l.dist }) }}
            data-tip="Save this camera angle as a shot">+ Shot</button>
          {p.shots.length > 0 && <IconButton name="clear" size={22} title="Remove the current shot" onClick={() => p.removeShot(p.shot)} />}
        </div>
        <Check label="Reel" checked={p.reel} disabled={p.shots.length < 2} onChange={p.setReel} />
        <Slider label="Seconds per shot" value={p.reelSec} min={2} max={12} step={1} ticks={10} format={(v) => `${v} s`} onChange={(v) => p.setMotion({ reelSec: v })} />
      </Group>
      <Group label="Turntable">
        <Check label="Turn" checked={p.spin} onChange={p.setSpin} />
        <Slider label="Speed" value={p.spinSpeed} min={2} max={45} step={1} ticks={9} format={(v) => `${v}°/s`} onChange={(v) => p.setMotion({ spinSpeed: v })} />
        <Pills<string> value={String(p.spinDir)} onChange={(v) => p.setSpinDir(+v as 1 | -1)} options={[{ id: '1', t: '↺ Counter-clockwise' }, { id: '-1', t: '↻ Clockwise' }]} />
      </Group>
      <SweepSettings />
      {p.saved.length > 1 && (
        <Group label="Compositions">
          <Check label="Cycle the saved ones" checked={p.cycle} onChange={p.setCycle} />
          <Slider label="Seconds each" value={p.cycleSec} min={3} max={20} step={1} ticks={9} format={(v) => `${v} s`} onChange={(v) => p.setMotion({ cycleSec: v })} />
        </Group>
      )}
    </>
  )
}

/** One animated value: its keyframes (spread evenly over the time), the time, and how it repeats. */
function TrackCard({ tr }: { tr: Track }) {
  const p = usePresent()
  const s = useStore()
  const d = paramOf(tr.param)
  if (!d) return null
  const off = d.get(s) == null
  const setKey = (i: number, v: number) => p.setTrack(tr.id, { keys: tr.keys.map((k, j) => (j === i ? v : k)) })
  return (
    <div className="anim-track">
      <div className="anim-track__h">
        <span className="anim-track__t">{d.t}</span>
        {off && <span className="anim-track__off">not in this mode</span>}
        <IconButton name="clear" size={22} title="Stop animating this value" onClick={() => p.removeTrack(tr.id)} />
      </div>
      <div className="anim-keys" aria-label="Keyframes">
        {tr.keys.map((k, i) => (
          <input key={i} className="anim-key" type="number" step={d.step} value={k} aria-label={`Keyframe ${i + 1}`}
            onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setKey(i, v) }} />
        ))}
        {tr.keys.length < 6 && <button className="anim-keys__b" onClick={() => p.setTrack(tr.id, { keys: [...tr.keys, tr.keys[tr.keys.length - 1]] })} data-tip="Add a keyframe">+</button>}
        {tr.keys.length > 2 && <button className="anim-keys__b" onClick={() => p.setTrack(tr.id, { keys: tr.keys.slice(0, -1) })} data-tip="Remove the last keyframe">−</button>}
      </div>
      <Slider label="Seconds" value={tr.sec} min={1} max={30} step={0.5} format={(v) => `${v} s`} onChange={(v) => p.setTrack(tr.id, { sec: v })} />
      <Pills<Track['mode']> value={tr.mode} onChange={(v) => p.setTrack(tr.id, { mode: v })} options={[{ id: 'bounce', t: 'Bounce' }, { id: 'loop', t: 'Loop' }, { id: 'once', t: 'Once' }]} />
    </div>
  )
}

/** The pass on one line: the story's segments to scale, the playhead; drag anywhere on it to scrub. */
function Timeline({ len }: { len: number }) {
  const p = usePresent()
  const now = useNow(p.playing, 50)
  const raw = clockOf(p, now)
  const t = len ? (p.loop ? raw % len : Math.min(raw, len)) : 0
  const segs = storySegments(p.stageReel)
  const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    p.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * len)
  }
  return (
    <div className="anim-time">
      <div className="anim-time__bar" role="slider" aria-label="Time" aria-valuemin={0} aria-valuemax={len} aria-valuenow={+t.toFixed(1)} tabIndex={0}
        onPointerDown={(e) => { if (!len) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); seekAt(e) }}
        onPointerMove={(e) => { if (e.buttons & 1 && len) seekAt(e) }}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') p.seek(Math.min(len, t + 1)); if (e.key === 'ArrowLeft') p.seek(Math.max(0, t - 1)) }}>
        {segs.map((x) => (
          <span key={x.stage} className={'anim-time__seg' + (t >= x.start && t < x.start + x.dur ? ' anim-time__seg--on' : '')} style={{ left: `${(x.start / (len || 1)) * 100}%`, width: `${(x.dur / (len || 1)) * 100}%` }}>{x.t}</span>
        ))}
        {!segs.length && <span className="anim-time__empty">{len ? 'values and look' : 'nothing to play'}</span>}
        <span className="anim-time__head" style={{ left: `${len ? (t / len) * 100 : 0}%` }} />
      </div>
      <div className="anim-time__read"><span>{t.toFixed(1)} s</span><span>{len.toFixed(1)} s</span></div>
    </div>
  )
}

/** Compose · Animate: one clock for everything: the story of the run (geometry to mesh, Evolve turn by
 *  turn), values with keyframes, the look, the camera and the slice. Play, scrub, speed, loop, record. */
function Animate() {
  const p = usePresent()
  const s = useStore()
  const len = passLength(p.tracks, p.stageReel, p.cycles)
  const evolve = s.q.mode === 'nations'
  const free = PARAMS.filter((d) => d.set && d.get(s) != null && !p.tracks.some((t) => t.param === d.id))
  const add = (id: string) => {
    const d = paramOf(id)
    if (!d) return
    const lo = d.min(s), hi = d.max(s), snap = (v: number) => +(Math.round(v / d.step) * d.step).toFixed(4)
    p.addTrack({ param: id, keys: id === 'turn' ? [0, hi] : [snap(lo + (hi - lo) * 0.2), snap(lo + (hi - lo) * 0.8)], sec: id === 'turn' ? 10 : 4, mode: id === 'turn' ? 'once' : 'bounce' })
  }
  const segs = p.stageReel.segs
  return (
    <>
      <Timeline len={len} />
      <div className="anim-transport">
        <Button kind="primary" active={p.playing} disabled={!len} onClick={() => p.setPlaying(!p.playing)} tip={p.playing ? 'Pause' : 'Play'} desc="Key: P">{p.playing ? 'Pause' : 'Play'}</Button>
        <Button onClick={() => p.seek(0)} tip="Back to the start">Start</Button>
        <Button disabled={!len || p.recording} onClick={() => { recordPass().catch(() => {}) }} tip="Record a pass" desc="Records one pass from the start to a WebM.">Record</Button>
      </div>
      <Pills<string> label="Speed" value={String(p.speed)} onChange={(v) => p.setSpeed(+v)} options={[0.25, 0.5, 1, 2, 4].map((v) => ({ id: String(v), t: `${v}×` }))} />
      <div className="pd-checks"><Checkbox label="Loop" checked={p.loop} onChange={p.setLoop} /></div>
      <Panel id="anim-stages" title="Story" sub aside={p.stageReel.on ? 'on' : undefined}>
        <div className="pd-checks">
          <Checkbox label="Tell the run, step by step" tip="From the original geometry to the mesh; Evolve plays every turn." checked={p.stageReel.on} onChange={(v) => p.setStageReel({ on: v })} />
          <Checkbox label="Model" checked={segs.model} onChange={(v) => p.setStageReel({ segs: { ...segs, model: v } })} />
          <Checkbox label="Voxels" checked={segs.voxels} onChange={(v) => p.setStageReel({ segs: { ...segs, voxels: v } })} />
          <Checkbox label={evolve ? 'Evolve, turn by turn' : 'Quantum'} checked={segs.quantum} onChange={(v) => p.setStageReel({ segs: { ...segs, quantum: v } })} />
          <Checkbox label="Mesh" checked={segs.mesh} onChange={(v) => p.setStageReel({ segs: { ...segs, mesh: v } })} />
        </div>
        <Slider label="Seconds per step" value={p.stageReel.sec} min={0.5} max={12} step={0.5} format={(v) => `${v} s`} onChange={(v) => p.setStageReel({ sec: v })} />
        {evolve && <Slider label="Turns per second" value={p.stageReel.tps} min={1} max={30} step={1} format={(v) => `${v} / s · ${(s.evolve.turns / v).toFixed(1)} s`} onChange={(v) => p.setStageReel({ tps: v })} />}
      </Panel>
      <Panel id="anim-values" title="Values" sub aside={p.tracks.length || undefined}>
        {p.tracks.map((tr) => <TrackCard key={tr.id} tr={tr} />)}
        <Select label={p.tracks.length ? 'Animate another value' : 'Animate a value'} value="" onChange={add}
          options={[{ value: '', label: free.length ? 'Choose…' : 'Every value is animated' }, ...free.map((d) => ({ value: d.id, label: d.t }))]} />
      </Panel>
      <Panel id="anim-look" title="Look" sub>
        <div className="pd-checks">
          <Checkbox label="Cycle the shading" checked={p.cycles.shading} onChange={(v) => p.setCycles({ shading: v })} />
          <Checkbox label="Cycle the light" checked={p.cycles.light} onChange={(v) => p.setCycles({ light: v })} />
          <Checkbox label="Cycle the backdrop" checked={p.cycles.backdrop} onChange={(v) => p.setCycles({ backdrop: v })} />
        </div>
        <Slider label="Seconds each" value={p.cycles.sec} min={1} max={10} step={0.5} format={(v) => `${v} s`} onChange={(v) => p.setCycles({ sec: v })} />
      </Panel>
      <MotionPage />
    </>
  )
}

/** A frame's shape drawn small, so the ratios read at a glance. */
function FrameGlyph({ ratio }: { ratio: number | null }) {
  const r = ratio ?? 1.6, w = r >= 1 ? 18 : 18 * r, h = r >= 1 ? 18 / r : 18
  return <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><rect x={10 - w / 2} y={10 - h / 2} width={w} height={h} fill="none" stroke="currentColor" strokeDasharray={ratio ? undefined : '2 2'} /></svg>
}

/** Output · the frame: the artboard's shape and the export size. */
function FramePick() {
  const p = usePresent()
  const fr = frameOf(p.frame)
  return (
    <>
      <div className="pd-frames" role="radiogroup" aria-label="Frame">
        {FRAMES.map((f) => (
          <button key={f.id} role="radio" aria-checked={p.frame === f.id} className={'pd-frame' + (p.frame === f.id ? ' pd-frame--on' : '')}
            onClick={() => p.setFrame(f.id as FrameId)} data-tip={f.t} data-tip-desc={f.use}>
            <FrameGlyph ratio={f.ratio} /><span>{f.t}</span>
          </button>
        ))}
      </div>
      <Note>{fr.use}.</Note>
      {fr.sizes.length > 0 && (
        <Pills<string> label="Size" value={String(Math.min(p.outSize, fr.sizes.length - 1))} onChange={(v) => p.setOutSize(+v)}
          options={fr.sizes.map(([w, h], i) => ({ id: String(i), t: `${w} × ${h}` }))} />
      )}
    </>
  )
}

/** Output · images, video and 3D. */
function Exports() {
  const p = usePresent()
  const st = useStore()
  const lv = useLive()
  const fr = frameOf(p.frame)
  const size = fr.sizes[Math.min(p.outSize, fr.sizes.length - 1)]
  const [busy, setBusy] = useState<string | null>(null)
  const run = (k: string, fn: () => Promise<unknown>) => { setBusy(k); fn().catch(() => {}).finally(() => setBusy(null)) }
  const hudPng = () => {
    const el = document.querySelector<HTMLElement>('.stage__view')
    if (el) return savePng(el, 'hud', 2)
    return Promise.resolve()
  }
  const stl = async () => {
    await st.exportStl()
    const f = useStore.getState().exported?.file
    if (f) window.open(`/api/download/${encodeURIComponent(f)}`)
  }
  return (
    <>
      <Panel id="out-image" title="Image" sub>
        <div className="pd-grid2">
          <button className="pd-chip pd-chip--ink" disabled={!!busy || !lv.engine} onClick={() => run('png', () => size ? exportFrame(lv.engine, size[0], size[1], fr.id) : screenshot())}
            data-tip={size ? 'Save the frame' : 'Save the view'} data-tip-desc={size ? 'Backdrop, geometry, pieces, pins and notes as one PNG at the size above.' : 'Pick a frame for an exact size; without one this saves the view as it is.'}>
            <Icon name="export" size={14} />{busy === 'png' ? 'Saving…' : size ? `PNG ${size[0]}×${size[1]}` : 'Save PNG'}
          </button>
          <button className="pd-chip" onClick={() => run('shot', screenshot)} data-tip="Screen grab" data-tip-desc="Exactly what the window shows, via the browser's tab capture."><Icon name="frame" size={14} />Screen grab</button>
          <button className="pd-chip" onClick={() => run('geo', () => renderStill(lv.engine, 3))} data-tip="Geometry only" data-tip-desc="The geometry alone at 3×, on a transparent background."><Icon name="model" size={14} />Geometry</button>
          <button className="pd-chip" onClick={() => run('hud', hudPng)} data-tip="Pieces only" data-tip-desc="Every piece, pin and note without the geometry, transparent, at 2×."><Icon name="layers" size={14} />Pieces only</button>
        </div>
        <Pills<'auto' | 'dark' | 'light'> label="Ink of transparent PNGs" value={p.pngInk} onChange={p.setPngInk} options={[{ id: 'auto', t: 'As shown' }, { id: 'dark', t: 'Dark' }, { id: 'light', t: 'Light' }]} />
      </Panel>
      <Panel id="out-video" title="Video" sub>
        <div className="pd-grid2">
          <button className={'pd-chip' + (p.recording ? ' pd-chip--on' : '')} onClick={() => toggleRecording().catch(() => {})}
            data-tip={p.recording ? 'Stop recording' : 'Record'} data-tip-desc={p.frame === 'window' ? 'A WebM of the window with its motion.' : 'A WebM of the frame only, where the browser can crop the capture (Chrome); otherwise the window.'}>
            <span className="pd-rec" />{p.recording ? 'Stop' : 'Record'}
          </button>
          <button className="pd-chip" disabled={p.recording || !passLength(p.tracks, p.stageReel, p.cycles)} onClick={() => { recordPass().catch(() => {}) }} data-tip="Record one pass" data-tip-desc="Plays the animation set up under Compose · Animate once, recording it.">One pass</button>
          <button className="pd-chip" onClick={() => p.setBare(true)} data-tip="Hide controls" data-tip-key="H" data-tip-desc="Only the view and its pieces, for clean frames and recordings. H or Esc brings the controls back.">Hide controls</button>
        </div>
      </Panel>
      <Panel id="out-3d" title="3D" sub>
        <div className="pd-grid2">
          <button className="pd-chip" disabled={!st.report || !!busy} onClick={() => run('stl', stl)} data-tip="STL" data-tip-desc="The printable surface, with a .json of every setting, written to output/ and downloaded."><Icon name="print" size={14} />STL</button>
          <button className="pd-chip" disabled={!st.model || !!busy} onClick={() => run('glb', () => exportGlb(lv.engine))} data-tip="glTF" data-tip-desc="What the view shows (mesh or voxels, with colours) as .glb for Blender, Rhino or the web."><Icon name="model" size={14} />GLB</button>
        </div>
      </Panel>
    </>
  )
}

/** Properties · 05 Compose: what goes on the view. */
export function ComposeSections() {
  const p = usePresent()
  // hovering a library row: it shows on the view and everything else dims
  const hover = (k: string | null, on: boolean) => { p.setPreview(k && !on ? k : null); p.setHl(k) }
  const mode = useStore((s) => s.q.mode)
  const preset = sameComposition(p.compose, DEFAULT_COMPOSITION.compose) ? { title: 'Default' } : CURATED.find((c) => sameComposition(p.compose, presetCompose(c, mode)))
  const on = countOn(p.compose, CATEGORIES.flatMap((c) => c.fams)) + p.texts.length
  return (
    <div className={'pd pd--props' + (p.composing ? ' pd--composing' : '')} onPointerLeave={() => { p.setHl(null); p.setPreview(null) }}>
      <Panel id="cmp-presets" title="Presets" aside={preset ? preset.title : on ? 'custom' : 'none'}><Presets /></Panel>
      <Panel id="cmp-view" title="On the view"><OnTheView /></Panel>
      <Panel id="cmp-library" title="Library" aside={on ? `${on} on` : undefined} flush><LibraryPage hover={hover} /></Panel>
      <Panel id="cmp-animate" title="Animate" aside={p.playing ? 'playing' : undefined}><Animate /></Panel>
      <Panel id="cmp-annotate" title="Annotate" defaultOpen={false}><NotesPage /></Panel>
      <Panel id="cmp-saved" title="Saved compositions" aside={p.saved.length || undefined} defaultOpen={false}><Compositions /></Panel>
    </div>
  )
}

/** Properties · 06 Output: the frame, images, video and 3D. */
export function OutputSections() {
  const frame = usePresent((p) => frameOf(p.frame).t)
  return (
    <div className="pd pd--props">
      <Panel id="out-frame" title="Frame" aside={frame}><FramePick /></Panel>
      <Panel id="out-export" title="Export"><Exports /></Panel>
    </div>
  )
}
