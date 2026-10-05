// QCam's home view and the station pills.
import type { Camera } from './QCam'

export const QCAM_HOME: Camera = { az: 35, el: 22, dist: 2.4 }

export const QCAM_STATIONS: ReadonlyArray<{ label: string; az: number; el: number }> = [
  { label: 'Front', az: 0, el: 0 },
  { label: 'Side', az: 90, el: 0 },
  { label: 'Top', az: 0, el: 89 },
  { label: 'Iso', az: 45, el: 35 },
]
