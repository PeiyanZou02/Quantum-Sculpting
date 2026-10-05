// Each step's action, always in reach at the foot of Parameters (and on top of Properties · Quantum
// until there is a result). With "Run steps by themselves" on (the built-in shapes), steps follow one
// another as settings change; off (your own models), each waits here for its Run, and "Run all" does
// what is missing or out of date. Atlas always waits for its own submit; Evolve also plays its turns.
import { useStore } from '../store'
import { Button, Buttons, Checkbox } from '../ui/Panel'
import { Spinner } from './parts'

export type RunStep = 'model' | 'voxels' | 'quantum' | 'mesh'

export function RunBar({ step = 'quantum', inline }: { step?: RunStep; inline?: boolean }) {
  const st = useStore()
  const { q, grid, proc, job, key, model, report, auto, stale } = st
  const ev = st.evolve
  const running = job?.status === 'running'
  const atlas = q.mode === 'atlas', evolve = q.mode === 'nations'
  // Evolve with random numbers from Atlas: its Run submits a job; with the bytes here, "Evolve again" asks nothing
  const dice = evolve && q.source === 'qrng'
  const waiting = job?.kind === 'qrng' ? ({ submitting: 'submitting', queued: 'queued', pending: 'queued', running: 'measuring', processing: 'measuring', evolving: 'bytes received, evolving' } as Record<string, string>)[job.atlas_status] ?? job.atlas_status : null
  const chip = proc?.qrng ? (proc.qrng.device === 'qpu' ? proc.qrng.backend ?? 'a real chip' : "Atlas's simulator") : null
  const qBusy = !!st.busy.proc || !!st.busy.evolve
  if (!model) return null

  let status: string, action: { t: string; tip: string; desc: string; go: () => void; off?: boolean } | null = null
  let busy = false
  if (step === 'model' || step === 'voxels') {
    busy = !!st.busy.vox
    status = busy ? `Voxelising ${st.vox.n}³…` : !grid ? 'Not voxelised yet.' : stale.vox ? 'Settings changed since the last run.' : `Voxelised ${grid.n}³ · ${grid.solid.toLocaleString()} solid cells`
    action = { t: grid ? 'Voxelise again' : 'Voxelise', tip: 'Voxelise', desc: 'Fill the grid from the model with these settings.', go: () => { st.voxelize() }, off: busy }
  } else if (step === 'quantum') {
    busy = running || qBusy
    status = !grid ? 'Voxelise the model first.'
      : running ? (waiting ? `Atlas · random numbers · ${waiting}` : `Atlas · ${job.tiles_done} of ${job.tiles_total} tiles`)
      : qBusy ? (evolve ? 'Evolving…' : 'Processing…')
      : stale.proc ? 'Settings changed since the last run.'
      : atlas ? (!key?.set ? 'Needs an Atlas API key.' : proc?.mode === 'atlas' ? (proc.cached ? 'Result read from the cache.' : 'Result from Atlas.') : 'Not run on Atlas yet.')
      : dice ? (!key?.set ? 'Needs an Atlas API key.' : ev.history && chip ? `Turn ${ev.turn} of ${ev.turns} · random numbers from ${chip}`
        : st.pool ? 'Not evolved from the bytes with these settings yet.' : 'Not run yet. Run asks Atlas for the random numbers.')
      : evolve ? (ev.history ? `Turn ${ev.turn} of ${ev.turns}` : 'Not evolved yet.')
      : proc ? (auto ? 'Runs again as you change a setting.' : 'Done.') : 'Not run yet.'
    action = (atlas || dice) && !key?.set
      ? { t: 'Set API key', tip: 'Atlas API key', desc: 'Paste the key from your Moth account. It stays on this computer.', go: () => useStore.setState({ keyOpen: true }) }
      : { t: running ? 'Running…' : atlas ? (proc?.mode === 'atlas' ? 'Run on Atlas again' : 'Run on Atlas') : dice ? (st.pool ? 'Run on Atlas again' : 'Run on Atlas') : evolve ? 'Run Evolve' : 'Run',
          tip: atlas || dice ? 'Run on Atlas' : evolve ? 'Run Evolve' : 'Run',
          desc: atlas ? 'Submit the grid to Atlas blur-core-v1. Large grids go as several tiles; results are cached.'
            : dice ? `Ask Atlas's comet-qrng-v1 (${q.device === 'qpu' ? 'a real chip' : 'the simulator'}) for a new pool of random bytes, one job and 5 credits, and evolve the nations from them.`
            : evolve ? 'Evolve the nations from the start with these settings.' : 'Compute the quantum step with these settings.',
          go: () => { st.process(atlas || dice ? { submit: true } : undefined) }, off: !grid || busy }
  } else {
    busy = !!st.busy.mesh
    status = busy ? 'Meshing…' : !proc ? 'Run the quantum step first.' : !report ? 'Not meshed yet.' : stale.mesh ? 'Settings changed since the last run.' : `${report.faces.toLocaleString()} faces · ${report.watertight ? 'watertight' : 'open'}`
    action = { t: report ? 'Build the mesh again' : 'Build the mesh', tip: 'Build the mesh', desc: 'Cut the surface from the quantum result with these settings.', go: () => { st.buildMesh() }, off: !proc || busy }
  }
  const behind = !grid || !proc || !report || stale.vox || stale.proc || stale.mesh
  return (
    <div className={'run-bar' + (inline ? ' run-bar--inline' : '')}>
      <span className="run-bar__s">{busy && <Spinner />}{status}</span>
      <Buttons>
        {action && <Button kind="primary" disabled={action.off} onClick={action.go} tip={action.tip} desc={action.desc}>{action.t}</Button>}
        {step === 'quantum' && evolve && ev.history && (ev.playing
          ? <Button onClick={st.pause} tip="Pause">Pause</Button>
          : <Button onClick={st.play} tip="Play the turns" desc="Watch the nations turn by turn; the territory morphs between turns.">Play turns</Button>)}
        {step === 'quantum' && dice && st.pool && !busy && (stale.proc || !proc?.qrng) && (
          <Button onClick={() => { st.process() }} tip="Evolve again" desc="Evolve with these settings from the random bytes already on this computer. Asks nothing of Atlas.">Evolve again</Button>
        )}
        {!auto && behind && !(step === 'quantum' && evolve && ev.history) && (
          <Button onClick={() => { st.runAll() }} tip="Run all" desc="Voxelise, run the quantum step and build the mesh: whatever is missing or out of date, in order. Atlas reads its cache here; it submits on its own button.">Run all</Button>
        )}
      </Buttons>
      {!inline && <Checkbox label="Run steps by themselves" tip="Each step runs as its settings change and passes on to the next. Good for small models; for large ones leave it off and run each step here." checked={auto} onChange={st.setAuto} />}
    </div>
  )
}
