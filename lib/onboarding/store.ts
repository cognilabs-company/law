// A one-value external store, same shape as lib/guide/store.ts so the host can
// read it through useSyncExternalStore without a provider. The onboarding runs
// at most once per user, so there is nothing else to keep here.

export type OnboardingState = { running: boolean; index: number };

const IDLE: OnboardingState = { running: false, index: 0 };

let state: OnboardingState = IDLE;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((fn) => fn());

export function getOnboarding(): OnboardingState {
  return state;
}

/** Server snapshot: the tour never runs during SSR, so idle is correct. */
export function getIdleOnboarding(): OnboardingState {
  return IDLE;
}

export function subscribeOnboarding(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function startOnboarding(): void {
  if (state.running) return;
  state = { running: true, index: 0 };
  emit();
}

export function stopOnboarding(): void {
  if (state === IDLE) return;
  state = IDLE;
  emit();
}

export function goToStep(index: number): void {
  if (!state.running || index === state.index) return;
  state = { ...state, index };
  emit();
}

export function onboardingRunning(): boolean {
  return state.running;
}
