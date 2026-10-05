// Present mode's compose panel, docked at the side so the view stays visible. Present is where you
// photograph and diagram the lab result. It starts clean: enter compose mode, drag components from the
// library onto the view, move and tune them, drag them back onto this panel to take them off, and save
// the composition by name. The icon row at the top jumps between sections, as in Lab's Properties.
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
import { LayerList, MARK_MIME, MarkLibrary, useSnap } from './MarkLibrary'
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

/** A section tile, as in Lab's panels. */
function Blk({ id, label, note, children }: { id: string; label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="blk pd-blk" data-mark={id}>
      <div className="pd-blk__head"><span className="blk__title">{label}</span>{note != null && <span className="pd-blk__n">{note}</span>}</div>
      {children}
    </div>
  )
}

/** The composition on the view (name, save, start clean) and the saved ones, as previews. */
function Compositions() {
  const p = usePresent()
  const { ctx, bg, refresh } = useSnap()
  const cur = p.saved.find((x) => x.id === p.current)
  const dirty = isDirty(p)
  const [name, setName] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  const shown = name ?? cur?.name ?? ''
  const startClean = () => { if (dirty && !ask) { setAsk(true); return } setAsk(false); p.clear() }
  return (
    <Blk id="pd-saved" label="Compositions" note={p.saved.length ? `${p.saved.length} saved` : undefined}>
      <div className="pd-now">
        <input className="pd-in pd-now__name" value={shown} placeholder="Untitled composition" aria-label="Composition name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name != null && cur && name.trim()) p.rename(cur.id, name.trim()); if (cur || !name?.trim()) setName(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }} />
        <span className="pd-now__state">{cur ? (dirty ? 'changed' : 'saved') : dirty ? 'not saved' : 'clean'}</span>
      </div>
      <div className="pd-row">
        <button className="pd-chip pd-chip--ink" disabled={!dirty} onClick={() => { p.save(name ?? undefined); setName(null) }}
          data-tip={cur ? 'Save' : 'Save as a new composition'} data-tip-desc="Keeps what is on the view, where you put it and how it looks.">{cur ? 'Save' : 'Save composition'}</button>
        {cur && <button className="pd-chip" onClick={() => { p.saveNew(`${cur.name} copy`); setName(null) }}>Save as new</button>}
        <span className="pd-grow" />
        {ask
          ? <><span className="pd-ask">Discard the unsaved changes?</span><button className="pd-chip pd-chip--s" onClick={startClean}>Discard</button><button className="pd-chip pd-chip--s" onClick={() => setAsk(false)}>Keep</button></>
          : <button className="pd-chip" onClick={startClean} data-tip="Start clean" data-tip-desc="Nothing on the view. Saved compositions stay.">Start clean</button>}
      </div>
      {p.saved.length > 0 && (
        <div className="pd-saved" onPointerEnter={refresh}>
          {p.saved.map((c, i) => (
            <div key={c.id} role="button" tabIndex={0} className={'pd-save' + (c.id === p.current ? ' pd-save--on' : '')}
              onClick={() => p.load(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') p.load(c.id) }}
              data-tip={c.name} data-tip-desc="Click to put it on the view." data-tip-key={i < 9 ? String(i + 1) : undefined}>
              {ctx ? <CompThumb compose={c.compose} positions={c.pos} looks={c.looks} texts={c.texts} ctx={ctx} bg={bg} w={146} h={90} /> : <span className="mini" style={{ width: 146, height: 90 }} />}
              <span className="pd-save__t"><span className="pd-save__n">{i + 1}</span>{c.name}</span>
              <button className="pd-save__x" aria-label={`Delete ${c.name}`} onClick={(e) => { e.stopPropagation(); p.removeSaved(c.id) }} data-tip="Delete this composition">×</button>
            </div>
          ))}
        </div>
      )}
      {p.saved.length > 1 && <Check label="Cycle" note={`through the saved, every ${p.cycleSec} s`} checked={p.cycle} onChange={p.setCycle} />}
    </Blk>
  )
}

function Annotate() {
  const st = useStore()
  const lv = useLive()
  const pins = lv.probe?.pins ?? []
  const rename = (i: number, t: string) => lv.probe?.setPins(pins.map((q, j) => (j === i ? { ...q, hit: { ...q.hit, lines: [t, q.hit.lines[1]] as [string, string] } } : q)))
  return (
    <Blk id="pd-annotate" label="Annotate" note="pins stay on the geometry">
      <div className="pd-chips" role="radiogroup" aria-label="Tool">
        {PRESENT_TOOLS.map((t) => (
          <button key={t.id} role="radio" aria-checked={st.tool === t.id} className={'pd-chip' + (st.tool === t.id ? ' pd-chip--on' : '')}
            onClick={() => st.setTool(t.id)} data-tip={t.t} data-tip-desc={t.d} data-tip-key={t.key}>
            <Icon name={t.icon} size={14} />{t.t}
          </button>
        ))}
      </div>
      <div className="pd-row">
        <button className="pd-chip" disabled={!st.gridData} onClick={() => { lv.autoAnnotate?.() }}
          data-tip="Auto-annotate" data-tip-desc="Pins the peak value, the top, the widest layer, the base and the most changed cell of the last result.">
          <Icon name="auto" size={14} />Auto-annotate
        </button>
        {pins.length > 0 && <button className="pd-chip" onClick={() => lv.probe?.clear()}>Clear pins</button>}
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
    </Blk>
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
  const on = Object.values(p.compose).filter((v) => v && v !== 'off').reduce((n, v) => n + v.split(',').length, 0) + p.texts.length
  return (
    <aside className={'pd' + (p.composing ? ' pd--composing' : '')} aria-label="Compose the present view" onPointerLeave={() => p.setHl(null)}>
      <header className="pd__head">
        <span className="pd__title">Compose</span>
        <button className={'pd-mode' + (p.composing ? ' pd-mode--on' : '')} onClick={() => p.setComposing(!p.composing)} aria-pressed={p.composing}
          data-tip={p.composing ? 'Done composing' : 'Compose mode'} data-tip-key="C"
          data-tip-desc={p.composing ? 'Pieces stay where they are.' : 'Drag components onto the view, move pieces, select and remove them.'}>
          <Icon name="drag" size={14} />{p.composing ? 'Done' : 'Compose mode'}
        </button>
        <IconButton name="clear" size={26} title="Close the panel" desc="Bring it back from the bar at the bottom." onClick={() => p.setDrawer(false)} side="left" />
      </header>
      {p.composing && <p className="pd-hint pd-hint--mode">Drag components onto the view. Drag a piece onto this panel, or press ⌫, to take it off.</p>}
      <ScrollArea markers={MARKERS} className="pane-scroll pane-scroll--tabs pd-scroll" bar={false} renderIndex={(ix) => <SectionTabs {...ix} label="Compose sections" />}>
        <Compositions />

        <Blk id="pd-layers" label="Layers" note={on ? `${on} on the view` : undefined}>
          <LayerList />
        </Blk>

        <Blk id="pd-library" label="Component library" note={p.composing ? 'drag onto the view' : 'click or drag to add'}>
          <MarkLibrary compose={p.compose} looks={p.looks} drag
            onAdd={(f, id) => { p.place(f, id); p.setComposing(true) }}
            onSelect={(k) => { p.setSel(k); p.setComposing(true) }}
            onDragStart={() => p.setComposing(true)}
            extra={
              <div className="mk-extra">
                <div role="button" tabIndex={0} className="mk-text" draggable
                  onDragStart={(e) => { e.dataTransfer.setData(MARK_MIME, 'text'); e.dataTransfer.effectAllowed = 'copy'; p.setComposing(true) }}
                  onClick={() => { p.addText(); p.setComposing(true) }} onKeyDown={(e) => { if (e.key === 'Enter') p.addText() }}
                  data-tip="Text" data-tip-desc="A title or caption. Drag it onto the view, then double-click it to edit.">
                  <span className="mk-text__aa">Aa</span><span>Text<em>title or caption</em></span>
                </div>
              </div>
            } />
        </Blk>

        <Blk id="pd-view" label="View" note="what the photo shows">
          <div className="pd-field"><span className="pd-k">Show</span>
            <Segmented<View> size="s" value={st.view} onChange={st.setView} options={[
              { value: 'model', label: 'Model', disabled: !avail.model }, { value: 'voxels', label: 'Voxels', disabled: !avail.voxels },
              { value: 'processed', label: 'Quantum', disabled: !avail.processed }, { value: 'result', label: 'Mesh', disabled: !avail.result },
              { value: 'scan', label: 'Scan', disabled: !avail.scan },
            ]} />
          </div>
          <div className="pd-field"><span className="pd-k">Overlay</span>
            <div className="pd-checks">
              {GHOSTS.map((g) => {
                const main = g.id === (st.view === 'scan' ? 'processed' : st.view)
                const has = avail[g.id as View]
                return <Check key={g.id} label={g.t} note={main ? 'shown' : has ? 'faint, over the view' : 'not computed'} checked={main || st.layers[g.id].visible} disabled={main || !has} onChange={(v) => st.setLayer(g.id, { visible: v })} />
              })}
            </div>
          </div>
          <div className="pd-field"><span className="pd-k">Shading</span>
            <div className="pd-chips">
              {SHADES.map((s) => (
                <button key={s.id} className={'pd-chip' + (st.shading === s.id ? ' pd-chip--on' : '')} onClick={() => st.setShading(s.id)} data-tip={`${s.t} shading`}>
                  <Icon name={s.icon} size={14} />{s.t}
                </button>
              ))}
            </div>
          </div>
          <div className="pd-field"><span className="pd-k">Light</span>
            <div className="pd-chips">{LIGHTS.map((l) => <button key={l.id} className={'pd-chip' + (st.shade.light === l.id ? ' pd-chip--on' : '')} onClick={() => st.setShading(st.shading, { light: l.id })}>{l.t}</button>)}</div>
          </div>
          <div className="pd-field"><span className="pd-k">Backdrop</span>
            <div className="pd-chips">{BACKDROPS.map((b) => <button key={b.id} className={'pd-chip' + (st.shade.backdrop === b.id ? ' pd-chip--on' : '')} onClick={() => st.setShading(st.shading, { backdrop: b.id })}>{b.t}</button>)}</div>
          </div>
        </Blk>

        <Annotate />

        <Blk id="pd-motion" label="Motion" note="for recordings">
          <div className="pd-field"><span className="pd-k">Shots</span>
            <div className="pd-chips">
              {p.shots.map((_, i) => (
                <button key={i} className={'pd-shot' + (p.shot === i ? ' pd-shot--on' : '')} onClick={() => p.setShot(i)} data-tip={`Shot ${i + 1}`} data-tip-desc="Fly to this camera position.">{i + 1}</button>
              ))}
              <button className="pd-chip" disabled={p.shots.length >= 10} onClick={() => { const e = lv.engine; if (!e) return; const a = e.angles(), l = e.lens(); p.addShot({ az: a.az, el: a.el, dist: l.dist }) }}
                data-tip="Capture this angle" data-tip-desc="Save the camera as a shot (up to 10).">+ Shot</button>
              {p.shots.length > 0 && <IconButton name="clear" size={24} title="Remove the current shot" onClick={() => p.removeShot(p.shot)} />}
            </div>
          </div>
          <div className="pd-checks">
            <Check label="Reel" note={p.shots.length < 2 ? 'needs two shots' : `${p.reelSec} s per shot`} checked={p.reel} disabled={p.shots.length < 2} onChange={p.setReel} />
            <Check label="Turntable" note="the camera circles the model" checked={p.spin} onChange={p.setSpin} />
            <Check label="Slice sweep" note="the cutting plane rises and falls" checked={p.sweep} disabled={!st.gridData} onChange={p.setSweep} />
          </div>
          <div className="pd-field"><span className="pd-k">Turntable direction</span>
            <div className="pd-chips">
              <button className={'pd-chip pd-chip--s' + (p.spinDir === 1 ? ' pd-chip--on' : '')} onClick={() => p.setSpinDir(1)}>↺ Counter-clockwise</button>
              <button className={'pd-chip pd-chip--s' + (p.spinDir === -1 ? ' pd-chip--on' : '')} onClick={() => p.setSpinDir(-1)}>↻ Clockwise</button>
            </div>
          </div>
          <Slider label="Turntable speed" value={p.spinSpeed} min={2} max={45} step={1} ticks={9} format={(v) => `${v}°/s`} onChange={(v) => p.setMotion({ spinSpeed: v })} />
          <Slider label="Seconds per shot" value={p.reelSec} min={2} max={12} step={1} ticks={10} format={(v) => `${v} s`} onChange={(v) => p.setMotion({ reelSec: v })} />
          <Slider label="Seconds per composition" value={p.cycleSec} min={3} max={20} step={1} ticks={9} format={(v) => `${v} s`} onChange={(v) => p.setMotion({ cycleSec: v })} />
        </Blk>

        <Blk id="pd-capture" label="Capture" note="files go to your downloads">
          <div className="pd-capture">
            <button className="pd-cap" onClick={() => screenshot().catch(() => {})} data-tip="Screenshot" data-tip-desc="A PNG of exactly what the view shows, HUD included. The browser asks to share this tab.">
              <Icon name="frame" size={18} /><span>Screenshot</span>
            </button>
            <button className={'pd-cap' + (p.recording ? ' pd-cap--on' : '')} onClick={() => toggleRecording().catch(() => {})} data-tip={p.recording ? 'Stop recording' : 'Record'} data-tip-desc="A WebM video of the view with its motion. Esc or the browser's Stop sharing ends it.">
              <span className="pd-rec" /><span>{p.recording ? 'Stop' : 'Record'}</span>
            </button>
            <button className="pd-cap" onClick={() => renderStill(lv.engine, 3)} data-tip="Render the geometry" data-tip-desc="The geometry alone at three times the view's resolution, on a transparent background.">
              <Icon name="export" size={18} /><span>Geometry</span>
            </button>
            <button className="pd-cap" onClick={hudPng} data-tip="Save the HUD" data-tip-desc="Every piece, pin and note without the geometry, as a transparent PNG at 2×.">
              <Icon name="layers" size={18} /><span>HUD only</span>
            </button>
          </div>
          <div className="pd-field"><span className="pd-k">PNG ink</span>
            <div className="pd-chips">
              {([['auto', 'As shown'], ['dark', 'Dark, for light grounds'], ['light', 'Light, for dark grounds']] as const).map(([v, t]) => (
                <button key={v} className={'pd-chip pd-chip--s' + (p.pngInk === v ? ' pd-chip--on' : '')} onClick={() => p.setPngInk(v)}>{t}</button>
              ))}
            </div>
          </div>
          <span className="pd-hint">A single piece saves on its own from its layer, or from its handle in compose mode.</span>
        </Blk>
        <div style={{ height: 40 }} />
      </ScrollArea>
    </aside>
  )
}
