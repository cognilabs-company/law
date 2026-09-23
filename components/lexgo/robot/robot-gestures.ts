// Friendly, stable ids for the GLB's 14 baked animation clips — robot-config.ts
// maps each to its raw glTF clip name. Two of the raw clip names in the
// source file are corrupted/truncated text (likely leaked from whatever
// generation tool produced them) rather than real labels; they're kept
// playable under a safe internal id since the underlying keyframe data
// (195 channels, same as every other clip) is still complete and real.
export const GESTURE_NAMES = [
  "slash",
  "box",
  "frustrated",
  "waveGoodbye",
  "pressUp",
  "sit",
  "depressed",
  "liftHeavy",
  "run",
  "swagger",
  "complain",
  "dive",
  "mysteryA",
  "mysteryB",
] as const;

export type GestureName = (typeof GESTURE_NAMES)[number];
