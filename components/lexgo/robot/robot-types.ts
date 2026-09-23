import type * as THREE from "three";
import type { GestureName } from "./robot-gestures";

// Canonical bone names this system knows how to drive. Real Mixamo strings
// live only in robot-config.ts's BONE_NAMES map + finger-bone builder — every
// other file asks RobotBones for one of these instead of a raw "mixamorig:…"
// string, so a future re-rig only touches one map.
export type CanonicalBone =
  | "hips"
  | "spine"
  | "spine1"
  | "spine2"
  | "neck"
  | "head"
  | "headTop"
  | "leftShoulder"
  | "leftArm"
  | "leftForeArm"
  | "leftHand"
  | "rightShoulder"
  | "rightArm"
  | "rightForeArm"
  | "rightHand";

export type Hand = "left" | "right";
export type Finger = "thumb" | "index" | "middle" | "ring" | "pinky";
// Mixamo hand rigs commonly export 4 segments per finger (3 phalanges + a
// tip); this model's 65-joint skin does too (verified against the GLB).
export type FingerSegment = 1 | 2 | 3 | 4;

export type BoneMap = Partial<Record<CanonicalBone, THREE.Bone>>;

// A bone's rest-pose transform, captured once when the model loads. Every
// procedural behavior composes a rotation delta on top of this snapshot
// instead of assuming any bone starts at identity — the exported rig's bind
// pose is not identity (e.g. Hips carries a baked ~-90° Y rotation).
export type BoneSnapshot = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

// Bone-ownership groups used by the state machine so two behaviors can never
// fight over the same joints in the same frame.
export type Channel = "HEAD" | "TORSO" | "LEFT_ARM" | "RIGHT_ARM" | "HANDS" | "ROOT";

export type RobotState =
  | "IDLE"
  | "PEEKING"
  | "HIDDEN"
  | "LOOKING"
  | "WAVING"
  | "POINTING"
  | "THINKING"
  | "HOLDING"
  | "SUCCESS"
  | "ERROR"
  | "GESTURE";

// Which channels a state claims exclusively while it runs. A behavior on a
// channel already claimed by an incompatible state is deferred (queued) or
// dropped — see RobotStateMachine's compatibility table. GESTURE (a baked
// full-body animation clip) claims every channel that exists: the clip
// drives the whole skeleton at once, so nothing procedural (breathing,
// look-at-cursor, wave/point/think) may touch a bone while one plays.
export const STATE_CHANNELS: Record<RobotState, Channel[]> = {
  IDLE: ["ROOT", "TORSO"],
  PEEKING: ["ROOT"],
  HIDDEN: ["ROOT"],
  LOOKING: ["HEAD"],
  WAVING: ["RIGHT_ARM", "HANDS"],
  POINTING: ["RIGHT_ARM", "HANDS"],
  THINKING: ["HEAD", "RIGHT_ARM", "HANDS"],
  HOLDING: ["HANDS"],
  SUCCESS: ["HEAD", "TORSO"],
  ERROR: ["HEAD", "TORSO"],
  GESTURE: ["ROOT", "TORSO", "HEAD", "LEFT_ARM", "RIGHT_ARM", "HANDS"],
};

export type HandTransformConfig = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type RobotEventName =
  | "idle"
  | "greet"
  | "peek"
  | "hide"
  | "wave"
  | "think"
  | "reactSuccess"
  | "reactError"
  | "reactNotification";

// The subset of RobotController fully implemented today — see section 11 of
// the spec this was built from. Everything else on the controller is a typed
// stub (present, callable, intentionally a no-op) so call sites can be
// written now without waiting on a future model/animation pass.
export interface RobotControllerApi {
  idle(): void;
  greet(target?: THREE.Vector3 | null): void;
  peek(): void;
  hide(): void;
  wave(): void;
  lookAtCursor(enabled: boolean): void;
  lookAt(target: THREE.Vector3 | null): void;
  pointAt(target: THREE.Vector3 | HTMLElement | null): void;
  think(): void;
  reactSuccess(): void;
  reactError(): void;
  reactNotification(): void;
  playGesture(name: GestureName): void;
  holdObject(object: THREE.Object3D, hand: Hand): void;
  releaseObject(hand: Hand): void;
  openHand(hand: Hand): void;
  relaxedHand(hand: Hand): void;
  pointFinger(hand: Hand): void;
  gripObject(hand: Hand): void;
  getState(): RobotState;
  dispose(): void;
}
