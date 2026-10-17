import type { StudioCreationJourney } from "@/lib/services/studio";

const has = (raw: Record<string, unknown>, ...keys: string[]): boolean => keys.some((k) => Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined);

export function mergeJourney(prev: StudioCreationJourney | null, next: StudioCreationJourney): StudioCreationJourney {
  if (!prev) return next;
  const r = next.raw;
  return {
    id: next.id || prev.id,
    type: has(r, "journey_type", "type") ? next.type : prev.type,
    title: next.title || prev.title,
    status: next.status || prev.status,
    progress: next.progress ?? prev.progress,
    completedCount: has(r, "completed_count", "completed_steps") ? next.completedCount : prev.completedCount,
    totalCount: next.totalCount ?? prev.totalCount,
    currentStep: has(r, "current_step") ? next.currentStep : prev.currentStep,
    completedSteps: has(r, "completed_steps") ? next.completedSteps : prev.completedSteps,
    missingSteps: has(r, "missing_steps") ? next.missingSteps : prev.missingSteps,
    context: has(r, "context") ? next.context : prev.context,
    resumeUrl: next.resumeUrl || prev.resumeUrl,
    createdAt: next.createdAt || prev.createdAt,
    updatedAt: next.updatedAt || prev.updatedAt,
    raw: { ...prev.raw, ...next.raw },
  };
}

export function isOlderJourney(next: Pick<StudioCreationJourney, "updatedAt">, local: Pick<StudioCreationJourney, "updatedAt">): boolean {
  const n = Date.parse(next.updatedAt);
  const l = Date.parse(local.updatedAt);
  return Number.isFinite(n) && Number.isFinite(l) && n < l;
}

export function outlineStateOf(state: string, key: string, errorSteps: ReadonlySet<string>): "error" | "done" | "todo" {
  if (errorSteps.has(key)) return "error";
  return state === "done" ? "done" : "todo";
}

export function stepsKey(j: Pick<StudioCreationJourney, "completedSteps" | "currentStep">): string {
  return JSON.stringify([[...j.completedSteps].sort(), j.currentStep]);
}

export function unionSteps(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of [...a, ...b]) if (k && !out.includes(k)) out.push(k);
  return out;
}

export function journeyPatchFor(j: StudioCreationJourney, step: string, next: string, objectId: string, code: string): { completedSteps: string[]; currentStep: string; context: Record<string, unknown> } {
  return {
    completedSteps: unionSteps(j.completedSteps, [step]),
    currentStep: next,
    context: objectId ? { ...j.context, studio_object_id: objectId, constructor_code: code } : { ...j.context, constructor_code: code },
  };
}

export function laterPatchFor(j: StudioCreationJourney, step: string, objectId: string): { completedSteps: string[]; currentStep: string; context: Record<string, unknown> } {
  return {
    completedSteps: [...j.completedSteps],
    currentStep: step,
    context: objectId ? { ...j.context, studio_object_id: objectId } : { ...j.context },
  };
}

export function isFullJourneyPayload(data: Record<string, unknown>): boolean {
  const full = (d: Record<string, unknown>) => {
    const id = d.id;
    const idOk = (typeof id === "string" && id.trim() !== "") || (typeof id === "number" && Number.isFinite(id));
    return idOk && d.progress_percent !== undefined && d.progress_percent !== null;
  };
  if (full(data)) return true;
  const inner = data.journey;
  return !!inner && typeof inner === "object" && !Array.isArray(inner) && full(inner as Record<string, unknown>);
}
