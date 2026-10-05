// Present mode's drawer, docked at the side so the view stays visible while you compose it.
// Present is where you photograph and diagram the lab result: pick a composition, choose what is shown
// and overlaid, add and tune marks (layers + library), annotate and measure, set the motion, capture.
import { useStore, type Layer, type Shading, type Tool, type View } from '../store'
import { usePresent } from '../present'
import { PRESENT_PRESETS, CompThumb, Sketch, full, presentPresetOf, savePng, toggleVariant } from '../hud/Composer'
import { Icon, IconButton } from '../qs/Icon'
import { Segmented } from '../qs/Segmented'
import { Slider } from '../qs/Slider'
import { Check } from '../qs/Popover'
import { useLive } from '../live'
import { renderStill, screenshot, toggleRecording } from './capture'
import { LayerList, MarkLibrary, useSnap } from './MarkLibrary'

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

function Sec({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="pd-sec">
      <header className="pd-sec__head"><span className="pd-sec__t">{title}</span>{note && <span className="pd-sec__n">{note}</span>}</header>
      {children}
    </section>
  )
}

function Compositions() {
  const p = usePresent()
  const { ctx, bg, refresh } = useSnap()
  const cur = presentPresetOf(p.compose)
  const idx = PRESENT_PRESETS.findIndex((x) => x.id === cur)
  const go = (d: number) => p.setCompose(full(PRESENT_PRESETS[(Math.max(0, idx) + d + PRESENT_PRESETS.length) % PRESENT_PRESETS.length].set()))
  return (
    <Sec title="Compositions" note={cur ? `${idx + 1} / ${PRESENT_PRESETS.length}` : 'custom'}>
      <div className="pd-presets" onPointerEnter={refresh} onPointerLeave={() => p.setPreview(null)}>
        {PRESENT_PRESETS.map((pp, i) => (
          <div key={pp.id} role="button" tabIndex={0} aria-pressed={cur === pp.id} className={'pd-preset' + (cur === pp.id ? ' pd-preset--on' : '')}
            onPointerEnter={() => p.setPreview(full(pp.set()))} onClick={() => { p.setCompose(full(pp.set())); p.setPreview(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.setCompose(full(pp.set())) } }}
            data-tip={pp.title} data-tip-desc={pp.desc} data-tip-key={String(i + 1)}>
            {ctx ? <CompThumb compose={full(pp.set())} ctx={ctx} bg={bg} w={146} h={90} /> : <Sketch parts={pp.sketch} w={146} h={90} />}
            <span className="pd-preset__t"><span className="pd-preset__n">{i + 1}</span>{pp.title}</span>
          </div>
        ))}
      </div>
      <div className="pd-row">
        <button className="pd-chip pd-chip--s" onClick={() => go(-1)} data-tip="Previous composition" data-tip-key="[">‹ Previous</button>
        <button className="pd-chip pd-chip--s" onClick={() => go(1)} data-tip="Next composition" data-tip-key="]">Next ›</button>
        <span className="pd-grow" />
        <Check label="Cycle" note={`every ${p.cycleSec} s`} checked={p.cycle} onChange={p.setCycle} />
      </div>
    </Sec>
  )
}

function Annotate() {
  const st = useStore()
  const p = usePresent()
  const lv = useLive()
  const pins = lv.probe?.pins ?? []
  const rename = (i: number, t: string) => lv.probe?.setPins(pins.map((q, j) => (j === i ? { ...q, hit: { ...q.hit, lines: [t, q.hit.lines[1]] as [string, string] } } : q)))
  return (
    <Sec title="Annotate" note="notes stay on the geometry">
      <div className="pd-tools" role="radiogroup" aria-label="Tool">
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
        <button className="pd-chip" onClick={p.addText} data-tip="Add text" data-tip-desc="A title or caption you can drag anywhere. Double-click it to edit.">+ Text</button>
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
      {p.texts.length > 0 && (
        <ol className="pd-notes">
          {p.texts.map((t) => (
            <li key={t.id} className="pd-note">
              <span className="pd-note__n">T</span>
              <span className="pd-note__body"><input className="pd-note__in" value={t.text} onChange={(e) => p.setText(t.id, e.target.value)} aria-label="Text" /></span>
              <IconButton name="clear" size={22} title="Remove the text" onClick={() => p.setText(t.id, null)} />
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
  return (
    <aside className="pd" aria-label="Compose the present view" onPointerLeave={() => { p.setPreview(null); p.setHl(null) }}>
      <header className="pd__head">
        <span className="pd__title">Compose</span>
        <IconButton name="clear" size={26} title="Close the drawer" desc="Bring it back from the bar at the bottom." onClick={() => p.setDrawer(false)} side="left" />
      </header>

      <Compositions />

      <Sec title="View" note="what the photo shows">
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
      </Sec>

      <Sec title="Layers" note="hover one to single it out">
        <LayerList />
        <div className="pd-row">
          <button className={'pd-chip' + (p.arrange ? ' pd-chip--on' : '')} onClick={() => p.setArrange(!p.arrange)} data-tip="Show every handle" data-tip-desc="Outlines all pieces so you can find and drag them. Pieces can also be dragged directly.">
            <Icon name="drag" size={14} />{p.arrange ? 'Done' : 'Show handles'}
          </button>
          {Object.keys(p.pos).some((k) => k.startsWith('present|') && !k.startsWith('present|text:')) && (
            <button className="pd-chip" onClick={() => Object.keys(p.pos).filter((k) => k.startsWith('present|') && !k.startsWith('present|text:')).forEach((k) => p.setPos(k, null))}>Reset positions</button>
          )}
        </div>
      </Sec>

      <Sec title="Library" note="click to add · several per family">
        <MarkLibrary compose={p.compose} looks={p.looks} onPreview={p.setPreview}
          onToggle={(f, id) => p.setCompose({ [f]: toggleVariant(p.compose, f, id) })} />
      </Sec>

      <Annotate />

      <Sec title="Motion" note="for recordings">
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
      </Sec>

      <Sec title="Capture" note="files go to your downloads">
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
          <button className="pd-cap" onClick={hudPng} data-tip="Save the HUD" data-tip-desc="Every mark, card, pin and note without the geometry, as a transparent PNG at 2×: lay it over the geometry render or anything else.">
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
        <span className="pd-hint">Each piece on the view also saves on its own: hover it and press PNG. PNGs are transparent; HUD only and pieces use the ink above.</span>
      </Sec>
    </aside>
  )
}
