// TSK-493303 / TSK-100467 — a seller's achievements, kept apart from their
// experience (contract 2026-10-27 §17): court results and much more —
// awards, certificates, research, mediation, pro bono… Each change is a new
// revision the call center verifies; only approved ones reach the public
// profile and the rating, and evidence never goes public.
import { ApiError, asArr, asDict, asStr, http, httpBlob, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { checkItemsOf, diffRowsOf, reviewRoomOf, reviewSellerOf, type CheckItem, type CheckRows, type DiffRow, type ExperienceEvidence, type ExperienceReviewEntry, type ReviewDecision, type ReviewRoom, type ReviewSeller } from "./experience";

export const ACHIEVEMENT_TYPES = [
  "court_dispute_result",
  "pretrial_resolution",
  "mediation_settlement",
  "corporate_transaction",
  "tax_customs",
  "intellectual_property",
  "state_body_appeal",
  "labor_hr",
  "compliance_audit",
  "publication_research",
  "qualification_certification",
  "award_recognition",
  "pro_bono",
  "other",
] as const;
export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];
export const isAchievementType = (v: string): v is AchievementType => (ACHIEVEMENT_TYPES as readonly string[]).includes(v);

export type AchievementStatus = "pending_review" | "approved" | "rejected" | "changes_requested" | "cancelled" | "other";
export type Achievement = {
  id: string;
  rootId: string;
  sourceId: string;
  version: number | null;
  status: AchievementStatus;
  type: AchievementType;
  title: string;
  categoryId: string;
  achievedAt: string;
  description: string;
  evidence: ExperienceEvidence[];
  reason: string;
  submittedAt: string;
};
export type AchievementGroup = { rootId: string; current: Achievement | null; pending: Achievement | null; latest: Achievement | null; revisionCount: number };

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
function statusOf(v: unknown): AchievementStatus {
  const s = asStr(v).toLowerCase();
  if (s === "pending" || s === "pending_review") return "pending_review";
  if (s === "approved" || s === "rejected" || s === "changes_requested" || s === "cancelled") return s;
  return "other";
}
function evidenceOf(v: unknown): ExperienceEvidence {
  const d = asDict(v);
  const id = asStr(d.id ?? d.evidence_id);
  return { id, fileName: asStr(d.file_name ?? d.name), mimeType: asStr(d.mime_type), size: num(d.size), downloadUrl: asStr(d.download_url) };
}
export function achievementOf(v: unknown): Achievement | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  const type = asStr(d.achievement_type ?? d.type);
  return {
    id,
    rootId: asStr(d.root_id) || id,
    sourceId: asStr(d.source_id),
    version: num(d.version),
    status: statusOf(d.status),
    type: isAchievementType(type) ? type : "other",
    title: asStr(d.title),
    categoryId: asStr(d.category_id),
    achievedAt: asStr(d.achieved_at),
    description: asStr(d.description),
    evidence: asArr(d.evidence ?? d.evidence_files).map(evidenceOf).filter((e) => e.id),
    reason: asStr(d.rejection_reason ?? d.reason ?? d.review_reason),
    submittedAt: asStr(d.submitted_at ?? d.created_at),
  };
}
const list = (v: unknown) => asArr(v).map(achievementOf).filter((x): x is Achievement => !!x);
const byVersion = (a: Achievement, b: Achievement) => (a.version ?? 0) - (b.version ?? 0) || a.submittedAt.localeCompare(b.submittedAt);

// The backend's groups when it sends them, else grouped by root_id here.
export function achievementGroupsOf(raw: unknown): AchievementGroup[] {
  const d = asDict(raw);
  const groups = asArr(d.groups);
  if (groups.length) {
    return groups.map((g) => {
      const x = asDict(g);
      const latest = achievementOf(x.latest);
      return { rootId: asStr(x.root_id) || latest?.rootId || "", current: achievementOf(x.current), pending: achievementOf(x.pending_revision), latest, revisionCount: num(x.revision_count) ?? 1 };
    });
  }
  const map = new Map<string, Achievement[]>();
  for (const it of list(Array.isArray(raw) ? raw : d.items)) map.set(it.rootId, [...(map.get(it.rootId) ?? []), it]);
  return [...map.entries()].map(([rootId, items]) => {
    const sorted = items.slice().sort(byVersion);
    return {
      rootId,
      current: sorted.filter((x) => x.status === "approved").pop() ?? null,
      pending: sorted.filter((x) => x.status === "pending_review").pop() ?? null,
      latest: sorted[sorted.length - 1] ?? null,
      revisionCount: sorted.length,
    };
  });
}

export async function listMyAchievements(signal?: AbortSignal): Promise<AchievementGroup[]> {
  return achievementGroupsOf(await http("/marketplace/me/achievements", { signal }));
}

// achieved_on: YYYY-MM-DD from the date picker.
export type AchievementInput = { sourceId?: string; type: AchievementType; title: string; categoryId?: string; achievedOn: string; description: string; evidenceIds: string[] };
export function achievementBody(input: AchievementInput): Dict {
  const body: Dict = {
    source_id: input.sourceId || null,
    achievement_type: input.type,
    title: input.title.trim(),
    achieved_at: input.achievedOn ? `${input.achievedOn}T00:00:00Z` : "",
    description: input.description.trim(),
    evidence_ids: input.evidenceIds,
  };
  if (input.categoryId) body.category_id = input.categoryId;
  return body;
}
export async function submitAchievement(input: AchievementInput): Promise<Achievement | null> {
  return achievementOf(await http("/marketplace/me/achievements", { method: "POST", body: JSON.stringify(achievementBody(input)) }));
}
export async function uploadAchievementEvidence(file: File): Promise<ExperienceEvidence> {
  const form = new FormData();
  form.append("file", file);
  return evidenceOf(await http("/marketplace/me/achievements/evidence", { method: "POST", body: form }));
}
export async function downloadAchievementEvidence(ev: ExperienceEvidence): Promise<void> {
  if (!ev.downloadUrl) throw new ApiError(404, "no evidence url");
  saveBlob(await httpBlob(ev.downloadUrl), ev.fileName || "evidence");
}

// The public, safe view on a seller's profile: approved only, no evidence.
export type PublicAchievement = { id: string; type: AchievementType; title: string; achievedAt: string; description: string };
export async function listPublicAchievements(sellerUserId: string, signal?: AbortSignal): Promise<PublicAchievement[]> {
  const d = await http(`/marketplace/lawyers/${encodeURIComponent(sellerUserId)}/achievements`, { signal });
  return asArr(Array.isArray(d) ? d : asDict(d).items)
    .map((v) => {
      const x = asDict(v);
      const type = asStr(x.achievement_type ?? x.type);
      return { id: asStr(x.id), type: isAchievementType(type) ? type : "other", title: asStr(x.title), achievedAt: asStr(x.achieved_at), description: asStr(x.description) };
    })
    .filter((x) => x.id && x.title);
}

// ── Call center ──
export type AchievementQueueItem = Achievement & { sellerUserId: string; sellerName: string };
const queueItemOf = (v: unknown): AchievementQueueItem | null => {
  const it = achievementOf(v);
  if (!it) return null;
  const d = asDict(v);
  const seller = asDict(d.seller);
  return { ...it, sellerUserId: asStr(d.seller_user_id ?? seller.id), sellerName: asStr(d.seller_name ?? seller.name ?? seller.full_name) };
};
export async function listAchievementQueue(opts: { status?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<{ items: AchievementQueueItem[]; total: number; hasMore: boolean }> {
  const qs = new URLSearchParams({ status: opts.status ?? "pending_review", limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) });
  const d = asDict(await http(`/call-center/marketplace/achievements?${qs}`, { signal }));
  const items = asArr(d.items).map(queueItemOf).filter((x): x is AchievementQueueItem => !!x);
  return { items, total: num(d.total) ?? items.length, hasMore: d.has_more === true };
}
export type AchievementReviewDetail = { record: AchievementQueueItem | null; previous: Achievement | null; reviews: ExperienceReviewEntry[]; checks: CheckItem[]; diff: DiffRow[]; room: ReviewRoom | null; seller: ReviewSeller | null };
const reviewOf = (v: unknown): ExperienceReviewEntry => {
  const d = asDict(v);
  const dec = asStr(d.decision ?? d.status);
  return { id: asStr(d.id), decision: dec === "approved" || dec === "rejected" ? dec : "", reason: asStr(d.reason), checklist: [], reviewedAt: asStr(d.reviewed_at) };
};
// Field-by-field when the backend sends no diff: what is shown, compared.
export function achievementDiff(next: Achievement | null, prev: Achievement | null): DiffRow[] {
  if (!next || !prev) return [];
  const rows: DiffRow[] = [];
  const add = (field: string, before: string, after: string) => {
    if (before !== after) rows.push({ field, label: "", before, after, kind: !before ? "added" : !after ? "removed" : "changed" });
  };
  add("achievement_type", prev.type, next.type);
  add("title", prev.title, next.title);
  add("achieved_at", prev.achievedAt.slice(0, 10), next.achievedAt.slice(0, 10));
  add("category_id", prev.categoryId, next.categoryId);
  add("description", prev.description, next.description);
  add("evidence", prev.evidence.map((e) => e.fileName).join("; "), next.evidence.map((e) => e.fileName).join("; "));
  return rows;
}
export async function getAchievementForReview(id: string, signal?: AbortSignal): Promise<AchievementReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/achievements/${encodeURIComponent(id)}`, { signal }));
  const keys = asArr(d.checklist_keys).map((x) => asStr(x)).filter(Boolean);
  const record = queueItemOf(d.record ?? d.achievement ?? d);
  const previous = achievementOf(d.previous_approved_revision);
  const given = diffRowsOf(d.diff);
  return {
    record,
    previous,
    reviews: asArr(d.reviews).map(reviewOf),
    checks: checkItemsOf(d.checklist, keys),
    diff: given.length ? given : achievementDiff(record, previous),
    room: reviewRoomOf(d.communication ?? d.review_room ?? {}),
    seller: reviewSellerOf(d.seller),
  };
}
export async function reviewAchievement(id: string, input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows }): Promise<void> {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  await http(`/call-center/marketplace/achievements/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify({ decision: input.decision, reason: input.reason.trim(), checklist }) });
}
export async function openAchievementRoom(id: string): Promise<ReviewRoom> {
  const r = reviewRoomOf(await http(`/call-center/marketplace/achievements/${encodeURIComponent(id)}/communication`, { method: "POST", body: JSON.stringify({}) }));
  if (!r) throw new ApiError(0, "achievement communication: no room in the answer");
  return r;
}
export async function closeAchievementRoom(id: string, current: ReviewRoom): Promise<ReviewRoom> {
  const r = reviewRoomOf(await http(`/call-center/marketplace/achievements/${encodeURIComponent(id)}/communication/close`, { method: "POST", body: JSON.stringify({}) }));
  return { ...current, ...(r ?? {}), roomId: r?.roomId || current.roomId, readOnly: true, status: r?.status || "read_only" };
}
