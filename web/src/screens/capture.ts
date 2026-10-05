// Capture for Present mode. Screenshot and Record use the browser's tab capture, so they record
// exactly what is on screen, HUD and all (the browser asks for permission each time). Render saves
// the geometry alone at a higher resolution with a transparent background.
import { usePresent } from '../present'
import type { Engine } from '../view/engine'

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const frames = (n = 2) => new Promise<void>((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })

async function tabStream(): Promise<MediaStream> {
  const opts = { video: { displaySurface: 'browser', frameRate: 60 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }
  return navigator.mediaDevices.getDisplayMedia(opts as DisplayMediaStreamOptions)
}

/** Hide the controls, wait for the layout to settle, then run `fn`. */
async function bare<T>(fn: () => Promise<T>): Promise<T> {
  const p = usePresent.getState()
  const was = { bare: p.bare, drawer: p.drawer }
  p.setBare(true)
  await frames(3)
  try {
    return await fn()
  } finally {
    const q = usePresent.getState()
    if (!q.recording) q.setBare(was.bare)
  }
}

export async function screenshot(): Promise<void> {
  const stream = await tabStream()
  try {
    await bare(async () => {
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()
      await frames(4)
      const c = document.createElement('canvas')
      c.width = video.videoWidth
      c.height = video.videoHeight
      c.getContext('2d')!.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (blob) download(blob, `quantum-sculptor-${stamp()}.png`)
    })
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

let recorder: MediaRecorder | null = null

export async function toggleRecording(): Promise<void> {
  const p = usePresent.getState()
  if (recorder) { recorder.stop(); return }
  const stream = await tabStream()
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  const chunks: Blob[] = []
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 })
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop())
    recorder = null
    usePresent.getState().setRecording(false)
    usePresent.getState().setBare(false)
    download(new Blob(chunks, { type: type || 'video/webm' }), `quantum-sculptor-${stamp()}.webm`)
  }
  // a framed artboard records only itself where the browser can crop a tab capture to an element
  const view = document.querySelector<HTMLElement>('.stage__view')
  const crop = (globalThis as unknown as { CropTarget?: { fromElement: (e: Element) => Promise<unknown> } }).CropTarget
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { cropTo?: (t: unknown) => Promise<void> }
  if (view && crop && track?.cropTo && usePresent.getState().frame !== 'window') {
    try { await track.cropTo(await crop.fromElement(view)) } catch { /* records the whole tab */ }
  }
  // the browser's own "Stop sharing" also ends the recording
  stream.getVideoTracks()[0]?.addEventListener('ended', () => recorder?.state === 'recording' && recorder.stop())
  p.setRecording(true)
  p.setBare(true)
  await frames(3)
  recorder = rec
  rec.start(250)
}

export const isRecording = () => !!recorder

const blobOf = (url: string) => fetch(url).then((r) => r.blob())
const img = (src: Blob) => new Promise<HTMLImageElement>((res, rej) => {
  const i = new Image()
  i.onload = () => res(i)
  i.onerror = rej
  i.src = URL.createObjectURL(src)
})

const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing'] as const
/** html-to-image drops paint that SVG shapes get from class rules (lines vanish, unfilled boxes turn
 *  black): write it onto each shape's own style for the capture, and put it back afterwards. */
export function inlineSvgPaint(root: Element): () => void {
  const undo: (() => void)[] = []
  root.querySelectorAll<SVGElement>('svg *').forEach((el) => {
    if (!(el instanceof SVGElement) || !el.getAttribute('class')) return
    const was = el.getAttribute('style')
    const cs = getComputedStyle(el)
    for (const k of PAINT) if (!el.style.getPropertyValue(k)) el.style.setProperty(k, cs.getPropertyValue(k))
    undo.push(() => { if (was == null) el.removeAttribute('style'); else el.setAttribute('style', was) })
  })
  return () => undo.forEach((f) => f())
}

/** The whole composition as one PNG of exactly w × h px: the backdrop, the geometry, then the HUD,
 *  pins and notes over it. The view has the frame's shape, so nothing is cropped or stretched. */
export async function exportFrame(engine: Engine | undefined, w: number, h: number, name: string): Promise<void> {
  const view = document.querySelector<HTMLElement>('.stage__view')
  if (!engine || !view) return
  await bare(async () => {
    const { toPng } = await import('html-to-image')
    const vw = view.clientWidth, vh = view.clientHeight
    const scale = w / vw
    const skip = (n: Node) => !(n instanceof Element && n.matches('canvas, .hud-piece__bar, [data-no-export], [data-hud^="chrome:"], .stage__drop, .landing, .qs-probe-rulers'))
    // 1 · the ground and its backdrop: the view's own background, no children
    const ground = await toPng(view, { pixelRatio: scale, width: vw, height: vh, filter: (n) => n === view })
    // 2 · the geometry, rendered at the target size
    const pr = engine.pixelRatio()
    const geo = await engine.render(scale / pr)
    // 3 · everything drawn over it, on a transparent ground
    const restore = inlineSvgPaint(view)
    const over = await toPng(view, { pixelRatio: scale, width: vw, height: vh, style: { background: 'none' }, filter: skip }).finally(restore)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--qs-bg').trim() || '#E3E4E7'
    g.fillRect(0, 0, w, h)
    for (const part of [await blobOf(ground), geo, await blobOf(over)]) {
      if (!part) continue
      const i = await img(part)
      g.drawImage(i, 0, 0, w, h)
      URL.revokeObjectURL(i.src)
    }
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
    if (blob) download(blob, `quantum-sculptor-${name}-${w}x${h}-${stamp()}.png`)
  })
}

/** What is on the view as a glTF binary (.glb): meshes and voxels as shown, for Blender, Rhino or the web. */
export async function exportGlb(engine: Engine | undefined): Promise<void> {
  if (!engine) return
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const data = await new GLTFExporter().parseAsync(engine.exportable(), { binary: true, onlyVisible: true })
  download(new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' }), `quantum-sculptor-${stamp()}.glb`)
}

export async function renderStill(engine: Engine | undefined, scale = 3): Promise<void> {
  if (!engine) return
  const blob = await engine.render(scale)
  if (blob) download(blob, `quantum-sculptor-render-${scale}x-${stamp()}.png`)
}
