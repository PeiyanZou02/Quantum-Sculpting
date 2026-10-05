// Present mode's bar: back to the lab, the compose drawer, the composition (‹ name ›), the tools
// (navigate, annotate, measure), shots, reel and turntable, capture. H hides everything for clean
// frames; [ ] or 1–6 change composition; ← → step the shots.
import { useEffect } from 'react'
import { useStore } from '../store'
import { usePresent } from '../present'
import { IconButton } from '../qs/Icon'
import { PRESENT_PRESETS, full, presentPresetOf } from '../hud/Composer'
import { isRecording, screenshot, toggleRecording } from './capture'
import { PRESENT_TOOLS } from './PresentPanel'

export function PresentChrome() {
  const { shots, shot } = usePresent()
  if (!shots.length) return null
  return <span className="shot-pill">Shot {shot + 1}/{shots.length}</span>
}

function step(d: number) {
  const p = usePresent.getState()
  const i = PRESENT_PRESETS.findIndex((x) => x.id === presentPresetOf(p.compose))
  p.setCompose(full(PRESENT_PRESETS[(Math.max(0, i) + d + PRESENT_PRESETS.length) % PRESENT_PRESETS.length].set()))
}

export function PresentBar() {
  const p = usePresent()
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]')) || e.metaKey || e.ctrlKey || e.altKey) return
      const s = usePresent.getState()
      if (s.mode !== 'present') return
      if (e.key === 'Escape' && isRecording()) { toggleRecording(); return }
      if (e.key === 'h' || e.key === 'H') s.setBare(!s.bare)
      else if (e.key === 'Escape') { if (s.arrange) s.setArrange(false); else if (s.bare) s.setBare(false) }
      else if (e.key === ']') step(1)
      else if (e.key === '[') step(-1)
      else if (e.key === 't' || e.key === 'T') s.setSpin(!s.spin)
      else if (/^[1-6]$/.test(e.key)) s.setCompose(full(PRESENT_PRESETS[+e.key - 1].set()))
      else if (e.key === 'ArrowRight' && s.shots.length) s.setShot((s.shot + 1) % s.shots.length)
      else if (e.key === 'ArrowLeft' && s.shots.length) s.setShot((s.shot - 1 + s.shots.length) % s.shots.length)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  if (p.bare) return p.recording ? null : <button className="present-peek" onClick={() => p.setBare(false)} data-tip="Show controls" data-tip-key="H" aria-label="Show controls" />
  const cur = PRESENT_PRESETS.find((x) => x.id === presentPresetOf(p.compose))
  return (
    <div className="present-bar" role="toolbar" aria-label="Present">
      <button className="present-bar__mode" onClick={() => p.setMode('lab')} data-tip="Back to the lab" data-tip-desc="Parameters, panels and the research tools.">Lab</button>
      <span className="present-bar__sep" />
      <IconButton name="layers" title={p.drawer ? 'Close the compose drawer' : 'Compose'} desc="Compositions, layers, the mark library, annotations, motion and capture." on={p.drawer} onClick={() => p.setDrawer(!p.drawer)} side="top" />
      <div className="present-bar__comp">
        <button className="present-bar__arrow present-bar__arrow--l" onClick={() => step(-1)} data-tip="Previous composition" data-tip-key="[" aria-label="Previous composition" />
        <span className="present-bar__name">{cur ? cur.title : 'Custom'}</span>
        <button className="present-bar__arrow" onClick={() => step(1)} data-tip="Next composition" data-tip-key="]" aria-label="Next composition" />
      </div>
      <span className="present-bar__sep" />
      {PRESENT_TOOLS.map((t) => (
        <IconButton key={t.id} name={t.icon} title={t.t} desc={t.d} hotkey={t.key} on={tool === t.id} onClick={() => setTool(t.id)} side="top" />
      ))}
      <span className="present-bar__sep" />
      {p.shots.map((_, i) => (
        <button key={i} className={'pd-shot pd-shot--s' + (p.shot === i ? ' pd-shot--on' : '')} onClick={() => p.setShot(i)} data-tip={`Shot ${i + 1}`} data-tip-key={i === p.shot ? undefined : '← →'}>{i + 1}</button>
      ))}
      <IconButton name={p.reel ? 'pause' : 'play'} title={p.reel ? 'Stop the reel' : 'Play the reel'} desc={p.shots.length < 2 ? 'Save two or more shots in the drawer first.' : 'Fly through the shots.'} on={p.reel} disabled={p.shots.length < 2} onClick={() => p.setReel(!p.reel)} side="top" />
      <IconButton name="replay" title={p.spin ? 'Stop the turntable' : 'Turntable'} desc="The camera circles the model. Speed and direction are in the drawer." hotkey="T" on={p.spin} onClick={() => p.setSpin(!p.spin)} side="top" />
      <span className="present-bar__sep" />
      <IconButton name="frame" title="Screenshot" desc="A PNG of what the view shows, HUD included." onClick={() => screenshot().catch(() => {})} side="top" />
      <button className={'present-bar__rec' + (p.recording ? ' present-bar__rec--on' : '')} onClick={() => toggleRecording().catch(() => {})} data-tip={p.recording ? 'Stop recording' : 'Record'} data-tip-desc="A WebM video of the view and its motion." aria-label="Record" />
      <IconButton name="eyeOff" title="Hide controls" desc="For clean frames. H brings them back." hotkey="H" onClick={() => p.setBare(true)} side="top" />
    </div>
  )
}
