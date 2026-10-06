// The service in a web worker: Pyodide (Python compiled to WebAssembly) runs app/*.py unchanged, and
// each request of the interface goes to Flask through its test client (boot.py). Nothing leaves the
// browser except Atlas jobs, which go through the relay with the visitor's own key.
import boot from './boot.py?raw'

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'
const APP = import.meta.glob('../../../app/*.py', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

interface PyProxy { toJs(): unknown; destroy(): void }
interface Py {
  loadPackage(names: string[]): Promise<void>
  pyimport(name: string): { install(names: string[]): Promise<void> }
  FS: { mkdirTree(p: string): void; writeFile(p: string, data: string | Uint8Array): void }
  globals: { get(name: string): (...a: unknown[]) => PyProxy | boolean; set(name: string, v: unknown): void }
  runPythonAsync(code: string): Promise<unknown>
}

const say = (text: string) => postMessage({ type: 'progress', text })

async function start(relay: string): Promise<Py> {
  say('Loading Python')
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`)
  const py: Py = await loadPyodide({ indexURL: PYODIDE })
  say('Loading NumPy, SciPy and scikit-image')
  await py.loadPackage(['numpy', 'scipy', 'scikit-image', 'micropip', 'requests'])
  say('Loading trimesh and Flask')
  await py.pyimport('micropip').install(['trimesh', 'flask', 'pyodide-http'])
  py.FS.mkdirTree('/qs/app')
  for (const dir of ['input', 'grids', 'output']) py.FS.mkdirTree(`/qs/${dir}`)
  for (const [path, src] of Object.entries(APP)) py.FS.writeFile(`/qs/app/${path.split('/').pop()}`, src)
  say('Starting the service')
  py.globals.set('ATLAS_RELAY', relay)
  await py.runPythonAsync(boot)
  postMessage({ type: 'ready' })
  return py
}

let ready: Promise<Py> | null = null
let later = false

/** Work a request started for afterwards (an Atlas job) runs once the answers before it are out. */
function runLater(py: Py) {
  if (later) return
  later = true
  setTimeout(() => {
    later = false
    try { py.globals.get('run_later')() } catch (e) { console.error(e) }
  }, 0)
}

onmessage = async (e: MessageEvent) => {
  const m = e.data
  if (m.type === 'start') {
    ready ??= start(m.relay).catch((err) => { postMessage({ type: 'failed', text: String(err) }); throw err })
    return
  }
  if (m.type !== 'request' || !ready) return
  try {
    const py = await ready
    const out = py.globals.get('handle')(m.method, m.path, JSON.stringify(m.headers), m.body ?? undefined) as PyProxy
    const [status, headers, body] = out.toJs() as [number, string, Uint8Array]
    out.destroy()
    const copy = body.slice()
    postMessage({ type: 'response', id: m.id, status, headers: JSON.parse(headers), body: copy.buffer }, { transfer: [copy.buffer] })
    runLater(py)
  } catch (err) {
    postMessage({ type: 'response', id: m.id, status: 500, headers: { 'Content-Type': 'application/json' }, body: new TextEncoder().encode(JSON.stringify({ error: String(err) })).buffer })
  }
}
