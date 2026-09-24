import type { CanonicalBone, Finger, FingerSegment, Hand } from "./robot-types";
import type { GestureName } from "./robot-gestures";

// The ONLY place raw Mixamo joint names appear outside RobotBones.ts itself.
// Verified against the actual GLB's skin.joints (65 bones, standard Mixamo
// naming) — not assumed from the spec's "expected names" list.
export const BONE_NAMES: Record<CanonicalBone, string> = {
  hips: "mixamorig:Hips",
  spine: "mixamorig:Spine",
  spine1: "mixamorig:Spine1",
  spine2: "mixamorig:Spine2",
  neck: "mixamorig:Neck",
  head: "mixamorig:Head",
  headTop: "mixamorig:HeadTop_End",
  leftShoulder: "mixamorig:LeftShoulder",
  leftArm: "mixamorig:LeftArm",
  leftForeArm: "mixamorig:LeftForeArm",
  leftHand: "mixamorig:LeftHand",
  rightShoulder: "mixamorig:RightShoulder",
  rightArm: "mixamorig:RightArm",
  rightForeArm: "mixamorig:RightForeArm",
  rightHand: "mixamorig:RightHand",
};

const FINGER_PREFIX: Record<Finger, string> = {
  thumb: "Thumb",
  index: "Index",
  middle: "Middle",
  ring: "Ring",
  pinky: "Pinky",
};
// e.g. fingerBoneName("right", "index", 1) -> "mixamorig:RightHandIndex1"
export function fingerBoneName(hand: Hand, finger: Finger, segment: FingerSegment): string {
  const side = hand === "left" ? "Left" : "Right";
  return `mixamorig:${side}Hand${FINGER_PREFIX[finger]}${segment}`;
}

export const MODEL_URL = "/models/lexgo-robot.glb";

// Bind-pose facts measured directly off the GLB (JSON chunk, POSITION
// accessor min/max): ~0.63m wide (arms included) x ~0.98m tall x ~0.44m
// deep, Y-up, origin at the feet. The head alone is roughly half the total
// height — camera framing and the safety zone below are sized for that,
// not a normal humanoid's proportions.
export const MODEL_HEIGHT_M = 0.98;

// Camera. A narrow-ish FOV keeps the oversized head from barrel-distorting
// at the edges of frame.
//
// Framed for the WORST-CASE pose across every baked gesture clip, not the
// standing bind pose — a fully-visible widget (see ROOT_PLACEMENT below)
// has to keep the whole body on-frame through sit/dive/press-up/lift_heavy
// etc, several of which drop the hips well below standing-feet height or
// reach well outside the standing silhouette. Verified numerically, not
// eyeballed: a script built the real node/skin hierarchy + all 14
// AnimationClips from the GLB's own accessor data (mirroring what
// GLTFLoader does internally, sanitizeNodeName included — mixamo's
// "mixamorig:" colon otherwise breaks THREE.PropertyBinding's track-name
// parser), sampled 50 poses per clip, and swept a world-space bounding box
// over every bone position (+0.1m flesh padding) — the real per-clip
// envelope this camera is fit to, at MODEL_SCALE 0.7 + restRotationY
// -0.54: x [-0.444, 0.406], y [-0.276, 0.675], z [-0.393, 0.548]. An
// earlier pass here only fit the standing bind pose and cropped the feet
// (target.y too high) and then, separately, half the body during any
// actual gesture (box far too narrow) — this is why both target.y and the
// distance/VIEWPORT_SIZE below now come from the animated envelope, with
// 15% margin, not the standing pose alone.
export const CAMERA = {
  fov: 28,
  position: [0, 0.22, 2.807] as [number, number, number],
  target: [0, 0.2, 0] as [number, number, number],
  near: 0.1,
  far: 10,
};

// Applied once to the root group (RobotModel) alongside the camera pull-back
// above — the two are tuned together, not independently, per the "camera
// and model scale together" brief. Pulled down again from 0.85 — the first
// pass still read as too large/too high on an actual screen.
export const MODEL_SCALE = 0.7;

// Character root placement inside the scene (meters, local to the root
// group RobotModel creates). Now a fully-visible bottom-right corner widget
// (no more "peek out of the edge" — that design, and the half-hidden crop
// it relied on, is gone): restX 0 keeps the character centered in
// .robot-viewport instead of biased toward a clipped right edge.
// VIEWPORT_SIZE below is sized (verified numerically — scripted
// THREE.PerspectiveCamera + Box3 against the real bind-pose bounding box,
// binary-searched for the exact aspect ratio that fits restRotationY's
// turned silhouette edge-to-edge, not eyeballed) so the character's full
// width fits inside the box with ~10% margin at every tier. PEEK/HIDDEN
// still apply their small offsets on top of restX — now read as a
// lean-toward-you / lean-back cue rather than a reveal/hide of a clipped
// edge.
export const ROOT_PLACEMENT = {
  restX: 0,
  peekOffsetX: -0.055,
  hiddenOffsetX: 0.16,
  restRotationY: -0.54,
  peekRotationYDelta: 0.14,
};

// The <canvas> itself renders wider than the visible .robot-viewport window
// (which clips it via overflow:hidden) — a second, independent safeguard on
// top of the conservative framing above: even if a future animation bug
// (or an unanticipated baked gesture clip) swung the character further than
// intended, the extra motion would still land inside this overscanned-but-
// clipped margin instead of the visible area, rather than depending on the
// framing math alone.
export const CANVAS_OVERSCAN_RATIO = 0.4;

// Head safety ellipsoid, in the head bone's local space (meters). Generous
// on purpose — this model's head is unusually large — and only ever used to
// push a procedural hand/arm TARGET outward, never to hide clipping after
// the fact.
export const HEAD_SAFETY_ZONE = {
  radiusX: 0.15,
  radiusY: 0.17,
  radiusZ: 0.16,
};

export const LOOK_CLAMP = {
  yawMaxDeg: 13,
  pitchMaxDeg: 8,
  spineYawMaxDeg: 3,
  damping: 6, // higher = snappier smoothing; see MathUtils.damp usage
};

// Real, active correction (robotHeadSafety.ts's resolveHeadAvoidance), not
// just a dev-console warning: wave/point/think all run their computed hand
// position through this after applying their own pose. marginValue is
// checked against headEllipsoidValue (>1 = outside, 1 = touching), set
// above 1 so a "clear" verdict still keeps a visible gap, not just
// technically-not-touching. iterations lets 2 corrective nudges compound
// (each nudge re-measures) rather than a single one-shot guess.
export const HEAD_AVOID = {
  marginValue: 1.35,
  maxExtraShoulderDeg: 22,
  maxLiftReductionRatio: 0.5,
  iterations: 2,
};

export const WAVE = {
  // Degrees, applied as local-axis deltas on top of each bone's rest quaternion.
  shoulderOutDeg: 34,
  armLiftDeg: -68,
  armOutDeg: -18,
  elbowBendDeg: 62,
  // Base wrist orientation: the exported hand is side-on in the bind pose;
  // rotate the palm toward the viewer before adding the small wave wiggle.
  wristXDeg: -35,
  wristYDeg: 0,
  wristZDeg: -78,
  wristWiggleDeg: 12,
  // A small friendly head cue makes the wave read as an intentional
  // greeting instead of a detached arm animation.
  headTurnDeg: -3.5,
  headTiltDeg: 3.5,
  // No longer pulling the mascot toward a clipped edge (VIEWPORT_SIZE now
  // frames the full body with margin, so there's nothing to reveal).
  edgeRevealX: 0,
  wiggleCount: 3,
  wiggleHz: 2.6,
  // Seconds, per step of the 9-step sequence (section 17).
  timing: {
    anticipation: 0.16,
    shoulderOut: 0.22,
    armOut: 0.22,
    lift: 0.3,
    elbowBend: 0.22,
    wiggle: 0.85,
    returnArm: 0.45,
    settle: 0.18,
  },
};

// point() — right arm (same channels as wave, so the two can never run at
// once), mostly-straight elbow and extended reach rather than wave's sharp
// bend, direction-biased by the target's screen position (see
// RobotController.point): pointing at something above vs. below the robot
// lifts the arm more or less, left vs. right biases armOutDeg's sign. Holds
// until idle()/another RIGHT_ARM behavior takes over — same "no natural
// end" shape as think(). armCrossBodyClampNdc caps how far the ARM alone
// swings toward a target on the character's far (left) side — the head and
// a small spine yaw already turn the FULL range via updateHead()'s existing
// look logic (POINTING only claims RIGHT_ARM+HANDS, HEAD stays free), so a
// far-left target is communicated mostly by the head/torso turning to face
// it, not by dragging the right arm across the chest.
export const POINT = {
  shoulderOutDeg: 18,
  armLiftBaseDeg: 26,
  armLiftRangeDeg: 26,
  armOutDeg: 54,
  elbowBendDeg: 10,
  armCrossBodyClampNdc: 0.28,
  moveSeconds: 0.48,
};

// think() — a dedicated pose on the RIGHT arm (same side as wave/point;
// the left arm's natural hanging bind pose is what "at rest" means for it,
// nothing procedural touches it in v1 — see RobotController's grip-pose
// note for why). Verified against the actual GLB skeleton (real forward
// kinematics through the Hips->Spine->Spine1->Spine2->RightShoulder->
// RightArm->RightForeArm->RightHand chain, using each bone's real local
// translation/rotation from the GLB's own JSON — not eyeballed): at these
// angles the hand lands noticeably lower on screen than wave's own end
// pose (NDC y -0.47 vs wave's -0.40, i.e. down toward chin/jaw height, not
// temple height) while clearing the head ellipsoid with more margin
// (ellipsoidValue ~1.55 vs wave's ~1.25).
export const THINK_POSE = {
  shoulderOutDeg: 16,
  armLiftDeg: 26,
  armOutDeg: 18,
  elbowBendDeg: 104,
  fingerCurl: 0.15,
  headTiltXDeg: 6,
  headTiltZDeg: -4,
  swayDeg: 2,
  swaySeconds: 2.4,
  moveSeconds: 0.45,
};

// Permanent LEFT hand edge grip. This is a local rest-pose delta, applied
// only to left-side bones, so right-arm wave/point/think can run without
// fighting it. Values are intentionally moderate: the hand reads as braced
// against the clipped right edge without forcing the compact rig into a
// broken elbow or wrist angle.
export const GRIP_POSE = {
  shoulderOutDeg: -8,
  armLiftDeg: 18,
  armOutDeg: -24,
  elbowBendDeg: -62,
  wristXDeg: -8,
  wristYDeg: 0,
  wristZDeg: -12,
  fingerCurl: 0.5,
};

export const PEEK = {
  travelX: 0.09,
  headTurnDeg: 9,
  holdSeconds: 1.1,
  moveSeconds: 0.5,
};

export const IDLE = {
  breatheAmplitude: 0.006,
  breatheSeconds: 4.2,
  headDriftDeg: 3.5,
  minGapSeconds: 4,
  maxGapSeconds: 11,
  tiltChance: 0.5,
};

// Four tiers: full / compact (~80% size, 1024-1279) / mini (mostly-head
// sliver, 901-1023) / hidden. The hidden cutoff reuses this app's own
// portal-shell mobile breakpoint (app/globals.css, .portal / .psb rules,
// 900px) rather than inventing an unrelated one.
export const BREAKPOINTS = {
  fullMinWidth: 1280,
  compactMinWidth: 1024,
  hiddenMaxWidth: 900,
};

// What .robot-viewport measures — a portrait box, not a landscape one.
// Sized (same script as CAMERA above, iteratively searched against the real
// per-corner projection rather than a flat-distance approximation — the
// swept envelope is 0.94m deep, so near/far corners magnify differently and
// a naive formula undershoots) so the worst-case pose across all 14 gesture
// clips stays within the central 85% of frame both horizontally and
// vertically. Ratio (~0.89) held constant across full/compact/mini.
export const VIEWPORT_SIZE = {
  full: { width: 196, height: 220 },
  compact: { width: 156, height: 176 },
  mini: { width: 107, height: 120 },
};

// Friendly-id -> raw glTF clip name, for the 14 baked full-body animations
// shipped in the GLB (see robot-gestures.ts for the id union). Two raw
// names are corrupted/truncated text rather than real labels — see that
// file's comment; the clip data itself is still real and playable.
export const GESTURE_CLIPS: Record<GestureName, string> = {
  slash: "slash.001",
  box: "box_02.001",
  frustrated: "frustrated_01.001",
  waveGoodbye: "wave_goodbye_01.001",
  pressUp: "press-up.001",
  sit: "sit.001",
  depressed: "depressed.001",
  liftHeavy: "lift_heavy.001",
  run: "run.001",
  swagger: "swagger.001",
  complain: "complain_02.001",
  dive: "dive.001",
  mysteryA: "I need you to rebuild the LexGo robot interaction so it matches",
  mysteryB: "Создай дружелюбную короткую анима",
};

// Seconds to hold on the clip's final (clamped) frame before fading back to
// the procedural rest pose — long enough to read as a deliberate pose, not
// a hiccup.
export const GESTURE_HOLD_SECONDS = 0.4;
export const GESTURE_FADE_SECONDS = 0.25;

export const RANDOM_GESTURE_INTERVAL_MS = 30_000;

// Comfortably above ordinary static page content, well below every real
// overlay in this app (nav 90, modals 120-270 — see app/globals.css).
export const Z_INDEX = 10;

// On in dev for now so behaviors are clickable/testable (LexGoRobot.tsx's
// click-to-cycle harness) and the head-safety-zone wireframe is visible —
// flip back to `&& false` once the poses are visually confirmed.
export const DEBUG_ROBOT = process.env.NODE_ENV !== "production";
