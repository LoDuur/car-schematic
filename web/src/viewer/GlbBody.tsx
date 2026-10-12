import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ViewMode } from "../state/store";
import type { ViewerPalette } from "./palette";

const BODY_EDGE_THRESHOLD_DEGREES = 50;
const ignoreRaycast = () => null;

interface GlbBodyProps {
  scene: THREE.Object3D;
  rootMatrix: THREE.Matrix4;
  claimedMeshNames: Set<string>;
  palette: ViewerPalette;
  viewMode: ViewMode;
}

function isClaimed(object: THREE.Object3D, claimedMeshNames: Set<string>): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (claimedMeshNames.has(current.name)) return true;
  }
  return false;
}

export function collectBodyGeometry(scene: THREE.Object3D, rootMatrix: THREE.Matrix4, claimedMeshNames: Set<string>): THREE.BufferGeometry[] {
  scene.updateMatrixWorld(true);
  const collected: THREE.BufferGeometry[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || isClaimed(object, claimedMeshNames)) return;
    const geometry = (object.geometry as THREE.BufferGeometry).clone();
    geometry.applyMatrix4(rootMatrix.clone().multiply(object.matrixWorld));
    collected.push(geometry);
  });
  return collected;
}

export function GlbBody({ scene, rootMatrix, claimedMeshNames, palette, viewMode }: GlbBodyProps) {
  const surfaces = useMemo(() => collectBodyGeometry(scene, rootMatrix, claimedMeshNames), [scene, rootMatrix, claimedMeshNames]);
  const edges = useMemo(() => surfaces.map((surface) => new THREE.EdgesGeometry(surface, BODY_EDGE_THRESHOLD_DEGREES)), [surfaces]);
  useEffect(
    () => () => {
      surfaces.forEach((surface) => surface.dispose());
      edges.forEach((edge) => edge.dispose());
    },
    [surfaces, edges],
  );
  const fillOpacity = viewMode === "xray" ? 0.03 : 0.1;

  return (
    <group raycast={ignoreRaycast}>
      {surfaces.map((surface, index) => (
        <mesh key={`fill-${index}`} geometry={surface} raycast={ignoreRaycast} renderOrder={4}>
          <meshStandardMaterial color={palette.partFill} transparent opacity={fillOpacity} depthWrite={false} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {edges.map((edge, index) => (
        <lineSegments key={`edge-${index}`} geometry={edge} raycast={ignoreRaycast} renderOrder={5}>
          <lineBasicMaterial color={palette.inkMuted} transparent opacity={viewMode === "xray" ? 0.3 : 0.22} depthWrite={false} />
        </lineSegments>
      ))}
    </group>
  );
}
