// The website runs the service in the visitor's browser (worker.ts). api.ts sends its requests here
// instead of to a server; they come back as ordinary Responses.

/** Built for the website: the service runs in the browser. */
export const IN_BROWSER = import.meta.env.VITE_QS_BROWSER === '1'
/** Where Atlas jobs go from the browser (Atlas does not answer web pages directly). */
const RELAY = import.meta.env.VITE_ATLAS_RELAY ?? ''

export type EngineState = { ready: boolean; failed: boolean; text: string }
let state: EngineState = { ready: false, failed: false, text: 'Starting' }
const listeners = new Set<(s: EngineState) => void>()
export const engineState = () => state
export const onEngine = (fn: (s: EngineState) => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
const set = (s: Partial<EngineState>) => { state = { ...state, ...s }; listeners.forEach((fn) => fn(state)) }

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, (r: Response) => void>()

/** Start loading the engine (also done by the first request). */
export function startEngine() {
  if (worker) return
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data
    if (m.type === 'progress') set({ text: m.text })
    else if (m.type === 'ready') set({ ready: true, text: 'Ready' })
    else if (m.type === 'failed') set({ failed: true, text: m.text })
    else if (m.type === 'response') {
      waiting.get(m.id)?.(new Response(m.status === 204 ? null : m.body, { status: m.status, headers: m.headers }))
      waiting.delete(m.id)
    }
  }
  worker.postMessage({ type: 'start', relay: RELAY })
}

export async function engineFetch(path: string, init?: RequestInit): Promise<Response> {
  startEngine()
  const method = init?.method ?? 'GET'
  // let the browser encode the body (JSON, or a form with a file) and name its type
  const req = new Request(new URL(path, location.origin), { method, body: init?.body, headers: init?.headers })
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k] = v })
  const body = method === 'GET' || method === 'HEAD' ? null : new Uint8Array(await req.arrayBuffer())
  const id = ++seq
  return new Promise((resolve) => {
    waiting.set(id, resolve)
    worker!.postMessage({ type: 'request', id, method, path, headers, body }, body ? [body.buffer] : [])
  })
}
