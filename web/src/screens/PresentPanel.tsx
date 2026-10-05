// Present mode's compose panel, docked at the side so the view stays visible. Present is where you
// photograph and diagram the lab result. It starts clean. The icons at the bottom switch pages: View
// (what the view shows), Layers (what is on it, and saved compositions), Library (the Quicksilver
// library by category: scene, marks, navigation, quantum glyphs, data and runtime, controls; each
// category's families open to their variants), Annotate, Motion, Capture.
import { useState, type ReactNode } from 'react'
import { useStore, type Layer, type Shading, type Stage as FocusStage, type Tool, type View } from '../store'
import { isDirty, usePresent, type Sweep } from '../present'
import { CATEGORIES } from '../hud/registry'
import { countOn, savePng } from '../hud/compose'
import { Icon, IconButton } from '../qs/Icon'
import { Segmented } from '../qs/Segmented'
import { Panel, Button, Buttons } from '../ui/Panel'
import { Slider } from '../qs/Slider'
import { Check } from '../qs/Popover'
import { ScrollArea } from '../qs/ScrollArea'
import { useLive } from '../live'
import { exportFrame, exportGlb, renderStill, screenshot, toggleRecording } from './capture'
import { FRAMES, frameOf, type FrameId } from '../frames'
import { CURATED, TIDY_LEVELS } from '../hud/tidy'
import { FloorSize, LayerList, LibRow, MarkLibrary } from './MarkLibrary'
import { PRESENT_TOOLS } from './presentTools'

const VIEWS: { id: View; t: string }[] = [
  { id: 'model', t: 'Model' }, { id: 'voxels', t: 'Voxels' }, { id: 'processed', t: 'Quantum' }, { id: 'result', t: 'Mesh' }, { id: 'scan', t: 'Scan' },
]
/** Present picks what to show on purpose: each view is the focus of a stage. */
const STAGE_OF: Record<View, (mode: string) => FocusStage> = {
  model: () => 'model', voxels: () => 'voxels', processed: (m) => (m === 'nations' ? 'evolve' : 'quantum'), result: () => 'mesh', scan: () => 'scan',
}
const SHADES: { id: Shading; t: string }[] = [{ id: 'wire', t: 'Wire' }, { id: 'solid', t: 'Solid' }, { id: 'value', t: 'Value' }, { id: 'entangle', t: 'Entangle' }]
const LIGHTS = [{ id: 'studio', t: 'Key' }, { id: 'soft', t: 'Soft' }, { id: 'flat', t: 'Flat' }, { id: 'rim', t: 'Rim' }] as const
const BACKDROPS = [{ id: 'plain', t: 'Plain' }, { id: 'dots', t: 'Dots' }, { id: 'lines', t: 'Grid' }, { id: 'gradient', t: 'Vignette' }, { id: 'studio', t: 'Studio' }] as const
const GHOSTS: { id: Layer; t: string }[] = [
  { id: 'model', t: 'Original mesh' }, { id: 'voxels', t: 'Input voxels' }, { id: 'processed', t: 'Quantum result' }, { id: 'result', t: 'Surface' },
]
/** The library's categories as tabs: the scene's own guides and text first, then the Quicksilver sheets. */
const CATS = [{ id: 'scene', short: 'Scene' }, ...CATEGORIES.map((c) => ({ id: c.id, short: c.id === 'glyphs' ? 'Glyphs' : c.id === 'data' ? 'Data' : c.title }))]

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

function ViewPage() {
  const st = useStore()
  const avail: Record<View, boolean> = { model: !!st.modelMesh, voxels: !!st.gridData, processed: !!st.procData, result: !!st.resultMesh, scan: !!st.procData && !!st.gridData }
  return (
    <>
      <Group label="Display">
        <Pills<View> value={st.view} onChange={(v) => st.setFocus(STAGE_OF[v](st.proc?.mode ?? st.q.mode), `Showing the ${VIEWS.find((x) => x.id === v)!.t.toLowerCase()}`)} options={VIEWS.map((v) => ({ id: v.id, t: v.t, off: !avail[v.id] }))} />
        <div className="pd-group">
          {GHOSTS.map((g) => {
            const main = g.id === (st.view === 'scan' ? 'processed' : st.view)
            return <Check key={g.id} label={g.t} checked={main || st.layers[g.id].visible} disabled={main || !avail[g.id as View]} onChange={(v) => st.setLayer(g.id, { visible: v })} />
          })}
        </div>
      </Group>
      <Group label="Render">
        <Pills<Shading> label="Shading" value={st.shading} onChange={(v) => st.setShading(v)} options={SHADES.map((s) => ({ id: s.id, t: s.t }))} />
        <Pills label="Light" value={st.shade.light} onChange={(v) => st.setShading(st.shading, { light: v })} options={LIGHTS.map((l) => ({ id: l.id, t: l.t }))} />
        <Pills label="Backdrop" value={st.shade.backdrop} onChange={(v) => st.setShading(st.shading, { backdrop: v })} options={BACKDROPS.map((b) => ({ id: b.id, t: b.t }))} />
      </Group>
    </>
  )
}

function LayersPage() {
  const p = usePresent()
  const [sub, setSub] = useState<'on' | 'saved'>('on')
  const on = Object.values(p.compose).filter((v) => v && v !== 'off').reduce((n, v) => n + v.split(',').length, 0) + p.texts.length + +p.guides.box + +p.guides.floor
  return (
    <>
      <SubTabs label="Layers" value={sub} onChange={setSub} options={[{ id: 'on', t: 'On the view', n: on }, { id: 'saved', t: 'Saved', n: p.saved.length }]} />
      {sub === 'on' ? (
        <Group>
          <LayerList />
          {p.crowded > 0 && <p className="pd-warn">{p.crowded === 1 ? 'One piece has' : `${p.crowded} pieces have`} no free room left and overlap others. Remove some, or make them smaller.</p>}
          {p.leftOut > 0 && <p className="pd-warn">{p.leftOut === 1 ? 'One piece is' : `${p.leftOut} pieces are`} left out of this frame: there is no room for {p.leftOut === 1 ? 'it' : 'them'} at a readable size. A larger frame shows {p.leftOut === 1 ? 'it' : 'them'}.</p>}
          {on > 0 && <TidyRow />}
        </Group>
      ) : <Compositions />}
    </>
  )
}

/** Auto-compose: lay everything out for the frame, at three degrees of keeping. */
function TidyRow() {
  const p = usePresent()
  return (
    <div className="pd-tidy">
      <span className="pd-tidy__k">Auto-compose for {frameOf(p.frame).t}</span>
      <Buttons>
        {TIDY_LEVELS.map((l) => <Button key={l.id} onClick={() => p.tidy(l.id)} tip={l.t} desc={l.d}>{l.t}</Button>)}
      </Buttons>
    </div>
  )
}

/** Curated compositions, laid out for the frame as soon as they are put on. */
function Presets() {
  const p = usePresent()
  const mode = useStore((s) => s.q.mode)
  const evolve = mode === 'nations'
  return (
    <Group>
      <TidyRow />
      <div className="pd-presets">
        {CURATED.map((c) => {
          const off = c.mode === 'nations' ? !evolve : c.mode === 'blur' ? evolve : false
          return (
            <button key={c.id} className="pd-preset" onClick={() => p.applyCurated(c.id)}>
              <span className="pd-preset__t">{c.title}{off && <em>{c.mode === 'nations' ? ' · needs Evolve' : ' · for blur modes'}</em>}</span>
              <span className="pd-preset__d">{c.desc}</span>
            </button>
          )
        })}
      </div>
    </Group>
  )
}

function LibraryPage({ hover }: { hover: (k: string | null, on: boolean) => void }) {
  const p = usePresent()
  const counts: Record<string, number> = { scene: p.texts.length + +p.guides.box + +p.guides.floor }
  for (const c of CATEGORIES) counts[c.id] = countOn(p.compose, c.fams)
  const cat = CATS.some((c) => c.id === p.libCat) ? p.libCat : 'marks'
  const guide = (g: 'box' | 'floor', name: string) => (
    <LibRow on={p.guides[g]} name={name}
      onToggle={() => { p.setGuides({ [g]: !p.guides[g] }); hover(`guide:${g}`, !p.guides[g]) }}
      onHover={(h) => hover(h ? `guide:${g}` : null, p.guides[g])} />
  )
  return (
    <>
      <SubTabs label="Library categories" value={cat} onChange={p.setLibCat} options={CATS.map((c) => ({ id: c.id, t: c.short, n: counts[c.id] }))} />
      {cat === 'presets' ? <Presets /> : cat === 'scene' ? (
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

/** A frame's shape drawn small, so the ratios read at a glance. */
function FrameGlyph({ ratio }: { ratio: number | null }) {
  const r = ratio ?? 1.6, w = r >= 1 ? 18 : 18 * r, h = r >= 1 ? 18 / r : 18
  return <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><rect x={10 - w / 2} y={10 - h / 2} width={w} height={h} fill="none" stroke="currentColor" strokeDasharray={ratio ? undefined : '2 2'} /></svg>
}

/** Everything that leaves the app: the frame and its size, images, video and 3D. */
function OutputPage() {
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
      <Group label="Frame">
        <div className="pd-frames" role="radiogroup" aria-label="Frame">
          {FRAMES.map((f) => (
            <button key={f.id} role="radio" aria-checked={p.frame === f.id} className={'pd-frame' + (p.frame === f.id ? ' pd-frame--on' : '')}
              onClick={() => p.setFrame(f.id as FrameId)} data-tip={f.t} data-tip-desc={f.use}>
              <FrameGlyph ratio={f.ratio} /><span>{f.t}</span>
            </button>
          ))}
        </div>
        <p className="pd-hint">{fr.use}. The view takes this shape and the HUD lays itself out for it.</p>
        {fr.sizes.length > 0 && (
          <Pills<string> label="Size" value={String(Math.min(p.outSize, fr.sizes.length - 1))} onChange={(v) => p.setOutSize(+v)}
            options={fr.sizes.map(([w, h], i) => ({ id: String(i), t: `${w} × ${h}` }))} />
        )}
      </Group>
      <Group label="Image">
        <div className="pd-grid2">
          <button className="pd-chip pd-chip--ink" disabled={!size || !!busy} onClick={() => size && run('png', () => exportFrame(lv.engine, size[0], size[1], fr.id))}
            data-tip="Save the frame" data-tip-desc="Backdrop, geometry, HUD, pins and notes as one PNG at the size above.">
            <Icon name="export" size={14} />{busy === 'png' ? 'Saving…' : size ? `PNG ${size[0]}×${size[1]}` : 'Pick a frame'}
          </button>
          <button className="pd-chip" onClick={() => run('shot', screenshot)} data-tip="Screen grab" data-tip-desc="Exactly what the window shows, via the browser's tab capture."><Icon name="frame" size={14} />Screen grab</button>
          <button className="pd-chip" onClick={() => run('geo', () => renderStill(lv.engine, 3))} data-tip="Geometry only" data-tip-desc="The geometry alone at 3×, on a transparent background."><Icon name="model" size={14} />Geometry</button>
          <button className="pd-chip" onClick={() => run('hud', hudPng)} data-tip="HUD only" data-tip-desc="Every piece, pin and note without the geometry, transparent, at 2×."><Icon name="layers" size={14} />HUD only</button>
        </div>
        <Pills<'auto' | 'dark' | 'light'> label="Ink of transparent PNGs" value={p.pngInk} onChange={p.setPngInk} options={[{ id: 'auto', t: 'As shown' }, { id: 'dark', t: 'Dark' }, { id: 'light', t: 'Light' }]} />
      </Group>
      <Group label="Video">
        <div className="pd-grid2">
          <button className={'pd-chip' + (p.recording ? ' pd-chip--on' : '')} onClick={() => toggleRecording().catch(() => {})}
            data-tip={p.recording ? 'Stop recording' : 'Record'} data-tip-desc={p.frame === 'window' ? 'A WebM of the window with its motion.' : 'A WebM of the frame only, where the browser can crop the capture (Chrome); otherwise the window.'}>
            <span className="pd-rec" />{p.recording ? 'Stop' : 'Record'}
          </button>
          <button className="pd-chip" onClick={() => p.setTab('motion')} data-tip="Motion" data-tip-desc="Turntable, shot reel, slice sweep and cycling compositions: set them up, then record.">Set up motion →</button>
        </div>
      </Group>
      <Group label="3D">
        <div className="pd-grid2">
          <button className="pd-chip" disabled={!st.report || !!busy} onClick={() => run('stl', stl)} data-tip="STL" data-tip-desc="The printable surface, with a .json of every setting, written to output/ and downloaded."><Icon name="print" size={14} />STL</button>
          <button className="pd-chip" disabled={!st.model || !!busy} onClick={() => run('glb', () => exportGlb(lv.engine))} data-tip="glTF" data-tip-desc="What the view shows (mesh or voxels, with colours) as .glb for Blender, Rhino or the web."><Icon name="model" size={14} />GLB</button>
        </div>
      </Group>
    </>
  )
}

/** Compose · left: what goes on the view. Presets and auto-compose, the layers on it, the library, notes. */
export function ComposeLeft() {
  const p = usePresent()
  // hovering a library row: it shows on the view and everything else dims
  const hover = (k: string | null, on: boolean) => { p.setPreview(k && !on ? k : null); p.setHl(k) }
  const on = Object.values(p.compose).filter((v) => v && v !== 'off').reduce((n, v) => n + v.split(',').length, 0) + p.texts.length + +p.guides.box + +p.guides.floor
  return (
    <div className={'side-page pd' + (p.composing ? ' pd--composing' : '')} aria-label="Compose" onPointerLeave={() => { p.setHl(null); p.setPreview(null) }}>
      <header className="side-page__head">
        <span className="side-page__t">Compose</span>
        <Button active={p.composing} onClick={() => p.setComposing(!p.composing)} tip={p.composing ? 'Done arranging' : 'Arrange'}
          desc="Drag pieces around the view, resize them by the corner, select and remove them. Key: C">{p.composing ? 'Done' : 'Arrange'}</Button>
      </header>
      <ScrollArea className="side-page__scroll" bar={false}>
        <Panel id="cmp-presets" title="Presets"><Presets /></Panel>
        <Panel id="cmp-layers" title="Layers" aside={on || undefined}><LayersPage /></Panel>
        <Panel id="cmp-library" title="Library" flush><LibraryPage hover={hover} /></Panel>
        <Panel id="cmp-annotate" title="Annotate" defaultOpen={false}><NotesPage /></Panel>
        <div style={{ height: 24 }} />
      </ScrollArea>
    </div>
  )
}

/** Compose · right: how it leaves. The frame and its export, the view, and motion. */
export function ComposeRight() {
  return (
    <div className="side-page pd" aria-label="Output">
      <header className="side-page__head"><span className="side-page__t">Output</span></header>
      <ScrollArea className="side-page__scroll" bar={false}>
        <Panel id="cmp-output" title="Frame and export"><OutputPage /></Panel>
        <Panel id="cmp-view" title="View"><ViewPage /></Panel>
        <Panel id="cmp-motion" title="Motion" defaultOpen={false}><MotionPage /></Panel>
        <div style={{ height: 24 }} />
      </ScrollArea>
    </div>
  )
}
