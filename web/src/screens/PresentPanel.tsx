// Present mode's compose panel, docked at the side so the view stays visible. Present is where you
// photograph and diagram the lab result. It starts clean: turn components on from the library (hover a
// row to see it on the view), arrange them in compose mode, and save the composition by name. Sections
// are compact rows; the icon rail on the left jumps between them.
import { useState, type ReactNode } from 'react'
import { useStore, type Layer, type Shading, type Tool, type View } from '../store'
import { isDirty, usePresent } from '../present'
import { CompThumb, savePng } from '../hud/Composer'
import { Icon, IconButton } from '../qs/Icon'
import { Segmented } from '../qs/Segmented'
import { Slider } from '../qs/Slider'
import { Check } from '../qs/Popover'
import { ScrollArea } from '../qs/ScrollArea'
import { useLive } from '../live'
import { renderStill, screenshot, toggleRecording } from './capture'
import { FloorSize, LayerList, LibRow, MarkLibrary, useSnap } from './MarkLibrary'
import { SectionTabs } from './SectionTabs'

const SHADES: { id: Shading; icon: string; t: string }[] = [
  { id: 'wire', icon: 'wire', t: 'Wire' }, { id: 'solid', icon: 'solid', t: 'Solid' },
  { id: 'value', icon: 'value', t: 'Value' }, { id: 'entangle', icon: 'entangle', t: 'Entangle' },
]
const LIGHTS = [{ id: 'studio', t: 'Key' }, { id: 'soft', t: 'Soft' }, { id: 'flat', t: 'Flat' }, { id: 'rim', t: 'Rim' }] as const
const BACKDROPS = [{ id: 'plain', t: 'Plain' }, { id: 'dots', t: 'Dots' }, { id: 'lines', t: 'Grid' }, { id: 'gradient', t: 'Vignette' }, { id: 'studio', t: 'Studio' }] as const
const GHOSTS: { id: Layer; t: string }[] = [
  { id: 'model', t: 'Original mesh' }, { id: 'voxels', t: 'Input voxels' }, { id: 'processed', t: 'Quantum result' }, { id: 'result', t: 'Surface' },
]
export const PRESENT_TOOLS: { id: Tool; icon: string; t: string; d: string; key: string }[] = [
  { id: 'navigate', icon: 'navigate', t: 'Navigate', d: 'Drag to orbit, right-drag to pan, scroll to zoom.', key: 'V' },
  { id: 'annotate', icon: 'annotate', t: 'Annotate', d: 'Click the geometry to pin a note; it turns with the model. Rename it below.', key: 'N' },
  { id: 'measure', icon: 'measure', t: 'Measure', d: 'Click points; consecutive pins are joined with their distance in mm.', key: 'M' },
]
const MARKERS = [
  { id: 'pd-saved', label: 'Compositions', icon: 'dots' },
  { id: 'pd-layers', label: 'Layers', icon: 'layers' },
  { id: 'pd-library', label: 'Component library', icon: 'drag' },
  { id: 'pd-view', label: 'View', icon: 'visibility' },
  { id: 'pd-annotate', label: 'Annotate', icon: 'annotate' },
  { id: 'pd-motion', label: 'Motion', icon: 'orbit' },
  { id: 'pd-capture', label: 'Capture', icon: 'frame' },
]

/** A section: a title and its rows, no tile around it. */
function Sec({ id, label, note, children }: { id: string; label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="pd-sec" data-mark={id}>
      <header className="pd-sec__head"><span className="pd-sec__t">{label}</span>{note != null && <span className="pd-sec__n">{note}</span>}</header>
      {children}
    </section>
  )
}

/** The composition on the view (name, save, start clean) and the saved ones, one row each. */
function Compositions() {
  const p = usePresent()
  const { ctx, bg, refresh } = useSnap()
  const cur = p.saved.find((x) => x.id === p.current)
  const dirty = isDirty(p)
  const [name, setName] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  const startClean = () => { if (dirty && !ask) { setAsk(true); return } setAsk(false); p.clear() }
  return (
    <Sec id="pd-saved" label="Compositions" note={cur ? (dirty ? 'changed' : 'saved') : dirty ? 'not saved' : 'clean'}>
      <div className="pd-now">
        <input className="pd-in" value={name ?? cur?.name ?? ''} placeholder="Untitled composition" aria-label="Composition name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name != null && cur && name.trim()) p.rename(cur.id, name.trim()); if (cur || !name?.trim()) setName(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} />
        <button className="pd-chip pd-chip--ink" disabled={!dirty} onClick={() => { p.save(name ?? undefined); setName(null) }}
          data-tip={cur ? 'Save' : 'Save as a new composition'} data-tip-desc="Keeps what is on the view, where you put it and how it looks.">Save</button>
      </div>
      {p.saved.length > 0 && (
        <div className="pd-list" onPointerEnter={refresh}>
          {p.saved.map((c, i) => (
            <div key={c.id} role="button" tabIndex={0} className={'pd-save' + (c.id === p.current ? ' pd-save--on' : '')}
              onClick={() => p.load(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') p.load(c.id) }}>
              {ctx ? <CompThumb compose={c.compose} positions={c.pos} looks={c.looks} texts={c.texts} ctx={ctx} bg={bg} w={44} h={28} /> : <span className="mini" style={{ width: 44, height: 28 }} />}
              <span className="pd-save__t">{c.name}</span>
              {i < 9 && <span className="pd-save__n">{i + 1}</span>}
              <span onClick={(e) => e.stopPropagation()}><IconButton name="clear" size={22} title="Delete this composition" onClick={() => p.removeSaved(c.id)} /></span>
            </div>
          ))}
        </div>
      )}
      <div className="pd-row">
        {cur && <button className="pd-chip pd-chip--s" onClick={() => { p.saveNew(`${cur.name} copy`); setName(null) }}>Save as new</button>}
        {p.saved.length > 1 && <button className={'pd-chip pd-chip--s' + (p.cycle ? ' pd-chip--on' : '')} onClick={() => p.setCycle(!p.cycle)} data-tip={`Step through the saved every ${p.cycleSec} s`}>Cycle</button>}
        <span className="pd-grow" />
        {ask
          ? <><span className="pd-ask">Discard changes?</span><button className="pd-chip pd-chip--s" onClick={startClean}>Discard</button><button className="pd-chip pd-chip--s" onClick={() => setAsk(false)}>Keep</button></>
          : <button className="pd-chip pd-chip--s" onClick={startClean} data-tip="Start clean" data-tip-desc="Nothing on the view. Saved compositions stay.">Start clean</button>}
      </div>
    </Sec>
  )
}

function Annotate() {
  const st = useStore()
  const lv = useLive()
  const pins = lv.probe?.pins ?? []
  const rename = (i: number, t: string) => lv.probe?.setPins(pins.map((q, j) => (j === i ? { ...q, hit: { ...q.hit, lines: [t, q.hit.lines[1]] as [string, string] } } : q)))
  return (
    <Sec id="pd-annotate" label="Annotate" note="pins stay on the geometry">
      <div className="pd-row">
        <Segmented<Tool> size="s" value={st.tool} onChange={st.setTool} options={PRESENT_TOOLS.map((t) => ({ value: t.id, label: t.t }))} />
        <span className="pd-grow" />
        <IconButton name="auto" size={26} title="Auto-annotate" desc="Pins the peak value, the top, the widest layer, the base and the most changed cell of the last result." disabled={!st.gridData} onClick={() => { lv.autoAnnotate?.() }} />
        {pins.length > 0 && <IconButton name="clear" size={26} title="Clear the pins" onClick={() => lv.probe?.clear()} />}
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
    </Sec>
  )
}

export function PresentPanel() {
  const p = usePresent()
  const st = useStore()
  const lv = useLive()
  const avail: Record<View, boolean> = { model: !!st.modelMesh, voxels: !!st.gridData, processed: !!st.procData, result: !!st.resultMesh, scan: !!st.procData && !!st.gridData }
  const hudPng = () => {
    const el = document.querySelector<HTMLElement>('.stage__view')
    if (el) savePng(el, 'hud', 2).catch(() => {})
  }
  // hovering a library row: it shows on the view and everything else dims
  const hover = (k: string | null, on: boolean) => { p.setPreview(k && !on ? k : null); p.setHl(k) }
  const guide = (g: 'box' | 'floor', name: string, note: string) => (
    <LibRow on={p.guides[g]} name={name} note={note} thumb={<span className="mini mk-row__glyph" style={{ width: 44, height: 28 }}>{g === 'box' ? '⬚' : '#'}</span>}
      onToggle={() => { p.setGuides({ [g]: !p.guides[g] }); hover(`guide:${g}`, !p.guides[g]) }}
      onHover={(h) => hover(h ? `guide:${g}` : null, p.guides[g])} />
  )
  const on = Object.values(p.compose).filter((v) => v && v !== 'off').reduce((n, v) => n + v.split(',').length, 0) + p.texts.length + +p.guides.box + +p.guides.floor
  return (
    <aside className={'pd' + (p.composing ? ' pd--composing' : '')} aria-label="Compose the present view" onPointerLeave={() => { p.setHl(null); p.setPreview(null) }}>
      <header className="pd__head">
        <span className="pd__title">Compose</span>
        <button className={'pd-mode' + (p.composing ? ' pd-mode--on' : '')} onClick={() => p.setComposing(!p.composing)} aria-pressed={p.composing}
          data-tip={p.composing ? 'Done arranging' : 'Arrange'} data-tip-key="C"
          data-tip-desc={p.composing ? 'Pieces stay where they are.' : 'Drag pieces around the view, select and remove them, drop rows from the library onto the view.'}>
          <Icon name="drag" size={14} />{p.composing ? 'Done' : 'Arrange'}
        </button>
        <IconButton name="clear" size={26} title="Close the panel" desc="Bring it back from the bar at the bottom." onClick={() => p.setDrawer(false)} side="left" />
      </header>
      <ScrollArea markers={MARKERS} className="pd-scroll" bar={false} renderIndex={(ix) => <SectionTabs {...ix} label="Compose sections" />}>
        <Compositions />

        <Sec id="pd-layers" label="Layers" note={on ? `${on} on the view` : undefined}>
          <LayerList />
        </Sec>

        <Sec id="pd-library" label="Component library" note="hover to see it">
          <MarkLibrary compose={p.compose} looks={p.looks} drag
            onToggle={(f, id, now) => (now ? p.place(f, id) : p.removePiece(`${f}:${id}`))}
            onPreview={hover}
            onDragStart={() => { p.setPreview(null); p.setHl(null); p.setComposing(true) }}
            guides={<div className="mk-fam">
              <span className="mk-fam__t">Scene guides</span>
              {guide('box', 'Bounding box', 'the grid volume')}
              {guide('floor', 'Print grid', `${p.guides.div} cells a side`)}
              {p.guides.floor && <div className="mk-sub"><FloorSize /></div>}
            </div>}
            extra={<div className="mk-group">
              <span className="mk-group__t">Text</span>
              <LibRow on={false} name="Text" note="title or caption" drag="text"
                thumb={<span className="mini mk-row__glyph" style={{ width: 44, height: 28 }}>Aa</span>}
                onToggle={() => { p.addText(); p.setComposing(true) }} onDragStart={() => p.setComposing(true)} />
            </div>} />
        </Sec>

        <Sec id="pd-view" label="View" note="what the photo shows">
          <Segmented<View> size="s" value={st.view} onChange={st.setView} options={[
            { value: 'model', label: 'Model', disabled: !avail.model }, { value: 'voxels', label: 'Voxels', disabled: !avail.voxels },
            { value: 'processed', label: 'Quantum', disabled: !avail.processed }, { value: 'result', label: 'Mesh', disabled: !avail.result },
            { value: 'scan', label: 'Scan', disabled: !avail.scan },
          ]} />
          <div className="pd-checks">
            {GHOSTS.map((g) => {
              const main = g.id === (st.view === 'scan' ? 'processed' : st.view)
              const has = avail[g.id as View]
              return <Check key={g.id} label={g.t} note={main ? 'shown' : has ? 'faint overlay' : 'not computed'} checked={main || st.layers[g.id].visible} disabled={main || !has} onChange={(v) => st.setLayer(g.id, { visible: v })} />
            })}
          </div>
          <div className="pd-line"><span className="pd-k">Shading</span>
            <div className="pd-chips">{SHADES.map((s) => <button key={s.id} className={'pd-chip pd-chip--s' + (st.shading === s.id ? ' pd-chip--on' : '')} onClick={() => st.setShading(s.id)}>{s.t}</button>)}</div>
          </div>
          <div className="pd-line"><span className="pd-k">Light</span>
            <div className="pd-chips">{LIGHTS.map((l) => <button key={l.id} className={'pd-chip pd-chip--s' + (st.shade.light === l.id ? ' pd-chip--on' : '')} onClick={() => st.setShading(st.shading, { light: l.id })}>{l.t}</button>)}</div>
          </div>
          <div className="pd-line"><span className="pd-k">Backdrop</span>
            <div className="pd-chips">{BACKDROPS.map((b) => <button key={b.id} className={'pd-chip pd-chip--s' + (st.shade.backdrop === b.id ? ' pd-chip--on' : '')} onClick={() => st.setShading(st.shading, { backdrop: b.id })}>{b.t}</button>)}</div>
          </div>
        </Sec>

        <Annotate />

        <Sec id="pd-motion" label="Motion" note="for recordings">
          <div className="pd-line"><span className="pd-k">Shots</span>
            <div className="pd-chips">
              {p.shots.map((_, i) => (
                <button key={i} className={'pd-shot pd-shot--s' + (p.shot === i ? ' pd-shot--on' : '')} onClick={() => p.setShot(i)} data-tip={`Shot ${i + 1}`}>{i + 1}</button>
              ))}
              <button className="pd-chip pd-chip--s" disabled={p.shots.length >= 10} onClick={() => { const e = lv.engine; if (!e) return; const a = e.angles(), l = e.lens(); p.addShot({ az: a.az, el: a.el, dist: l.dist }) }}
                data-tip="Capture this angle" data-tip-desc="Save the camera as a shot (up to 10).">+ Shot</button>
              {p.shots.length > 0 && <IconButton name="clear" size={22} title="Remove the current shot" onClick={() => p.removeShot(p.shot)} />}
            </div>
          </div>
          <div className="pd-checks">
            <Check label="Reel" note={p.shots.length < 2 ? 'needs two shots' : `${p.reelSec} s per shot`} checked={p.reel} disabled={p.shots.length < 2} onChange={p.setReel} />
            <Check label="Turntable" note={p.spinDir === 1 ? 'counter-clockwise' : 'clockwise'} checked={p.spin} onChange={p.setSpin} />
            <Check label="Slice sweep" note="the cutting plane rises and falls" checked={p.sweep} disabled={!st.gridData} onChange={p.setSweep} />
          </div>
          <div className="pd-line"><span className="pd-k">Direction</span>
            <Segmented<string> size="s" value={String(p.spinDir)} onChange={(v) => p.setSpinDir(+v as 1 | -1)} options={[{ value: '1', label: '↺ Counter' }, { value: '-1', label: '↻ Clockwise' }]} />
          </div>
          <Slider label="Turntable speed" value={p.spinSpeed} min={2} max={45} step={1} ticks={9} format={(v) => `${v}°/s`} onChange={(v) => p.setMotion({ spinSpeed: v })} />
          <Slider label="Seconds per shot" value={p.reelSec} min={2} max={12} step={1} ticks={10} format={(v) => `${v} s`} onChange={(v) => p.setMotion({ reelSec: v })} />
          <Slider label="Seconds per composition" value={p.cycleSec} min={3} max={20} step={1} ticks={9} format={(v) => `${v} s`} onChange={(v) => p.setMotion({ cycleSec: v })} />
        </Sec>

        <Sec id="pd-capture" label="Capture" note="to your downloads">
          <div className="pd-chips">
            <button className="pd-chip" onClick={() => screenshot().catch(() => {})} data-tip="Screenshot" data-tip-desc="A PNG of exactly what the view shows, HUD included. The browser asks to share this tab."><Icon name="frame" size={14} />Screenshot</button>
            <button className={'pd-chip' + (p.recording ? ' pd-chip--on' : '')} onClick={() => toggleRecording().catch(() => {})} data-tip={p.recording ? 'Stop recording' : 'Record'} data-tip-desc="A WebM video of the view with its motion. Esc or the browser's Stop sharing ends it."><span className="pd-rec" />{p.recording ? 'Stop' : 'Record'}</button>
            <button className="pd-chip" onClick={() => renderStill(lv.engine, 3)} data-tip="Render the geometry" data-tip-desc="The geometry alone at three times the view's resolution, on a transparent background."><Icon name="export" size={14} />Geometry</button>
            <button className="pd-chip" onClick={hudPng} data-tip="Save the HUD" data-tip-desc="Every piece, pin and note without the geometry, as a transparent PNG at 2×."><Icon name="layers" size={14} />HUD only</button>
          </div>
          <div className="pd-line"><span className="pd-k">PNG ink</span>
            <Segmented<string> size="s" value={p.pngInk} onChange={(v) => p.setPngInk(v as 'auto' | 'dark' | 'light')} options={[{ value: 'auto', label: 'As shown' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
          </div>
        </Sec>
        <div style={{ height: 40 }} />
      </ScrollArea>
    </aside>
  )
}
