"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { RobotBones } from "./RobotBones";
import { RobotController } from "./RobotController";
import { RobotEvents } from "./RobotEvents";
import RobotFace from "./RobotFace";
import { MODEL_SCALE, MODEL_URL } from "./robot-config";
import type { RobotEventName, RobotEventPayload, RobotExpression } from "./robot-types";

useGLTF.preload(MODEL_URL);

const BEHAVIOR_BY_EVENT: Record<RobotEventName, (controller: RobotController, payload?: RobotEventPayload) => void> = {
  idle: (c) => c.idle(),
  greet: (c) => c.greet(),
  peek: (c) => c.peek(),
  hide: (c) => c.hide(),
  wave: (c) => c.wave(),
  look: (c, payload) => c.lookAt(payload?.target instanceof THREE.Vector3 ? payload.target : null),
  point: (c, payload) => c.pointAt(payload?.target ?? null),
  gesture: (c, payload) => payload?.gesture && c.playGesture(payload.gesture),
  lookCursor: (c, payload) => c.lookAtCursor(Boolean(payload?.enabled)),
  expression: (c, payload) => payload?.expression && c.setExpression(payload.expression),
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
  const { scene, animations } = useGLTF(MODEL_URL);
  const rootRef = useRef<THREE.Group>(null);
  const controllerRef = useRef<RobotController | null>(null);
  const bones = useMemo(() => new RobotBones(scene), [scene]);
  const [expression, setExpression] = useState<RobotExpression>("default");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const missingBones = bones.missingRequired();
    if (missingBones.length && process.env.NODE_ENV !== "production") {
      console.warn(`[LexGoRobot] model is missing ${missingBones.length} required bones.`, missingBones);
    }
    const controller = new RobotController(root, bones, scene, animations, setExpression);
    controller.setReducedMotion(reducedMotion);
    controllerRef.current = controller;
    onReady(controller);

    const unsubscribers = (Object.keys(BEHAVIOR_BY_EVENT) as RobotEventName[]).map((event) =>
      RobotEvents.on(event, (payload) => BEHAVIOR_BY_EVENT[event](controller, payload)),
    );

    return () => {
      unsubscribers.forEach((off) => off());
      controller.dispose();
      controllerRef.current = null;
      onReady(null);
    };
    // reducedMotion is applied via its own effect below, not re-run here —
    // rebuilding the whole controller for a prefers-reduced-motion flip
    // would be wasteful and would restart every in-flight gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animations, bones, scene]);

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
      <RobotFace head={bones.get("head")} expression={expression} />
    </group>
  );
}
