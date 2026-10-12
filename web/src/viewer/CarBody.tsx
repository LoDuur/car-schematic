import { useMemo } from "react";
import * as THREE from "three";
import type { ModelMap } from "@car-schematic/shared";
import type { ViewerPalette } from "./palette";

const BODY_EDGE_THRESHOLD_DEGREES = 25;
const ignoreRaycast = () => null;

type BodyMapping = NonNullable<ModelMap["body"]>;

export function CarBody({ body, palette }: { body: BodyMapping; palette: ViewerPalette }) {
  const bodyEdges = useMemo(() => {
    const outline = new THREE.Shape(body.profile.map(([x, y]) => new THREE.Vector2(x, y)));
    const extruded = new THREE.ExtrudeGeometry(outline, { depth: body.width, bevelEnabled: false, curveSegments: 4 });
    extruded.translate(0, 0, -body.width / 2);
    const edges = new THREE.EdgesGeometry(extruded, BODY_EDGE_THRESHOLD_DEGREES);
    extruded.dispose();
    return edges;
  }, [body]);

  const wheelEdges = useMemo(
    () =>
      body.wheels.map((wheel) => {
        const cylinder = new THREE.CylinderGeometry(wheel.radius, wheel.radius, wheel.width, 32);
        cylinder.rotateX(Math.PI / 2);
        const edges = new THREE.EdgesGeometry(cylinder, BODY_EDGE_THRESHOLD_DEGREES);
        cylinder.dispose();
        return { edges, position: wheel.position };
      }),
    [body],
  );

  return (
    <group raycast={ignoreRaycast}>
      <lineSegments geometry={bodyEdges} raycast={ignoreRaycast}>
        <lineBasicMaterial color={palette.inkMuted} transparent opacity={0.7} />
      </lineSegments>
      {wheelEdges.map((wheel, index) => (
        <lineSegments key={index} geometry={wheel.edges} position={wheel.position} raycast={ignoreRaycast}>
          <lineBasicMaterial color={palette.inkMuted} transparent opacity={0.7} />
        </lineSegments>
      ))}
    </group>
  );
}
