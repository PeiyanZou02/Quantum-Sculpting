// The Entanglement Shader (Moth, entanglement-shader-v1) as a three.js display mode.
//
// Moth's engine returns two single-channel lookup tables, reflectance R and transmission T, indexed
// by a thin-film phase s in [0, 1) (periodic) and the view angle t = θ / (π/2). For each of three
// wavelengths (650 / 530 / 470 nm) the film phase is s = mod(D/λ, 2π) / 2π with D = −2·2π·d·cosθ,
// so the surface shows interference colour that shifts with angle. Shading follows moduli's
// renderer: col = R·(env + (n·l·0.9 + spec)·light) + T·0.12, then a filmic tonemap.
//
// One material works for a plain Mesh (normals from the attribute, or flat normals from screen-space
// derivatives when the geometry has none or `flatShading` is set) and for an InstancedMesh of boxes
// (instanceMatrix; instanceColor's luminance is read as a per-instance value that thickens the film,
// so a value field shows up as interference bands). Clipping planes work as on built-in materials.
import * as THREE from 'three'
import { parseHDR } from './hdr'
import type { Lut } from './hdr'

export type { Lut } from './hdr'

export interface ShaderTables {
  id: string
  label: string
  R: Lut
  T: Lut
  params: Record<string, unknown>
  job_id: string
  source: 'bundled' | 'live'
}

interface ManifestEntry {
  id: string
  label: string
  engine: string
  job_id: string
  seconds: number
  params: Record<string, unknown>
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Could not load ${url} (HTTP ${r.status})`)
  return new Uint8Array(await r.arrayBuffer())
}

async function loadPair(dir: string): Promise<{ R: Lut; T: Lut }> {
  const [r, t] = await Promise.all([fetchBytes(`${dir}/R_lut.hdr`), fetchBytes(`${dir}/T_lut.hdr`)])
  return { R: parseHDR(r), T: parseHDR(t) }
}

/** The five tables shipped in public/quantum/shaders/ (real Moth runs from the Moduli project). */
export async function loadBundled(): Promise<ShaderTables[]> {
  const base = `${import.meta.env.BASE_URL}quantum/shaders`
  const r = await fetch(`${base}/manifest.json`)
  if (!r.ok) throw new Error(`Could not load the shader manifest (HTTP ${r.status})`)
  const manifest = (await r.json()) as { shaders: ManifestEntry[] }
  return Promise.all(
    manifest.shaders.map(async (e): Promise<ShaderTables> => {
      const { R, T } = await loadPair(`${base}/${e.id}`)
      return { id: e.id, label: e.label, R, T, params: e.params, job_id: e.job_id, source: 'bundled' }
    }),
  )
}

const STYLE_NAMES: Record<string, string> = { peaked: 'Peaked', frustrated: 'Frustrated', '3-body': '3-body', constrained: 'Constrained' }

/** A short label from shader params, e.g. "Peaked · 2 layers". */
export function labelFor(params: Record<string, unknown>): string {
  const style = String(params.style ?? '')
  const layers = Number(params.layers ?? 0)
  return `${STYLE_NAMES[style] ?? style} · ${layers} layer${layers === 1 ? '' : 's'}`
}

/** Runs fetched by the service (GET /api/shader/live → grids/shaders/<job_id>/). */
export async function loadLive(): Promise<ShaderTables[]> {
  const r = await fetch('/api/shader/live')
  if (!r.ok) return []
  const { runs } = (await r.json()) as { runs: { job_id: string; params: Record<string, unknown> }[] }
  const out = await Promise.all(
    runs.map(async (run): Promise<ShaderTables | null> => {
      try {
        const { R, T } = await loadPair(`/api/shader/${encodeURIComponent(run.job_id)}`)
        return { id: `live-${run.job_id}`, label: labelFor(run.params), R, T, params: run.params, job_id: run.job_id, source: 'live' }
      } catch {
        return null
      }
    }),
  )
  return out.filter((t): t is ShaderTables => t !== null)
}

/** Load one live run once GET /api/shader/<job_id> reports ready. */
export async function loadLiveRun(jobId: string, params: Record<string, unknown>): Promise<ShaderTables> {
  const { R, T } = await loadPair(`/api/shader/${encodeURIComponent(jobId)}`)
  return { id: `live-${jobId}`, label: labelFor(params), R, T, params, job_id: jobId, source: 'live' }
}

// R in .r, T in .g, half floats so linear filtering works on every WebGL2 device.
function lutTexture(t: ShaderTables): THREE.DataTexture {
  const { R, T } = t
  if (R.width !== T.width || R.height !== T.height) throw new Error('R and T tables differ in size')
  const n = R.width * R.height
  const px = new Uint16Array(n * 2)
  for (let i = 0; i < n; i++) {
    px[i * 2] = THREE.DataUtils.toHalfFloat(R.data[i])
    px[i * 2 + 1] = THREE.DataUtils.toHalfFloat(T.data[i])
  }
  const tex = new THREE.DataTexture(px, R.width, R.height, THREE.RGFormat, THREE.HalfFloatType)
  tex.internalFormat = 'RG16F'
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.flipY = false // row 0 = view angle 0 = t 0
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

const VERT = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
uniform vec2 u_valueRange;
varying vec3 vViewPos;
varying vec3 vNormalV;
varying float vHasNormal;
varying float vValue;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = vec3(0.0, 0.0, 1.0);
  vHasNormal = 0.0;
#ifdef HAS_NORMAL
  n = normal;
  vHasNormal = 1.0;
#endif
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
  mat3 im = mat3(instanceMatrix);
  n = im * (n / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
#endif
  vValue = 0.0;
  float span = u_valueRange.y - u_valueRange.x;
  span = abs(span) < 1e-5 ? 1e-5 : span;
#ifdef USE_INSTANCING_COLOR
  float lum = dot(instanceColor, vec3(0.2126, 0.7152, 0.0722));
  vValue = clamp((lum - u_valueRange.x) / span, 0.0, 1.0);
#endif
#ifdef USE_COLOR
  // a painted mesh (vertex colours) reads the same way
  float lumV = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vValue = clamp((lumV - u_valueRange.x) / span, 0.0, 1.0);
#endif
  vec4 mvPosition = modelViewMatrix * p;
  vViewPos = mvPosition.xyz;
  vNormalV = normalMatrix * n;
  gl_Position = projectionMatrix * mvPosition;
#include <clipping_planes_vertex>
}
`

const FRAG = /* glsl */ `
#include <common>
#include <clipping_planes_pars_fragment>
uniform sampler2D u_lut;
uniform float u_thickness, u_exposure, u_mix, u_fringe, u_valueGain, u_saturation;
uniform vec3 u_light, u_bg;
varying vec3 vViewPos;
varying vec3 vNormalV;
varying float vHasNormal;
varying float vValue;
const float PI_2 = 1.5707963267948966;
vec3 tonemap(vec3 x) { return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); }
void main() {
  vec4 diffuseColor = vec4(1.0);
#include <clipping_planes_fragment>
  vec3 V = normalize(-vViewPos);
  vec3 N = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
#ifndef ENTANGLE_FLAT
  if (vHasNormal > 0.5) N = normalize(vNormalV);
#endif
  if (dot(N, V) < 0.0) N = -N;

  // thin-film phase per wavelength (µm), view angle
  float cosTheta = clamp(dot(N, V), 0.0, 1.0);
  float theta = acos(cosTheta);
  float d = u_thickness * (1.0 + u_valueGain * vValue);
  float D = -2.0 * PI2 * d * cosTheta;
  vec3 s = mod(D / vec3(0.65, 0.53, 0.47) + u_fringe * PI2, PI2) / PI2;
  float t = clamp(theta / PI_2, 0.0, 1.0);
  vec2 r = texture2D(u_lut, vec2(s.x, t)).rg;
  vec2 g = texture2D(u_lut, vec2(s.y, t)).rg;
  vec2 b = texture2D(u_lut, vec2(s.z, t)).rg;
  vec3 R = vec3(r.x, g.x, b.x);
  vec3 T = vec3(r.y, g.y, b.y);

  vec3 L = normalize(u_light);
  vec3 H = normalize(L + V);
  float nl = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.9;
  float sky = 0.5 + 0.5 * N.y;
  vec3 env = vec3(0.16, 0.17, 0.2) * sky + vec3(0.07);
  vec3 film = R * (env + vec3(nl * 0.9 + spec)) + T * 0.12;
  // the tables are pale (R stays well above 0), so open the chroma up a little around the luminance
  float fl = dot(film, vec3(0.2126, 0.7152, 0.0722));
  film = max(mix(vec3(fl), film, u_saturation), 0.0);

  // plain grey shading for u_mix < 1
  vec3 grey = vec3(0.42) * (0.3 + 0.7 * nl) + vec3(0.05) * sky;
  vec3 col = mix(grey, film, u_mix);

  // filmic shoulder, capped below white so highlights stay visible on a light ground
  col = tonemap(col * u_exposure) * 0.94;
  // a faint rim of the background at grazing angles separates the silhouette from either ground
  float rim = pow(1.0 - cosTheta, 3.0);
  col = mix(col, u_bg, rim * 0.35);

  gl_FragColor = vec4(col, 1.0);
#include <colorspace_fragment>
}
`

export interface EntangleOptions {
  /** Film thickness in µm (moduli's 500 nm = 0.5). Default 0.9. */
  thickness?: number
  /** Expect an InstancedMesh (front faces only); otherwise double-sided for open meshes. */
  instanced?: boolean
  /** Force flat (derivative) normals even when the geometry has a normal attribute. */
  flat?: boolean
}

/** Uniform values of a material from makeEntangleMaterial, for typed access. */
export interface EntangleUniforms {
  [name: string]: THREE.IUniform
  u_lut: THREE.IUniform<THREE.DataTexture>
  u_thickness: THREE.IUniform<number>
  u_exposure: THREE.IUniform<number>
  u_light: THREE.IUniform<THREE.Vector3>
  u_bg: THREE.IUniform<THREE.Color>
  u_mix: THREE.IUniform<number>
  u_fringe: THREE.IUniform<number>
  u_valueGain: THREE.IUniform<number>
  u_saturation: THREE.IUniform<number>
  u_valueRange: THREE.IUniform<THREE.Vector2>
}

export function makeEntangleMaterial(t: ShaderTables, opts: EntangleOptions = {}): THREE.ShaderMaterial {
  const uniforms: EntangleUniforms = {
    u_lut: { value: lutTexture(t) },
    u_thickness: { value: opts.thickness ?? 0.9 },
    u_exposure: { value: 1 },
    // matches the viewer's key light, which rides on the camera at (−0.6, 0.9, 1)
    u_light: { value: new THREE.Vector3(-0.6, 0.9, 1).normalize() },
    u_bg: { value: new THREE.Color('#E3E4E7') },
    u_mix: { value: 1 },
    u_fringe: { value: 0 },
    u_valueGain: { value: 0.8 },
    u_saturation: { value: 1.6 },
    // instanceColor luminance (linear) that maps to value 0 and value 1: by default darker = higher
    u_valueRange: { value: new THREE.Vector2(1, 0) },
  }
  const mat = new THREE.ShaderMaterial({
    name: 'EntanglementShader',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    clipping: true,
    defines: opts.flat ? { ENTANGLE_FLAT: '' } : {},
    side: opts.instanced ? THREE.FrontSide : THREE.DoubleSide,
  })
  mat.userData.tablesId = t.id
  return mat
}

/** Swap the lookup tables in place (no recompile). */
export function setTables(mat: THREE.ShaderMaterial, t: ShaderTables): void {
  const u = mat.uniforms as EntangleUniforms
  const old = u.u_lut.value
  const img = old?.image as { width: number; height: number; data: Uint16Array } | undefined
  if (old && img && img.width === t.R.width && img.height === t.R.height) {
    const fresh = lutTexture(t)
    img.data.set((fresh.image as { data: Uint16Array }).data)
    old.needsUpdate = true
    fresh.dispose()
  } else {
    u.u_lut.value = lutTexture(t)
    old?.dispose()
  }
  mat.userData.tablesId = t.id
}

/**
 * u_valueRange for the viewer's value colours: the (linear) luminance of the colour at value 0 and
 * at value 1, e.g. valueRangeFor(SURFACE, DEEP) when instance colours lerp SURFACE → DEEP.
 */
export function valueRangeFor(low: THREE.Color, high: THREE.Color): THREE.Vector2 {
  const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return new THREE.Vector2(lum(low), lum(high))
}

/** Free the lookup texture (the material's own dispose() does not touch uniforms). */
export function disposeEntangleMaterial(mat: THREE.ShaderMaterial): void {
  ;(mat.uniforms as EntangleUniforms).u_lut.value?.dispose()
  mat.dispose()
}
