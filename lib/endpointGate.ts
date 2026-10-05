import { isRouteMissing } from "./http";

export type GatedFeature = "instructor" | "marketAiSearch" | "support" | "supportQueue" | "orgOwner";

const missing = new Set<GatedFeature>();
const listeners = new Set<() => void>();

export function featureMissing(key: GatedFeature): boolean {
  return missing.has(key);
}

export function noteFeatureError(key: GatedFeature, e: unknown): boolean {
  if (!isRouteMissing(e)) return false;
  if (!missing.has(key)) {
    missing.add(key);
    listeners.forEach((fn) => fn());
  }
  return true;
}

export function subscribeFeatureGate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
