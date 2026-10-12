import { useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Vector3Tuple } from "@car-schematic/shared";

const TICK_HEIGHT = 0.08;
const ignoreRaycast = () => null;

interface AnnotationProps {
  from: Vector3Tuple;
  to: Vector3Tuple;
  label: string;
  color: string;
}

export function Annotation({ from, to, label, color }: AnnotationProps) {
  const geometry = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const lift = new THREE.Vector3(0, TICK_HEIGHT, 0);
    return new THREE.BufferGeometry().setFromPoints([start, end, start, start.clone().add(lift), end, end.clone().add(lift)]);
  }, [from, to]);

  const middle = useMemo(
    () => new THREE.Vector3(...from).add(new THREE.Vector3(...to)).multiplyScalar(0.5).add(new THREE.Vector3(0, TICK_HEIGHT, 0)),
    [from, to],
  );

  return (
    <group>
      <lineSegments geometry={geometry} raycast={ignoreRaycast}>
        <lineBasicMaterial color={color} transparent opacity={0.6} />
      </lineSegments>
      <Html position={middle} center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
        <span className="viewer-annotation">{label}</span>
      </Html>
    </group>
  );
}
