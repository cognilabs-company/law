import * as THREE from "three";
import type { RobotRig } from "./RobotRig";
import type { Hand, HandTransformConfig } from "./robot-types";

const DEFAULT_TRANSFORM: HandTransformConfig = {
  position: [0, 0.06, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export class RobotPropManager {
  private attached = new Map<Hand, THREE.Object3D>();

  constructor(private rig: RobotRig) {}

  attach(hand: Hand, object: THREE.Object3D, config: Partial<HandTransformConfig> = {}): boolean {
    const target = hand === "left" ? this.rig.arms.left.hand : this.rig.arms.right.hand;
    this.detach(hand);
    const transform = { ...DEFAULT_TRANSFORM, ...config };
    object.position.set(...transform.position);
    object.rotation.set(...transform.rotation);
    object.scale.set(...transform.scale);
    target.add(object);
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
