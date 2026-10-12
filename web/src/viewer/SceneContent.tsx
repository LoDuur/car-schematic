import { useCallback, useEffect, useMemo } from "react";
import { ContactShadows, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { findIncomingRelations, resolvePartMapping } from "@car-schematic/shared";
import { useText } from "../i18n/useText";
import { useExplorer } from "../state/store";
import { useVehicleData } from "../state/vehicleData";
import { Annotation } from "./Annotation";
import { CameraRig } from "./CameraRig";
import { CarBody } from "./CarBody";
import { GlbBody, collectBodyGeometry } from "./GlbBody";
import { buildPartGeometry, createRootMatrix, offsetBounds } from "./geometry";
import type { ViewerPalette } from "./palette";
import { PartModel, type PartState } from "./PartModel";

interface SceneProps {
  palette: ViewerPalette;
  isReducedMotion: boolean;
  hasAnnotations: boolean;
  hoveredId: string | null;
  onHover: (componentId: string | null) => void;
}

function profileBounds(body: NonNullable<ReturnType<typeof useVehicleData>["vehiclePackage"]["modelMap"]["body"]>): THREE.Box3 {
  const xs = body.profile.map(([x]) => x);
  const ys = body.profile.map(([, y]) => y);
  return new THREE.Box3(new THREE.Vector3(Math.min(...xs), 0, -body.width / 2), new THREE.Vector3(Math.max(...xs), Math.max(...ys), body.width / 2));
}

function SceneParts({ scene, palette, isReducedMotion, hasAnnotations, hoveredId, onHover }: SceneProps & { scene: THREE.Object3D | null }) {
  const { local } = useText();
  const { vehiclePackage, components, componentsById, config } = useVehicleData();
  const selectedId = useExplorer((state) => state.selectedId);
  const selectedIds = useExplorer((state) => state.selectedIds);
  const hiddenIds = useExplorer((state) => state.hiddenIds);
  const isolatedIds = useExplorer((state) => state.isolatedIds);
  const highlightIds = useExplorer((state) => state.highlightIds);
  const viewMode = useExplorer((state) => state.viewMode);
  const explodeSetting = useExplorer((state) => state.explode);
  const focusRequest = useExplorer((state) => state.focusRequest);
  const cameraRequest = useExplorer((state) => state.cameraRequest);
  const select = useExplorer((state) => state.select);
  const { modelMap } = vehiclePackage;
  const explode = viewMode === "exploded" ? explodeSetting : 0;

  const rootMatrix = useMemo(() => createRootMatrix(modelMap.glb), [modelMap.glb]);
  const claimedMeshNames = useMemo(
    () => new Set(Object.values(modelMap.parts).flatMap((mapping) => [...mapping.meshes, ...mapping.variants.flatMap((variant) => variant.meshes)])),
    [modelMap.parts],
  );

  const bodyBounds = useMemo(() => {
    if (scene) {
      const bounds = new THREE.Box3();
      collectBodyGeometry(scene, rootMatrix, claimedMeshNames).forEach((geometry) => {
        geometry.computeBoundingBox();
        if (geometry.boundingBox) bounds.union(geometry.boundingBox);
        geometry.dispose();
      });
      return bounds;
    }
    return modelMap.body ? profileBounds(modelMap.body) : new THREE.Box3();
  }, [scene, rootMatrix, claimedMeshNames, modelMap.body]);

  const partGeometries = useMemo(() => {
    scene?.updateMatrixWorld(true);
    const centre = bodyBounds.isEmpty() ? new THREE.Vector3(0, 0.5, 0) : bodyBounds.getCenter(new THREE.Vector3());
    return new Map(
      components.flatMap((component) => {
        const mapping = modelMap.parts[component.id];
        if (!mapping) return [];
        const resolved = resolvePartMapping(mapping, config);
        return [[component.id, buildPartGeometry({ ...resolved, explode: mapping.explode }, scene, rootMatrix, centre)] as const];
      }),
    );
  }, [components, modelMap.parts, config, scene, rootMatrix, bodyBounds]);
  useEffect(
    () => () => partGeometries.forEach((geometry) => geometry.pieces.forEach((piece) => piece.dispose())),
    [partGeometries],
  );

  const modelBounds = useMemo(() => {
    const bounds = bodyBounds.clone();
    partGeometries.forEach((geometry) => bounds.union(offsetBounds(geometry, explode)));
    return bounds;
  }, [bodyBounds, partGeometries, explode]);

  const resolveFocusBounds = useCallback(
    (componentIds: string[]) => {
      const bounds = new THREE.Box3();
      componentIds.forEach((id) => {
        const geometry = partGeometries.get(id);
        if (geometry && !geometry.bounds.isEmpty()) bounds.union(offsetBounds(geometry, explode));
      });
      return bounds.isEmpty() ? null : bounds;
    },
    [partGeometries, explode],
  );

  const relatedIds = useMemo(() => {
    const selected = selectedId ? componentsById.get(selectedId) : undefined;
    if (!selected || selectedIds.length > 1) return new Set<string>();
    return new Set([
      ...selected.relations.map((relation) => relation.target),
      ...findIncomingRelations(components, selected.id).map((relation) => relation.sourceId),
    ]);
  }, [selectedId, selectedIds, components, componentsById]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const partState = useCallback(
    (componentId: string): PartState => {
      if (selected.has(componentId)) return "selected";
      if (isolatedIds && !isolatedIds.includes(componentId)) return "dimmed";
      if (highlightIds.includes(componentId)) return "highlighted";
      if (relatedIds.has(componentId)) return "related";
      return "normal";
    },
    [selected, isolatedIds, highlightIds, relatedIds],
  );

  const handleSelect = useCallback((componentId: string, isAdditive: boolean) => select(componentId, { additive: isAdditive }), [select]);
  const hidden = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const shadowSize = modelBounds.isEmpty() ? new THREE.Vector3(5, 0, 2) : modelBounds.getSize(new THREE.Vector3());
  const shadowCentre = modelBounds.isEmpty() ? new THREE.Vector3() : modelBounds.getCenter(new THREE.Vector3());

  return (
    <>
      <CameraRig
        modelBounds={modelBounds}
        resolveFocusBounds={resolveFocusBounds}
        focusRequest={focusRequest}
        cameraRequest={cameraRequest}
        isReducedMotion={isReducedMotion}
      />
      {viewMode !== "xray" && !modelBounds.isEmpty() && (
        <ContactShadows
          key={`${viewMode}-${hiddenIds.length}-${isolatedIds?.length ?? 0}-${explode}`}
          position={[shadowCentre.x, 0.002, shadowCentre.z]}
          scale={[shadowSize.x * 1.25, shadowSize.z * 1.6]}
          resolution={512}
          blur={2.4}
          far={1.6}
          opacity={0.42}
          frames={1}
        />
      )}
      {scene ? (
        <GlbBody scene={scene} rootMatrix={rootMatrix} claimedMeshNames={claimedMeshNames} palette={palette} viewMode={viewMode} />
      ) : (
        modelMap.body && <CarBody body={modelMap.body} palette={palette} />
      )}
      {hasAnnotations &&
        modelMap.body?.annotations.map((annotation, index) => (
          <Annotation key={index} from={annotation.from} to={annotation.to} label={local(annotation.label).text} color={palette.inkMuted} />
        ))}
      {components.map((component) => {
        const geometry = partGeometries.get(component.id);
        if (!geometry || geometry.pieces.length === 0 || hidden.has(component.id)) return null;
        return (
          <PartModel
            key={component.id}
            componentId={component.id}
            geometry={geometry}
            state={partState(component.id)}
            isHovered={hoveredId === component.id}
            viewMode={viewMode}
            explode={explode}
            palette={palette}
            onSelect={handleSelect}
            onHover={onHover}
          />
        );
      })}
    </>
  );
}

function GlbSceneParts({ url, ...props }: SceneProps & { url: string }) {
  const { scene } = useGLTF(url);
  return <SceneParts scene={scene} {...props} />;
}

export function SceneContent(props: SceneProps & { glbUrl: string | null }) {
  const { glbUrl, ...sceneProps } = props;
  return glbUrl ? <GlbSceneParts url={glbUrl} {...sceneProps} /> : <SceneParts scene={null} {...sceneProps} />;
}
