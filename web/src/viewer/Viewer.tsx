import { Component as ReactComponent, Suspense, useCallback, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useProgress } from "@react-three/drei";
import { useText } from "../i18n/useText";
import { useVehicleData } from "../state/vehicleData";
import { INITIAL_CAMERA_POSITION } from "./CameraRig";
import { usePrefersReducedMotion, useViewerPalette } from "./palette";
import { SceneContent } from "./SceneContent";
import { ViewerToolbar } from "./ViewerToolbar";

interface FallbackBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
  onError?: () => void;
}

class FallbackBoundary extends ReactComponent<FallbackBoundaryProps, { hasFailed: boolean }> {
  state = { hasFailed: false };
  static getDerivedStateFromError() {
    return { hasFailed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
    this.props.onError?.();
  }
  render() {
    return this.state.hasFailed ? this.props.fallback : this.props.children;
  }
}

export function Viewer() {
  const { t, local } = useText();
  const { vehiclePackage, componentsById } = useVehicleData();
  const palette = useViewerPalette();
  const isReducedMotion = usePrefersReducedMotion();
  const isModelLoading = useProgress((state) => state.active);
  const [hasModelFailed, setHasModelFailed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const handleHover = useCallback((componentId: string | null) => {
    setHoveredId(componentId);
    document.body.style.cursor = componentId ? "pointer" : "";
  }, []);
  const { glb } = vehiclePackage.modelMap;
  const glbUrl = glb ? `/api/vehicles/${encodeURIComponent(vehiclePackage.vehicle.id)}/assets/${encodeURIComponent(glb.file)}` : null;
  const sceneProps = { palette, isReducedMotion, hoveredId, onHover: handleHover };
  const placeholderScene = <SceneContent glbUrl={null} hasAnnotations={false} {...sceneProps} />;
  const hovered = hoveredId ? componentsById.get(hoveredId) : undefined;

  return (
    <section className="viewer" aria-label={t("viewerLabel")}>
      <FallbackBoundary fallback={<p className="viewer-fallback">{t("viewerNoWebgl")}</p>}>
        <Canvas
          shadows
          camera={{ position: INITIAL_CAMERA_POSITION.toArray(), fov: 30, near: 0.02, far: 80 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          onPointerMissed={() => handleHover(null)}
        >
          <hemisphereLight args={["#ffffff", "#8a8a85", 1.25]} />
          <directionalLight position={[4, 7, 3]} intensity={1.7} />
          <directionalLight position={[-5, 3, -4]} intensity={0.55} />
          <OrbitControls makeDefault enableDamping={!isReducedMotion} dampingFactor={0.12} rotateSpeed={0.7} zoomSpeed={0.9} maxPolarAngle={Math.PI * 0.55} />
          <FallbackBoundary fallback={placeholderScene} onError={() => setHasModelFailed(true)}>
            <Suspense fallback={null}>
              <SceneContent glbUrl={glbUrl} hasAnnotations {...sceneProps} />
            </Suspense>
          </FallbackBoundary>
        </Canvas>
      </FallbackBoundary>
      <ViewerToolbar />
      <div className="viewer-status" aria-live="polite">
        {isModelLoading && <p>{t("model3dLoading")}…</p>}
        {hasModelFailed && <p className="notice notice-warning">{t("model3dFailed")}</p>}
        {hovered && !isModelLoading && (
          <p className="viewer-hover">
            {local(hovered.name).text}
            <span>{t("hoverHint")}</span>
          </p>
        )}
      </div>
    </section>
  );
}
