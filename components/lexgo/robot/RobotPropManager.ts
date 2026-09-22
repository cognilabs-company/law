import * as THREE from "three";
import type { RobotBones } from "./RobotBones";
import type { Hand, HandTransformConfig } from "./robot-types";

const DEFAULT_TRANSFORM: HandTransformConfig = {
  position: [0, 0.06, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

// Bone attachment, not GLB merging (spec #25) — a prop rides along with
// whatever the hand bone does every frame for free, since it becomes a
// child of the bone in the scene graph. No props are implemented by any v1
// behavior; this exists so holdObject()/releaseObject() are real, not
// placeholders, the moment a future feature hands it a mesh.
export class RobotPropManager {
  private attached = new Map<Hand, THREE.Object3D>();

  constructor(private bones: RobotBones) {}

  attach(hand: Hand, object: THREE.Object3D, config: Partial<HandTransformConfig> = {}): boolean {
    const bone = this.bones.get(hand === "left" ? "leftHand" : "rightHand");
    if (!bone) {
      if (process.env.NODE_ENV !== "production") console.warn(`[LexGoRobot] cannot attach prop — ${hand} hand bone missing.`);
      return false;
    }
    this.detach(hand);
    const t = { ...DEFAULT_TRANSFORM, ...config };
    object.position.set(...t.position);
    object.rotation.set(...t.rotation);
    object.scale.set(...t.scale);
    bone.add(object);
    this.attached.set(hand, object);
    return true;
  }

  detach(hand: Hand): void {
    const object = this.attached.get(hand);
    if (!object) return;
    object.parent?.remove(object);
    this.attached.delete(hand);
  }

  detachAll(): void {
    this.detach("left");
    this.detach("right");
  }
}
