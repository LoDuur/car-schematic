import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CameraPreset } from "../state/store";

interface OrbitControlsImpl {
  target: THREE.Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
  addEventListener: (type: "start", listener: () => void) => void;
  removeEventListener: (type: "start", listener: () => void) => void;
}

export const INITIAL_CAMERA_POSITION = new THREE.Vector3(4.6, 2.4, 5.2);

const PRESET_DIRECTIONS: Record<CameraPreset, THREE.Vector3> = {
  isometric: new THREE.Vector3(1, 0.55, 1.1).normalize(),
  front: new THREE.Vector3(1, 0.12, 0).normalize(),
  rear: new THREE.Vector3(-1, 0.12, 0).normalize(),
  left: new THREE.Vector3(0, 0.12, -1).normalize(),
  right: new THREE.Vector3(0, 0.12, 1).normalize(),
  top: new THREE.Vector3(0.0, 1, 0.001).normalize(),
};

const TRANSITION_MS = 650;
const OVERVIEW_MARGIN = 1.06;
const FOCUS_MARGIN = 1.3;
const MIN_FOCUS_RADIUS = 0.2;

interface Transition {
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

function halfFovTangents(camera: THREE.Camera, aspect: number) {
  const verticalFov = camera instanceof THREE.PerspectiveCamera ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 4;
  const vertical = Math.tan(verticalFov / 2);
  return { vertical, horizontal: vertical * aspect };
}

function boxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  const { min, max } = bounds;
  return [0, 1, 2, 3, 4, 5, 6, 7].map((index) => new THREE.Vector3(index & 1 ? max.x : min.x, index & 2 ? max.y : min.y, index & 4 ? max.z : min.z));
}

function frameBounds(bounds: THREE.Box3, direction: THREE.Vector3, camera: THREE.Camera, aspect: number, margin: number, minRadius: number) {
  const padded = bounds.clone();
  const centre = padded.getCenter(new THREE.Vector3());
  padded.union(new THREE.Box3().setFromCenterAndSize(centre, new THREE.Vector3(minRadius * 2, minRadius * 2, minRadius * 2)));
  const toCamera = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toCamera);
  if (right.lengthSq() < 1e-6) right.set(0, 0, 1);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(toCamera, right).normalize();
  const { vertical, horizontal } = halfFovTangents(camera, aspect);
  let distance = 0;
  for (const corner of boxCorners(padded)) {
    const offset = corner.sub(centre);
    const depth = offset.dot(toCamera);
    distance = Math.max(distance, depth + Math.abs(offset.dot(right)) / horizontal, depth + Math.abs(offset.dot(up)) / vertical);
  }
  distance *= margin;
  return { position: centre.clone().add(toCamera.multiplyScalar(distance)), target: centre };
}

interface CameraRigProps {
  modelBounds: THREE.Box3;
  resolveFocusBounds: (componentIds: string[]) => THREE.Box3 | null;
  focusRequest: { value: string[]; nonce: number } | null;
  cameraRequest: { value: CameraPreset; nonce: number } | null;
  isReducedMotion: boolean;
}

export function CameraRig({ modelBounds, resolveFocusBounds, focusRequest, cameraRequest, isReducedMotion }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  const transition = useRef<Transition | null>(null);
  const hasUserMoved = useRef(false);

  const moveTo = (position: THREE.Vector3, target: THREE.Vector3, isInstant = false) => {
    if (!controls) return;
    if (isReducedMotion || isInstant) {
      transition.current = null;
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      return;
    }
    transition.current = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: position, toTarget: target, startedAt: performance.now() };
  };

  useEffect(() => {
    if (!controls || modelBounds.isEmpty()) return;
    const radius = modelBounds.getBoundingSphere(new THREE.Sphere()).radius;
    controls.minDistance = 0.25;
    controls.maxDistance = radius * 6;
    if (hasUserMoved.current || transition.current) return;
    const framed = frameBounds(modelBounds, PRESET_DIRECTIONS.isometric, camera, aspect, OVERVIEW_MARGIN, 0);
    moveTo(framed.position, framed.target, true);
  }, [controls, modelBounds, aspect, camera]);

  useEffect(() => {
    if (!focusRequest || !controls) return;
    const bounds = resolveFocusBounds(focusRequest.value);
    if (!bounds || bounds.isEmpty()) return;
    hasUserMoved.current = true;
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-6) direction.copy(PRESET_DIRECTIONS.isometric);
    const framed = frameBounds(bounds, direction, camera, aspect, FOCUS_MARGIN, MIN_FOCUS_RADIUS);
    moveTo(framed.position, framed.target);
  }, [focusRequest?.nonce]);

  useEffect(() => {
    if (!cameraRequest || modelBounds.isEmpty()) return;
    hasUserMoved.current = cameraRequest.value !== "isometric";
    const framed = frameBounds(modelBounds, PRESET_DIRECTIONS[cameraRequest.value], camera, aspect, OVERVIEW_MARGIN, 0);
    moveTo(framed.position, framed.target);
  }, [cameraRequest?.nonce]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      transition.current = null;
      hasUserMoved.current = true;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame(() => {
    const active = transition.current;
    if (!active || !controls) return;
    const progress = Math.min(1, (performance.now() - active.startedAt) / TRANSITION_MS);
    const eased = easeInOutCubic(progress);
    camera.position.lerpVectors(active.fromPosition, active.toPosition, eased);
    controls.target.lerpVectors(active.fromTarget, active.toTarget, eased);
    controls.update();
    if (progress >= 1) transition.current = null;
  });

  return null;
}
