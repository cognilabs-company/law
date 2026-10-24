// A lawyer's professional experience per service category, verified by the
// call center (TSK-659111; FRONTEND_MARKETPLACE_CONTRACT_GAPS_CLOSED §3).
// Every new record or revision is pending_review until a verifier approves
// it against the checklist; the approved revision stays in force meanwhile,
// and only approved experience counts for pricing and ranking. The backend
// computes the years from the dates; nothing here counts them.

import { ApiError, asArr, asDict, asStr, http, httpBlob, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";

export const EXPERIENCE_STAGES = ["pre_investigation", "investigation", "first_instance", "appeal", "cassation", "supervision", "enforcement", "advisory", "transactional"] as const;
export const EXPERIENCE_RESULTS = ["full_success", "partial_success", "settlement", "dismissed", "acquittal", "sentence_reduced", "claim_granted", "claim_partially_granted", "defense_success", "other"] as const;
export const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;

export type ExperienceStatus = "pending_review" | "approved" | "rejected" | "cancelled" | "superseded" | "other";
export type ExperienceEvidence = { id: string; fileName: string; mimeType: string; size: number | null; downloadUrl: string };
export type ExperienceItem = {
  id: string;
  rootId: string;
  sourceId: string;
  version: number | null;
  status: ExperienceStatus;
  categoryId: string;
  subcategoryId: string;
  workplace: string;
  position: string;
  startedAt: string;
  endedAt: string;
  isCurrent: boolean;
  description: string;
  stages: string[];
  results: string[];
  evidence: ExperienceEvidence[];
  years: number | null;
  rejectionReason: string;
  submittedAt: string;
  reviewedAt: string;
};
// One experience over its revisions: what counts now, what waits, and the
// newest record (a rejection shows there).
export type ExperienceGroup = { rootId: string; current: ExperienceItem | null; pending: ExperienceItem | null; latest: ExperienceItem | null; revisionCount: number };

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const strs = (v: unknown): string[] => asArr(v).map((x) => asStr(x)).filter(Boolean);

function statusOf(v: unknown): ExperienceStatus {
  const s = asStr(v).toLowerCase();
  if (s === "pending_review" || s === "pending") return "pending_review";
  if (s === "approved" || s === "rejected" || s === "cancelled") return s;
  return s.startsWith("superseded") ? "superseded" : "other";
}

function evidenceOf(v: unknown): ExperienceEvidence {
  const d = asDict(v);
  const id = asStr(d.id ?? d.evidence_id);
  return { id, fileName: asStr(d.file_name ?? d.name), mimeType: asStr(d.mime_type), size: num(d.size), downloadUrl: asStr(d.download_url) || (id ? `/marketplace/experience/evidence/${encodeURIComponent(id)}` : "") };
}

export function experienceItemOf(v: unknown): ExperienceItem | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  const ended = asStr(d.ended_at);
  return {
    id,
    rootId: asStr(d.root_id) || id,
    sourceId: asStr(d.source_id),
    version: num(d.version),
    status: statusOf(d.status),
    categoryId: asStr(d.category_id),
    subcategoryId: asStr(d.subcategory_id),
    workplace: asStr(d.workplace),
    position: asStr(d.position),
    startedAt: asStr(d.started_at),
    endedAt: ended,
    isCurrent: d.is_current === true || (d.is_current === undefined && !ended),
    description: asStr(d.description),
    stages: strs(d.stages),
    results: strs(d.results),
    evidence: asArr(d.evidence ?? d.evidence_files).map(evidenceOf).filter((e) => e.id),
    years: num(d.years),
    rejectionReason: asStr(d.rejection_reason ?? d.reason),
    submittedAt: asStr(d.submitted_at ?? d.created_at),
    reviewedAt: asStr(d.reviewed_at),
  };
}

const items = (v: unknown) => asArr(v).map(experienceItemOf).filter((x): x is ExperienceItem => !!x);
const byVersion = (a: ExperienceItem, b: ExperienceItem) => (a.version ?? 0) - (b.version ?? 0) || a.submittedAt.localeCompare(b.submittedAt);

// The backend's groups when it sends them; otherwise grouped here by
// root_id (the earlier flat-list response).
export function experienceGroupsOf(raw: unknown): ExperienceGroup[] {
  const d = asDict(raw);
  const groups = asArr(d.groups);
  if (groups.length) {
    return groups.map((g) => {
      const x = asDict(g);
      const latest = experienceItemOf(x.latest);
      return {
        rootId: asStr(x.root_id) || latest?.rootId || "",
        current: experienceItemOf(x.current),
        pending: experienceItemOf(x.pending_revision),
        latest,
        revisionCount: num(x.revision_count) ?? 1,
      };
    });
  }
  const map = new Map<string, ExperienceItem[]>();
  for (const it of items(Array.isArray(raw) ? raw : d.items)) map.set(it.rootId, [...(map.get(it.rootId) ?? []), it]);
  return [...map.entries()].map(([rootId, list]) => {
    const sorted = list.slice().sort(byVersion);
    return {
      rootId,
      current: sorted.filter((x) => x.status === "approved").pop() ?? null,
      pending: sorted.filter((x) => x.status === "pending_review").pop() ?? null,
      latest: sorted[sorted.length - 1] ?? null,
      revisionCount: sorted.length,
    };
  });
}

export async function listMyExperience(signal?: AbortSignal): Promise<ExperienceGroup[]> {
  return experienceGroupsOf(await http("/marketplace/me/experience?limit=50&offset=0", { signal }));
}

export type ExperienceInput = {
  sourceId?: string;
  categoryId: string;
  subcategoryId?: string;
  workplace: string;
  position: string;
  // YYYY-MM-DD from the date inputs.
  startedOn: string;
  endedOn: string;
  isCurrent: boolean;
  description: string;
  stages: string[];
  results: string[];
  evidenceIds: string[];
};

const isoDay = (day: string) => (day ? `${day}T00:00:00Z` : null);

export async function submitExperience(input: ExperienceInput): Promise<ExperienceItem | null> {
  const body: Dict = {
    source_id: input.sourceId || null,
    category_id: input.categoryId,
    workplace: input.workplace.trim(),
    position: input.position.trim(),
    started_at: isoDay(input.startedOn),
    ended_at: input.isCurrent ? null : isoDay(input.endedOn),
    is_current: input.isCurrent,
    description: input.description.trim(),
    stages: input.stages,
    results: input.results,
    evidence_ids: input.evidenceIds,
  };
  // Optional: a real child id from /service-categories/tree, else left out.
  if (input.subcategoryId) body.subcategory_id = input.subcategoryId;
  return experienceItemOf(await http("/marketplace/me/experience", { method: "POST", body: JSON.stringify(body) }));
}

export async function uploadExperienceEvidence(file: File): Promise<ExperienceEvidence> {
  const form = new FormData();
  form.append("file", file);
  return evidenceOf(await http("/marketplace/me/experience/evidence", { method: "POST", body: form }));
}

export async function downloadExperienceEvidence(ev: ExperienceEvidence): Promise<void> {
  saveBlob(await httpBlob(ev.downloadUrl), ev.fileName || ev.id);
}

export async function cancelExperience(experienceId: string): Promise<void> {
  await http(`/marketplace/me/experience/${encodeURIComponent(experienceId)}/cancel`, { method: "POST" });
}

export type ExperienceReviewEntry = { id: string; decision: "approved" | "rejected" | ""; reason: string; checklist: { key: string; verdict: string; note: string }[]; reviewedAt: string };
const reviewOf = (v: unknown): ExperienceReviewEntry => {
  const d = asDict(v);
  const dec = asStr(d.decision ?? d.status);
  return {
    id: asStr(d.id),
    decision: dec === "approved" || dec === "rejected" ? dec : "",
    reason: asStr(d.reason),
    checklist: asArr(d.checklist).map((c) => {
      const x = asDict(c);
      return { key: asStr(x.key), verdict: asStr(x.verdict), note: asStr(x.note) };
    }),
    reviewedAt: asStr(d.reviewed_at),
  };
};

export async function experienceHistory(experienceId: string): Promise<{ items: ExperienceItem[]; reviews: ExperienceReviewEntry[] }> {
  const d = asDict(await http(`/marketplace/me/experience/${encodeURIComponent(experienceId)}/history`));
  return { items: items(d.items).sort(byVersion), reviews: asArr(d.reviews).map(reviewOf) };
}

// The field a structured error points at, for showing it in place.
export function experienceErrorOf(e: unknown): { code: string; field: string } | null {
  if (!(e instanceof ApiError)) return null;
  const detail = asDict(e.data.detail);
  const code = asStr(detail.code) || e.code || "";
  if (!code.startsWith("experience_") && code !== "verification_checklist_incomplete") return null;
  const fields = strs(detail.fields);
  return { code, field: asStr(detail.field) || fields[0] || "" };
}

// ── Call-center review ─────────────────────────────────────────────────

// The verifier's checklist. Approval needs every row approved or not
// applicable; the mandatory rows must be approved.
export const EXPERIENCE_CHECKS = [
  { key: "identity_license", mandatory: true },
  { key: "workplace_position", mandatory: true },
  { key: "dates_duration", mandatory: true },
  { key: "category_relevance", mandatory: true },
  { key: "court_investigation_evidence", mandatory: false },
  { key: "duplicates_conflicts", mandatory: true },
  { key: "file_authenticity", mandatory: true },
  { key: "category_test", mandatory: false },
  { key: "verifier_conclusion", mandatory: true },
] as const;
export type CheckVerdict = "approved" | "rejected" | "not_applicable" | "";
export type CheckRow = { verdict: CheckVerdict; note: string };
export type CheckRows = Partial<Record<string, CheckRow>>;

const MANDATORY = new Set<string>(EXPERIENCE_CHECKS.filter((c) => c.mandatory).map((c) => c.key));
export const isMandatoryCheck = (key: string) => MANDATORY.has(key);

export function canApprove(keys: readonly string[], rows: CheckRows): boolean {
  return keys.every((k) => (isMandatoryCheck(k) ? rows[k]?.verdict === "approved" : rows[k]?.verdict === "approved" || rows[k]?.verdict === "not_applicable"));
}

export type ExperienceQueueItem = ExperienceItem & { sellerUserId: string; sellerName: string };
const queueItemOf = (v: unknown): ExperienceQueueItem | null => {
  const it = experienceItemOf(v);
  if (!it) return null;
  const d = asDict(v);
  const seller = asDict(d.seller);
  return { ...it, sellerUserId: asStr(d.seller_user_id ?? seller.id), sellerName: asStr(d.seller_name ?? seller.name ?? seller.full_name) };
};

export async function listExperienceQueue(opts: { status?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<{ items: ExperienceQueueItem[]; total: number; hasMore: boolean }> {
  const qs = new URLSearchParams({ status: opts.status ?? "pending_review", limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) });
  const d = asDict(await http(`/call-center/marketplace/experience?${qs}`, { signal }));
  const list = asArr(d.items).map(queueItemOf).filter((x): x is ExperienceQueueItem => !!x);
  return { items: list, total: num(d.total) ?? list.length, hasMore: d.has_more === true };
}

export type ExperienceReviewDetail = { record: ExperienceQueueItem | null; previous: ExperienceItem | null; reviews: ExperienceReviewEntry[]; checklistKeys: string[] };

export async function getExperienceForReview(experienceId: string, signal?: AbortSignal): Promise<ExperienceReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}`, { signal }));
  const keys = strs(d.checklist_keys);
  return {
    record: queueItemOf(d.record),
    previous: experienceItemOf(d.previous_approved_revision),
    reviews: asArr(d.reviews).map(reviewOf),
    checklistKeys: keys.length ? keys : EXPERIENCE_CHECKS.map((c) => c.key),
  };
}

export async function reviewExperience(experienceId: string, input: { decision: "approved" | "rejected"; reason: string; keys: readonly string[]; rows: CheckRows }): Promise<void> {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision: input.decision, reason: input.reason.trim(), checklist }),
  });
}

// The category tree with real ids (backend 24 Oct 2026 §6): a root's
// children are the subcategories the experience form may send.
export type CategoryNode = { id: string; parentId: string; slug: string; title: string; children: CategoryNode[] };
const nodeOf = (v: unknown): CategoryNode => {
  const d = asDict(v);
  return { id: asStr(d.id), parentId: asStr(d.parent_id), slug: asStr(d.slug), title: asStr(d.title ?? d.name), children: asArr(d.children).map(nodeOf).filter((c) => c.id) };
};
export async function getCategoryTree(signal?: AbortSignal): Promise<CategoryNode[]> {
  const d = await http("/service-categories/tree", { signal });
  const list = Array.isArray(d) ? d : asArr(asDict(d).items);
  return list.map(nodeOf).filter((n) => n.id);
}
