"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { RobotBones } from "./RobotBones";
import { RobotController } from "./RobotController";
import { RobotEvents } from "./RobotEvents";
import { DEBUG_ROBOT, HEAD_SAFETY_ZONE, MODEL_SCALE, MODEL_URL } from "./robot-config";
import type { RobotEventName } from "./robot-types";

useGLTF.preload(MODEL_URL);

// DEBUG_ROBOT only (section 38) — a wireframe ellipsoid on the head bone
// showing the safety zone wave() (and future point/hold gestures) check
// against. Not part of the render path in production.
function attachHeadSafetyDebugMesh(bones: RobotBones): THREE.Mesh | null {
  const head = bones.get("head");
  if (!head) return null;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, wireframe: true, transparent: true, opacity: 0.5 }),
  );
  mesh.scale.set(HEAD_SAFETY_ZONE.radiusX, HEAD_SAFETY_ZONE.radiusY, HEAD_SAFETY_ZONE.radiusZ);
  head.add(mesh);
  return mesh;
}

const BEHAVIOR_BY_EVENT: Record<RobotEventName, (controller: RobotController) => void> = {
  idle: (c) => c.idle(),
  greet: (c) => c.greet(),
  peek: (c) => c.peek(),
  hide: (c) => c.hide(),
  wave: (c) => c.wave(),
  think: (c) => c.think(),
  reactSuccess: (c) => c.reactSuccess(),
  reactError: (c) => c.reactError(),
  reactNotification: (c) => c.reactNotification(),
};

export default function RobotModel({
  onReady,
  reducedMotion,
}: {
  onReady: (controller: RobotController | null) => void;
  reducedMotion: boolean;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const rootRef = useRef<THREE.Group>(null);
  const controllerRef = useRef<RobotController | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bones = new RobotBones(scene);
    const controller = new RobotController(root, bones);
    controller.setReducedMotion(reducedMotion);
    controllerRef.current = controller;
    onReady(controller);

    const unsubscribers = (Object.keys(BEHAVIOR_BY_EVENT) as RobotEventName[]).map((event) =>
      RobotEvents.on(event, () => BEHAVIOR_BY_EVENT[event](controller)),
    );

    const debugMesh = DEBUG_ROBOT ? attachHeadSafetyDebugMesh(bones) : null;

    return () => {
      unsubscribers.forEach((off) => off());
      if (debugMesh) {
        debugMesh.parent?.remove(debugMesh);
        debugMesh.geometry.dispose();
        (debugMesh.material as THREE.Material).dispose();
      }
      controller.dispose();
      controllerRef.current = null;
      onReady(null);
    };
    // reducedMotion is applied via its own effect below, not re-run here —
    // rebuilding the whole controller for a prefers-reduced-motion flip
    // would be wasteful and would restart every in-flight gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    controllerRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useFrame((state, dt) => {
    if (document.hidden) return;
    controllerRef.current?.update(dt, state.clock.elapsedTime);
  });

  return (
    <group ref={rootRef} scale={MODEL_SCALE}>
      <primitive object={scene} />
    </group>
  );
}
