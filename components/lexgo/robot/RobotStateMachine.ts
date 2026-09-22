import { STATE_CHANNELS } from "./robot-types";
import type { Channel, RobotState } from "./robot-types";

// Per-channel exclusive ownership, not one global exclusive state. IDLE
// (ROOT + TORSO) is the default resting owner of every channel and yields to
// anything; a behavior claims only the channels it lists in STATE_CHANNELS,
// so e.g. LOOKING (HEAD only) and IDLE's own torso breathing run at the same
// time, while WAVING and POINTING — both RIGHT_ARM + HANDS — cannot.
export class RobotStateMachine {
  private ownerByChannel = new Map<Channel, RobotState>();
  private headline: RobotState = "IDLE";
  private listeners = new Set<(state: RobotState) => void>();

  constructor() {
    for (const ch of STATE_CHANNELS.IDLE) this.ownerByChannel.set(ch, "IDLE");
  }

  canEnter(state: RobotState): boolean {
    return STATE_CHANNELS[state].every((ch) => {
      const owner = this.ownerByChannel.get(ch);
      return !owner || owner === "IDLE" || owner === state;
    });
  }

  enter(state: RobotState): boolean {
    if (!this.canEnter(state)) return false;
    for (const ch of STATE_CHANNELS[state]) this.ownerByChannel.set(ch, state);
    if (state !== "IDLE") this.headline = state;
    this.notify();
    return true;
  }

  enterInterrupting(state: RobotState): boolean {
    for (const ch of STATE_CHANNELS[state]) {
      const owner = this.ownerByChannel.get(ch);
      if (owner && owner !== "IDLE" && owner !== state) this.exit(owner);
    }
    return this.enter(state);
  }

  // Hands the state's channels back to IDLE. Call when a behavior's
  // timeline finishes or is aborted — never leave a channel claimed forever.
  exit(state: RobotState): void {
    for (const ch of STATE_CHANNELS[state]) {
      if (this.ownerByChannel.get(ch) === state) this.ownerByChannel.set(ch, "IDLE");
    }
    if (this.headline === state) {
      const stillHeld = [...this.ownerByChannel.values()].find((s) => s !== "IDLE");
      this.headline = stillHeld ?? "IDLE";
    }
    this.notify();
  }

  get(): RobotState {
    return this.headline;
  }

  onChange(fn: (state: RobotState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.headline);
  }
}
