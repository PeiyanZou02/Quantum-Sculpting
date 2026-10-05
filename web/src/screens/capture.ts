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
  // the browser's own "Stop sharing" also ends the recording
  stream.getVideoTracks()[0]?.addEventListener('ended', () => recorder?.state === 'recording' && recorder.stop())
  p.setRecording(true)
  p.setBare(true)
  await frames(3)
  recorder = rec
  rec.start(250)
}

export const isRecording = () => !!recorder

export async function renderStill(engine: Engine | undefined, scale = 3): Promise<void> {
  if (!engine) return
  const blob = await engine.render(scale)
  if (blob) download(blob, `quantum-sculptor-render-${scale}x-${stamp()}.png`)
}
