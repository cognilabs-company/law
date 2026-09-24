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

function removeRobotSideBalls(scene: THREE.Object3D, head?: THREE.Object3D): void {
  if (!head) return;
  scene.updateWorldMatrix(true, true);
  head.updateWorldMatrix(true, false);
  const headWorldInverse = head.matrixWorld.clone().invert();

  scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    const geometry = mesh.geometry;
    const index = geometry?.index;
    const position = geometry?.getAttribute("position");
    if (!mesh.isSkinnedMesh || !geometry || !index || !position || geometry.userData.lexgoRobotSideBallsRemoved) return;

    mesh.updateWorldMatrix(true, false);
    const bindPositions: THREE.Vector3[] = [];
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      mesh.applyBoneTransform(i, point);
      point.applyMatrix4(mesh.matrixWorld).applyMatrix4(headWorldInverse);
      bindPositions.push(point.clone());
    }

    const parents = new Int32Array(position.count);
    for (let i = 0; i < parents.length; i++) parents[i] = i;
    const find = (value: number): number => {
      let root = value;
      while (parents[root] !== root) root = parents[root];
      while (parents[value] !== value) {
        const next = parents[value];
        parents[value] = root;
        value = next;
      }
      return root;
    };
    const union = (a: number, b: number): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parents[rootB] = rootA;
    };

    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      union(a, b);
      union(b, c);
    }

    const components = new Map<number, { count: number; min: THREE.Vector3; max: THREE.Vector3; sum: THREE.Vector3 }>();
    for (let i = 0; i < bindPositions.length; i++) {
      const root = find(i);
      const current = components.get(root);
      if (current) {
        current.count += 1;
        current.min.min(bindPositions[i]);
        current.max.max(bindPositions[i]);
        current.sum.add(bindPositions[i]);
      } else {
        components.set(root, {
          count: 1,
          min: bindPositions[i].clone(),
          max: bindPositions[i].clone(),
          sum: bindPositions[i].clone(),
        });
      }
    }

    const sideBallRoots = new Set<number>();
    components.forEach((component, root) => {
      const center = component.sum.clone().multiplyScalar(1 / component.count);
      const size = component.max.clone().sub(component.min);
      if (
        component.count >= 50 &&
        component.count <= 220 &&
        Math.abs(center.x) >= 0.16 &&
        Math.abs(center.x) <= 0.23 &&
        center.y >= 0.02 &&
        center.y <= 0.3 &&
        Math.abs(center.z) <= 0.04 &&
        size.x <= 0.09 &&
        size.y >= 0.18 &&
        size.y <= 0.32
      ) {
        sideBallRoots.add(root);
      }
    });

    if (!sideBallRoots.size) {
      geometry.userData.lexgoRobotSideBallsRemoved = true;
      return;
    }

    const filtered: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      if (sideBallRoots.has(find(a)) || sideBallRoots.has(find(b)) || sideBallRoots.has(find(c))) continue;
      filtered.push(a, b, c);
    }

    const filteredIndex = index.array instanceof Uint32Array ? new Uint32Array(filtered) : new Uint16Array(filtered);
    geometry.setIndex(new THREE.BufferAttribute(filteredIndex, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.lexgoRobotSideBallsRemoved = true;
  });
}

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
  const bones = useMemo(() => {
    const mappedBones = new RobotBones(scene);
    removeRobotSideBalls(scene, mappedBones.get("head"));
    return mappedBones;
  }, [scene]);
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
