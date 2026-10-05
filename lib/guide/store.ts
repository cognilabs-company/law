import type { GuideState, GuideTour } from "./types";

const IDLE: GuideState = { phase: "idle", tour: null, index: 0, element: null, missing: [], shown: 0 };

let state: GuideState = IDLE;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

export function getGuide(): GuideState {
  return state;
}

export function getIdleGuide(): GuideState {
  return IDLE;
}

export function subscribeGuide(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function patchGuide(next: Partial<GuideState>): void {
  state = { ...state, ...next };
  emit();
}

export function startTour(tour: GuideTour): void {
  if (!tour.navigate && !tour.steps.length) return;
  state = { ...IDLE, tour, phase: tour.navigate ? "navigating" : "locating" };
  emit();
}

export function nextStep(): void {
  if (!state.tour) return;
  if (state.index >= state.tour.steps.length - 1) {
    stopTour();
    return;
  }
  state = { ...state, index: state.index + 1, phase: "locating", element: null };
  emit();
}

export function prevStep(): void {
  if (!state.tour || state.index <= 0) return;
  state = { ...state, index: state.index - 1, phase: "locating", element: null };
  emit();
}

export function stopTour(): void {
  if (state === IDLE) return;
  state = IDLE;
  emit();
}

export function tourActive(): boolean {
  return state.phase !== "idle";
}
