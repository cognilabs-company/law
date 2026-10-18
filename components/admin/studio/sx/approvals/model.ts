import { parseServerTime } from "@/lib/http";
import { isApprovalFree, normStudioStep, studioCtorRank, type StudioAccess, type StudioConstructor, type StudioDetail, type StudioGroup, type StudioStatus, type StudioStep } from "@/lib/services/studio";
import { isTestTitle } from "../ctorpage/quiet";
import { normRole, stepPending } from "../editor/model";
import { groupOfCode } from "../home/groupModel";

export type ApprWork = "review" | "publish" | "returned";
export type ApprKind = ApprWork | "done";
export type ApprSection = "mine" | "others" | "done";
export type ApprNeed = "" | ApprWork;
export type ApprNextKind = "you" | "people" | "role" | "author" | "none";
export type ApprNext = { kind: ApprNextKind; names: readonly string[]; role: string };
export type ApprAccess = Pick<StudioAccess, "any" | "isAdmin" | "canEdit" | "canReview" | "canPublish" | "roles">;
export type ApprViewer = { id: string; access: ApprAccess };
export type ApprRegistry = { items: readonly StudioConstructor[]; groups: readonly StudioGroup[] };

export type ApprRow = {
  id: string;
  code: string;
  group: string;
  title: string;
  status: StudioStatus;
  statusRaw: string;
  kind: ApprKind;
  section: ApprSection;
  step: StudioStep | null;
  next: ApprNext;
  by: string;
  at: string;
  since: number;
  version: string;
  overdue: boolean;
  test: boolean;
  rank: number;
  comments: number;
  hasFile: boolean;
  detail: StudioDetail;
};

export const APPR_WORK: readonly ApprWork[] = ["review", "publish", "returned"];
export const REVIEW_STATUSES: ReadonlySet<string> = new Set(["submitted", "in_review"]);

export const LIST_EVENTS: ReadonlySet<string> = new Set([
  "studio.object_submitted",
  "studio.object_reviewed",
  "studio.object_published",
  "studio.object_rollback",
  "studio.object_archived",
  "studio.object_saved",
  "studio.object_created",
  "studio.approval_progress",
  "studio.approval_reassigned",
  "studio.approval_overdue",
  "studio.approval_route_updated",
  "studio.resync",
]);

export const DETAIL_EVENTS: ReadonlySet<string> = new Set([...LIST_EVENTS, "studio.comment_created", "studio.file_uploaded"]);

export const isListEvent = (name: string): boolean => LIST_EVENTS.has(name) || name.startsWith("studio.object_") || name.startsWith("studio.approval_");

const DONE_STEP = /approv|done|complete|pass|skip/;
const BACK_STEP = /change|reject|declin|return|rework/;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const dict = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function personName(v: unknown): string {
  if (typeof v === "string") return v.trim();
  const d = dict(v);
  return text(d.full_name) || text(d.name) || [text(d.first_name), text(d.last_name)].filter(Boolean).join(" ");
}

export function kindOf(status: StudioStatus): ApprKind {
  if (status === "submitted" || status === "in_review") return "review";
  if (status === "approved") return "publish";
  if (status === "changes_requested") return "returned";
  return "done";
}

function stepsOf(d: StudioDetail): StudioStep[] {
  if (d.steps.length) return d.steps;
  const raw = dict(d.raw.current_step);
  return Object.keys(raw).length ? [normStudioStep(raw, 0)] : [];
}

export function currentStepOf(d: StudioDetail): StudioStep | null {
  if (d.status === "changes_requested") return [...stepsOf(d)].reverse().find((s) => BACK_STEP.test(s.status)) ?? null;
  if (!REVIEW_STATUSES.has(d.status)) return null;
  return stepsOf(d).find((s) => !DONE_STEP.test(s.status) && !BACK_STEP.test(s.status)) ?? null;
}

export function canDecideOf(d: StudioDetail, v: ApprViewer): boolean {
  if (!REVIEW_STATUSES.has(d.status)) return false;
  const step = currentStepOf(d);
  if (step && step.canDecide !== null) return step.canDecide;
  if (typeof d.raw.can_decide === "boolean") return d.raw.can_decide;
  if (!v.access.canReview) return false;
  if (v.access.isAdmin) return true;
  if (!step || !step.role) return true;
  return v.access.roles.includes(normRole(step.role));
}

export function canPublishOf(d: StudioDetail, v: ApprViewer, ctor: StudioConstructor | null): boolean {
  return d.status === "approved" && v.access.canPublish && !isApprovalFree(d.code, ctor);
}

export function authorIdsOf(d: StudioDetail): string[] {
  const r = d.raw;
  const cur = dict(r.current_version);
  const ids = [r.owner_user_id, dict(r.created_by).id, r.created_by_user_id, dict(r.submitted_by).id, r.submitted_by_user_id, cur.created_by_user_id].map(text).filter(Boolean);
  return [...new Set(ids)];
}

export function isAuthorOf(d: StudioDetail, viewerId: string): boolean {
  return !!viewerId && authorIdsOf(d).includes(viewerId);
}

export function authorNameOf(d: StudioDetail): string {
  const r = d.raw;
  return text(r.submitted_by_name) || personName(r.submitted_by) || text(r.owner_name) || personName(r.created_by) || d.createdBy;
}

export function sentAtOf(d: StudioDetail): string {
  return text(d.raw.submitted_at) || d.updatedAt || d.createdAt;
}

export function commentsOf(d: StudioDetail): number {
  const r = d.raw;
  for (const v of [r.comments_count, r.comment_count, r.comments_total]) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  return Array.isArray(r.comments) ? r.comments.length : 0;
}

export function sectionOf(d: StudioDetail, kind: ApprKind, v: ApprViewer, ctor: StudioConstructor | null): ApprSection {
  if (kind === "review") return canDecideOf(d, v) ? "mine" : "others";
  if (kind === "publish") return canPublishOf(d, v, ctor) ? "mine" : "others";
  if (kind === "returned") return v.access.canEdit && isAuthorOf(d, v.id) ? "mine" : "others";
  return "done";
}

export function nextOf(d: StudioDetail, kind: ApprKind, section: ApprSection, step: StudioStep | null): ApprNext {
  if (section === "done" || kind === "done") return { kind: "none", names: [], role: "" };
  if (section === "mine") return { kind: "you", names: [], role: "" };
  if (kind === "publish") return { kind: "role", names: [], role: "studio_publisher" };
  if (kind === "returned") {
    const name = authorNameOf(d);
    return { kind: "author", names: name ? [name] : [], role: "" };
  }
  if (step) {
    const decided = new Set(step.approvals.map((a) => a.userId));
    const names = step.approvers.filter((p) => !decided.has(p.id)).map((p) => p.name.trim()).filter(Boolean);
    if (names.length) return { kind: "people", names, role: step.role ? normRole(step.role) : "" };
    if (step.role) return { kind: "role", names: [], role: normRole(step.role) };
  }
  return { kind: "role", names: [], role: "studio_reviewer" };
}

export function buildRow(d: StudioDetail, v: ApprViewer, reg: ApprRegistry): ApprRow {
  const ctor = reg.items.find((c) => c.code === d.code) ?? null;
  const kind = kindOf(d.status);
  const section = sectionOf(d, kind, v, ctor);
  const step = currentStepOf(d);
  const at = kind === "done" ? text(dict(d.raw.published_version).published_at) || text(d.raw.published_at) || sentAtOf(d) : sentAtOf(d);
  const t = parseServerTime(at);
  return {
    id: d.id,
    code: d.code,
    group: groupOfCode(d.code, reg.groups, reg.items),
    title: d.title,
    status: d.status,
    statusRaw: d.statusRaw || d.status,
    kind,
    section,
    step,
    next: nextOf(d, kind, section, step),
    by: authorNameOf(d),
    at,
    since: Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER,
    version: d.currentVersion,
    overdue: !!step && step.overdue && stepPending(step),
    test: isTestTitle(d.title),
    rank: studioCtorRank(d.code),
    comments: commentsOf(d),
    hasFile: d.hasFile,
    detail: d,
  };
}

const WORK_ORDER: Readonly<Record<ApprKind, number>> = { review: 0, publish: 1, returned: 2, done: 3 };

export function compareRows(a: ApprRow, b: ApprRow): number {
  if (a.section === "done" && b.section === "done") return Number(a.test) - Number(b.test) || b.since - a.since || a.title.localeCompare(b.title);
  return WORK_ORDER[a.kind] - WORK_ORDER[b.kind] || Number(a.test) - Number(b.test) || a.rank - b.rank || a.since - b.since || a.title.localeCompare(b.title);
}

export function mergeDetails(...lists: readonly (readonly StudioDetail[])[]): StudioDetail[] {
  const out = new Map<string, StudioDetail>();
  for (const list of lists) for (const d of list) if (d.id && !out.has(d.id)) out.set(d.id, d);
  return [...out.values()];
}
