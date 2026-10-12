import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { ViewMode } from "../state/store";
import type { PartGeometry } from "./geometry";
import type { ViewerPalette } from "./palette";

const PART_EDGE_THRESHOLD_DEGREES = 40;
const CLICK_DRAG_TOLERANCE_PX = 4;
const ignoreRaycast = () => null;

export type PartState = "normal" | "selected" | "highlighted" | "related" | "dimmed";

interface PartModelProps {
  componentId: string;
  geometry: PartGeometry;
  state: PartState;
  isHovered: boolean;
  viewMode: ViewMode;
  explode: number;
  palette: ViewerPalette;
  onSelect: (componentId: string, isAdditive: boolean) => void;
  onHover: (componentId: string | null) => void;
}

interface Look {
  fill: string;
  fillOpacity: number;
  edge: string;
  edgeOpacity: number;
  isOnTop: boolean;
}

function partLook(state: PartState, isHovered: boolean, viewMode: ViewMode, baseColor: string, palette: ViewerPalette): Look {
  const isXray = viewMode === "xray";
  if (state === "selected") return { fill: palette.selectFill, fillOpacity: 0.95, edge: palette.selectInk, edgeOpacity: 1, isOnTop: true };
  if (state === "highlighted") return { fill: palette.highlightFill, fillOpacity: 0.95, edge: palette.highlightInk, edgeOpacity: 1, isOnTop: true };
  if (state === "dimmed") return { fill: palette.partFill, fillOpacity: isXray ? 0.02 : 0.06, edge: palette.inkMuted, edgeOpacity: 0.08, isOnTop: false };
  if (state === "related") return { fill: isXray ? palette.selectFill : baseColor, fillOpacity: isXray ? 0.28 : 1, edge: palette.selectFill, edgeOpacity: 0.95, isOnTop: false };
  if (isXray) return { fill: palette.partFill, fillOpacity: isHovered ? 0.45 : 0.14, edge: palette.ink, edgeOpacity: isHovered ? 0.9 : 0.4, isOnTop: false };
  return { fill: isHovered ? palette.selectFill : baseColor, fillOpacity: 1, edge: palette.ink, edgeOpacity: isHovered ? 0.6 : 0.18, isOnTop: false };
}

export function PartModel({ componentId, geometry, state, isHovered, viewMode, explode, palette, onSelect, onHover }: PartModelProps) {
  const isInteractive = state !== "dimmed";
  const edges = useMemo(() => geometry.pieces.map((piece) => new THREE.EdgesGeometry(piece, PART_EDGE_THRESHOLD_DEGREES)), [geometry]);
  useEffect(() => () => edges.forEach((edge) => edge.dispose()), [edges]);

  const offset = geometry.explodeDirection.clone().multiplyScalar(explode);
  const look = partLook(state, isHovered, viewMode, geometry.baseColor ?? palette.partFill, palette);
  const isTransparent = look.fillOpacity < 1;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!isInteractive || event.delta > CLICK_DRAG_TOLERANCE_PX) return;
    event.stopPropagation();
    const native = event.nativeEvent;
    onSelect(componentId, native.shiftKey || native.metaKey || native.ctrlKey);
  };

  return (
    <group
      position={offset}
      name={componentId}
      onClick={handleClick}
      onPointerOver={(event) => {
        if (!isInteractive) return;
        event.stopPropagation();
        onHover(componentId);
      }}
      onPointerOut={() => onHover(null)}
    >
      {geometry.pieces.map((piece, index) => (
        <group key={index}>
          <mesh
            geometry={piece}
            raycast={isInteractive ? THREE.Mesh.prototype.raycast : ignoreRaycast}
            renderOrder={look.isOnTop ? 10 : isTransparent ? 2 : 1}
            castShadow={!isTransparent}
          >
            <meshStandardMaterial
              color={look.fill}
              roughness={0.62}
              metalness={0.12}
              transparent={isTransparent}
              opacity={look.fillOpacity}
              depthWrite={!isTransparent}
              depthTest={!look.isOnTop}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments geometry={edges[index]} raycast={ignoreRaycast} renderOrder={look.isOnTop ? 11 : 3}>
            <lineBasicMaterial color={look.edge} transparent opacity={look.edgeOpacity} depthTest={!look.isOnTop} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}
