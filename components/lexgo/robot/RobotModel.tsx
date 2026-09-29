"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RobotEvents } from "./RobotEvents";
import RobotFace from "./RobotFace";
import RobotRig, { type RobotRig as RobotRigData } from "./RobotRig";
import { RobotController } from "./RobotController";
import type { RobotEventName, RobotEventPayload, RobotExpression } from "./robot-types";

const BEHAVIOR_BY_EVENT: Record<RobotEventName, (controller: RobotController, payload?: RobotEventPayload) => void> = {
  idle: (controller) => controller.idle(),
  greet: (controller, payload) => controller.greet(payload?.target instanceof THREE.Vector3 ? payload.target : null),
  peek: (controller) => controller.peek(),
  hide: (controller) => controller.hide(),
  wave: (controller) => controller.wave(),
  look: (controller, payload) => controller.lookAt(payload?.target instanceof THREE.Vector3 ? payload.target : null),
  point: (controller, payload) => controller.pointAt(payload?.target ?? null),
  gesture: (controller, payload) => payload?.gesture && controller.playGesture(payload.gesture),
  lookCursor: (controller, payload) => controller.lookAtCursor(Boolean(payload?.enabled)),
  expression: (controller, payload) => payload?.expression && controller.setExpression(payload.expression),
  think: (controller) => controller.think(),
  reactSuccess: (controller) => controller.reactSuccess(),
  reactError: (controller) => controller.reactError(),
  reactNotification: (controller) => controller.reactNotification(),
};

export default function RobotModel({ onReady, reducedMotion }: { onReady: (controller: RobotController | null) => void; reducedMotion: boolean }) {
  const [rig, setRig] = useState<RobotRigData | null>(null);
  const [expression, setExpression] = useState<RobotExpression>("default");
  const controllerRef = useRef<RobotController | null>(null);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const handleRigReady = useCallback((nextRig: RobotRigData | null) => {
    setRig(nextRig);
  }, []);

  useEffect(() => {
    if (!rig) return;
    const controller = new RobotController(rig, setExpression);
    controllerRef.current = controller;
    onReadyRef.current(controller);
    const unsubscribers = (Object.keys(BEHAVIOR_BY_EVENT) as RobotEventName[]).map((event) =>
      RobotEvents.on(event, (payload) => BEHAVIOR_BY_EVENT[event](controller, payload)),
    );
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      controller.dispose();
      controllerRef.current = null;
      onReadyRef.current(null);
    };
  }, [rig]);

  useEffect(() => {
    controllerRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useFrame((state, dt) => {
    if (document.hidden) return;
    controllerRef.current?.update(dt, state.clock.elapsedTime);
  });

  return (
    <>
      <RobotRig onReady={handleRigReady} />
      {rig ? <RobotFace head={rig.head} expression={expression} /> : null}
    </>
  );
}
