// The quantum step's action, always in reach: at the foot of Parameters while the step is open, and
// in Properties until there is a result. Atlas runs on a submit (with a key); Evolve and the local
// modes run as their dials turn, and can be run again on demand; Evolve plays its turns.
import { useStore } from '../store'
import { Button, Buttons } from '../ui/Panel'
import { Spinner } from './parts'

export function RunBar({ inline }: { inline?: boolean }) {
  const q = useStore((s) => s.q)
  const grid = useStore((s) => s.grid)
  const proc = useStore((s) => s.proc)
  const job = useStore((s) => s.job)
  const key = useStore((s) => s.key)
  const busy = useStore((s) => !!s.busy.proc || !!s.busy.evolve)
  const ev = useStore((s) => s.evolve)
  const process = useStore((s) => s.process)
  const play = useStore((s) => s.play)
  const pause = useStore((s) => s.pause)
  const running = job?.status === 'running'
  const atlas = q.mode === 'atlas'
  const evolve = q.mode === 'nations'
  const status = !grid ? 'Voxelise a model first.'
    : running ? `Atlas · ${job.tiles_done} of ${job.tiles_total} tiles`
    : busy ? (evolve ? 'Evolving…' : 'Processing…')
    : atlas ? (!key?.set ? 'Needs an Atlas API key.' : proc?.mode === 'atlas' ? (proc.cached ? 'Result read from the cache.' : 'Result from Atlas.') : 'Not run on Atlas yet.')
    : evolve ? (ev.history ? `Turn ${ev.turn} of ${ev.turns}` : 'Not evolved yet.')
    : proc ? 'Live: runs as you change a setting.' : 'Not run yet.'
  return (
    <div className={'run-bar' + (inline ? ' run-bar--inline' : '')}>
      <span className="run-bar__s">{(running || busy) && <Spinner />}{status}</span>
      <Buttons>
        {atlas && !key?.set
          ? <Button kind="primary" onClick={() => useStore.setState({ keyOpen: true })} tip="Atlas API key" desc="Paste the key from your Moth account. It stays on this computer.">Set API key</Button>
          : <Button kind="primary" disabled={!grid || running || busy} onClick={() => process(atlas ? { submit: true } : undefined)}
              tip={atlas ? 'Run on Atlas' : evolve ? 'Run Evolve' : 'Run'} desc={atlas ? 'Submit the grid to Atlas blur-core-v1. Large grids go as several tiles; results are cached.' : evolve ? 'Evolve the nations again from the start with these settings.' : 'Compute the quantum step again with these settings.'}>
              {running ? 'Running…' : atlas ? (proc?.mode === 'atlas' ? 'Run on Atlas again' : 'Run on Atlas') : evolve ? 'Run Evolve' : 'Run'}
            </Button>}
        {evolve && ev.history && (ev.playing
          ? <Button onClick={pause} tip="Pause">Pause</Button>
          : <Button onClick={play} tip="Play the turns" desc="Watch the nations turn by turn; the territory morphs between turns.">Play turns</Button>)}
      </Buttons>
    </div>
  )
}
