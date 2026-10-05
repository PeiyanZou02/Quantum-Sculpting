// Built-in shapes to start from, made here and opened like any other mesh: about 80 mm across, +Z up,
// closed so they voxelise cleanly. The test cup comes from the service.
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type ShapeId = 'cup' | 'sphere' | 'cube' | 'pyramid' | 'cylinder' | 'cone' | 'torus'
export const SHAPES: { id: ShapeId; t: string }[] = [
  { id: 'cup', t: 'Cup' }, { id: 'sphere', t: 'Sphere' }, { id: 'cube', t: 'Cube' }, { id: 'pyramid', t: 'Pyramid' },
  { id: 'cylinder', t: 'Cylinder' }, { id: 'cone', t: 'Cone' }, { id: 'torus', t: 'Torus' },
]

function geometry(id: Exclude<ShapeId, 'cup'>): THREE.BufferGeometry {
  // three.js builds round solids along +Y: turn those to stand on +Z
  const up = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2)
  switch (id) {
    case 'sphere': return new THREE.SphereGeometry(40, 96, 64)
    case 'cube': return new THREE.BoxGeometry(70, 70, 70)
    case 'pyramid': return up(new THREE.ConeGeometry(48, 72, 4, 1).rotateY(Math.PI / 4))
    case 'cylinder': return up(new THREE.CylinderGeometry(34, 34, 80, 96))
    case 'cone': return up(new THREE.ConeGeometry(40, 80, 96))
    case 'torus': return new THREE.TorusGeometry(26, 16, 48, 128)   // lies flat already
  }
}

/** The shape as a binary STL file. */
export function shapeFile(id: Exclude<ShapeId, 'cup'>): File {
  const g = mergeVertices(geometry(id).deleteAttribute('normal').deleteAttribute('uv'))
  g.computeVertexNormals()
  const data = new STLExporter().parse(new THREE.Mesh(g), { binary: true }) as DataView
  return new File([data.buffer as ArrayBuffer], `${id}.stl`, { type: 'model/stl' })
}
