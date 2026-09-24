import type { RobotEventName, RobotEventPayload } from "./robot-types";

type Listener = (payload?: RobotEventPayload) => void;

// Section 28's decoupled trigger path: any file in the app can do
// `RobotEvents.emit("wave")` without importing React, the controller, or
// touching PortalShell — useful from business logic far from the component
// tree (e.g. a data hook reacting to a new notification). RobotModel
// subscribes these to the live RobotController once the model has loaded;
// events fired before that (or while the robot is unmounted, e.g. on a
// fullscreen route) are simply dropped, not queued — none of the v1
// behaviors are the kind that must not be missed.
class RobotEventBus {
  private listeners = new Map<RobotEventName, Set<Listener>>();

  on(event: RobotEventName, fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(event: RobotEventName, payload?: RobotEventPayload): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
}

export const RobotEvents = new RobotEventBus();
