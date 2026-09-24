import * as THREE from "three";
import { BONE_NAMES, fingerBoneName } from "./robot-config";
import type { BoneMap, BoneSnapshot, CanonicalBone, Finger, FingerSegment, Hand } from "./robot-types";

function threeSafeBoneName(rawName: string): string {
  return rawName.replace("mixamorig:", "mixamorig");
}

export class RobotBones {
  private bones: BoneMap = {};
  private byRawName = new Map<string, THREE.Bone>();
  private snapshots = new Map<THREE.Bone, BoneSnapshot>();

  constructor(scene: THREE.Object3D) {
    scene.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        const bone = obj as THREE.Bone;
        this.byRawName.set(bone.name, bone);
        this.snapshots.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() });
      }
    });

    for (const [canonical, rawName] of Object.entries(BONE_NAMES) as [CanonicalBone, string][]) {
      const bone = this.byRawName.get(rawName) ?? this.byRawName.get(threeSafeBoneName(rawName));
      if (bone) {
        this.bones[canonical] = bone;
      } else if (process.env.NODE_ENV !== "production") {
        // Fail gracefully, not silently: a behavior that needs this bone
        // just no-ops (see RobotController), but this is worth knowing.
        console.warn(`[LexGoRobot] expected bone "${rawName}" (${canonical}) not found in the GLB.`);
      }
    }
  }

  get(canonical: CanonicalBone): THREE.Bone | undefined {
    return this.bones[canonical];
  }

  has(canonical: CanonicalBone): boolean {
    return !!this.bones[canonical];
  }

  missingRequired(): string[] {
    const missing: string[] = [];
    for (const [canonical, rawName] of Object.entries(BONE_NAMES) as [CanonicalBone, string][]) {
      if (!this.has(canonical)) missing.push(rawName);
    }
    const hands: Hand[] = ["left", "right"];
    const fingers: Finger[] = ["thumb", "index", "middle", "ring", "pinky"];
    const segments: FingerSegment[] = [1, 2, 3, 4];
    for (const hand of hands) {
      for (const finger of fingers) {
        for (const segment of segments) {
          const rawName = fingerBoneName(hand, finger, segment);
          if (!this.getByRawName(rawName)) missing.push(rawName);
        }
      }
    }
    return missing;
  }

  // Every bone (including fingers, which have no canonical entry) is
  // available by its raw name too — still the single indexed lookup this
  // class exists to own, not a fresh scene.traverse() per caller.
  getByRawName(rawName: string): THREE.Bone | undefined {
    return this.byRawName.get(rawName) ?? this.byRawName.get(threeSafeBoneName(rawName));
  }

  restQuaternion(bone: THREE.Bone): THREE.Quaternion {
    return this.snapshots.get(bone)?.quaternion ?? bone.quaternion;
  }

  restPosition(bone: THREE.Bone): THREE.Vector3 {
    return this.snapshots.get(bone)?.position ?? bone.position;
  }

  // Reset every bone this instance controls back to its rest pose — used
  // when a behavior aborts/unmounts mid-motion so it never leaves a limb
  // stuck off-pose.
  resetAll(): void {
    for (const bone of Object.values(this.bones)) {
      if (!bone) continue;
      const snap = this.snapshots.get(bone);
      if (!snap) continue;
      bone.position.copy(snap.position);
      bone.quaternion.copy(snap.quaternion);
    }
  }

  // Reset the WHOLE skeleton (all 65 bones — legs, spine, fingers, every
  // bone this class saw during traverse(), not just the ~15 canonical ones
  // resetAll() covers) back to rest. Needed after a baked gesture clip ends:
  // AnimationMixer writes every bone it has a track for directly and leaves
  // it wherever the clip's last frame put it once the action's weight drops
  // to 0 — nothing else restores it.
  resetEvery(): void {
    for (const [bone, snap] of this.snapshots) {
      bone.position.copy(snap.position);
      bone.quaternion.copy(snap.quaternion);
    }
  }
}
