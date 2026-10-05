// three.js view of the pipeline. Everything is drawn in grid coordinates (voxel (i,j,k) centred on
// (i,j,k), z up) and the root is scaled to a unit cube, as in Peiyan's original viewer, so the four
// views line up exactly. The camera is driven from outside by the gimbal's {az, el, dist}.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { MeshData } from '../api'
import type { Axis, Grid } from '../qs/grid'
import type { Camera } from '../qs/QCam'

export type LayerName = 'model' | 'voxels' | 'processed' | 'result'

const INK = new THREE.Color('#151618')
const INK3 = new THREE.Color('#8B8D93')
const INK4 = new THREE.Color('#B3B5BB')
const SURFACE = new THREE.Color('#C9CBD0')
const DEEP = new THREE.Color('#5E6066')

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
  private voxMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  private lineMat = new THREE.LineBasicMaterial({ color: INK4, transparent: true, opacity: 0.9 })
  private dashMat = new THREE.LineDashedMaterial({ color: INK3, dashSize: 0.6, gapSize: 0.9 })
  private plane: THREE.Mesh
  private planeEdge: THREE.LineSegments
  private ray = new THREE.Raycaster()
  private raf = 0
  controls: OrbitControls
  private tween: { from: THREE.Vector3; to: THREE.Vector3; t0: number } | null = null
  onChange?: () => void

  private host: HTMLElement

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

    this.root.add(this.frame)
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

  /** Swing the camera to an azimuth / elevation (degrees). az 0 = front (camera on −y). */
  orbitTo(azDeg: number, elDeg: number, distScale = 1) {
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(Math.min(elDeg, 89.5))
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2
    const h = Math.atan(Math.tan(v) * this.camera.aspect)
    const d = (0.95 / Math.sin(Math.min(v, h))) * distScale
    const to = new THREE.Vector3(Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)).multiplyScalar(d)
    const from = this.camera.position.clone().sub(this.controls.target)
    this.tween = { from, to, t0: performance.now() }
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

  setCamera(c: Camera) {
    const az = THREE.MathUtils.degToRad(c.az), el = THREE.MathUtils.degToRad(c.el)
    const target = new THREE.Vector3(0, 0, 0.42)
    const d = c.dist * 1.45
    // az 0 looks at the front (camera on −y), az 90 from the side (+x)
    this.camera.position.set(
      target.x + d * Math.cos(el) * Math.sin(az),
      target.y - d * Math.cos(el) * Math.cos(az),
      target.z + d * Math.sin(el),
    )
    this.camera.lookAt(target)
    this.dirty = true
  }

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
    const floor = new THREE.GridHelper(n, 4)
    floor.material = this.lineMat
    floor.rotation.x = Math.PI / 2
    floor.position.set(c, c, -0.5)
    this.frame.add(outline, floor)
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
    this.dirty = true
  }

  private put(name: LayerName, obj: THREE.Object3D) {
    this.clear(name)
    obj.visible = name === this.active
    this.layers[name] = obj
    this.root.add(obj)
    this.dirty = true
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
    const mesh = new THREE.InstancedMesh(this.box, this.voxMat, Math.max(count, 1))
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

  show(name: LayerName) {
    this.active = name
    for (const [k, layer] of Object.entries(this.layers)) layer!.visible = k === name
    this.frame.visible = Object.keys(this.layers).length > 0
    this.dirty = true
  }

  /** The slice plane in the voxel views; null hides it. */
  setSlice(s: { axis: Axis; index: number } | null) {
    const p = this.plane
    p.visible = !!s && (this.active === 'voxels' || this.active === 'processed')
    if (!s) return void (this.dirty = true)
    const n = this.n, c = (n - 1) / 2
    p.scale.set(n, n, 1)
    p.rotation.set(0, 0, 0)
    if (s.axis === 'z') p.position.set(c, c, s.index)
    else if (s.axis === 'x') { p.rotation.set(0, Math.PI / 2, 0); p.position.set(s.index, c, c) }
    else { p.rotation.set(Math.PI / 2, 0, 0); p.position.set(c, s.index, c) }
    this.dirty = true
  }

  /** Raycast the active layer; px/py are CSS pixels relative to the host. */
  pick(px: number, py: number): Pick | null {
    const layer = this.layers[this.active]
    if (!layer) return null
    const w = this.host.clientWidth, h = this.host.clientHeight
    this.ray.setFromCamera(new THREE.Vector2(px / w * 2 - 1, -(py / h) * 2 + 1), this.camera)
    this.root.updateMatrixWorld(true)
    const hit = this.ray.intersectObject(layer, false)[0]
    if (!hit) return null
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
    const g = this.grids[this.active] ?? this.grids.voxels ?? null
    const value = g ? g.data[(cell[0] * g.n + cell[1]) * g.n + cell[2]] : null
    return { cell, value, layer: this.active, point }
  }

  /** Project a grid-space point to host pixels (for marks that follow the model). */
  project(p: THREE.Vector3): [number, number] {
    this.root.updateMatrixWorld(true)
    const v = p.clone().applyMatrix4(this.root.matrixWorld).project(this.camera)
    return [(v.x + 1) / 2 * this.host.clientWidth, (1 - v.y) / 2 * this.host.clientHeight]
  }
}
