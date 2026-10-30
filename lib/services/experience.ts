// A lawyer's professional experience per service category, verified by the
// call center (TSK-659111; FRONTEND_MARKETPLACE_CONTRACT_GAPS_CLOSED §3).
// Every new record or revision is pending_review until a verifier approves
// it against the checklist; the approved revision stays in force meanwhile,
// and only approved experience counts for pricing and ranking. The backend
// computes the years from the dates; nothing here counts them.

import { ApiError, asArr, asDict, asStr, http, httpBlob, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { labelledOf, type Labelled } from "@/lib/backendLabel";

// TSK-415946 (contract 2026-10-27 §15): one record is one workplace with one
// or more positions, each with its own dates; parallel workplaces are
// separate records and overlapping periods are allowed (the backend merges
// them, so the same months never count twice). The old "which cases" and
// "results" fields are gone.
export const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;

export type ExperienceStatus = "pending_review" | "approved" | "rejected" | "changes_requested" | "cancelled" | "superseded" | "other";
// Contract 2026-10-29 §5: employment before advocate status (public bodies
// or private organizations) is its own kind — no category, never priced,
// never part of advocate tenure. Records without a kind are category ones.
export const EXPERIENCE_KINDS = ["category_experience", "pre_advocate_employment"] as const;
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];
export const experienceKindOf = (v: unknown): ExperienceKind => (asStr(v) === "pre_advocate_employment" ? "pre_advocate_employment" : "category_experience");
export type ExperienceEvidence = { id: string; fileName: string; mimeType: string; size: number | null; downloadUrl: string };
export type ExperienceItem = {
  id: string;
  rootId: string;
  sourceId: string;
  version: number | null;
  status: ExperienceStatus;
  kind: ExperienceKind;
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
  const title = asStr(d.title).trim();
  if (!title) return null;
  const ended = asStr(d.ended_at);
  return { title, startedAt: asStr(d.started_at), endedAt: ended, isCurrent: d.is_current === true || (d.is_current === undefined && !ended), description: asStr(d.description) };
}
// The record's positions; a legacy record (before positions[]) carries one
// flat position, its title in `position`.
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
  const s = asStr(v);
  return s === "pending_review" || s === "approved" || s === "rejected" || s === "changes_requested" || s === "cancelled" || s === "superseded" ? s : "other";
}

function evidenceOf(v: unknown): ExperienceEvidence {
  const d = asDict(v);
  const id = asStr(d.id);
  return { id, fileName: asStr(d.file_name), mimeType: asStr(d.mime_type), size: num(d.size), downloadUrl: asStr(d.download_url) || (id ? `/marketplace/experience/evidence/${encodeURIComponent(id)}` : "") };
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
    kind: experienceKindOf(d.experience_kind),
    categoryId: asStr(d.category_id),
    subcategoryId: asStr(d.subcategory_id),
    workplace: asStr(d.workplace),
    positions,
    startedAt: starts[0] ?? asStr(d.started_at),
    endedAt: current ? "" : (ends[ends.length - 1] ?? asStr(d.ended_at)),
    isCurrent: current,
    description: asStr(d.description),
    evidence: asArr(d.evidence).map(evidenceOf).filter((e) => e.id),
    years: num(d.years),
    rejectionReason: asStr(d.rejection_reason),
    submittedAt: asStr(d.submitted_at),
    reviewedAt: asStr(d.reviewed_at),
  };
}

const items = (v: unknown) => asArr(v).map(experienceItemOf).filter((x): x is ExperienceItem => !!x);
const byVersion = (a: ExperienceItem, b: ExperienceItem) => (a.version ?? 0) - (b.version ?? 0) || a.submittedAt.localeCompare(b.submittedAt);

// The seller's list, grouped by revision root by the backend (2026-10-29 §13).
export function experienceGroupsOf(raw: unknown): ExperienceGroup[] {
  return asArr(asDict(raw).groups)
    .map((g) => {
      const x = asDict(g);
      return { rootId: asStr(x.root_id), current: experienceItemOf(x.current), pending: experienceItemOf(x.pending_revision), latest: experienceItemOf(x.latest), revisionCount: num(x.revision_count) ?? 1 };
    })
    .filter((g) => g.rootId && (g.current || g.pending || g.latest));
}

const YEAR_MS = 365 * 86400000;

export function approvedYears(groups: ExperienceGroup[], today: string): number {
  const items = groups.map((g) => g.current).filter((x): x is ExperienceItem => !!x);
  if (items.some((it) => !it.positions.some((p) => p.startedAt))) return items.reduce((n, it) => n + (it.years ?? 0), 0);
  const end = Date.parse(today);
  const spans = items
    .flatMap((it) => it.positions)
    .map((p) => [Date.parse(p.startedAt.slice(0, 10)), p.isCurrent || !p.endedAt ? end : Math.min(end, Date.parse(p.endedAt.slice(0, 10)))] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let from = NaN;
  let to = NaN;
  for (const [a, b] of spans) {
    if (Number.isFinite(from) && a <= to) {
      to = Math.max(to, b);
      continue;
    }
    if (Number.isFinite(from)) total += to - from;
    from = a;
    to = b;
  }
  if (Number.isFinite(from)) total += to - from;
  return Math.floor(total / YEAR_MS);
}

export async function listMyExperience(signal?: AbortSignal): Promise<ExperienceGroup[]> {
  return experienceGroupsOf(await http("/marketplace/me/experience?limit=50&offset=0", { signal }));
}

// Dates are YYYY-MM-DD from the date pickers.
export type PositionInput = { title: string; startedOn: string; endedOn: string; isCurrent: boolean; description: string };
export type ExperienceInput = {
  sourceId?: string;
  kind?: ExperienceKind;
  categoryId: string;
  subcategoryId?: string;
  workplace: string;
  positions: PositionInput[];
  description: string;
  evidenceIds: string[];
};

const isoDay = (day: string) => (day ? `${day}T00:00:00Z` : null);

export function experienceBody(input: ExperienceInput): Dict {
  const positions = input.positions.map((p) => ({
    title: p.title.trim(),
    started_at: isoDay(p.startedOn),
    ended_at: p.isCurrent ? null : isoDay(p.endedOn),
    is_current: p.isCurrent,
    description: p.description.trim(),
  }));
  // Pre-advocate employment carries its kind and never a category.
  if (input.kind === "pre_advocate_employment") {
    return { source_id: input.sourceId || null, experience_kind: input.kind, workplace: input.workplace.trim(), positions, description: input.description.trim(), evidence_ids: input.evidenceIds };
  }
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
  return body;
}
export async function submitExperience(input: ExperienceInput): Promise<ExperienceItem | null> {
  return experienceItemOf(await http("/marketplace/me/experience", { method: "POST", body: JSON.stringify(experienceBody(input)) }));
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

export type ExperienceReviewEntry = { id: string; decision: "approved" | "rejected" | "changes_requested" | ""; reason: string; checklist: { key: string; verdict: string; note: string }[]; reviewedAt: string; reviewer: string };
// One past review (final contract 2026-10-29 §5): `decision` is the stored
// status (approved | rejected | changes_requested); `decision_action`, the
// word the operator sent, is not shown.
const DECIDED = new Set(["approved", "rejected", "changes_requested"]);
export const reviewOf = (v: unknown): ExperienceReviewEntry => {
  const d = asDict(v);
  const dec = asStr(d.decision);
  return {
    id: asStr(d.id),
    decision: DECIDED.has(dec) ? (dec as ExperienceReviewEntry["decision"]) : "",
    reason: asStr(d.reason),
    checklist: asArr(d.checklist).map((c) => {
      const x = asDict(c);
      return { key: asStr(x.key), verdict: asStr(x.verdict), note: asStr(x.note) };
    }),
    reviewedAt: asStr(d.reviewed_at),
    // Who decided, when the backend names them (reviews[] is untyped).
    reviewer: asStr(asDict(d.reviewer).name ?? asDict(d.reviewed_by).name ?? d.reviewer_name ?? d.reviewed_by_name).trim(),
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
  const code = e.code ?? "";
  // The record's own codes, and the evidence file's (evidence_file_too_large,
  // evidence_file_type_not_allowed, evidence_not_found).
  if (!code.startsWith("experience_") && !code.startsWith("evidence_") && code !== "verification_checklist_incomplete") return null;
  const fields = strs(detail.fields);
  return { code, field: asStr(detail.field) || fields[0] || "" };
}

// ── Call-center review ─────────────────────────────────────────────────

export type CheckVerdict = "approved" | "rejected" | "not_applicable" | "";
export type CheckRow = { verdict: CheckVerdict; note: string };
export type CheckRows = Partial<Record<string, CheckRow>>;

// TSK-100467: approve stays shut until every item the backend asked for is
// approved or not applicable (none rejected, none left open).
export function canApprove(keys: readonly string[], rows: CheckRows): boolean {
  return keys.length > 0 && keys.every((k) => rows[k]?.verdict === "approved" || rows[k]?.verdict === "not_applicable");
}

// The backend's ready-made checklist (2026-10-29 §8), in its order, with
// its own labels: [{ key, label, hint, label_i18n }].
export type CheckItem = Labelled & { key: string; hint: string };
export function checkItemsOf(raw: unknown): CheckItem[] {
  return asArr(raw)
    .map((x) => ({ key: asStr(asDict(x).key), hint: asStr(asDict(x).hint), ...labelledOf(x) }))
    .filter((c) => c.key);
}

// TSK-874927: what changed in a revision, field by field, as the backend's
// diff[] gives it: { field, label, before, after }.
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
  return asArr(raw)
    .map((x) => {
      const d = asDict(x);
      const before = plain(d.before);
      const after = plain(d.after);
      return { field: asStr(d.field), label: asStr(d.label), before, after, kind: kindOf(before, after) };
    })
    .filter((r) => r.field && r.before !== r.after);
}
// The protected review room (TSK-365169): only the operator closes it; once
// closed it stays readable but takes no new messages.
export type ReviewCallKind = "audio" | "video";
export type ReviewRoom = { roomId: string; status: string; readOnly: boolean; closedAt: string; callTypes: ReviewCallKind[] };
// Backend answers 2026-10-28 §6.2: create → { room_id, messages_url,
// calls_url, close_by_operator_only }; close → { room_id, status: "read_only" }.
export function reviewRoomOf(v: unknown): ReviewRoom | null {
  const d = asDict(v);
  const roomId = asStr(d.room_id);
  if (!roomId) return null;
  const status = asStr(d.status).toLowerCase();
  // call_types: the calls the room allows (TSK-365169); a room with a
  // calls_url and no list allows both.
  const listed = asArr(d.call_types).map((x) => asStr(x)).filter((x): x is ReviewCallKind => x === "audio" || x === "video");
  const callTypes: ReviewCallKind[] = listed.length ? listed : asStr(d.calls_url) ? ["audio", "video"] : [];
  return { roomId, status, readOnly: status === "read_only" || status === "closed", closedAt: asStr(d.closed_at), callTypes };
}

// A queue row's advocate: seller { id, lexgo_id, name, phone, role,
// account_status } (backend check 2026-10-29).
export type ExperienceQueueItem = ExperienceItem & { sellerUserId: string; seller: ReviewSeller | null };
const queueItemOf = (v: unknown): ExperienceQueueItem | null => {
  const it = experienceItemOf(v);
  if (!it) return null;
  const seller = reviewSellerOf(asDict(v).seller);
  return { ...it, sellerUserId: seller?.id ?? "", seller };
};
export { queueItemOf as experienceQueueItemOf };

// experience_kind filters on the backend (2026-10-29 §13); "" = every kind.
export async function listExperienceQueue(opts: { status?: string; kind?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<{ items: ExperienceQueueItem[]; total: number; hasMore: boolean }> {
  const qs = new URLSearchParams({ status: opts.status ?? "pending_review", limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) });
  if (opts.kind) qs.set("experience_kind", opts.kind);
  const d = asDict(await http(`/call-center/marketplace/experience?${qs}`, { signal }));
  const list = asArr(d.items).map(queueItemOf).filter((x): x is ExperienceQueueItem => !!x);
  return { items: list, total: num(d.total) ?? list.length, hasMore: d.has_more === true };
}

// The seller under review, from the review detail's `seller`: who the
// operator is checking and how to reach them (never shown as an id).
export type ReviewSeller = { id: string; name: string; lexgoId: string; phone: string; role: string; status: string };
export function reviewSellerOf(v: unknown): ReviewSeller | null {
  const d = asDict(v);
  const s = { id: asStr(d.id), name: asStr(d.name).trim(), lexgoId: asStr(d.lexgo_id).trim(), phone: asStr(d.phone).trim(), role: asStr(d.role).toLowerCase(), status: asStr(d.account_status).toLowerCase() };
  return s.name || s.phone || s.lexgoId ? s : null;
}
// One revision in the record's history, for the operator's timeline.
export type HistoryRow = { id: string; version: number | null; status: string; submittedAt: string; reviewedAt: string };
// history[]: the record's revisions, oldest first.
export function historyOf(raw: unknown): HistoryRow[] {
  return asArr(raw)
    .map((v) => {
      const d = asDict(v);
      return { id: asStr(d.id), version: num(d.version), status: asStr(d.status), submittedAt: asStr(d.submitted_at), reviewedAt: asStr(d.reviewed_at) };
    })
    .filter((h) => h.id)
    .sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
}
export type ExperienceReviewDetail = {
  record: ExperienceQueueItem | null;
  previous: ExperienceItem | null;
  reviews: ExperienceReviewEntry[];
  checks: CheckItem[];
  diff: DiffRow[];
  room: ReviewRoom | null;
  seller: ReviewSeller | null;
  history: HistoryRow[];
  // revision.changed_fields: what this revision changed, for highlighting.
  changedFields: string[];
};

export async function getExperienceForReview(experienceId: string, signal?: AbortSignal): Promise<ExperienceReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}`, { signal }));
  return {
    record: queueItemOf(d.record),
    previous: experienceItemOf(d.previous_approved_revision),
    reviews: asArr(d.reviews).map(reviewOf),
    checks: checkItemsOf(d.checklist),
    diff: diffRowsOf(d.diff),
    room: reviewRoomOf(d.communication),
    seller: reviewSellerOf(d.seller),
    history: historyOf(d.history),
    changedFields: strs(asDict(d.revision).changed_fields),
  };
}

export type ReviewDecision = "approved" | "changes_requested" | "rejected";
// Our decisions in the backend's action words (final contract 2026-10-29
// §5, §7, §8): every review endpoint takes approve | reject | changes_requested.
export const DECISION_WIRE: Record<ReviewDecision, string> = { approved: "approve", rejected: "reject", changes_requested: "changes_requested" };
export async function reviewExperience(experienceId: string, input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows }): Promise<void> {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  await http(`/call-center/marketplace/experience/${encodeURIComponent(experienceId)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision: DECISION_WIRE[input.decision], reason: input.reason.trim(), checklist }),
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
