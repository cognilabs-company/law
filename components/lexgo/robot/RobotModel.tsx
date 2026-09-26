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

// ── Removing the robot's side pods ──────────────────────────────────
// The model is one skinned primitive that the generator left as ~1400
// disconnected shells, every one of them weighted to mixamorig:Head — so there
// is no node, material or joint that names the two pods on the sides of the
// head. They have to be found by shape.
//
// The previous attempt matched a hard-coded box in head space and then also
// deleted any TRIANGLE whose three corners fell inside it. Measured against
// the real mesh that box spans |x| 0.146–0.198 while the head itself only
// reaches |x| 0.22, so the triangle sweep was cutting 262 triangles out of the
// side of the head — holes — and still left 13 shells (168 vertices) standing
// beside it, which is the round leftover.
//
// This finds the two pods by their own silhouette (a thin plate in x, tall and
// deep), then derives the removal volume from those two boxes and drops only
// WHOLE shells that fit entirely inside one of them. A rule that can only ever
// remove a complete shell cannot punch a hole in a surface, and measured on
// this model it takes 78 shells / 982 triangles — the pods and every fragment
// of them — while touching nothing that belongs to the head or body.
const POD_PAD: readonly [number, number, number] = [0.055, 0.075, 0.075];

type Shell = {
  root: number;
  count: number;
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  size: THREE.Vector3;
};

// A pod: a flat plate standing out at the side of the head. The numbers are the
// two real components, +x 156 verts and -x 77 verts, with room around them.
function isSidePod(s: Shell): boolean {
  return (
    s.count >= 40 &&
    s.count <= 400 &&
    Math.abs(s.center.x) >= 0.17 &&
    s.size.x <= 0.08 &&
    s.size.y >= 0.18 &&
    s.size.z >= 0.25
  );
}

function removeRobotEars(scene: THREE.Object3D, head?: THREE.Object3D): boolean {
  if (!head) return false;
  scene.updateWorldMatrix(true, true);
  head.updateWorldMatrix(true, false);
  const headWorldInverse = head.matrixWorld.clone().invert();
  let removed = false;

  scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    const geometry = mesh.geometry;
    const index = geometry?.index;
    const position = geometry?.getAttribute("position");
    if (!mesh.isSkinnedMesh || !geometry || !index || !position || geometry.userData.lexgoRobotPodsRemoved) return;
    geometry.userData.lexgoRobotPodsRemoved = true;

    // Bind-pose position of every vertex, in the head bone's own space, so the
    // thresholds mean the same thing whatever the rig is doing this frame.
    mesh.updateWorldMatrix(true, false);
    mesh.skeleton.update();
    const bind: THREE.Vector3[] = new Array(position.count);
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      mesh.applyBoneTransform(i, point);
      point.applyMatrix4(mesh.matrixWorld).applyMatrix4(headWorldInverse);
      bind[i] = point.clone();
    }

    // Connected shells, by union-find over the index buffer.
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

    const shells = new Map<number, Shell>();
    for (let i = 0; i < bind.length; i++) {
      const root = find(i);
      const p = bind[i];
      const s = shells.get(root);
      if (s) {
        s.count += 1;
        s.min.min(p);
        s.max.max(p);
      } else {
        shells.set(root, { root, count: 1, min: p.clone(), max: p.clone(), center: new THREE.Vector3(), size: new THREE.Vector3() });
      }
    }
    for (const s of shells.values()) {
      s.size.copy(s.max).sub(s.min);
      s.center.copy(s.min).add(s.max).multiplyScalar(0.5);
    }

    // One removal volume per pod, from the pod's own bounds. Nothing is removed
    // when the pods are not found: a model without them must come through
    // untouched rather than be cut by whatever the fallback guessed.
    const zones = [...shells.values()].filter(isSidePod).map((pod) => ({
      sign: Math.sign(pod.center.x),
      min: pod.min.clone().sub(new THREE.Vector3(...POD_PAD)),
      max: pod.max.clone().add(new THREE.Vector3(...POD_PAD)),
    }));
    if (!zones.length) {
      if (process.env.NODE_ENV !== "production") console.warn("[LexGoRobot] side pods not found — geometry left as authored.");
      return;
    }

    const doomed = new Set<number>();
    for (const s of shells.values()) {
      for (const zone of zones) {
        if (Math.sign(s.center.x) !== zone.sign) continue;
        if (
          s.min.x >= zone.min.x && s.max.x <= zone.max.x &&
          s.min.y >= zone.min.y && s.max.y <= zone.max.y &&
          s.min.z >= zone.min.z && s.max.z <= zone.max.z
        ) {
          doomed.add(s.root);
          break;
        }
      }
    }
    if (!doomed.size) return;

    const filtered: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      // A shell is whole, so testing one corner is testing the triangle.
      if (doomed.has(find(a))) continue;
      filtered.push(a, index.getX(i + 1), index.getX(i + 2));
    }
    if (filtered.length === index.count) return;

    const filteredIndex = index.array instanceof Uint32Array ? new Uint32Array(filtered) : new Uint16Array(filtered);
    geometry.setIndex(new THREE.BufferAttribute(filteredIndex, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    removed = true;
  });
  return removed;
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
  const earsRemovedRef = useRef(false);
  const bones = useMemo(() => {
    return new RobotBones(scene);
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
    // Once, on the first frame the rig is ready: the pass walks every vertex,
    // and the old "retry until it returns true" version re-ran that sweep on
    // every frame for any model it found nothing to cut in.
    if (!earsRemovedRef.current) {
      earsRemovedRef.current = true;
      removeRobotEars(scene, bones.get("head"));
    }
    controllerRef.current?.update(dt, state.clock.elapsedTime);
  });

  return (
    <group ref={rootRef} scale={MODEL_SCALE}>
      <primitive object={scene} />
      <RobotFace head={bones.get("head")} expression={expression} />
    </group>
  );
}
