// Output frames for Present: the shape of the artboard and the pixel sizes it exports at. The view
// takes the frame's shape inside the window, the HUD lays itself out for it, and Output saves it at
// any of its sizes. 'window' is the whole window, as before.
export type FrameId = 'window' | 'wide' | 'cinema' | 'link' | 'square' | 'post' | 'story' | 'long' | 'poster'
export interface Frame { id: FrameId; t: string; ratio: number | null; use: string; sizes: [number, number][] }

export const FRAMES: Frame[] = [
  { id: 'window', t: 'Window', ratio: null, use: 'The whole window, as shown', sizes: [] },
  { id: 'wide', t: '16:9', ratio: 16 / 9, use: 'Slides, video, screens', sizes: [[1920, 1080], [3840, 2160]] },
  { id: 'cinema', t: '21:9', ratio: 21 / 9, use: 'Banners, web headers', sizes: [[2520, 1080], [5040, 2160]] },
  { id: 'link', t: '1.91:1', ratio: 1.91, use: 'Link cards: LinkedIn, X', sizes: [[1200, 628], [2400, 1256]] },
  { id: 'square', t: '1:1', ratio: 1, use: 'Instagram square post', sizes: [[1080, 1080], [2160, 2160]] },
  { id: 'post', t: '4:5', ratio: 4 / 5, use: 'Instagram portrait post', sizes: [[1080, 1350], [2160, 2700]] },
  { id: 'story', t: '9:16', ratio: 9 / 16, use: 'Stories, Reels, TikTok', sizes: [[1080, 1920], [2160, 3840]] },
  { id: 'long', t: '1:2', ratio: 1 / 2, use: 'Long vertical, carousels', sizes: [[1080, 2160]] },
  { id: 'poster', t: 'A · 1:√2', ratio: 1 / Math.SQRT2, use: 'Posters: A4 and A2 at 300 dpi', sizes: [[2480, 3508], [4961, 7016]] },
]
export const frameOf = (id: FrameId | undefined) => FRAMES.find((f) => f.id === id) ?? FRAMES[0]

/** The largest box of `ratio` inside w × h. */
export function fit(ratio: number, w: number, h: number): { w: number; h: number } {
  return w / h > ratio ? { w: Math.round(h * ratio), h: Math.round(h) } : { w: Math.round(w), h: Math.round(w / ratio) }
}
