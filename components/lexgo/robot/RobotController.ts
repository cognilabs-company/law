import * as THREE from "three";
import gsap from "gsap";
import { RobotBones } from "./RobotBones";
import { RobotStateMachine } from "./RobotStateMachine";
import { RobotPropManager } from "./RobotPropManager";
import {
  fingerBoneName,
  GESTURE_CLIPS,
  GESTURE_FADE_SECONDS,
  GESTURE_HOLD_SECONDS,
  GRIP_POSE,
  IDLE,
  LOOK_CLAMP,
  PEEK,
  POINT,
  ROOT_PLACEMENT,
  THINK_POSE,
  WAVE,
} from "./robot-config";
import { resolveHeadAvoidance, type HeadAvoidCorrection } from "./robotHeadSafety";
import type { GestureName } from "./robot-gestures";
import type { Finger, FingerSegment, Hand, RobotControllerApi, RobotExpression, RobotState } from "./robot-types";

const scratchEuler = new THREE.Euler();
const scratchQuat = new THREE.Quaternion();
const scratchBaseHeadQuat = new THREE.Quaternion();
const scratchSavedHeadQuat = new THREE.Quaternion();
const scratchSavedNeckQuat = new THREE.Quaternion();
const scratchSavedSpine2Quat = new THREE.Quaternion();
const scratchVecA = new THREE.Vector3();
const scratchVecB = new THREE.Vector3();
const deg = THREE.MathUtils.degToRad;

// One controller instance per mounted <LexGoRobot/>. All rotation is a
// delta on top of the rest pose captured by RobotBones (section 13) — never
// an absolute assignment — composed as restQuaternion * Quaternion(deltaEuler).
export class RobotController implements RobotControllerApi {
  private stateMachine = new RobotStateMachine();
  private props: RobotPropManager;
  private disposed = false;

  // Continuous head aim (radians), damped every frame toward whichever
  // target currently has priority: an explicit lookAt() > a peek glance >
  // the pointer > idle wander.
  private headYaw = 0;
  private headPitch = 0;
  private cursorNDC: { x: number; y: number } | null = null;
  private lookAtCursorEnabled = false;
  private explicitLookTarget: THREE.Vector3 | null = null;
  private pointNDC: { x: number; y: number } | null = null;
  private peekHeadOverrideYaw: number | null = null;
  private wanderYawDeg = 0;
  private wanderPitchDeg = 0;
  private nextWanderAt = 0;
  private reducedMotion = false;

  private waveTimeline: gsap.core.Timeline | null = null;
  private rootTimeline: gsap.core.Timeline | null = null;
  private reactionTimeline: gsap.core.Timeline | null = null;
  private pointTimeline: gsap.core.Timeline | null = null;
  private rightArmResetTimeline: gsap.core.Timeline | null = null;
  private greetingTimeline: gsap.core.Timeline | null = null;
  private waveProgress = { shoulder: 0, out: 0, lift: 0, elbow: 0, wristPhase: 0, headCue: 0, edgeReveal: 0 };

  // Baked full-body gesture playback (section: 14 GLB animation clips),
  // layered on top of the procedural system rather than replacing it — see
  // playGesture(). The mixer targets sceneRoot (the actual GLTF scene
  // graph), not `root` (a plain wrapper THREE.Group RobotModel creates for
  // procedural position/rotation offsets) — AnimationClip tracks resolve by
  // node name against whatever object graph the mixer is given, and only
  // sceneRoot's subtree contains the named bones.
  private mixer: THREE.AnimationMixer;
  private clipsByRawName = new Map<string, THREE.AnimationClip>();
  private activeGestureAction: THREE.AnimationAction | null = null;
  private gestureEndTimer: gsap.core.Tween | null = null;
  private gestureResetTween: gsap.core.Tween | null = null;
  private gestureVersion = 0;
  private activeGestureFinishedHandler: ((event: { action: THREE.AnimationAction }) => void) | null = null;
  private expression: RobotExpression = "default";
  private greetingStepActive = false;

  constructor(
    private root: THREE.Object3D,
    private bones: RobotBones,
    sceneRoot: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private onExpressionChange?: (expression: RobotExpression) => void,
  ) {
    this.props = new RobotPropManager(bones);
    this.root.position.x = ROOT_PLACEMENT.restX;
    this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
    this.applyLeftGripPose();
    this.mixer = new THREE.AnimationMixer(sceneRoot);
    for (const clip of clips) this.clipsByRawName.set(clip.name, clip);
  }

  private applyLeftGripPose(): void {
    const shoulder = this.bones.get("leftShoulder");
    const arm = this.bones.get("leftArm");
    const foreArm = this.bones.get("leftForeArm");
    const hand = this.bones.get("leftHand");
    if (shoulder) this.applyDelta(shoulder, 0, 0, deg(GRIP_POSE.shoulderOutDeg));
    if (arm) this.applyDelta(arm, deg(GRIP_POSE.armLiftDeg), 0, deg(GRIP_POSE.armOutDeg));
    if (foreArm) this.applyDelta(foreArm, 0, 0, deg(GRIP_POSE.elbowBendDeg));
    if (hand) this.applyDelta(hand, deg(GRIP_POSE.wristXDeg), deg(GRIP_POSE.wristYDeg), deg(GRIP_POSE.wristZDeg));
    this.setFingerCurl("left", GRIP_POSE.fingerCurl);
  }

  private resetRightArmToRest(duration = 0, onComplete?: () => void): void {
    const rightArmBones = [this.bones.get("rightShoulder"), this.bones.get("rightArm"), this.bones.get("rightForeArm"), this.bones.get("rightHand")].filter(
      Boolean,
    ) as THREE.Bone[];
    this.rightArmResetTimeline?.kill();
    this.rightArmResetTimeline = null;
    if (duration <= 0 || this.reducedMotion) {
      for (const bone of rightArmBones) bone.quaternion.copy(this.bones.restQuaternion(bone));
      this.setFingerCurl("right", 0);
      onComplete?.();
      return;
    }
    const starts = rightArmBones.map((bone) => bone.quaternion.clone());
    const rests = rightArmBones.map((bone) => this.bones.restQuaternion(bone).clone());
    const p = { t: 0 };
    this.rightArmResetTimeline = gsap.timeline({
      onUpdate: () => {
        rightArmBones.forEach((bone, i) => bone.quaternion.copy(starts[i]).slerp(rests[i], p.t));
      },
      onComplete: () => {
        this.rightArmResetTimeline = null;
        this.setFingerCurl("right", 0);
        onComplete?.();
      },
    });
    this.rightArmResetTimeline.to(p, { t: 1, duration, ease: "power2.out" });
  }

  private clearRightArmTimelines(): void {
    this.waveTimeline?.kill();
    this.pointTimeline?.kill();
    this.rightArmResetTimeline?.kill();
    this.setFingerCurl("right", 0);
  }

  private cancelGreetingSequence(): void {
    if (this.greetingStepActive) return;
    this.greetingTimeline?.kill();
    this.greetingTimeline = null;
  }

  private runGreetingStep(action: () => void): void {
    this.greetingStepActive = true;
    try {
      action();
    } finally {
      this.greetingStepActive = false;
    }
  }

  setExpression(expression: RobotExpression): void {
    if (this.expression === expression) return;
    this.expression = expression;
    this.onExpressionChange?.(expression);
  }

  private stopActiveGesture(restore = true): void {
    this.gestureVersion += 1;
    this.gestureEndTimer?.kill();
    this.gestureEndTimer = null;
    this.gestureResetTween?.kill();
    this.gestureResetTween = null;
    if (this.activeGestureFinishedHandler) {
      this.mixer.removeEventListener("finished", this.activeGestureFinishedHandler);
      this.activeGestureFinishedHandler = null;
    }
    this.mixer.stopAllAction();
    this.activeGestureAction = null;
    if (!restore) return;
    this.bones.resetEvery();
    this.root.position.set(ROOT_PLACEMENT.restX, 0, 0);
    this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
    this.applyLeftGripPose();
  }

  private stopBehavior(state: RobotState): void {
    if (state === "GESTURE") {
      this.stopActiveGesture();
      return;
    }
    if (state === "WAVING") this.waveTimeline?.kill();
    if (state === "POINTING") this.pointTimeline?.kill();
    if (state === "PEEKING" || state === "HIDDEN") this.rootTimeline?.kill();
    if (state === "THINKING" || state === "SUCCESS" || state === "ERROR") this.reactionTimeline?.kill();
    this.waveTimeline = null;
    this.pointTimeline = null;
    this.rootTimeline = null;
    this.reactionTimeline = null;
    this.rightArmResetTimeline?.kill();
    this.rightArmResetTimeline = null;
  }

  private beginBehavior(state: RobotState): boolean {
    this.cancelGreetingSequence();
    for (const active of this.stateMachine.activeStates()) {
      if (active === state && state !== "GESTURE") continue;
      this.stopBehavior(active);
      this.stateMachine.exit(active);
    }
    this.rightArmResetTimeline?.kill();
    this.rightArmResetTimeline = null;
    this.resetRightArmToRest();
    if (state !== "PEEKING") this.peekHeadOverrideYaw = null;
    if (state !== "POINTING") this.pointNDC = null;
    if (state !== "HIDDEN") {
      this.root.position.x = ROOT_PLACEMENT.restX;
      this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
    }
    return this.stateMachine.enter(state);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) this.idle();
  }

  setPointerNDC(x: number, y: number): void {
    this.cursorNDC = { x, y };
  }

  // --- per-frame procedural update (called from useFrame) -----------------
  update(dt: number, elapsed: number): void {
    if (this.disposed) return;
    // Always stepped, not just while GESTURE owns the channels — a clip's
    // fade-in/out still needs the mixer advancing during those transitions.
    this.mixer.update(dt);
    this.updateIdleBreathing(elapsed);
    this.updateHead(dt, elapsed);
  }

  private channelFree(channel: "ROOT" | "TORSO" | "HEAD"): boolean {
    // A channel is free for the ambient systems below when no *other*
    // active behavior currently owns it — reuses the state machine's own
    // "can this state enter" check against a state that claims only the
    // channel being asked about.
    return this.stateMachine.canEnter(channel === "HEAD" ? "LOOKING" : "IDLE");
  }

  private updateIdleBreathing(elapsed: number): void {
    if (!this.channelFree("ROOT")) return;
    const spine1 = this.bones.get("spine1");
    if (this.reducedMotion) {
      this.root.position.y = 0;
      if (spine1) spine1.quaternion.copy(this.bones.restQuaternion(spine1));
      return;
    }
    const phase = (elapsed / IDLE.breatheSeconds) * Math.PI * 2;
    this.root.position.y = Math.sin(phase) * IDLE.breatheAmplitude;
    if (spine1) {
      const rest = this.bones.restQuaternion(spine1);
      scratchEuler.set(Math.sin(phase) * deg(1.1), 0, 0);
      scratchQuat.setFromEuler(scratchEuler);
      spine1.quaternion.copy(rest).multiply(scratchQuat);
    }
  }

  private updateHead(dt: number, elapsed: number): void {
    const neck = this.bones.get("neck");
    const head = this.bones.get("head");
    if (!neck || !head) return;
    if (!this.channelFree("HEAD")) return;

    let targetYaw = 0;
    let targetPitch = 0;
    if (this.explicitLookTarget) {
      const aim = this.aimAtWorldPoint(this.explicitLookTarget, head);
      targetYaw = aim.yaw;
      targetPitch = -aim.pitch;
    } else if (this.pointNDC) {
      targetYaw = this.pointNDC.x * deg(LOOK_CLAMP.yawMaxDeg);
      targetPitch = -this.pointNDC.y * deg(LOOK_CLAMP.pitchMaxDeg);
    } else if (this.peekHeadOverrideYaw !== null) {
      targetYaw = this.peekHeadOverrideYaw;
    } else if (this.lookAtCursorEnabled && this.cursorNDC && !this.reducedMotion) {
      targetYaw = this.cursorNDC.x * deg(LOOK_CLAMP.yawMaxDeg);
      targetPitch = -this.cursorNDC.y * deg(LOOK_CLAMP.pitchMaxDeg);
    } else if (!this.reducedMotion) {
      if (elapsed > this.nextWanderAt) {
        this.wanderYawDeg = THREE.MathUtils.randFloatSpread(LOOK_CLAMP.yawMaxDeg * 0.7);
        this.wanderPitchDeg = THREE.MathUtils.randFloatSpread(LOOK_CLAMP.pitchMaxDeg * 0.6);
        this.nextWanderAt = elapsed + THREE.MathUtils.randFloat(IDLE.minGapSeconds, IDLE.maxGapSeconds);
      }
      targetYaw = deg(this.wanderYawDeg);
      targetPitch = deg(this.wanderPitchDeg);
    }

    // WAVING owns the arm and hands, so the head remains available for this
    // tiny social cue. It is intentionally added before damping: the same
    // smoothing as ordinary look-at motion keeps the cue soft when a wave is
    // interrupted by another behavior.
    if (this.stateMachine.get() === "WAVING") {
      targetYaw += deg(WAVE.headTurnDeg) * this.waveProgress.headCue;
      targetPitch += deg(WAVE.headTiltDeg) * this.waveProgress.headCue;
    }

    const yawMax = deg(LOOK_CLAMP.yawMaxDeg);
    const pitchMax = deg(LOOK_CLAMP.pitchMaxDeg);
    targetYaw = THREE.MathUtils.clamp(targetYaw, -yawMax, yawMax);
    targetPitch = THREE.MathUtils.clamp(targetPitch, -pitchMax, pitchMax);

    this.headYaw = THREE.MathUtils.damp(this.headYaw, targetYaw, LOOK_CLAMP.damping, dt);
    this.headPitch = THREE.MathUtils.damp(this.headPitch, targetPitch, LOOK_CLAMP.damping, dt);

    const waveRoll = this.stateMachine.get() === "WAVING" ? deg(1.5) * this.waveProgress.headCue : 0;
    this.applyDelta(head, this.headYaw * 0.62, this.headPitch, waveRoll);
    this.applyDelta(neck, this.headYaw * 0.38, this.headPitch * 0.3, waveRoll * 0.35);
    const spine2 = this.bones.get("spine2");
    if (spine2) {
      const spineYawMax = deg(LOOK_CLAMP.spineYawMaxDeg);
      const spineYaw = THREE.MathUtils.clamp(this.headYaw * 0.15, -spineYawMax, spineYawMax);
      this.applyDelta(spine2, spineYaw, 0, 0);
    }
  }

  // World-space atan2 aim, treated as a local yaw/pitch delta. An
  // approximation (it ignores the character's own world rotation) rather
  // than a real IK solve — acceptable for the small corrective glances
  // lookAt()/pointAt() are used for today; revisit if a future gesture needs
  // to track a target across a wide angular range.
  private aimAtWorldPoint(target: THREE.Vector3, head: THREE.Bone): { yaw: number; pitch: number } {
    const neck = this.bones.get("neck");
    const spine2 = this.bones.get("spine2");
    scratchSavedHeadQuat.copy(head.quaternion);
    if (neck) scratchSavedNeckQuat.copy(neck.quaternion);
    if (spine2) scratchSavedSpine2Quat.copy(spine2.quaternion);
    head.quaternion.copy(this.bones.restQuaternion(head));
    if (neck) neck.quaternion.copy(this.bones.restQuaternion(neck));
    if (spine2) spine2.quaternion.copy(this.bones.restQuaternion(spine2));
    this.root.updateWorldMatrix(true, true);
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(scratchVecA);
    head.getWorldQuaternion(scratchBaseHeadQuat);
    scratchBaseHeadQuat.invert();
    scratchVecB.copy(target).sub(scratchVecA).applyQuaternion(scratchBaseHeadQuat);
    head.quaternion.copy(scratchSavedHeadQuat);
    if (neck) neck.quaternion.copy(scratchSavedNeckQuat);
    if (spine2) spine2.quaternion.copy(scratchSavedSpine2Quat);
    this.root.updateWorldMatrix(true, true);
    const yaw = Math.atan2(scratchVecB.x, scratchVecB.z);
    const horizontal = Math.hypot(scratchVecB.x, scratchVecB.z);
    const pitch = Math.atan2(scratchVecB.y, horizontal);
    return { yaw, pitch };
  }

  private applyDelta(bone: THREE.Bone, x: number, y: number, z: number): void {
    const rest = this.bones.restQuaternion(bone);
    scratchEuler.set(x, y, z);
    scratchQuat.setFromEuler(scratchEuler);
    bone.quaternion.copy(rest).multiply(scratchQuat);
  }

  // --- public behaviors -----------------------------------------------------

  // The universal "return to normal resting behavior" entry point — safe to
  // call from any state, including the architecturally-stubbed ones that
  // have no other natural way back to IDLE (think() in particular).
  idle(): void {
    this.cancelGreetingSequence();
    this.peekHeadOverrideYaw = null;
    this.pointNDC = null;
    this.explicitLookTarget = null;
    for (const active of this.stateMachine.activeStates()) {
      this.stopBehavior(active);
      this.stateMachine.exit(active);
    }
    this.rootTimeline?.kill();
    this.resetRightArmToRest(0.28);
    if (this.reducedMotion) {
      this.root.position.x = ROOT_PLACEMENT.restX;
      this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
      this.setExpression("default");
      return;
    }
    this.rootTimeline = gsap
      .timeline()
      .to(this.root.position, { x: ROOT_PLACEMENT.restX, duration: PEEK.moveSeconds, ease: "power2.inOut" }, 0)
      .to(this.root.rotation, { y: ROOT_PLACEMENT.restRotationY, duration: PEEK.moveSeconds, ease: "power2.inOut" }, 0);
    this.setExpression("default");
  }

  peek(): void {
    if (this.reducedMotion) return;
    if (!this.beginBehavior("PEEKING")) return;
    this.rootTimeline?.kill();
    this.peekHeadOverrideYaw = deg(PEEK.headTurnDeg);
    this.setExpression("curious");
    this.rootTimeline = gsap
      .timeline()
      .to(this.root.position, { x: ROOT_PLACEMENT.restX + ROOT_PLACEMENT.peekOffsetX, duration: PEEK.moveSeconds, ease: "power2.out" }, 0)
      .to(this.root.rotation, { y: ROOT_PLACEMENT.restRotationY + ROOT_PLACEMENT.peekRotationYDelta, duration: PEEK.moveSeconds, ease: "power2.out" }, 0)
      .to({}, { duration: PEEK.holdSeconds })
      .to(this.root.position, { x: ROOT_PLACEMENT.restX, duration: PEEK.moveSeconds, ease: "power2.inOut" }, ">")
      .to(
        this.root.rotation,
        {
          y: ROOT_PLACEMENT.restRotationY,
          duration: PEEK.moveSeconds,
          ease: "power2.inOut",
          onComplete: () => {
            this.peekHeadOverrideYaw = null;
            this.stateMachine.exit("PEEKING");
          },
        },
        "<",
      );
  }

  /**
   * Complete Salom sequence from the reference board:
   * subtle peek → look around → wave from the edge → hide slightly → return.
   */
  greet(target?: THREE.Vector3 | null): void {
    if (this.reducedMotion) return;
    this.cancelGreetingSequence();
    this.pointNDC = null;
    this.explicitLookTarget = null;
    this.peekHeadOverrideYaw = null;
    this.idle();

    const lookTarget = target ?? new THREE.Vector3(0.58, 0.76, 1);
    this.peek();
    this.setExpression("happy");
    this.greetingTimeline = gsap
      .timeline({ onComplete: () => { this.greetingTimeline = null; } })
      .call(() => this.runGreetingStep(() => this.lookAt(lookTarget)), [], 0.75)
      .call(() => this.runGreetingStep(() => this.wave()), [], 2.2)
      .call(() => this.runGreetingStep(() => this.hide()), [], 4.25)
      .call(() => this.runGreetingStep(() => {
        this.lookAt(null);
        this.idle();
      }), [], 5.75);
  }

  hide(): void {
    if (this.reducedMotion) return;
    if (!this.beginBehavior("HIDDEN")) return;
    this.rootTimeline?.kill();
    this.setExpression("default");
    this.rootTimeline = gsap
      .timeline()
      .to(this.root.position, { x: ROOT_PLACEMENT.restX + ROOT_PLACEMENT.hiddenOffsetX, duration: PEEK.moveSeconds * 1.4, ease: "power2.inOut" }, 0)
      .to(this.root.rotation, { y: ROOT_PLACEMENT.restRotationY - 0.08, duration: PEEK.moveSeconds * 1.4, ease: "power2.inOut" }, 0);
  }

  lookAtCursor(enabled: boolean): void {
    this.lookAtCursorEnabled = enabled;
    if (!enabled) this.cursorNDC = null;
  }

  lookAt(target: THREE.Vector3 | null): void {
    this.cancelGreetingSequence();
    this.explicitLookTarget = this.reducedMotion ? null : target?.clone() ?? null;
    if (target) this.pointNDC = null;
  }

  wave(): void {
    if (this.reducedMotion) return;
    if (!this.beginBehavior("WAVING")) return;
    // Peek owns the root channel. End any previous root travel before the
    // greeting takes over, otherwise two timelines fight over x/rotation.
    this.rootTimeline?.kill();
    this.rootTimeline = null;
    this.clearRightArmTimelines();
    this.reactionTimeline?.kill();
    this.reactionTimeline = null;
    this.setExpression("happy");
    const shoulder = this.bones.get("rightShoulder");
    const arm = this.bones.get("rightArm");
    const foreArm = this.bones.get("rightForeArm");
    const hand = this.bones.get("rightHand");
    const head = this.bones.get("head");
    if (!shoulder || !arm || !foreArm || !hand) {
      this.stateMachine.exit("WAVING");
      return;
    }

    const p = this.waveProgress;
    p.shoulder = 0;
    p.out = 0;
    p.lift = 0;
    p.elbow = 0;
    p.wristPhase = 0;
    p.headCue = 0;
    p.edgeReveal = 0;

    // Real collision avoidance, not a warning: measure the hand's actual
    // (post-forward-kinematics) world position against the head ellipsoid
    // every update, and if it intrudes, push the shoulder further out /
    // reduce the lift and re-measure — resolveHeadAvoidance owns the
    // measure/check/nudge loop, this closure just knows WAVE's own bone
    // wiring and axis signs.
    const applyPose = () => {
      this.root.position.x = ROOT_PLACEMENT.restX + WAVE.edgeRevealX * p.edgeReveal;
      const measureHand = (correction: HeadAvoidCorrection) => {
        this.applyDelta(shoulder, 0, 0, deg(WAVE.shoulderOutDeg) * p.shoulder + deg(correction.extraShoulderDeg));
        this.applyDelta(arm, deg(WAVE.armLiftDeg) * p.lift, 0, deg(WAVE.armOutDeg) * p.out);
        this.applyDelta(foreArm, 0, 0, deg(WAVE.elbowBendDeg) * p.elbow);
        this.applyDelta(
          hand,
          deg(WAVE.wristXDeg) * p.elbow,
          deg(WAVE.wristYDeg) * p.elbow,
          (deg(WAVE.wristZDeg) + Math.sin(p.wristPhase) * deg(WAVE.wristWiggleDeg)) * p.elbow,
        );
        hand.updateWorldMatrix(true, false);
        return hand.getWorldPosition(scratchVecA);
      };
      if (head) resolveHeadAvoidance(head, measureHand);
      else measureHand({ extraShoulderDeg: 0, liftMultiplier: 1 });
    };

    // The GLB bind pose keeps the fingers slightly curled. A small negative
    // curl opens them into a readable five-finger greeting silhouette.
    this.curlFingers("right", ["thumb", "index", "middle", "ring", "pinky"], -0.35);
    this.waveTimeline?.kill();
    const t = WAVE.timing;
    this.waveTimeline = gsap
      .timeline({
        onUpdate: applyPose,
        onComplete: () => {
          this.waveTimeline = null;
          this.resetRightArmToRest();
          this.setFingerCurl("right", 0);
          this.stateMachine.exit("WAVING");
        },
      })
      .to(p, { shoulder: -0.15, duration: t.anticipation, ease: "power1.out" })
      .to(p, { edgeReveal: 1, duration: t.anticipation, ease: "power2.out" }, "<")
      .to(p, { shoulder: 1, duration: t.shoulderOut, ease: "back.out(1.4)" })
      .to(p, { out: 1, duration: t.armOut, ease: "power2.out" }, "<0.05")
      .to(p, { lift: 1, duration: t.lift, ease: "power2.out" }, "<0.05")
      .to(p, { elbow: 1, duration: t.elbowBend, ease: "power2.out" }, "<0.1")
      .to(p, { headCue: 1, duration: t.elbowBend, ease: "sine.out" }, "<")
      .to(p, { wristPhase: Math.PI * 2 * WAVE.wiggleCount, duration: t.wiggle, ease: "none" })
      .to(p, { shoulder: 0, out: 0, lift: 0, elbow: 0, wristPhase: 0, duration: t.returnArm, ease: "power2.inOut" })
      .to(p, { headCue: 0, edgeReveal: 0, duration: t.settle, ease: "sine.inOut" });
  }

  // Baked full-body reaction — layered on top of every procedural behavior
  // above, not one of them: the clip drives the entire skeleton at once (see
  // GESTURE's channel claim in robot-types.ts), so every other bone-writing
  // system here is suspended for its duration (enterInterrupting kills
  // whatever else currently owns any of those channels) and the whole
  // skeleton is explicitly restored afterward via endGesture() —
  // RobotBones.resetEvery(), not the narrower ~15-bone resetAll() the rest
  // of this class uses, since a clip also drives legs/spine/fingers nothing
  // procedural ever touches.
  playGesture(name: GestureName): void {
    if (this.reducedMotion) return;
    const clip = this.clipsByRawName.get(GESTURE_CLIPS[name]);
    if (!clip) return;
    if (!this.beginBehavior("GESTURE")) return;
    this.greetingTimeline?.kill();
    this.greetingTimeline = null;
    this.gestureEndTimer?.kill();
    this.gestureEndTimer = null;
    this.gestureResetTween?.kill();
    this.gestureResetTween = null;
    this.peekHeadOverrideYaw = null;
    this.pointNDC = null;
    this.explicitLookTarget = null;
    this.root.position.set(ROOT_PLACEMENT.restX, 0, 0);
    this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
    this.bones.resetEvery();
    this.applyLeftGripPose();
    this.setExpression("default");
    const action = this.mixer.clipAction(clip);
    const version = ++this.gestureVersion;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.fadeIn(0.15);
    action.play();
    this.activeGestureAction = action;

    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== action || this.activeGestureAction !== action || version !== this.gestureVersion) return;
      this.mixer.removeEventListener("finished", onFinished);
      this.activeGestureFinishedHandler = null;
      this.gestureEndTimer = gsap.delayedCall(GESTURE_HOLD_SECONDS, () => this.endGesture(action, version));
    };
    this.activeGestureFinishedHandler = onFinished;
    this.mixer.addEventListener("finished", onFinished);
  }

  private endGesture(action: THREE.AnimationAction, version: number): void {
    if (this.activeGestureAction !== action || version !== this.gestureVersion) return;
    this.gestureEndTimer = null;
    action.fadeOut(GESTURE_FADE_SECONDS);
    this.gestureResetTween = gsap.delayedCall(GESTURE_FADE_SECONDS, () => {
      if (this.activeGestureAction !== action || version !== this.gestureVersion) return;
      action.stop();
      if (this.activeGestureFinishedHandler) {
        this.mixer.removeEventListener("finished", this.activeGestureFinishedHandler);
        this.activeGestureFinishedHandler = null;
      }
      this.bones.resetEvery();
      this.root.position.set(ROOT_PLACEMENT.restX, 0, 0);
      this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
      this.applyLeftGripPose();
      this.activeGestureAction = null;
      this.gestureResetTween = null;
      this.stateMachine.exit("GESTURE");
      this.setExpression("default");
    });
  }

  // --- stubs: typed, callable, architecturally wired; not fully realized ---

  // Head turn (same NDC mapping lookAtCursor() uses) PLUS a real right-arm
  // extension, direction-biased by the target's screen position — not just
  // a head-orientation placeholder any more. No true unprojected 3D ray (the
  // controller has no camera reference) or IK: the arm's reach direction is
  // approximated from the same yaw/pitch the head already turns to, clamped
  // and scaled by POINT's config — precise enough for "the robot gestures
  // toward this general area", not pixel-accurate aim.
  pointAt(target: THREE.Vector3 | HTMLElement | null): void {
    this.cancelGreetingSequence();
    if (this.reducedMotion) {
      if (!target) this.lookAt(null);
      return;
    }
    if (!target) {
      this.pointNDC = null;
      this.lookAt(null);
      this.exitPointing();
      return;
    }
    let ndcX = 0;
    let ndcY = 0;
    if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      this.explicitLookTarget = null;
      ndcX = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
      ndcY = -((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1;
      ndcX = THREE.MathUtils.clamp(ndcX, -1, 1);
      ndcY = THREE.MathUtils.clamp(ndcY, -1, 1);
      this.pointNDC = { x: ndcX, y: ndcY };
    } else {
      this.lookAt(target);
      const head = this.bones.get("head");
      if (head) {
        const aim = this.aimAtWorldPoint(target, head);
        ndcX = THREE.MathUtils.clamp(aim.yaw / deg(LOOK_CLAMP.yawMaxDeg), -1, 1);
        ndcY = THREE.MathUtils.clamp(aim.pitch / deg(LOOK_CLAMP.pitchMaxDeg), -1, 1);
      }
    }
    this.animatePointArm(ndcX, ndcY);
  }

  private exitPointing(): void {
    if (this.stateMachine.get() !== "POINTING") return;
    this.pointTimeline?.kill();
    this.resetRightArmToRest();
    this.stateMachine.exit("POINTING");
  }

  // Re-entrant: calling this again while already POINTING (pointing at a
  // new target) just re-tweens toward the new direction — canEnter() treats
  // "already owned by this same state" as free, same as everywhere else.
  private animatePointArm(ndcX: number, ndcY: number): void {
    if (this.reducedMotion) return;
    if (!this.beginBehavior("POINTING")) return;
    this.clearRightArmTimelines();
    this.setExpression("curious");
    const shoulder = this.bones.get("rightShoulder");
    const arm = this.bones.get("rightArm");
    const foreArm = this.bones.get("rightForeArm");
    const head = this.bones.get("head");
    const hand = this.bones.get("rightHand");
    if (!shoulder || !arm || !foreArm || !hand) {
      this.stateMachine.exit("POINTING");
      return;
    }
    this.pointFinger("right");
    // Cross-body clamp: the head (and, via updateHead()'s existing spine2
    // contribution, a little of the upper torso) already turn toward the
    // FULL ndcX range — POINTING claims RIGHT_ARM + HANDS, not HEAD, so
    // updateHead() keeps running unmodified. The arm itself only follows a
    // narrower range, so a target on the character's far (left) side is
    // communicated mainly by the head/torso turning to face it rather than
    // the arm dragging across the chest to physically reach it.
    const armBiasX = THREE.MathUtils.clamp(ndcX, -POINT.armCrossBodyClampNdc, 1);
    const armOutBase = -deg(POINT.armOutDeg) * armBiasX;
    const armLiftBase = deg(POINT.armLiftBaseDeg + POINT.armLiftRangeDeg * ndcY);
    const p = { progress: 0 };
    const applyPose = () => {
      const measureHand = (correction: HeadAvoidCorrection) => {
        this.applyDelta(shoulder, 0, 0, (deg(POINT.shoulderOutDeg) + deg(correction.extraShoulderDeg)) * p.progress);
        this.applyDelta(arm, armLiftBase * correction.liftMultiplier * p.progress, 0, armOutBase * p.progress);
        this.applyDelta(foreArm, 0, 0, deg(POINT.elbowBendDeg) * p.progress);
        hand.updateWorldMatrix(true, false);
        return hand.getWorldPosition(scratchVecA);
      };
      if (head) resolveHeadAvoidance(head, measureHand);
      else measureHand({ extraShoulderDeg: 0, liftMultiplier: 1 });
    };
    this.pointTimeline?.kill();
    this.pointTimeline = gsap.timeline({ onUpdate: applyPose }).to(p, { progress: 1, duration: POINT.moveSeconds, ease: "power2.out" });
  }

  // A held "considering" cue, own dedicated pose (not wave's end pose reused
  // — that read as "about to wave", not "thinking"): head tilts and settles
  // into a slow sway, right arm bends to bring the hand toward the LOWER
  // side of the face (verified via real forward kinematics through the
  // actual GLB skeleton — see THINK_POSE's comment in robot-config.ts — to
  // land noticeably lower on screen than wave's hand-beside-head height)
  // with relaxed, not gripping, fingers. Runs until idle()/reactSuccess()/
  // reactError() ends it — no natural end of its own.
  think(): void {
    if (this.reducedMotion) return;
    if (!this.beginBehavior("THINKING")) return;
    this.clearRightArmTimelines();
    const head = this.bones.get("head");
    const shoulder = this.bones.get("rightShoulder");
    const arm = this.bones.get("rightArm");
    const foreArm = this.bones.get("rightForeArm");
    const hand = this.bones.get("rightHand");
    this.reactionTimeline?.kill();
    this.setExpression("thinking");
    this.setFingerCurl("right", THINK_POSE.fingerCurl);
    const p = { tilt: 0, armIn: 0, sway: 0 };
    const applyPose = () => {
      if (head) {
        this.applyDelta(
          head,
          deg(THINK_POSE.headTiltXDeg) * p.tilt + deg(THINK_POSE.swayDeg) * Math.sin(p.sway),
          0,
          deg(THINK_POSE.headTiltZDeg) * p.tilt,
        );
      }
      const measureHand = (correction: HeadAvoidCorrection) => {
        if (shoulder) this.applyDelta(shoulder, 0, 0, (deg(THINK_POSE.shoulderOutDeg) + deg(correction.extraShoulderDeg)) * p.armIn);
        if (arm) this.applyDelta(arm, deg(THINK_POSE.armLiftDeg) * correction.liftMultiplier * p.armIn, 0, deg(THINK_POSE.armOutDeg) * p.armIn);
        if (foreArm) this.applyDelta(foreArm, 0, 0, deg(THINK_POSE.elbowBendDeg) * p.armIn);
        if (hand) hand.updateWorldMatrix(true, false);
        return hand ? hand.getWorldPosition(scratchVecA) : scratchVecA;
      };
      if (head && shoulder && arm && foreArm && hand) resolveHeadAvoidance(head, measureHand);
      else measureHand({ extraShoulderDeg: 0, liftMultiplier: 1 });
    };
    this.reactionTimeline = gsap
      .timeline({ onUpdate: applyPose })
      .to(p, { tilt: 1, armIn: 1, duration: THINK_POSE.moveSeconds, ease: "power2.out" })
      .to(p, { sway: Math.PI * 2, duration: THINK_POSE.swaySeconds, ease: "none", repeat: -1 });
  }

  reactSuccess(): void {
    this.playReactionBlip(1);
  }

  reactError(): void {
    this.playReactionBlip(-1);
  }

  reactNotification(): void {
    this.peek();
    this.setExpression("surprised");
  }

  private playReactionBlip(sign: 1 | -1): void {
    const state: RobotState = sign === 1 ? "SUCCESS" : "ERROR";
    if (!this.beginBehavior(state)) return;
    const head = this.bones.get("head");
    if (!head) {
      this.stateMachine.exit(state);
      return;
    }
    const p = { v: 0 };
    this.reactionTimeline?.kill();
    this.reactionTimeline = gsap
      .timeline({
        onUpdate: () => this.applyDelta(head, 0, 0, sign === 1 ? deg(8) * Math.sin(p.v * Math.PI * 2) : deg(10) * Math.sin(p.v * Math.PI * 3)),
        onComplete: () => {
          this.reactionTimeline = null;
          this.stateMachine.exit(state);
          this.setExpression("default");
        },
      })
      .to(p, { v: 1, duration: 0.55, ease: "power1.inOut" });
    this.setExpression(sign === 1 ? "success" : "error");
  }

  holdObject(object: THREE.Object3D, hand: Hand): void {
    this.props.attach(hand, object);
  }

  releaseObject(hand: Hand): void {
    this.props.detach(hand);
  }

  openHand(hand: Hand): void {
    this.setFingerCurl(hand, 0);
  }

  relaxedHand(hand: Hand): void {
    this.setFingerCurl(hand, 0.18);
  }

  pointFinger(hand: Hand): void {
    const curled: Finger[] = ["thumb", "middle", "ring", "pinky"];
    this.curlFingers(hand, curled, 0.6);
    this.curlFingers(hand, ["index"], 0);
  }

  gripObject(hand: Hand): void {
    this.setFingerCurl(hand, 0.55);
  }

  private setFingerCurl(hand: Hand, amount: number): void {
    this.curlFingers(hand, ["thumb", "index", "middle", "ring", "pinky"], amount);
  }

  private curlFingers(hand: Hand, fingers: Finger[], amount: number): void {
    const curl = deg(amount * 40) * (hand === "left" ? -1 : 1);
    const segments: FingerSegment[] = [1, 2, 3, 4];
    const weights = [1, 0.88, 0.7, 0.45];
    for (const finger of fingers) {
      for (const [index, segment] of segments.entries()) {
        const bone = this.bones.getByRawName(fingerBoneName(hand, finger, segment));
        if (!bone) continue;
        this.applyDelta(bone, 0, 0, curl * weights[index]);
      }
    }
  }

  getState(): RobotState {
    return this.stateMachine.get();
  }

  dispose(): void {
    this.disposed = true;
    this.waveTimeline?.kill();
    this.rootTimeline?.kill();
    this.reactionTimeline?.kill();
    this.pointTimeline?.kill();
    this.rightArmResetTimeline?.kill();
    this.greetingTimeline?.kill();
    this.greetingTimeline = null;
    this.greetingStepActive = false;
    this.gestureEndTimer?.kill();
    this.gestureResetTween?.kill();
    this.stopActiveGesture(false);
    this.mixer.stopAllAction();
    this.bones.resetEvery();
    this.applyLeftGripPose();
    this.root.position.set(ROOT_PLACEMENT.restX, 0, 0);
    this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
    this.props.detachAll();
  }
}
