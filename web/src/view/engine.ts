// three.js view of the pipeline. Everything is drawn in grid coordinates (voxel (i,j,k) centred on
// (i,j,k), z up) and the root is scaled to a unit cube, as in Peiyan's original viewer, so the four
// views line up exactly. Shading modes (wire, solid, value, entanglement) swap materials only.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { MeshData } from '../api'
import type { Axis, Grid } from '../qs/grid'

export type LayerName = 'model' | 'voxels' | 'processed' | 'result'
export type ViewName = LayerName | 'scan'
export type ShadingMode = 'wire' | 'solid' | 'value' | 'entangle'

/** Box edges drawn from the face UVs, so instanced voxels read as a clean lattice (no triangle diagonals). */
function voxelWire(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color('#151618') } },
    vertexShader: `#include <common>
#include <clipping_planes_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`,
    fragmentShader: `#include <clipping_planes_pars_fragment>
uniform vec3 color;
varying vec2 vUv;
void main() {
  #include <clipping_planes_fragment>
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float a = 1.0 - smoothstep(0.0, fwidth(e) * 1.4, e);
  if (a < 0.03) discard;
  gl_FragColor = vec4(color, a * 0.85);
}`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false, clipping: true,
  })
}

const INK = new THREE.Color('#151618')
const INK3 = new THREE.Color('#8B8D93')
const INK4 = new THREE.Color('#B3B5BB')
const SURFACE = new THREE.Color('#C9CBD0')
const DEEP = new THREE.Color('#5E6066')

/** A labelled voxel layer (setLabels) and the tween from its previous frame. Instances are the union
 *  of the cells drawn before and after; those that move come first, so each frame uploads one range. */
interface Morph {
  n: number
  /** Target frame: label per cell (0 = empty), index (x·n + y)·n + z. */
  labels: Uint8Array
  grid: Grid
  mesh: THREE.InstancedMesh
  /** Flat cell index per instance. */
  cell: Int32Array
  /** Scale shown now, and from / to of the tween. */
  scale: Float32Array
  s0: Float32Array
  s1: Float32Array
  /** Linear RGB from / to. */
  c0: Float32Array
  c1: Float32Array
  /** Owner changed: a small swell so the conquest reads. */
  pop: Uint8Array
  /** Drawn in the settled frame (else dropped when the tween ends). */
  keep: Uint8Array
  /** Instances [0, moving) change during the tween. */
  moving: number
  t0: number
  ms: number
  done: boolean
}

const POP = 0.18

export interface Pick {
  cell: [number, number, number]
  value: number | null
  layer: LayerName
  point: THREE.Vector3 // grid coords
}

export class Engine {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50)
  root = new THREE.Group()
  frame = new THREE.Group()
  layers: Partial<Record<LayerName, THREE.Object3D>> = {}
  grids: Partial<Record<LayerName, Grid>> = {}
  active: LayerName = 'model'
  n = 32
  dirty = true
  private box = new THREE.BoxGeometry(0.9, 0.9, 0.9)
  private meshMat = new THREE.MeshStandardMaterial({ color: SURFACE, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide })
  private voxMats: Record<string, THREE.MeshLambertMaterial> = {
    voxels: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    processed: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  }
  private wireVox: Record<string, THREE.ShaderMaterial> = { voxels: voxelWire(), processed: voxelWire() }
  private meshWire = new THREE.MeshBasicMaterial({ color: INK, wireframe: true, transparent: true, opacity: 0.55 })
  private ghostMesh = new THREE.MeshBasicMaterial({ color: INK3, wireframe: true, transparent: true, opacity: 0.16, depthWrite: false })
  private ghostVox = new THREE.MeshBasicMaterial({ color: INK3, transparent: true, opacity: 0.08, depthWrite: false })
  private shading: ShadingMode = 'solid'
  private ent: { mesh: THREE.Material; voxels: THREE.Material; processed: THREE.Material } | null = null
  private ghosts = new Set<LayerName>()
  // scan view: processed kept below the plane, input voxels above it
  private cut = { processed: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), voxels: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) }
  private scanner = new THREE.Group()
  private scanMat = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  private scanEdge = new THREE.LineBasicMaterial({ color: INK })
  private outline: THREE.Object3D | null = null
  private floor: THREE.Object3D | null = null
  private showBounds = true
  private showFloor = true
  /** Cells of the print grid along each side of the floor. */
  private floorDiv = 4
  view: ViewName = 'model'
  private lineMat = new THREE.LineBasicMaterial({ color: INK4, transparent: true, opacity: 0.9 })
  private dashMat = new THREE.LineDashedMaterial({ color: INK3, dashSize: 0.6, gapSize: 0.9 })
  private plane: THREE.Mesh
  private planeEdge: THREE.LineSegments
  private ray = new THREE.Raycaster()
  private raf = 0
  controls: OrbitControls
  private tween: { from: THREE.Vector3; to: THREE.Vector3; t0: number } | null = null
  private morphs: Partial<Record<LayerName, Morph>> = {}
  /** Scratch n³ map cell → union slot (−1 = none), reset after each use. */
  private slot: Int32Array | null = null
  onChange?: () => void

  private host: HTMLElement
  private lights!: { hemi: THREE.HemisphereLight; key: THREE.DirectionalLight; rim: THREE.DirectionalLight }

  constructor(host: HTMLElement) {
    this.host = host
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    host.prepend(this.renderer.domElement)
    Object.assign(this.renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })

    this.camera.up.set(0, 0, 1)
    this.scene.add(this.camera)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9ca2, 2.1)
    hemi.position.set(0, 0, 1)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(-0.6, 0.9, 1)
    this.camera.add(key)
    const rim = new THREE.DirectionalLight(0xffffff, 0)
    rim.position.set(0.4, -0.6, -1)
    this.camera.add(rim)
    this.lights = { hemi, key, rim }

    this.root.add(this.frame)
    this.renderer.localClippingEnabled = true
    this.scanner.visible = false
    this.root.add(this.scanner)
    this.frame.visible = false
    this.scene.add(this.root)

    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
    )
    this.planeEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: INK }))
    this.plane.add(this.planeEdge)
    this.plane.visible = false
    this.root.add(this.plane)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.target.set(0, 0, 0.42)
    this.controls.addEventListener('change', () => { this.dirty = true; this.onChange?.() })

    this.setGrid(32)
    new ResizeObserver(() => this.resize()).observe(host)
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (this.tween) {
        const k = Math.min(1, (performance.now() - this.tween.t0) / 480)
        const e = 1 - (1 - k) ** 3
        const tgt = this.controls.target
        const a = this.tween.from, b = this.tween.to
        // interpolate on the sphere around the target so the camera swings rather than cutting through
        const r = a.length() + (b.length() - a.length()) * e
        const dir = a.clone().normalize().lerp(b.clone().normalize(), e).normalize()
        this.camera.position.copy(tgt).addScaledVector(dir, r)
        if (k >= 1) this.tween = null
        this.dirty = true
        this.onChange?.()
      }
      this.stepMorphs(performance.now())
      this.controls.update()
      if (this.dirty) {
        this.renderer.render(this.scene, this.camera)
        this.dirty = false
      }
    }
    loop()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private lastOrbit = 0

  /** Swing the camera to an azimuth / elevation (degrees). az 0 = front (camera on −y).
   *  Calls in quick succession (a drag on a HUD mark) move the camera directly, keeping its distance. */
  orbitTo(azDeg: number, elDeg: number, distScale = 1) {
    const now = performance.now(), dragging = now - this.lastOrbit < 120
    this.lastOrbit = now
    if (dragging) {
      const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(Math.max(-89.5, Math.min(elDeg, 89.5)))
      const d = this.camera.position.distanceTo(this.controls.target)
      this.tween = null
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3(Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)).multiplyScalar(d))
      this.camera.lookAt(this.controls.target)
      this.controls.update()
      this.dirty = true
      this.onChange?.()
      return
    }
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(Math.min(elDeg, 89.5))
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2
    const h = Math.atan(Math.tan(v) * this.camera.aspect)
    const d = (0.95 / Math.sin(Math.min(v, h))) * distScale
    const to = new THREE.Vector3(Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)).multiplyScalar(d)
    const from = this.camera.position.clone().sub(this.controls.target)
    this.tween = { from, to, t0: performance.now() }
  }

  /** Navigation from the icon buttons: drag deltas in px. */
  nudge({ orbit, pan, zoom }: { orbit?: [number, number]; pan?: [number, number]; zoom?: number }) {
    const t = this.controls.target, cam = this.camera
    const off = cam.position.clone().sub(t)
    if (orbit) {
      const sph = new THREE.Spherical().setFromVector3(new THREE.Vector3(off.x, off.z, -off.y))
      sph.theta -= orbit[0] * 0.01
      sph.phi = Math.min(Math.PI - 0.01, Math.max(0.01, sph.phi - orbit[1] * 0.01))
      const v = new THREE.Vector3().setFromSpherical(sph)
      off.set(v.x, -v.z, v.y)
    }
    if (zoom) off.multiplyScalar(Math.exp(zoom * 0.005))
    if (pan) {
      const k = off.length() * 0.0015
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
      const d = right.multiplyScalar(-pan[0] * k).add(up.multiplyScalar(pan[1] * k))
      t.add(d)
    }
    cam.position.copy(t).add(off)
    cam.lookAt(t)
    this.controls.update()
    this.dirty = true
    this.onChange?.()
  }

  /** Dolly and pan (keeping the angle) until what is shown fills `rect` (host px) without spilling:
   *  how Present frames the object in the room its HUD leaves. */
  frameInto(rect: { l: number; r: number; t: number; b: number }) {
    // the view may have just taken a new frame's shape: project with the camera's current aspect
    if (this.host.clientHeight && Math.abs(this.camera.aspect - this.host.clientWidth / this.host.clientHeight) > 1e-3) this.resize()
    const t = this.controls.target, cam = this.camera
    const H = this.host.clientHeight
    for (let i = 0; i < 4; i++) {
      const cur = this.bounds2D()
      if (!cur || cur.r - cur.l < 1 || cur.b - cur.t < 1) return
      const k = Math.min((rect.r - rect.l) / (cur.r - cur.l), (rect.b - rect.t) / (cur.b - cur.t))
      const off = cam.position.clone().sub(t).multiplyScalar(1 / Math.max(0.2, Math.min(5, k)))
      cam.position.copy(t).add(off)
      cam.lookAt(t)
      cam.updateMatrixWorld()
      const now = this.bounds2D()
      if (!now) return
      const dx = (rect.l + rect.r) / 2 - (now.l + now.r) / 2, dy = (rect.t + rect.b) / 2 - (now.t + now.b) / 2
      const wpp = (2 * off.length() * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / H
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
      const move = right.multiplyScalar(-dx * wpp).add(up.multiplyScalar(dy * wpp))
      t.add(move)
      cam.position.add(move)
      cam.lookAt(t)
      cam.updateMatrixWorld()
    }
    this.controls.update()
    this.dirty = true
    this.onChange?.()
  }

  /** Fly to a saved shot: azimuth, elevation (degrees) and distance (grid-box units). */
  flyTo(azDeg: number, elDeg: number, dist: number) {
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(Math.max(-89.5, Math.min(elDeg, 89.5)))
    const to = new THREE.Vector3(Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)).multiplyScalar(dist)
    this.tween = { from: this.camera.position.clone().sub(this.controls.target), to, t0: performance.now() }
  }

  /** Left drag orbits (off while the slice tool takes the drag). */
  setRotate(on: boolean) {
    this.controls.enableRotate = on
  }

  /** Turntable: the camera circles the model slowly. */
  setSpin(on: boolean, degPerSec = 8) {
    this.controls.autoRotate = on
    this.controls.autoRotateSpeed = degPerSec / 6   // OrbitControls: 2.0 ≈ 30 s per turn at 60 fps
    this.dirty = true
  }

  /** The renderer's device pixel ratio (render(scale) multiplies it). */
  pixelRatio() { return this.renderer.getPixelRatio() }

  /** The geometry on view for export: a copy of the root without the frame, plane and scanner guides. */
  exportable(): THREE.Object3D {
    const out = new THREE.Group()
    for (const c of this.root.children) {
      if (c === this.frame || c === this.plane || c === this.scanner || !c.visible) continue
      out.add(c.clone())
    }
    out.applyMatrix4(this.root.matrixWorld)
    return out
  }

  /** A still of the geometry alone at `scale`× the view's pixels, transparent background (PNG blob). */
  async render(scale = 2): Promise<Blob | null> {
    const pr = this.renderer.getPixelRatio()
    const w = this.host.clientWidth, h = this.host.clientHeight
    this.renderer.setPixelRatio(pr * scale)
    this.renderer.setSize(w, h, false)
    const frame = this.frame.visible, plane = this.plane.visible
    this.frame.visible = false
    this.plane.visible = false
    this.renderer.render(this.scene, this.camera)
    const blob = await new Promise<Blob | null>((res) => this.renderer.domElement.toBlob(res, 'image/png'))
    this.frame.visible = frame
    this.plane.visible = plane
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(w, h, false)
    this.dirty = true
    return blob
  }

  private rt: THREE.WebGLRenderTarget | null = null

  /** Off-screen renders of single layers from the current camera, as PNG data URLs (for the stages strip).
   *  Nothing is drawn to the screen, so there is no flicker. */
  thumbs(names: LayerName[], w: number, h: number): Partial<Record<LayerName, string>> {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = Math.round(w * dpr), H = Math.round(h * dpr)
    if (!this.rt || this.rt.width !== W || this.rt.height !== H) {
      this.rt?.dispose()
      this.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 })
    }
    const cam = this.camera.clone()
    cam.aspect = w / h
    cam.updateProjectionMatrix()
    const keep = { view: this.view, active: this.active, ghosts: this.ghosts, frame: this.frame.visible, plane: this.plane.visible, scanner: this.scanner.visible }
    const px = new Uint8Array(W * H * 4)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    const out: Partial<Record<LayerName, string>> = {}
    this.ghosts = new Set()
    this.plane.visible = false
    for (const name of names) {
      if (!this.layers[name]) continue
      this.view = name
      this.active = name
      this.apply()
      this.scanner.visible = false
      this.renderer.setRenderTarget(this.rt)
      this.renderer.setClearColor(0x000000, 0)
      this.renderer.clear()
      this.renderer.render(this.scene, cam)
      this.renderer.readRenderTargetPixels(this.rt, 0, 0, W, H, px)
      const img = ctx.createImageData(W, H)
      for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)   // GL rows are bottom-up
      ctx.putImageData(img, 0, 0)
      out[name] = canvas.toDataURL('image/png')
    }
    this.renderer.setRenderTarget(null)
    this.view = keep.view
    this.active = keep.active
    this.ghosts = keep.ghosts
    this.apply()
    this.frame.visible = keep.frame
    this.plane.visible = keep.plane
    this.scanner.visible = keep.scanner
    this.dirty = true
    return out
  }

  /** Back to the starting view, centred on the grid. */
  /** The camera as it is (position and target), to put back later. */
  cameraState(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    return { pos: this.camera.position.clone(), target: this.controls.target.clone() }
  }
  setCameraState(c: { pos: THREE.Vector3; target: THREE.Vector3 }) {
    this.controls.target.copy(c.target)
    this.camera.position.copy(c.pos)
    this.camera.lookAt(c.target)
    this.controls.update()
    this.dirty = true
    this.onChange?.()
  }

  home() {
    this.controls.target.set(0, 0, 0.42)
    this.orbitTo(35, 22)
  }

  /** Camera distance to the target in grid-box units, and the vertical field of view. */
  lens() {
    return { dist: this.camera.position.distanceTo(this.controls.target), fov: this.camera.fov }
  }

  /** Grid-space bounding box of what is shown (the active layer, else the model). */
  boxGrid(): { min: [number, number, number]; max: [number, number, number] } | null {
    const layer = this.layers[this.active] ?? this.layers.model
    if (!layer) return null
    this.scene.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(layer)
    if (b.isEmpty()) return null
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert()
    b.applyMatrix4(inv)
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }
  }

  /** Current azimuth / elevation in degrees, for the readout. */
  angles() {
    const d = this.camera.position.clone().sub(this.controls.target)
    const el = Math.asin(d.z / d.length())
    const az = (Math.atan2(d.x, -d.y) * 180) / Math.PI
    return { az: (az + 360) % 360, el: (el * 180) / Math.PI }
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (!this.framed) {
      this.framed = true
      this.orbitTo(35, 22)
      this.tween!.t0 = -1e9
    }
    this.dirty = true
  }

  private framed = false

  /** Grid edge changed: rescale and redraw the n³ outline and floor lines. */
  setGrid(n: number) {
    this.n = n
    const s = 1 / n
    this.root.scale.setScalar(s)
    this.root.position.set(-(n - 1) / 2 * s, -(n - 1) / 2 * s, 0.5 * s)
    for (const child of [...this.frame.children]) {
      this.frame.remove(child)
      ;(child as THREE.LineSegments).geometry.dispose()
    }
    const c = (n - 1) / 2
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(n, n, n)), this.dashMat)
    outline.computeLineDistances()
    outline.scale.setScalar(1)
    outline.position.set(c, c, c)
    const floor = this.makeFloor()
    outline.visible = this.showBounds
    this.outline = outline
    this.floor = floor
    this.frame.add(outline, floor)
    for (const c of [...this.scanner.children]) this.scanner.remove(c)
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(n, n), this.scanMat)
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(n, n)), this.scanEdge)
    this.scanner.add(sq, rim)
    this.scanner.position.set(c, c, -0.5)
    this.dirty = true
  }

  private clear(name: LayerName) {
    const layer = this.layers[name]
    if (!layer) return
    this.root.remove(layer)
    if (layer instanceof THREE.InstancedMesh) layer.dispose()
    else if (layer instanceof THREE.Mesh) layer.geometry.dispose()
    delete this.layers[name]
    delete this.grids[name]
    delete this.morphs[name]
    this.dirty = true
  }

  private put(name: LayerName, obj: THREE.Object3D) {
    this.clear(name)
    this.layers[name] = obj
    this.root.add(obj)
    this.apply()
  }

  private shows(k: LayerName) {
    return this.view === 'scan' ? k === 'voxels' || k === 'processed' : k === this.view
  }

  /** Material for a layer under the current shading mode (ghost layers get a faint wire). */
  private materialFor(k: LayerName): THREE.Material {
    const inst = k === 'voxels' || k === 'processed'
    if (!this.shows(k) && this.ghosts.has(k)) return inst ? this.ghostVox : this.ghostMesh
    if (this.shading === 'wire') return inst ? this.wireVox[k] : this.meshWire
    if (this.shading === 'entangle' && this.ent) return inst ? this.ent[k as 'voxels' | 'processed'] : this.ent.mesh
    return inst ? this.voxMats[k] : this.meshMat
  }

  /** Visibility, materials and scan clipping, after any change. */
  private apply() {
    const scan = this.view === 'scan'
    for (const [k, layer] of Object.entries(this.layers) as [LayerName, THREE.Mesh][]) {
      layer.visible = this.shows(k) || this.ghosts.has(k)
      const mat = this.materialFor(k)
      if (k === 'voxels' || k === 'processed') {
        const want = scan && this.shows(k) ? [this.cut[k]] : null
        if ((mat.clippingPlanes?.length ?? 0) !== (want?.length ?? 0)) {
          mat.clippingPlanes = want
          mat.needsUpdate = true
        }
      }
      layer.material = mat
    }
    this.frame.visible = Object.keys(this.layers).length > 0
    this.scanner.visible = scan
    this.dirty = true
  }

  setShading(mode: ShadingMode, ent?: { mesh: THREE.Material; voxels: THREE.Material; processed: THREE.Material } | null) {
    this.shading = mode
    if (ent !== undefined) this.ent = ent
    this.apply()
  }

  /** Extra layers drawn faintly with the main view, like Blender's visibility toggles. */
  setGhosts(names: LayerName[]) {
    this.ghosts = new Set(names)
    this.apply()
  }

  setMesh(name: LayerName, data: MeshData | null, transform?: number[][]) {
    if (!data) return this.clear(name)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3))
    g.setIndex(new THREE.BufferAttribute(data.faces, 1))
    const mesh = new THREE.Mesh(g, this.meshMat)
    if (transform) {
      mesh.matrixAutoUpdate = false
      mesh.matrix.set(...(transform.flat() as Parameters<THREE.Matrix4['set']>))
    }
    this.put(name, mesh)
  }

  /** Fit a raw mesh into the grid the way pipeline.placement does (longest side fills n − 2·pad, centred, on the floor). */
  static placement(data: MeshData, n: number, pad = 2): number[][] {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < data.vertices.length; i += 3)
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], data.vertices[i + a])
        hi[a] = Math.max(hi[a], data.vertices[i + a])
      }
    const ext = hi.map((h, a) => h - lo[a])
    const s = (n - 2 * pad - 1) / Math.max(...ext)
    const off = [(n - 1 - ext[0] * s) / 2, (n - 1 - ext[1] * s) / 2, pad - 0.5]
    return [
      [s, 0, 0, off[0] - lo[0] * s],
      [0, s, 0, off[1] - lo[1] * s],
      [0, 0, s, off[2] - lo[2] * s],
      [0, 0, 0, 1],
    ]
  }

  /** Only cells with a neighbour below the threshold are drawn. Processed grids are shaded by value. */
  setVoxels(name: LayerName, grid: Grid | null, threshold: number, shaded: boolean) {
    if (!grid) return this.clear(name)
    const { n, data } = grid, n2 = n * n
    const cells: number[] = []
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        for (let z = 0; z < n; z++) {
          const i = x * n2 + y * n + z
          if (data[i] < threshold) continue
          const exposed = x === 0 || x === n - 1 || y === 0 || y === n - 1 || z === 0 || z === n - 1
            || data[i - n2] < threshold || data[i + n2] < threshold
            || data[i - n] < threshold || data[i + n] < threshold
            || data[i - 1] < threshold || data[i + 1] < threshold
          if (exposed) cells.push(x, y, z, data[i])
        }
    const count = cells.length / 4
    const mesh = new THREE.InstancedMesh(this.box, this.voxMats[name] ?? this.voxMats.voxels, Math.max(count, 1))
    mesh.count = count
    const m = new THREE.Matrix4(), col = new THREE.Color()
    const span = Math.max(1 - threshold, 1e-6)
    for (let k = 0; k < count; k++) {
      m.makeTranslation(cells[k * 4], cells[k * 4 + 1], cells[k * 4 + 2])
      mesh.setMatrixAt(k, m)
      if (shaded) col.copy(SURFACE).lerp(DEEP, Math.min(1, (cells[k * 4 + 3] - threshold) / span))
      else col.copy(SURFACE)
      mesh.setColorAt(k, col)
    }
    mesh.userData.cells = cells
    this.put(name, mesh)
    this.grids[name] = grid
  }

  /** The cells drawn for a voxel layer, as x, y, z, value quads (see setVoxels), or null. */
  cellsOf(name: LayerName): number[] | null {
    const l = this.layers[name]
    return l instanceof THREE.InstancedMesh ? (l.userData.cells as number[]) : null
  }

  /** Per-cell colours for a voxel layer (linear RGB triples, in the order of cellsOf), e.g. Evolve's nations. */
  setVoxelColors(name: LayerName, rgb: Float32Array) {
    const l = this.layers[name]
    if (!(l instanceof THREE.InstancedMesh) || !l.instanceColor) return
    l.instanceColor.array.set(rgb.subarray(0, l.instanceColor.array.length))
    l.instanceColor.needsUpdate = true
    this.dirty = true
  }

  /**
   * A voxel layer from a label frame (e.g. Evolve's owners: 0 = empty, else owner + 1), drawn like
   * setVoxels at level 0.5 with plain per-label colours from `palette` (linear RGB, 3 per label).
   * With ms > 0 and a previous frame of the same size on this layer, it morphs from what is on screen:
   * cells that fill grow in, cells that empty shrink out, cells that change label cross-fade with a
   * small swell. A new frame interrupts a running tween and starts from its current state.
   */
  setLabels(name: LayerName, labels: Uint8Array, n: number, palette: Float32Array, ms = 0) {
    const n2 = n * n, N = n * n2
    const prev = this.morphs[name]
    const from = ms > 0 && prev && prev.n === n ? prev : null
    // the grid for picks: reuse the previous buffer, nothing outside the engine holds it
    const grid: Grid = prev && prev.n === n ? prev.grid : { n, data: new Float32Array(N) }
    const data = grid.data
    for (let i = 0; i < N; i++) data[i] = labels[i] ? 1 : 0
    // cells drawn in the new frame: filled with an empty neighbour or on the boundary
    const drawn: number[] = []
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        for (let z = 0; z < n; z++) {
          const i = x * n2 + y * n + z
          if (!labels[i]) continue
          if (x === 0 || x === n - 1 || y === 0 || y === n - 1 || z === 0 || z === n - 1
            || !labels[i - n2] || !labels[i + n2] || !labels[i - n] || !labels[i + n] || !labels[i - 1] || !labels[i + 1]) drawn.push(i)
        }
    // the union: what is on screen now, then the new cells
    const cell: number[] = [], s0: number[] = [], s1: number[] = [], c0: number[] = [], c1: number[] = [], pop: number[] = [], keep: number[] = []
    if (from) {
      if (!this.slot || this.slot.length !== N) this.slot = new Int32Array(N).fill(-1)
      const slot = this.slot, col = from.mesh.instanceColor!.array as Float32Array
      for (let k = 0; k < from.mesh.count; k++) {
        const c = from.cell[k], s = from.scale[k], b = labels[c], a = from.labels[c]
        if (s === 0 && !b) continue
        slot[c] = cell.length
        cell.push(c)
        s0.push(s)
        s1.push(b ? 1 : 0)
        c0.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2])
        if (b) c1.push(palette[b * 3], palette[b * 3 + 1], palette[b * 3 + 2])
        else c1.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2])
        pop.push(a && b && a !== b ? 1 : 0)
        keep.push(0)
      }
      for (const c of drawn) {
        if (slot[c] >= 0) { keep[slot[c]] = 1; continue }
        // not on screen: it was empty (grows in) or hidden inside the old territory (already full)
        const a = from.labels[c], b = labels[c], p = a ? a : b
        cell.push(c)
        s0.push(a ? 1 : 0)
        s1.push(1)
        c0.push(palette[p * 3], palette[p * 3 + 1], palette[p * 3 + 2])
        c1.push(palette[b * 3], palette[b * 3 + 1], palette[b * 3 + 2])
        pop.push(a && a !== b ? 1 : 0)
        keep.push(1)
      }
      for (const c of cell) slot[c] = -1
    } else {
      for (const c of drawn) {
        const b = labels[c]
        cell.push(c)
        s0.push(1)
        s1.push(1)
        c0.push(palette[b * 3], palette[b * 3 + 1], palette[b * 3 + 2])
        c1.push(palette[b * 3], palette[b * 3 + 1], palette[b * 3 + 2])
        pop.push(0)
        keep.push(1)
      }
    }
    // moving instances first
    const U = cell.length
    const order: number[] = [], still: number[] = []
    for (let k = 0; k < U; k++) {
      const moves = pop[k] || s0[k] !== s1[k] || c0[k * 3] !== c1[k * 3] || c0[k * 3 + 1] !== c1[k * 3 + 1] || c0[k * 3 + 2] !== c1[k * 3 + 2]
      ;(moves ? order : still).push(k)
    }
    const moving = order.length
    for (const k of still) order.push(k)
    const m: Morph = {
      n, labels, grid, mesh: new THREE.InstancedMesh(this.box, this.voxMats[name] ?? this.voxMats.voxels, Math.max(U, 1)),
      cell: new Int32Array(U), scale: new Float32Array(U), s0: new Float32Array(U), s1: new Float32Array(U),
      c0: new Float32Array(U * 3), c1: new Float32Array(U * 3), pop: new Uint8Array(U), keep: new Uint8Array(U),
      moving, t0: performance.now(), ms, done: moving === 0,
    }
    const mesh = m.mesh
    mesh.count = U
    const mat = mesh.instanceMatrix.array as Float32Array
    const rgb = new Float32Array(Math.max(U, 1) * 3)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(rgb, 3)
    if (moving) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      // while cells scale, cull and pick against the whole grid (settle measures the real bounds)
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((n - 1) / 2, (n - 1) / 2, (n - 1) / 2), n)
    }
    const cells = new Array<number>(U * 4)
    for (let j = 0; j < U; j++) {
      const k = order[j], c = cell[k]
      const x = Math.floor(c / n2), y = Math.floor(c / n) % n, z = c % n
      m.cell[j] = c
      m.s0[j] = s0[k]
      m.s1[j] = s1[k]
      m.scale[j] = s0[k]
      m.pop[j] = pop[k]
      m.keep[j] = keep[k]
      for (let a = 0; a < 3; a++) {
        m.c0[j * 3 + a] = rgb[j * 3 + a] = c0[k * 3 + a]
        m.c1[j * 3 + a] = c1[k * 3 + a]
      }
      const o = j * 16, s = s0[k]
      mat[o] = s; mat[o + 5] = s; mat[o + 10] = s; mat[o + 15] = 1
      mat[o + 12] = x; mat[o + 13] = y; mat[o + 14] = z
      cells[j * 4] = x; cells[j * 4 + 1] = y; cells[j * 4 + 2] = z; cells[j * 4 + 3] = 1
    }
    mesh.userData.cells = cells
    this.put(name, mesh)
    this.grids[name] = grid
    this.morphs[name] = m
    if (m.done) this.settle(m)
  }

  /** Advance the running tweens: only the moving instances are rewritten and uploaded. */
  private stepMorphs(now: number) {
    for (const m of Object.values(this.morphs)) {
      if (!m || m.done) continue
      const k = Math.min(1, (now - m.t0) / m.ms), e = 1 - (1 - k) ** 3
      const swell = POP * Math.sin(Math.PI * k)
      const mesh = m.mesh, mat = mesh.instanceMatrix.array as Float32Array, rgb = mesh.instanceColor!.array as Float32Array
      for (let j = 0; j < m.moving; j++) {
        const s = m.s0[j] + (m.s1[j] - m.s0[j]) * e + (m.pop[j] ? swell : 0)
        m.scale[j] = s
        const o = j * 16
        mat[o] = s; mat[o + 5] = s; mat[o + 10] = s
        for (let a = j * 3; a < j * 3 + 3; a++) rgb[a] = m.c0[a] + (m.c1[a] - m.c0[a]) * e
      }
      mesh.instanceMatrix.clearUpdateRanges()
      mesh.instanceMatrix.addUpdateRange(0, m.moving * 16)
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.clearUpdateRanges()
      mesh.instanceColor!.addUpdateRange(0, m.moving * 3)
      mesh.instanceColor!.needsUpdate = true
      this.dirty = true
      if (k >= 1) this.settle(m)
    }
  }

  /** End of a tween: final values, and only the cells the frame draws (compacted in place). */
  private settle(m: Morph) {
    m.done = true
    const mesh = m.mesh, mat = mesh.instanceMatrix.array as Float32Array, rgb = mesh.instanceColor!.array as Float32Array
    const cells = mesh.userData.cells as number[]
    let w = 0
    for (let j = 0; j < mesh.count; j++) {
      if (!m.keep[j]) continue
      if (w !== j) {
        mat.copyWithin(w * 16, j * 16, j * 16 + 16)
        for (let a = 0; a < 4; a++) cells[w * 4 + a] = cells[j * 4 + a]
        m.cell[w] = m.cell[j]
      }
      const o = w * 16
      mat[o] = 1; mat[o + 5] = 1; mat[o + 10] = 1
      m.scale[w] = 1
      for (let a = 0; a < 3; a++) rgb[w * 3 + a] = m.c1[j * 3 + a]
      w++
    }
    const moved = w !== mesh.count || m.moving > 0
    mesh.count = w
    cells.length = w * 4
    m.moving = 0
    if (!moved) return
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.clearUpdateRanges()
    mesh.instanceColor!.needsUpdate = true
    mesh.boundingBox = null
    mesh.boundingSphere = null
    this.dirty = true
  }

  show(name: ViewName) {
    this.view = name
    this.active = name === 'scan' ? 'processed' : name
    this.apply()
  }

  /** Scan plane at the bottom face of layer z (may be fractional). Only the clipping planes move. */
  setScan(z: number) {
    const f = z / this.n
    this.cut.processed.constant = f
    this.cut.voxels.constant = -f
    this.scanner.position.z = z - 0.5
    this.dirty = true
  }

  /** The print grid under the model: the floor of the grid volume in `floorDiv` cells a side. */
  private makeFloor() {
    const n = this.n, c = (n - 1) / 2
    const floor = new THREE.GridHelper(n, this.floorDiv)
    floor.material = this.lineMat
    floor.rotation.x = Math.PI / 2
    floor.position.set(c, c, -0.5)
    floor.visible = this.showFloor
    return floor
  }

  setFrame(p: { bounds?: boolean; floor?: boolean; divisions?: number }) {
    if (p.bounds != null) this.showBounds = p.bounds
    if (p.floor != null) this.showFloor = p.floor
    if (p.divisions != null && p.divisions !== this.floorDiv) {
      this.floorDiv = Math.max(1, Math.round(p.divisions))
      if (this.floor) {
        this.frame.remove(this.floor)
        ;(this.floor as THREE.LineSegments).geometry.dispose()
        this.floor = this.makeFloor()
        this.frame.add(this.floor)
      }
    }
    if (this.outline) this.outline.visible = this.showBounds
    if (this.floor) this.floor.visible = this.showFloor
    this.dirty = true
  }

  /** Lighting presets: studio (key from the camera's upper left), soft, flat (no shading), rim (backlit edge). */
  setLighting(preset: 'studio' | 'soft' | 'flat' | 'rim') {
    const { hemi, key, rim } = this.lights
    const p = {
      studio: [2.1, 1.6, 0, [-0.6, 0.9, 1]],
      soft: [2.8, 0.7, 0, [-0.3, 0.5, 1]],
      flat: [3.6, 0, 0, [0, 0, 1]],
      rim: [1.2, 0.9, 2.4, [-0.8, 0.6, 0.6]],
    }[preset] as [number, number, number, number[]]
    hemi.intensity = p[0]
    key.intensity = p[1]
    rim.intensity = p[2]
    key.position.set(p[3][0], p[3][1], p[3][2])
    this.dirty = true
  }

  /** Colours from the CSS tokens, so the view follows light and dark themes. */
  setTheme(css: (name: string) => string) {
    const c = (n: string) => new THREE.Color(css(n).trim() || '#888')
    const dark = css('--qs-scheme').trim() === 'dark'
    SURFACE.copy(dark ? new THREE.Color('#9A9CA2') : new THREE.Color('#C9CBD0'))
    DEEP.copy(dark ? new THREE.Color('#E6E7EA') : new THREE.Color('#5E6066'))
    this.meshMat.color.copy(SURFACE)
    this.meshWire.color.copy(c('--qs-ink'))
    for (const m of Object.values(this.wireVox)) (m.uniforms.color.value as THREE.Color).copy(c('--qs-ink'))
    this.ghostMesh.color.copy(c('--qs-ink3'))
    this.ghostVox.color.copy(c('--qs-ink3'))
    this.lineMat.color.copy(c('--qs-ink4'))
    this.dashMat.color.copy(c('--qs-ink3'))
    this.scanMat.color.copy(c('--qs-ink'))
    this.scanEdge.color.copy(c('--qs-ink'))
    if (!this.planeTex) (this.plane.material as THREE.MeshBasicMaterial).color.copy(c('--qs-ink'))
    this.planeInk = c('--qs-ink').clone()
    ;(this.planeEdge.material as THREE.LineBasicMaterial).color.copy(c('--qs-ink'))
    this.dirty = true
  }

  /** The slice plane in the voxel views; null hides it. */
  private planeTex: THREE.DataTexture | null = null
  private planeInk = INK.clone()
  /** The section on the cutting plane: RGBA per cell as qs/sectionColor lays it out (row v, column u),
   *  or null for the plain faint sheet. Empty cells keep a faint tint so the plane still reads. */
  setSliceImage(rgba: Uint8ClampedArray | null, n: number, axis: Axis) {
    const mat = this.plane.material as THREE.MeshBasicMaterial
    this.planeTex?.dispose()
    this.planeTex = null
    if (!rgba) {
      mat.map = null
      mat.color.copy(this.planeInk)
      mat.opacity = 0.06
      mat.needsUpdate = true
      this.dirty = true
      return
    }
    const data = new Uint8Array(n * n * 4)
    const ink = [this.planeInk.r, this.planeInk.g, this.planeInk.b].map((v) => Math.round(THREE.MathUtils.clamp(v, 0, 1) ** (1 / 2.2) * 255))
    for (let t = 0; t < n; t++)
      for (let s = 0; s < n; s++) {
        // texel (s, t) runs along the plane's own x and y; which cell of the section that is depends on
        // how setSlice turned the plane for the axis
        const [u, v] = axis === 'x' ? [t, n - 1 - s] : [s, t]
        const i = (v * n + u) * 4, o = (t * n + s) * 4
        if (rgba[i + 3]) { data[o] = rgba[i]; data[o + 1] = rgba[i + 1]; data[o + 2] = rgba[i + 2]; data[o + 3] = rgba[i + 3] }
        else { data[o] = ink[0]; data[o + 1] = ink[1]; data[o + 2] = ink[2]; data[o + 3] = 16 }
      }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    this.planeTex = tex
    mat.map = tex
    mat.color.set(0xffffff)
    mat.opacity = 0.94
    mat.needsUpdate = true
    this.dirty = true
  }

  setSlice(s: { axis: Axis; index: number } | null) {
    const p = this.plane
    p.visible = !!s && this.view !== 'scan'
    if (!s) return void (this.dirty = true)
    const n = this.n, c = (n - 1) / 2
    p.scale.set(n, n, 1)
    p.rotation.set(0, 0, 0)
    if (s.axis === 'z') p.position.set(c, c, s.index)
    else if (s.axis === 'x') { p.rotation.set(0, Math.PI / 2, 0); p.position.set(s.index, c, c) }
    else { p.rotation.set(Math.PI / 2, 0, 0); p.position.set(c, s.index, c) }
    this.dirty = true
  }

  /** Raycast the visible, pickable layers; px/py are CSS pixels relative to the host. Nearest hit wins. */
  pick(px: number, py: number, pickable: (k: LayerName) => boolean = () => true): Pick | null {
    const w = this.host.clientWidth, h = this.host.clientHeight
    this.ray.setFromCamera(new THREE.Vector2(px / w * 2 - 1, -(py / h) * 2 + 1), this.camera)
    this.root.updateMatrixWorld(true)
    let hit: THREE.Intersection | undefined, which: LayerName = this.active
    for (const [k, l] of Object.entries(this.layers) as [LayerName, THREE.Object3D][]) {
      if (!l.visible || !pickable(k)) continue
      const hs = this.ray.intersectObject(l, false)
      // in the scan view, ignore hits in the clipped-away part of each layer
      const ok = hs.find((x) => this.view !== 'scan' || (k === 'processed' ? x.point.z <= this.cut.processed.constant + 1e-6 : k === 'voxels' ? x.point.z >= -this.cut.voxels.constant - 1e-6 : true))
      if (ok && (!hit || ok.distance < hit.distance)) { hit = ok; which = k }
    }
    if (!hit) return null
    const layer = this.layers[which]!
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert()
    const point = hit.point.clone().applyMatrix4(inv)
    let cell: [number, number, number]
    if (layer instanceof THREE.InstancedMesh && hit.instanceId != null) {
      const c = layer.userData.cells as number[]
      cell = [c[hit.instanceId * 4], c[hit.instanceId * 4 + 1], c[hit.instanceId * 4 + 2]]
    } else {
      // step half a voxel inside the surface so the cell is the one the surface belongs to
      const nrm = hit.face?.normal.clone().transformDirection(layer.matrixWorld).transformDirection(inv) ?? new THREE.Vector3()
      const q = point.clone().addScaledVector(nrm, -0.5)
      cell = [Math.round(q.x), Math.round(q.y), Math.round(q.z)].map((v) => Math.max(0, Math.min(this.n - 1, v))) as [number, number, number]
    }
    const g = this.grids[which] ?? this.grids.voxels ?? null
    const value = g ? g.data[(cell[0] * g.n + cell[1]) * g.n + cell[2]] : null
    return { cell, value, layer: which, point }
  }

  /** Screen directions of the world X, Y, Z axes (for the 2D gnomon). */
  axes2D(): [number, number][] {
    const m = this.camera.matrixWorldInverse
    return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((v) => {
      const d = v.transformDirection(m)
      return [d.x, -d.y] as [number, number]
    })
  }

  /** Screen rectangle of what is showing, or null. */
  bounds2D(): { l: number; r: number; t: number; b: number } | null {
    const layer = this.layers[this.active] ?? this.layers.model
    if (!layer) return null
    this.scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(layer)
    if (box.isEmpty()) return null
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(this.camera)
      const px = (v.x + 1) / 2 * this.host.clientWidth, py = (1 - v.y) / 2 * this.host.clientHeight
      l = Math.min(l, px); r = Math.max(r, px); t = Math.min(t, py); b = Math.max(b, py)
    }
    return { l, r, t, b }
  }

  /** Project a grid-space point to host pixels (for marks that follow the model). */
  project(p: THREE.Vector3): [number, number] {
    this.camera.updateMatrixWorld()
    this.root.updateMatrixWorld(true)
    const v = p.clone().applyMatrix4(this.root.matrixWorld).project(this.camera)
    return [(v.x + 1) / 2 * this.host.clientWidth, (1 - v.y) / 2 * this.host.clientHeight]
  }
}
