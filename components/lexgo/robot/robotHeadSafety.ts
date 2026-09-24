import * as THREE from "three";
import { HEAD_AVOID, HEAD_SAFETY_ZONE } from "./robot-config";

// A mathematical stand-in for real collision (spec: "full collision physics
// is NOT necessary") — an ellipsoid centered on the head bone, in the head's
// own local axes. Reused by wave (as a dev-mode sanity check on a
// pre-calibrated pose) and meant for future point/hold gestures that pick a
// target dynamically and actually need the push-out.
const scratchLocal = new THREE.Vector3();
const scratchHeadPos = new THREE.Vector3();
const scratchHeadQuatInv = new THREE.Quaternion();

function toHeadLocal(worldPoint: THREE.Vector3, head: THREE.Object3D): THREE.Vector3 {
  head.updateWorldMatrix(true, false);
  head.getWorldPosition(scratchHeadPos);
  head.getWorldQuaternion(scratchHeadQuatInv).invert();
  return scratchLocal.copy(worldPoint).sub(scratchHeadPos).applyQuaternion(scratchHeadQuatInv);
}

// >1 outside the ellipsoid, <1 inside, 1 = on the surface.
export function headEllipsoidValue(worldPoint: THREE.Vector3, head: THREE.Object3D): number {
  const local = toHeadLocal(worldPoint, head);
  const { radiusX, radiusY, radiusZ } = HEAD_SAFETY_ZONE;
  return (local.x * local.x) / (radiusX * radiusX) + (local.y * local.y) / (radiusY * radiusY) + (local.z * local.z) / (radiusZ * radiusZ);
}

export function isInsideHeadZone(worldPoint: THREE.Vector3, head: THREE.Object3D): boolean {
  return headEllipsoidValue(worldPoint, head) < 1;
}

export type HeadAvoidCorrection = { extraShoulderDeg: number; liftMultiplier: number };
const NO_CORRECTION: HeadAvoidCorrection = { extraShoulderDeg: 0, liftMultiplier: 1 };

// Real, active collision avoidance for a procedural arm gesture — not just a
// dev-console warning. `applyAndMeasureHand` is the caller's own pose
// function: given a correction, it (re-)applies the gesture's bone deltas
// PLUS that correction and returns the hand's resulting world position.
// This file has no bone-topology knowledge of its own (which axis is
// "shoulder out", and its sign, differs per gesture/side) — the caller
// owns that, this just runs the measure -> check -> nudge loop against the
// ellipsoid until it clears HEAD_AVOID.marginValue or the iteration budget
// (2 passes) runs out. Each pass measures against the CURRENT correction
// (not a fresh guess), so a second nudge compounds on the first rather
// than overwriting it.
//
// IMPORTANT: `applyAndMeasureHand` must call `hand.updateWorldMatrix(true,
// false)` before reading its world position — R3F's render loop (not this
// synchronous call) is what normally recomputes matrixWorld, so without an
// explicit update the measurement would read last frame's stale pose and
// this whole check would silently do nothing.
export function resolveHeadAvoidance(
  head: THREE.Object3D,
  applyAndMeasureHand: (correction: HeadAvoidCorrection) => THREE.Vector3,
): HeadAvoidCorrection {
  let correction = NO_CORRECTION;
  for (let i = 0; i < HEAD_AVOID.iterations; i++) {
    const handPos = applyAndMeasureHand(correction);
    const value = headEllipsoidValue(handPos, head);
    if (value >= HEAD_AVOID.marginValue) return correction;
    const intrusion = THREE.MathUtils.clamp(1 - value / HEAD_AVOID.marginValue, 0, 1);
    // Cumulative, not overwritten: a second pass compounds on the first
    // instead of discarding it, so two mild nudges can add up to clear a
    // deeper intrusion than either alone would.
    correction = {
      extraShoulderDeg: correction.extraShoulderDeg + intrusion * HEAD_AVOID.maxExtraShoulderDeg,
      liftMultiplier: correction.liftMultiplier * (1 - intrusion * HEAD_AVOID.maxLiftReductionRatio),
    };
  }
  // The loop above always measures BEFORE computing the next correction, so
  // the last computed correction (the strongest one) was never itself
  // applied+measured — apply it now rather than leave the bones showing the
  // second-to-last, weaker attempt.
  applyAndMeasureHand(correction);
  return correction;
}

// Pushes `worldPoint` radially outward onto the ellipsoid surface (plus a
// small margin) when it falls inside — returns a NEW world-space vector, the
// input is not mutated so callers can compare before/after.
export function pushOutOfHeadZone(worldPoint: THREE.Vector3, head: THREE.Object3D, margin = 1.08): THREE.Vector3 {
  const local = toHeadLocal(worldPoint, head);
  const value = headEllipsoidValue(worldPoint, head);
  if (value >= 1) return worldPoint.clone();
  const scale = value <= 0 ? margin : Math.sqrt(margin / value);
  local.multiplyScalar(scale);
  head.getWorldQuaternion(scratchHeadQuatInv);
  head.getWorldPosition(scratchHeadPos);
  return local.applyQuaternion(scratchHeadQuatInv).add(scratchHeadPos);
}
