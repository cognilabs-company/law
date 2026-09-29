import * as THREE from "three";
import { RobotPropManager } from "./RobotPropManager";
import type { RobotRig } from "./RobotRig";
import type { GestureName } from "./robot-gestures";
import type { Hand, RobotControllerApi, RobotExpression, RobotState } from "./robot-types";

type ActionName = "peek" | "greet" | "wave" | "point" | "think" | "hide" | "success" | "error" | "gesture";

type Action = {
  name: ActionName;
  elapsed: number;
  duration: number;
  hold: boolean;
  gesture?: GestureName;
};

type Pose = {
  rootX: number;
  rootY: number;
  rootYaw: number;
  torsoPitch: number;
  torsoYaw: number;
  neckYaw: number;
  neckPitch: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  leftShoulder: number;
  rightShoulder: number;
  leftForearm: number;
  rightForearm: number;
  leftHand: number;
  rightHand: number;
  leftFinger: number;
  rightFinger: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  leftFoot: number;
  rightFoot: number;
};

const DEG = Math.PI / 180;
const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();
const scratchWorldPoint = new THREE.Vector3();
const scratchHeadPoint = new THREE.Vector3();
const scratchTargetPoint = new THREE.Vector3();

function createPose(): Pose {
  return {
    rootX: 0,
    rootY: 0,
    rootYaw: 0,
    torsoPitch: 0,
    torsoYaw: 0,
    neckYaw: 0,
    neckPitch: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    leftShoulder: 0,
    rightShoulder: 0,
    leftForearm: 0,
    rightForearm: 0,
    leftHand: 0,
    rightHand: 0,
    leftFinger: 0,
    rightFinger: 0,
    leftHip: 0,
    rightHip: 0,
    leftKnee: 0,
    rightKnee: 0,
    leftFoot: 0,
    rightFoot: 0,
  };
}

function easeInOut(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function actionState(name: ActionName): RobotState {
  if (name === "peek") return "PEEKING";
  if (name === "hide") return "HIDDEN";
  if (name === "wave" || name === "greet") return "WAVING";
  if (name === "point") return "POINTING";
  if (name === "think") return "THINKING";
  if (name === "success") return "SUCCESS";
  if (name === "error") return "ERROR";
  return "GESTURE";
}

export class RobotController implements RobotControllerApi {
  private disposed = false;
  private reducedMotion = false;
  private expression: RobotExpression = "default";
  private state: RobotState = "IDLE";
  private action: Action | null = null;
  private cursorNDC: { x: number; y: number } | null = null;
  private lookAtCursorEnabled = false;
  private explicitLookTarget: THREE.Vector3 | null = null;
  private pointNDC: { x: number; y: number } | null = null;
  private pointWorldTarget: THREE.Vector3 | null = null;
  private wanderYaw = 0;
  private wanderPitch = 0;
  private nextWanderAt = 0;
  private leftFingerCurl = 0.08;
  private rightFingerCurl = 0.08;
  private rest = new Map<THREE.Object3D, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
  private propsManager: RobotPropManager;

  constructor(private rig: RobotRig, private onExpressionChange?: (expression: RobotExpression) => void) {
    this.propsManager = new RobotPropManager(rig);
    this.captureRestPose();
    this.rig.root.position.set(0, 0, 0);
    this.rig.root.rotation.set(0, 0, 0);
  }

  private captureRestPose(): void {
    const nodes = [
      this.rig.root,
      this.rig.pelvis,
      this.rig.torso,
      this.rig.neck,
      this.rig.head,
      this.rig.arms.left.shoulder,
      this.rig.arms.left.forearm,
      this.rig.arms.left.hand,
      this.rig.arms.right.shoulder,
      this.rig.arms.right.forearm,
      this.rig.arms.right.hand,
      this.rig.legs.left.hip,
      this.rig.legs.left.knee,
      this.rig.legs.left.foot,
      this.rig.legs.right.hip,
      this.rig.legs.right.knee,
      this.rig.legs.right.foot,
      ...this.rig.arms.left.fingers,
      ...this.rig.arms.right.fingers,
    ];
    nodes.forEach((node) => this.rest.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone() }));
  }

  private applyExpression(expression: RobotExpression): void {
    if (this.expression === expression) return;
    this.expression = expression;
    this.onExpressionChange?.(expression);
  }

  setExpression(expression: RobotExpression): void {
    this.applyExpression(expression);
  }

  private startAction(name: ActionName, duration: number, hold = false, gesture?: GestureName): void {
    this.action = { name, elapsed: 0, duration, hold, gesture };
    this.state = actionState(name);
  }

  private clearAction(): void {
    this.action = null;
    this.state = "IDLE";
  }

  private stopAction(): void {
    this.clearAction();
    this.pointWorldTarget = null;
    this.pointNDC = null;
    this.explicitLookTarget = null;
    this.leftFingerCurl = 0.08;
    this.rightFingerCurl = 0.08;
  }

  private setNodeRotation(node: THREE.Object3D, x: number, y: number, z: number, amount: number): void {
    const rest = this.rest.get(node);
    if (!rest) return;
    scratchEuler.set(x, y, z);
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchQuaternion.premultiply(rest.quaternion);
    node.quaternion.slerp(scratchQuaternion, amount);
  }

  private setNodePosition(node: THREE.Object3D, x: number, y: number, z: number, amount: number): void {
    const rest = this.rest.get(node);
    if (!rest) return;
    node.position.x = THREE.MathUtils.lerp(node.position.x, rest.position.x + x, amount);
    node.position.y = THREE.MathUtils.lerp(node.position.y, rest.position.y + y, amount);
    node.position.z = THREE.MathUtils.lerp(node.position.z, rest.position.z + z, amount);
  }

  private applyPose(pose: Pose, dt: number): void {
    const amount = 1 - Math.exp(-12 * Math.max(dt, 0.001));
    this.setNodePosition(this.rig.root, pose.rootX, pose.rootY, 0, amount);
    this.setNodeRotation(this.rig.root, 0, pose.rootYaw, 0, amount);
    this.setNodeRotation(this.rig.torso, pose.torsoPitch, pose.torsoYaw, 0, amount);
    this.setNodeRotation(this.rig.neck, pose.neckPitch, pose.neckYaw, 0, amount);
    this.setNodeRotation(this.rig.head, pose.headPitch, pose.headYaw, pose.headRoll, amount);
    this.setNodeRotation(this.rig.arms.left.shoulder, 0, 0, -pose.leftShoulder, amount);
    this.setNodeRotation(this.rig.arms.right.shoulder, 0, 0, pose.rightShoulder, amount);
    this.setNodeRotation(this.rig.arms.left.forearm, 0, 0, -pose.leftForearm, amount);
    this.setNodeRotation(this.rig.arms.right.forearm, 0, 0, pose.rightForearm, amount);
    this.setNodeRotation(this.rig.arms.left.hand, 0, 0, -pose.leftHand, amount);
    this.setNodeRotation(this.rig.arms.right.hand, 0, 0, pose.rightHand, amount);
    this.setNodeRotation(this.rig.legs.left.hip, pose.leftHip, 0, 0, amount);
    this.setNodeRotation(this.rig.legs.right.hip, pose.rightHip, 0, 0, amount);
    this.setNodeRotation(this.rig.legs.left.knee, pose.leftKnee, 0, 0, amount);
    this.setNodeRotation(this.rig.legs.right.knee, pose.rightKnee, 0, 0, amount);
    this.setNodeRotation(this.rig.legs.left.foot, pose.leftFoot, 0, 0, amount);
    this.setNodeRotation(this.rig.legs.right.foot, pose.rightFoot, 0, 0, amount);
    const leftCurl = pose.leftFinger || this.leftFingerCurl;
    const rightCurl = pose.rightFinger || this.rightFingerCurl;
    this.rig.arms.left.fingers.forEach((finger) => this.setNodeRotation(finger, -leftCurl * 0.72, 0, 0, amount));
    this.rig.arms.right.fingers.forEach((finger) => this.setNodeRotation(finger, rightCurl * 0.72, 0, 0, amount));
  }

  private aimAtWorldPoint(target: THREE.Vector3): { yaw: number; pitch: number } {
    scratchTargetPoint.copy(target);
    this.rig.root.worldToLocal(scratchTargetPoint);
    this.rig.head.getWorldPosition(scratchWorldPoint);
    this.rig.root.worldToLocal(scratchHeadPoint.copy(scratchWorldPoint));
    scratchTargetPoint.sub(scratchHeadPoint);
    const yaw = Math.atan2(scratchTargetPoint.x, Math.max(0.05, scratchTargetPoint.z));
    const pitch = Math.atan2(scratchTargetPoint.y, Math.max(0.05, Math.hypot(scratchTargetPoint.x, scratchTargetPoint.z)));
    return { yaw: THREE.MathUtils.clamp(yaw, -24 * DEG, 24 * DEG), pitch: THREE.MathUtils.clamp(pitch, -14 * DEG, 14 * DEG) };
  }

  private getLookTarget(elapsed: number): { yaw: number; pitch: number } {
    if (this.explicitLookTarget) return this.aimAtWorldPoint(this.explicitLookTarget);
    if (this.pointWorldTarget) return this.aimAtWorldPoint(this.pointWorldTarget);
    if (this.pointNDC) return { yaw: this.pointNDC.x * 20 * DEG, pitch: -this.pointNDC.y * 12 * DEG };
    if (this.lookAtCursorEnabled && this.cursorNDC && !this.reducedMotion) return { yaw: this.cursorNDC.x * 20 * DEG, pitch: -this.cursorNDC.y * 12 * DEG };
    if (elapsed >= this.nextWanderAt && !this.reducedMotion) {
      this.wanderYaw = THREE.MathUtils.randFloatSpread(14) * DEG;
      this.wanderPitch = THREE.MathUtils.randFloatSpread(8) * DEG;
      this.nextWanderAt = elapsed + THREE.MathUtils.randFloat(4, 10);
    }
    return { yaw: this.wanderYaw, pitch: this.wanderPitch };
  }

  private applyLook(pose: Pose, elapsed: number): void {
    const target = this.getLookTarget(elapsed);
    pose.headYaw += target.yaw * 0.7;
    pose.neckYaw += target.yaw * 0.3;
    pose.headPitch += target.pitch * 0.72;
    pose.neckPitch += target.pitch * 0.28;
  }

  private applyPointIK(pose: Pose): void {
    const shoulder = this.rig.arms.right.shoulder.position;
    if (this.pointWorldTarget) {
      scratchTargetPoint.copy(this.pointWorldTarget);
      this.rig.root.worldToLocal(scratchTargetPoint);
    } else {
      scratchTargetPoint.set(
        shoulder.x + (this.pointNDC?.x ?? 0) * 0.42,
        shoulder.y + (this.pointNDC?.y ?? 0) * 0.34,
        0.08,
      );
    }
    const upperLength = 0.235;
    const forearmLength = 0.275;
    const dx = scratchTargetPoint.x - shoulder.x;
    const dy = scratchTargetPoint.y - shoulder.y;
    const distance = THREE.MathUtils.clamp(Math.hypot(dx, dy), 0.12, upperLength + forearmLength - 0.015);
    const elbowCos = THREE.MathUtils.clamp((upperLength * upperLength + forearmLength * forearmLength - distance * distance) / (2 * upperLength * forearmLength), -1, 1);
    const elbowAngle = Math.acos(elbowCos);
    const targetAngle = Math.atan2(dy, dx);
    const upperAngle = targetAngle + Math.atan2(forearmLength * Math.sin(elbowAngle), upperLength + forearmLength * Math.cos(elbowAngle));
    const elbowX = shoulder.x + upperLength * Math.cos(upperAngle);
    const elbowY = shoulder.y + upperLength * Math.sin(upperAngle);
    const forearmAngle = Math.atan2(scratchTargetPoint.y - elbowY, scratchTargetPoint.x - elbowX);
    pose.rightShoulder = THREE.MathUtils.clamp(upperAngle + Math.PI / 2, -1.2, 1.35);
    pose.rightForearm = THREE.MathUtils.clamp(forearmAngle - upperAngle, -2.2, 2.2);
    pose.rightHand = THREE.MathUtils.clamp(-pose.rightForearm * 0.12, -0.3, 0.3);
    pose.rightFinger = 0;
  }

  private applyWave(pose: Pose, progress: number): void {
    const pulse = Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI);
    pose.rightShoulder = 1.0 * pulse;
    pose.rightForearm = -0.85 * pulse + Math.sin(progress * Math.PI * 6) * 0.1 * pulse;
    pose.rightHand = Math.sin(progress * Math.PI * 6) * 0.22 * pulse;
    pose.rightFinger = 0.16;
    pose.headRoll += Math.sin(progress * Math.PI) * 0.04;
  }

  private applyGesture(pose: Pose, name: GestureName, progress: number): void {
    const wave = Math.sin(progress * Math.PI);
    const beat = Math.sin(progress * Math.PI * 8);
    if (name === "waveGoodbye") {
      this.applyWave(pose, progress);
      return;
    }
    if (name === "run") {
      pose.rightShoulder = 0.55 + beat * 0.35;
      pose.leftShoulder = 0.55 - beat * 0.35;
      pose.rightForearm = -0.7 + beat * 0.28;
      pose.leftForearm = -0.7 - beat * 0.28;
      pose.rightHip = beat * 0.18;
      pose.leftHip = -beat * 0.18;
      pose.rightKnee = 0.55 + beat * 0.25;
      pose.leftKnee = 0.55 - beat * 0.25;
      return;
    }
    if (name === "pressUp") {
      pose.leftShoulder = 0.9 * wave;
      pose.rightShoulder = 0.9 * wave;
      pose.leftForearm = -0.3 * wave;
      pose.rightForearm = -0.3 * wave;
      pose.leftKnee = 0.35 * wave;
      pose.rightKnee = 0.35 * wave;
      pose.rootY = -0.08 * wave;
      return;
    }
    if (name === "sit") {
      pose.rootY = -0.12 * wave;
      pose.leftHip = -0.35 * wave;
      pose.rightHip = 0.35 * wave;
      pose.leftKnee = 0.9 * wave;
      pose.rightKnee = 0.9 * wave;
      pose.leftShoulder = 0.14 * wave;
      pose.rightShoulder = 0.14 * wave;
      return;
    }
    if (name === "liftHeavy") {
      pose.leftShoulder = 0.55 * wave;
      pose.rightShoulder = 0.55 * wave;
      pose.leftForearm = -1.1 * wave;
      pose.rightForearm = -1.1 * wave;
      pose.torsoPitch = -0.16 * wave;
      pose.rootY = -0.04 * wave;
      return;
    }
    if (name === "swagger") {
      pose.rootYaw = Math.sin(progress * Math.PI * 4) * 0.12 * wave;
      pose.torsoYaw = Math.sin(progress * Math.PI * 2) * 0.12 * wave;
      pose.leftShoulder = 0.24 * wave;
      pose.rightShoulder = -0.24 * wave;
      pose.headRoll = Math.sin(progress * Math.PI * 2) * 0.08 * wave;
      return;
    }
    if (name === "dive") {
      pose.torsoPitch = 0.42 * wave;
      pose.rootY = -0.13 * wave;
      pose.leftShoulder = 0.85 * wave;
      pose.rightShoulder = 0.85 * wave;
      pose.leftForearm = -0.35 * wave;
      pose.rightForearm = -0.35 * wave;
      return;
    }
    if (name === "box") {
      pose.rightShoulder = 0.62 + Math.max(0, beat) * 0.42;
      pose.leftShoulder = 0.62 + Math.max(0, -beat) * 0.42;
      pose.rightForearm = -0.55;
      pose.leftForearm = -0.55;
      pose.rightFinger = 0.48;
      pose.leftFinger = 0.48;
      return;
    }
    if (name === "frustrated" || name === "complain") {
      pose.headRoll = Math.sin(progress * Math.PI * 5) * 0.12 * wave;
      pose.leftShoulder = 0.32 * wave;
      pose.rightShoulder = 0.32 * wave;
      pose.leftForearm = -0.5 * wave;
      pose.rightForearm = -0.5 * wave;
      return;
    }
    if (name === "depressed") {
      pose.headPitch = 0.2 * wave;
      pose.headRoll = -0.08 * wave;
      pose.torsoPitch = 0.18 * wave;
      pose.leftShoulder = 0.16 * wave;
      pose.rightShoulder = 0.16 * wave;
      return;
    }
    pose.leftShoulder = 0.35 * wave;
    pose.rightShoulder = -0.35 * wave;
    pose.leftForearm = -0.55 * wave;
    pose.rightForearm = -0.55 * wave;
    pose.headRoll = Math.sin(progress * Math.PI * 4) * 0.1 * wave;
  }

  private applyAction(pose: Pose, elapsed: number): void {
    const action = this.action;
    if (!action) return;
    const progress = action.duration > 0 ? THREE.MathUtils.clamp(action.elapsed / action.duration, 0, 1) : 1;
    if (action.name === "peek") {
      const travel = Math.sin(progress * Math.PI);
      pose.rootX = -0.055 * travel;
      pose.rootYaw = 0.12 * travel;
      pose.headYaw += 0.2 * travel;
      return;
    }
    if (action.name === "hide") {
      const travel = easeInOut(progress);
      pose.rootX = 0.16 * travel;
      pose.rootYaw = -0.12 * travel;
      return;
    }
    if (action.name === "wave") {
      this.applyWave(pose, progress);
      return;
    }
    if (action.name === "greet") {
      if (progress < 0.25) {
        const phase = easeInOut(progress / 0.25);
        pose.rootX = -0.055 * phase;
        pose.rootYaw = 0.12 * phase;
        pose.headYaw += 0.2 * phase;
      } else if (progress < 0.4) {
        pose.headYaw += 0.2;
      } else if (progress < 0.78) {
        this.applyWave(pose, (progress - 0.4) / 0.38);
      } else if (progress < 0.9) {
        const phase = easeInOut((progress - 0.78) / 0.12);
        pose.rootX = 0.15 * phase;
        pose.rootYaw = -0.1 * phase;
      }
      return;
    }
    if (action.name === "point") {
      this.applyPointIK(pose);
      return;
    }
    if (action.name === "think") {
      pose.rightShoulder = 0.52;
      pose.rightForearm = -1.55;
      pose.rightHand = 0.22;
      pose.rightFinger = 0.18;
      pose.headRoll += -0.1 + Math.sin(elapsed * 2.5) * 0.03;
      pose.headPitch += 0.08;
      return;
    }
    if (action.name === "success") {
      const pulse = Math.sin(progress * Math.PI * 2) * (1 - progress);
      pose.leftShoulder = -0.78 - pulse * 0.2;
      pose.rightShoulder = 0.78 + pulse * 0.2;
      pose.leftForearm = -0.45;
      pose.rightForearm = -0.45;
      pose.leftFinger = 0.25;
      pose.rightFinger = 0.25;
      return;
    }
    if (action.name === "error") {
      pose.headRoll = Math.sin(progress * Math.PI * 4) * 0.12;
      pose.leftShoulder = 0.32;
      pose.rightShoulder = 0.32;
      return;
    }
    if (action.name === "gesture" && action.gesture) this.applyGesture(pose, action.gesture, progress);
  }

  update(dt: number, elapsed: number): void {
    if (this.disposed) return;
    const pose = createPose();
    if (!this.reducedMotion) {
      const breathe = Math.sin(elapsed * Math.PI * 2 / 4.2);
      pose.rootY = breathe * 0.006;
      pose.torsoPitch = breathe * 0.012;
    }
    this.applyLook(pose, elapsed);
    this.applyAction(pose, elapsed);
    this.applyPose(pose, dt);
    if (!this.action) return;
    if (this.action.elapsed < this.action.duration) this.action.elapsed = Math.min(this.action.duration, this.action.elapsed + dt);
    if (this.action.hold || this.action.elapsed < this.action.duration) return;
    const completed = this.action.name;
    this.clearAction();
    if (completed === "greet") this.explicitLookTarget = null;
    if (completed !== "gesture") this.setExpression("default");
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) this.idle();
  }

  setPointerNDC(x: number, y: number): void {
    this.cursorNDC = { x: THREE.MathUtils.clamp(x, -1, 1), y: THREE.MathUtils.clamp(y, -1, 1) };
  }

  idle(): void {
    this.stopAction();
    this.setExpression("default");
  }

  peek(): void {
    if (this.reducedMotion) return;
    this.startAction("peek", 2.2);
    this.setExpression("curious");
  }

  greet(target?: THREE.Vector3 | null): void {
    if (this.reducedMotion) return;
    this.explicitLookTarget = target?.clone() ?? new THREE.Vector3(0.55, 0.75, 1);
    this.startAction("greet", 5.8);
    this.setExpression("happy");
  }

  hide(): void {
    if (this.reducedMotion) return;
    this.startAction("hide", 0.8, true);
    this.setExpression("default");
  }

  lookAtCursor(enabled: boolean): void {
    this.lookAtCursorEnabled = enabled;
    if (!enabled) this.cursorNDC = null;
  }

  lookAt(target: THREE.Vector3 | null): void {
    this.explicitLookTarget = target?.clone() ?? null;
    if (!target && !this.action) this.state = "IDLE";
  }

  pointAt(target: THREE.Vector3 | HTMLElement | null): void {
    if (!target) {
      this.idle();
      return;
    }
    if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      this.pointNDC = {
        x: THREE.MathUtils.clamp(((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1, -1, 1),
        y: THREE.MathUtils.clamp(-((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1, -1, 1),
      };
      this.pointWorldTarget = null;
    } else {
      this.pointNDC = null;
      this.pointWorldTarget = target.clone();
    }
    this.startAction("point", 0.5, true);
    this.setExpression("curious");
  }

  think(): void {
    if (this.reducedMotion) return;
    this.startAction("think", 0.55, true);
    this.setExpression("thinking");
  }

  reactSuccess(): void {
    if (this.reducedMotion) return;
    this.startAction("success", 0.9);
    this.setExpression("success");
  }

  reactError(): void {
    if (this.reducedMotion) return;
    this.startAction("error", 0.9);
    this.setExpression("error");
  }

  reactNotification(): void {
    this.greet();
    this.setExpression("surprised");
  }

  wave(): void {
    if (this.reducedMotion) return;
    this.startAction("wave", 2.8);
    this.setExpression("happy");
  }

  playGesture(name: GestureName): void {
    if (this.reducedMotion) return;
    const duration = name === "run" || name === "pressUp" ? 3.2 : name === "sit" || name === "dive" ? 2.8 : 2.6;
    this.startAction("gesture", duration, false, name);
    this.setExpression(name === "frustrated" || name === "depressed" || name === "complain" ? "error" : "happy");
  }

  holdObject(object: THREE.Object3D, hand: Hand): void {
    this.propsManager.attach(hand, object);
    this.state = "HOLDING";
  }

  releaseObject(hand: Hand): void {
    this.propsManager.detach(hand);
    if (this.state === "HOLDING") this.state = "IDLE";
  }

  openHand(hand: Hand): void {
    if (hand === "left") this.leftFingerCurl = 0;
    else this.rightFingerCurl = 0;
  }

  relaxedHand(hand: Hand): void {
    if (hand === "left") this.leftFingerCurl = 0.08;
    else this.rightFingerCurl = 0.08;
  }

  pointFinger(hand: Hand): void {
    if (hand === "left") this.leftFingerCurl = 0.16;
    else this.rightFingerCurl = 0.16;
  }

  gripObject(hand: Hand): void {
    if (hand === "left") this.leftFingerCurl = 0.58;
    else this.rightFingerCurl = 0.58;
  }

  getState(): RobotState {
    return this.state;
  }

  dispose(): void {
    this.disposed = true;
    this.propsManager.detachAll();
    this.clearAction();
  }
}
