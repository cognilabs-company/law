import { isApprovalFree, type StudioAccess, type StudioConstructor, type StudioDetail, type StudioStatus, type StudioStep, type StudioVersion } from "@/lib/services/studio";
import { parseServerTime } from "@/lib/http";

export const QUEUE_STATUSES: StudioStatus[] = ["submitted", "in_review", "approved", "changes_requested"];
export const REVIEWABLE: StudioStatus[] = ["submitted", "in_review"];

export const LIST_EVENTS = new Set([
  "studio.object_submitted",
  "studio.object_reviewed",
  "studio.object_published",
  "studio.object_rollback",
  "studio.object_archived",
  "studio.object_saved",
  "studio.approval_route_updated",
  "studio.resync",
]);

export const DETAIL_EVENTS = new Set([...LIST_EVENTS, "studio.comment_created", "studio.file_uploaded"]);

const DONE = new Set(["approved", "approve", "done", "completed", "passed", "skipped"]);
const BACK = new Set(["changes_requested", "rejected", "reject", "declined", "returned"]);
const ROLE_ALIAS: Record<string, string> = {
  reviewer: "studio_reviewer",
  publisher: "studio_publisher",
  editor: "studio_editor",
};

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

function person(v: unknown): string {
  const s = text(v);
  if (s) return s;
  if (!v || typeof v !== "object") return "";
  const d = v as Record<string, unknown>;
  const full = [text(d.first_name), text(d.last_name)].filter(Boolean).join(" ");
  return text(d.full_name) || text(d.name) || full || text(d.phone) || text(d.email);
}
export function normRole(r: string): string {
  const k = r.trim().toLowerCase();
  return ROLE_ALIAS[k] ?? k;
}

export function currentVersionOf(d: StudioDetail): StudioVersion | null {
  return d.versions.find((v) => v.id === d.currentVersionId) ?? d.versions[0] ?? null;
}

export function versionLabelOf(d: StudioDetail): string {
  return d.currentVersion || currentVersionOf(d)?.version || "";
}

export function submittedOf(d: StudioDetail): { by: string; at: string } {
  const r = d.raw;
  const cur = currentVersionOf(d);
  const by = text(r.submitted_by_name) || person(r.submitted_by) || cur?.createdBy || d.createdBy;
  const at = text(r.submitted_at) || cur?.createdAt || d.updatedAt || d.createdAt;
  return { by, at };
}

export function waitingSince(d: StudioDetail): number {
  const t = parseServerTime(submittedOf(d).at);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

export function commentsCountOf(d: StudioDetail): number | null {
  const r = d.raw;
  for (const v of [r.comments_count, r.comment_count, r.comments_total]) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  if (Array.isArray(r.comments)) return r.comments.length;
  return null;
}

export type StepAt = { index: number; total: number; step: StudioStep; back: boolean };

export function currentStepOf(d: StudioDetail): StepAt | null {
  const steps = d.steps;
  if (!steps.length) return null;
  const backAt = steps.findIndex((s) => BACK.has(s.status));
  if (d.status === "changes_requested" && backAt >= 0) return { index: backAt, total: steps.length, step: steps[backAt], back: true };
  const at = steps.findIndex((s) => !DONE.has(s.status));
  if (at < 0) return null;
  return { index: at, total: steps.length, step: steps[at], back: false };
}

export function stepDone(s: StudioStep): boolean {
  return DONE.has(s.status);
}

export function stepBack(s: StudioStep): boolean {
  return BACK.has(s.status);
}

export function isReviewable(d: StudioDetail): boolean {
  return REVIEWABLE.includes(d.status);
}

export function canActOnStep(d: StudioDetail, acc: StudioAccess): boolean {
  if (!acc.canReview || !isReviewable(d)) return false;
  if (acc.isAdmin) return true;
  const at = currentStepOf(d);
  if (!at || !at.step.role) return true;
  return acc.roles.includes(normRole(at.step.role));
}

export function canPublishItem(d: StudioDetail, acc: StudioAccess, ctor: StudioConstructor | null): boolean {
  return d.status === "approved" && acc.canPublish && !isApprovalFree(d.code, ctor);
}

export function isMine(d: StudioDetail, acc: StudioAccess, ctor: StudioConstructor | null): boolean {
  return canActOnStep(d, acc) || canPublishItem(d, acc, ctor);
}

export function mergeDetail(base: StudioDetail, fresh: StudioDetail | null): StudioDetail {
  if (!fresh || !fresh.id) return base;
  return {
    ...base,
    ...fresh,
    title: fresh.title || base.title,
    code: fresh.code || base.code,
    currentVersion: fresh.currentVersion || base.currentVersion,
    currentVersionId: fresh.currentVersionId || base.currentVersionId,
    createdBy: fresh.createdBy || base.createdBy,
    payload: Object.keys(fresh.payload).length ? fresh.payload : base.payload,
    versions: fresh.versions.length ? fresh.versions : base.versions,
    steps: fresh.steps.length ? fresh.steps : base.steps,
    hasFile: fresh.hasFile || base.hasFile,
    raw: { ...base.raw, ...fresh.raw },
  };
}
