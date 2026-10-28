// A lawyer's professional experience per service category, verified by the
// call center (TSK-659111; FRONTEND_MARKETPLACE_CONTRACT_GAPS_CLOSED §3).
// Every new record or revision is pending_review until a verifier approves
// it against the checklist; the approved revision stays in force meanwhile,
// and only approved experience counts for pricing and ranking. The backend
// computes the years from the dates; nothing here counts them.

import { ApiError, asArr, asDict, asStr, http, httpBlob, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";

// TSK-415946 (contract 2026-10-27 §15): one record is one workplace with one
// or more positions, each with its own dates; parallel workplaces are
// separate records and overlapping periods are allowed (the backend merges
// them, so the same months never count twice). The old "which cases" and
// "results" fields are gone.
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
  positions: ExperiencePosition[];
  // The earliest start and the latest end over the positions (for the card).
  startedAt: string;
  endedAt: string;
  isCurrent: boolean;
  description: string;
  evidence: ExperienceEvidence[];
  years: number | null;
  rejectionReason: string;
  submittedAt: string;
  reviewedAt: string;
};
export type ExperiencePosition = { title: string; startedAt: string; endedAt: string; isCurrent: boolean; description: string };
function positionOf(v: unknown): ExperiencePosition | null {
  const d = asDict(v);
  const title = asStr(d.title ?? d.position ?? d.name).trim();
  if (!title) return null;
  const ended = asStr(d.ended_at);
  return { title, startedAt: asStr(d.started_at), endedAt: ended, isCurrent: d.is_current === true || (d.is_current === undefined && !ended), description: asStr(d.description) };
}
// The record's positions; an older record carries one flat position.
export function positionsOf(d: Dict): ExperiencePosition[] {
  const list = asArr(d.positions).map(positionOf).filter((x): x is ExperiencePosition => !!x);
  if (list.length) return list;
  const one = positionOf({ title: d.position, started_at: d.started_at, ended_at: d.ended_at, is_current: d.is_current });
  return one ? [one] : [];
}

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
  const positions = positionsOf(d);
  const starts = positions.map((p) => p.startedAt).filter(Boolean).sort();
  const ends = positions.map((p) => p.endedAt).filter(Boolean).sort();
  const current = positions.some((p) => p.isCurrent);
  return {
    id,
    rootId: asStr(d.root_id) || id,
    sourceId: asStr(d.source_id),
    version: num(d.version),
    status: statusOf(d.status),
    categoryId: asStr(d.category_id),
    subcategoryId: asStr(d.subcategory_id),
    workplace: asStr(d.workplace),
    positions,
    startedAt: starts[0] ?? asStr(d.started_at),
    endedAt: current ? "" : (ends[ends.length - 1] ?? asStr(d.ended_at)),
    isCurrent: current,
    description: asStr(d.description),
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

// Dates are YYYY-MM-DD from the date pickers.
export type PositionInput = { title: string; startedOn: string; endedOn: string; isCurrent: boolean; description: string };
export type ExperienceInput = {
  sourceId?: string;
  categoryId: string;
  subcategoryId?: string;
  workplace: string;
  positions: PositionInput[];
  description: string;
  evidenceIds: string[];
};

const isoDay = (day: string) => (day ? `${day}T00:00:00Z` : null);

export async function submitExperience(input: ExperienceInput): Promise<ExperienceItem | null> {
  const positions = input.positions.map((p) => ({
    title: p.title.trim(),
    started_at: isoDay(p.startedOn),
    ended_at: p.isCurrent ? null : isoDay(p.endedOn),
    is_current: p.isCurrent,
    description: p.description.trim(),
  }));
  const body: Dict = {
    source_id: input.sourceId || null,
    category_id: input.categoryId,
    workplace: input.workplace.trim(),
    positions,
    description: input.description.trim(),
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

// TSK-100467: approve stays shut until every item the backend asked for is
// approved or not applicable (none rejected, none left open).
export function canApprove(keys: readonly string[], rows: CheckRows): boolean {
  return keys.length > 0 && keys.every((k) => rows[k]?.verdict === "approved" || rows[k]?.verdict === "not_applicable");
}

// The backend's dynamic checklist (contract §16): keys depend on the
// positions, current jobs, parallel periods, the revision's changes and the
// evidence — "position_2_dates", "evidence_3_readable", … Each gets a human
// label: the backend's own when it sends one, else built from the key.
// Gaps closed 2026-10-28 §12: the detail's checklist [{ key, label, hint,
// label_i18n }] is the list to render, in its order; checklist_keys stays
// only for an older answer without it.
export type CheckItem = { key: string; label: string; hint: string; i18n: Record<string, string> };
export function checkItemsOf(raw: unknown, keys: readonly string[]): CheckItem[] {
  const given = asArr(raw)
    .map((x) => {
      const d = asDict(x);
      const i18n = Object.fromEntries(Object.entries(asDict(d.label_i18n)).filter(([, y]) => typeof y === "string" && y.trim()).map(([k, y]) => [k, String(y).trim()]));
      return { key: asStr(d.key), label: asStr(d.label), hint: asStr(d.hint), i18n };
    })
    .filter((c) => c.key);
  if (given.length) return given;
  return keys.map((k) => ({ key: k, label: "", hint: "", i18n: {} }));
}
// "position_2_dates" → { base: "position_dates", n: 2 }; no number → n null.
export function checkKeyParts(key: string): { base: string; n: number | null } {
  const m = /^(.*?)_(\d+)(?:_(.*))?$/.exec(key);
  if (!m) return { base: key, n: null };
  return { base: [m[1], m[3]].filter(Boolean).join("_"), n: Number(m[2]) };
}

// TSK-874927: what changed in a revision, field by field. The backend's
// diff when it sends one; otherwise the two records compared here (a plain
// comparison of what is shown, nothing computed about the experience).
export type DiffKind = "changed" | "added" | "removed";
// "label" is the backend's human name for the field (gaps closed §13).
export type DiffRow = { field: string; label: string; before: string; after: string; kind: DiffKind };
const plain = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(plain).filter(Boolean).join("; ");
  const d = asDict(v);
  const t = asStr(d.title ?? d.name ?? d.file_name ?? d.label);
  const when = [asStr(d.started_at).slice(0, 10), d.is_current === true ? "…" : asStr(d.ended_at).slice(0, 10)].filter(Boolean).join(" — ");
  return [t, when].filter(Boolean).join(" · ");
};
const kindOf = (before: string, after: string): DiffKind => (!before ? "added" : !after ? "removed" : "changed");
export function diffRowsOf(raw: unknown): DiffRow[] {
  const list = Array.isArray(raw) ? raw : Object.entries(asDict(raw)).map(([field, v]) => ({ field, ...asDict(v) }));
  return list
    .map((x) => {
      const d = asDict(x);
      const before = plain(d.before ?? d.old ?? d.previous);
      const after = plain(d.after ?? d.new ?? d.current);
      return { field: asStr(d.field), label: asStr(d.label), before, after, kind: kindOf(before, after) };
    })
    .filter((r) => r.field && r.before !== r.after);
}
const positionLine = (p: ExperiencePosition) => [p.title, [p.startedAt.slice(0, 10), p.isCurrent ? "…" : p.endedAt.slice(0, 10)].filter(Boolean).join(" — ")].filter(Boolean).join(" · ");
export function localDiff(next: ExperienceItem | null, prev: ExperienceItem | null): DiffRow[] {
  if (!next || !prev) return [];
  const rows: DiffRow[] = [];
  const add = (field: string, before: string, after: string) => {
    if (before !== after) rows.push({ field, label: "", before, after, kind: kindOf(before, after) });
  };
  add("category_id", prev.categoryId, next.categoryId);
  add("subcategory_id", prev.subcategoryId, next.subcategoryId);
  add("workplace", prev.workplace, next.workplace);
  const n = Math.max(prev.positions.length, next.positions.length);
  for (let i = 0; i < n; i++) add(`positions.${i}`, prev.positions[i] ? positionLine(prev.positions[i]) : "", next.positions[i] ? positionLine(next.positions[i]) : "");
  add("description", prev.description, next.description);
  add("evidence", prev.evidence.map((e) => e.fileName).join("; "), next.evidence.map((e) => e.fileName).join("; "));
  return rows;
}

// The protected review room (TSK-365169): only the operator closes it; once
// closed it stays readable but takes no new messages.
export type ReviewRoom = { roomId: string; status: string; readOnly: boolean; closedAt: string };
// Backend answers 2026-10-28 §6.2: create → { room_id, messages_url,
// calls_url, close_by_operator_only }; close → { room_id, status: "read_only" }.
export function reviewRoomOf(v: unknown): ReviewRoom | null {
  const d = asDict(v);
  const roomId = asStr(d.room_id);
  if (!roomId) return null;
  const status = asStr(d.status).toLowerCase();
  return { roomId, status, readOnly: status === "read_only" || status === "closed", closedAt: asStr(d.closed_at) };
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

// The seller under review, from the review detail's `seller`: who the
// operator is checking and how to reach them (never shown as an id).
export type ReviewSeller = { id: string; name: string; lexgoId: string; phone: string; role: string; status: string };
export function reviewSellerOf(v: unknown): ReviewSeller | null {
  const d = asDict(v);
  const s = { id: asStr(d.id), name: asStr(d.name ?? d.full_name).trim(), lexgoId: asStr(d.lexgo_id).trim(), phone: asStr(d.phone).trim(), role: asStr(d.role).toLowerCase(), status: asStr(d.account_status).toLowerCase() };
  return s.name || s.phone || s.lexgoId ? s : null;
}
export type ExperienceReviewDetail = { record: ExperienceQueueItem | null; previous: ExperienceItem | null; reviews: ExperienceReviewEntry[]; checklistKeys: string[]; checks: CheckItem[]; diff: DiffRow[]; room: ReviewRoom | null; seller: ReviewSeller | null };

export async function getExperienceForReview(experienceId: string, signal?: AbortSignal): Promise<ExperienceReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}`, { signal }));
  const keys = strs(d.checklist_keys);
  const checklistKeys = keys.length ? keys : EXPERIENCE_CHECKS.map((c) => c.key);
  const record = queueItemOf(d.record);
  const previous = experienceItemOf(d.previous_approved_revision);
  const given = diffRowsOf(d.diff);
  return {
    record,
    previous,
    reviews: asArr(d.reviews).map(reviewOf),
    checklistKeys,
    checks: checkItemsOf(d.checklist, checklistKeys),
    diff: given.length ? given : localDiff(record, previous),
    room: reviewRoomOf(d.communication ?? d.review_room ?? {}),
    seller: reviewSellerOf(d.seller),
  };
}

export type ReviewDecision = "approved" | "changes_requested" | "rejected";
export async function reviewExperience(experienceId: string, input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows }): Promise<void> {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision: input.decision, reason: input.reason.trim(), checklist }),
  });
}

// TSK-365169: a protected chat (and calls from it) between the operator
// and the seller about this record; creating it again returns the same room.
export async function openExperienceRoom(experienceId: string): Promise<ReviewRoom> {
  const r = reviewRoomOf(await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}/communication`, { method: "POST", body: JSON.stringify({}) }));
  if (!r) throw new ApiError(0, "experience communication: no room in the answer");
  return r;
}
export async function closeExperienceRoom(experienceId: string, current: ReviewRoom): Promise<ReviewRoom> {
  const r = reviewRoomOf(await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}/communication/close`, { method: "POST", body: JSON.stringify({}) }));
  return { ...current, ...(r ?? {}), roomId: r?.roomId || current.roomId, readOnly: true, status: r?.status || "read_only" };
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
