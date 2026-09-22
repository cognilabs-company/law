import * as THREE from "three";
import gsap from "gsap";
import { RobotBones } from "./RobotBones";
import { RobotStateMachine } from "./RobotStateMachine";
import { RobotPropManager } from "./RobotPropManager";
import { fingerBoneName, GRIP_POSE, IDLE, LOOK_CLAMP, PEEK, POINT, ROOT_PLACEMENT, THINK_POSE, WAVE } from "./robot-config";
import { resolveHeadAvoidance, type HeadAvoidCorrection } from "./robotHeadSafety";
import type { Finger, Hand, RobotControllerApi, RobotState } from "./robot-types";

const scratchEuler = new THREE.Euler();
const scratchQuat = new THREE.Quaternion();
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

  constructor(
    private root: THREE.Object3D,
    private bones: RobotBones,
  ) {
    this.props = new RobotPropManager(bones);
    this.root.position.x = ROOT_PLACEMENT.restX;
    this.root.rotation.y = ROOT_PLACEMENT.restRotationY;
    this.applyLeftGripPose();
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

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  setPointerNDC(x: number, y: number): void {
    this.cursorNDC = { x, y };
  }

  // --- per-frame procedural update (called from useFrame) -----------------
  update(dt: number, elapsed: number): void {
    if (this.disposed) return;
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
      targetPitch = aim.pitch;
    } else if (this.pointNDC) {
      targetYaw = this.pointNDC.x * deg(LOOK_CLAMP.yawMaxDeg);
      targetPitch = this.pointNDC.y * deg(LOOK_CLAMP.pitchMaxDeg);
    } else if (this.peekHeadOverrideYaw !== null) {
      targetYaw = this.peekHeadOverrideYaw;
    } else if (this.lookAtCursorEnabled && this.cursorNDC && !this.reducedMotion) {
      targetYaw = this.cursorNDC.x * deg(LOOK_CLAMP.yawMaxDeg);
      targetPitch = this.cursorNDC.y * deg(LOOK_CLAMP.pitchMaxDeg);
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
    head.getWorldPosition(scratchVecA);
    scratchVecB.copy(target).sub(scratchVecA);
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
    this.greetingTimeline?.kill();
    this.greetingTimeline = null;
    const current = this.stateMachine.get();
    this.peekHeadOverrideYaw = null;
    this.pointNDC = null;
    this.explicitLookTarget = null;
    if (current === "IDLE") return;
    if (current !== "PEEKING" && current !== "HIDDEN") {
      this.reactionTimeline?.kill();
      this.waveTimeline?.kill();
      this.pointTimeline?.kill();
      this.root.position.x = ROOT_PLACEMENT.restX;
      // A killed GSAP tween stops exactly where it was, not at rest — wave/
      // think/point all move the right arm and none of them are guaranteed
      // to run their own return-to-rest tail before this fires (idle() can
      // interrupt mid-gesture). Head needs no equivalent call: updateHead()
      // recomputes it every frame the moment the HEAD channel is free again.
      this.resetRightArmToRest(0.28, () => this.stateMachine.exit(current));
      return;
    }
    this.rootTimeline?.kill();
    this.rootTimeline = gsap
      .timeline({ onComplete: () => this.stateMachine.exit(current) })
      .to(this.root.position, { x: ROOT_PLACEMENT.restX, duration: PEEK.moveSeconds, ease: "power2.inOut" }, 0)
      .to(this.root.rotation, { y: ROOT_PLACEMENT.restRotationY, duration: PEEK.moveSeconds, ease: "power2.inOut" }, 0);
  }

  peek(): void {
    if (!this.stateMachine.enterInterrupting("PEEKING")) return;
    this.rootTimeline?.kill();
    this.peekHeadOverrideYaw = deg(PEEK.headTurnDeg);
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
    this.greetingTimeline?.kill();
    this.greetingTimeline = null;
    this.pointNDC = null;
    this.explicitLookTarget = null;
    this.peekHeadOverrideYaw = null;
    this.idle();

    const lookTarget = target ?? new THREE.Vector3(0.58, 0.76, 1);
    this.peek();
    this.greetingTimeline = gsap
      .timeline({ onComplete: () => { this.greetingTimeline = null; } })
      // Look around while the peek is held.
      .call(() => this.lookAt(lookTarget), [], 0.75)
      // Wave before the peek returns, so the hand stays behind the edge.
      .call(() => this.wave(), [], 1.2)
      // Hide after the wave has settled.
      .call(() => this.hide(), [], 3.85)
      .call(() => {
        this.lookAt(null);
        this.idle();
      }, [], 5.35);
  }

  hide(): void {
    if (!this.stateMachine.enter("HIDDEN")) return;
    this.rootTimeline?.kill();
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
    this.explicitLookTarget = target;
    if (target) this.pointNDC = null;
  }

  wave(): void {
    if (!this.stateMachine.enterInterrupting("WAVING")) return;
    this.clearRightArmTimelines();
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
        this.applyDelta(arm, deg(WAVE.armLiftDeg) * p.lift * correction.liftMultiplier, 0, deg(WAVE.armOutDeg) * p.out);
        this.applyDelta(foreArm, 0, 0, deg(WAVE.elbowBendDeg) * p.elbow);
        this.applyDelta(hand, 0, 0, Math.sin(p.wristPhase) * deg(WAVE.wristWiggleDeg));
        hand.updateWorldMatrix(true, false);
        return hand.getWorldPosition(scratchVecA);
      };
      if (head) resolveHeadAvoidance(head, measureHand);
      else measureHand({ extraShoulderDeg: 0, liftMultiplier: 1 });
    };

    this.relaxedHand("right");
    this.waveTimeline?.kill();
    const t = WAVE.timing;
    this.waveTimeline = gsap
      .timeline({
        onUpdate: applyPose,
        onComplete: () => {
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

  // --- stubs: typed, callable, architecturally wired; not fully realized ---

  // Head turn (same NDC mapping lookAtCursor() uses) PLUS a real right-arm
  // extension, direction-biased by the target's screen position — not just
  // a head-orientation placeholder any more. No true unprojected 3D ray (the
  // controller has no camera reference) or IK: the arm's reach direction is
  // approximated from the same yaw/pitch the head already turns to, clamped
  // and scaled by POINT's config — precise enough for "the robot gestures
  // toward this general area", not pixel-accurate aim.
  pointAt(target: THREE.Vector3 | HTMLElement | null): void {
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
    if (!this.stateMachine.enterInterrupting("POINTING")) return;
    this.clearRightArmTimelines();
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
    if (!this.stateMachine.enterInterrupting("THINKING")) return;
    this.clearRightArmTimelines();
    const head = this.bones.get("head");
    const shoulder = this.bones.get("rightShoulder");
    const arm = this.bones.get("rightArm");
    const foreArm = this.bones.get("rightForeArm");
    const hand = this.bones.get("rightHand");
    this.reactionTimeline?.kill();
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
  }

  private playReactionBlip(sign: 1 | -1): void {
    const state: RobotState = sign === 1 ? "SUCCESS" : "ERROR";
    if (!this.stateMachine.enter(state)) return;
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
        onComplete: () => this.stateMachine.exit(state),
      })
      .to(p, { v: 1, duration: 0.55, ease: "power1.inOut" });
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
    const segments = [1, 2, 3] as const;
    for (const finger of fingers) {
      for (const segment of segments) {
        const bone = this.bones.getByRawName(fingerBoneName(hand, finger, segment));
        if (!bone) continue;
        this.applyDelta(bone, 0, 0, curl);
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
    this.props.detachAll();
  }
}
