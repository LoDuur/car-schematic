import * as THREE from "three";
import type { ModelMap, Shape } from "@car-schematic/shared";

const DEFAULT_EXPLODE_DISTANCE = 0.4;

export interface PartGeometry {
  pieces: THREE.BufferGeometry[];
  bounds: THREE.Box3;
  explodeDirection: THREE.Vector3;
  baseColor: string | null;
  isModelled: boolean;
}

function createShapeGeometry(shape: Shape): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry;
  if (shape.type === "box") {
    geometry = new THREE.BoxGeometry(...shape.size);
    if (shape.rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...shape.rotation)));
  } else if (shape.type === "sphere") {
    geometry = new THREE.SphereGeometry(shape.radius, 12, 8);
  } else {
    geometry = new THREE.CylinderGeometry(shape.radius, shape.radius, shape.length, 20);
    if (shape.axis === "x") geometry.rotateZ(Math.PI / 2);
    if (shape.axis === "z") geometry.rotateX(Math.PI / 2);
  }
  geometry.translate(...shape.position);
  return geometry;
}

export function createRootMatrix(glb: ModelMap["glb"]): THREE.Matrix4 {
  if (!glb) return new THREE.Matrix4();
  const { position, rotation, scale } = glb.transform;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(scale, scale, scale),
  );
}

function collectMeshes(scene: THREE.Object3D, meshNames: string[], rootMatrix: THREE.Matrix4) {
  const geometries: THREE.BufferGeometry[] = [];
  let baseColor: string | null = null;
  for (const name of meshNames) {
    scene.getObjectByName(name)?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = (object.geometry as THREE.BufferGeometry).clone();
      geometry.applyMatrix4(rootMatrix.clone().multiply(object.matrixWorld));
      geometries.push(geometry);
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (!baseColor && material && "color" in material && material.color instanceof THREE.Color) baseColor = `#${material.color.getHexString()}`;
    });
  }
  return { geometries, baseColor };
}

export function buildPartGeometry(
  mapping: { meshes: string[]; shapes: Shape[]; explode?: [number, number, number] },
  scene: THREE.Object3D | null,
  rootMatrix: THREE.Matrix4,
  vehicleCentre: THREE.Vector3,
): PartGeometry {
  const modelled = scene && mapping.meshes.length > 0 ? collectMeshes(scene, mapping.meshes, rootMatrix) : { geometries: [], baseColor: null };
  const isModelled = modelled.geometries.length > 0;
  const pieces = isModelled ? modelled.geometries : mapping.shapes.map(createShapeGeometry);
  const bounds = new THREE.Box3();
  for (const piece of pieces) {
    piece.computeBoundingBox();
    if (piece.boundingBox) bounds.union(piece.boundingBox);
  }
  let explodeDirection = new THREE.Vector3();
  if (mapping.explode) {
    explodeDirection = new THREE.Vector3(...mapping.explode);
  } else if (!bounds.isEmpty()) {
    const away = bounds.getCenter(new THREE.Vector3()).sub(vehicleCentre);
    if (away.lengthSq() > 1e-6) explodeDirection = away.normalize().multiplyScalar(DEFAULT_EXPLODE_DISTANCE);
  }
  return { pieces, bounds, explodeDirection, baseColor: modelled.baseColor, isModelled };
}

export function offsetBounds(geometry: PartGeometry, explode: number): THREE.Box3 {
  return geometry.bounds.clone().translate(geometry.explodeDirection.clone().multiplyScalar(explode));
}
