// An advocate's professional achievements (contract 2026-10-29 §2–3): a
// positive result reached at one stage of a case — before investigation,
// inquiry, preliminary investigation or court — fully or partly. The form is
// built from the backend's config (stages, results, file rules, the warning);
// each record is checked by software first and then decided by a LexGo
// operator. Approved achievements count for the rating only (never the
// price), and only their safe public text reaches the profile; evidence and
// the AI analysis never go public. The old type/title schema is gone.
import { ApiError, asArr, asDict, asStr, http, httpBlob, httpUpload, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { checkItemsOf, diffRowsOf, reviewRoomOf, reviewSellerOf, type CheckItem, type CheckRows, type DiffRow, type ExperienceEvidence, type ExperienceReviewEntry, type ReviewDecision, type ReviewRoom, type ReviewSeller } from "./experience";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const bool = (v: unknown): boolean | null => (v === true || v === false ? v : null);
const strs = (v: unknown): string[] => asArr(v).map((x) => asStr(x)).filter(Boolean);
const day = (v: unknown) => asStr(v).slice(0, 10);

// ── Config: the only source of the form ──
// One choice the backend offers (a stage or a result), with its own label
// and, when it sends them, labels per language.
export type ConfigOption = { value: string; label: string; hint: string; i18n: Record<string, string> };
export type AchievementConfig = {
  stages: ConfigOption[];
  results: ConfigOption[];
  evidenceRequired: boolean;
  minFiles: number | null;
  maxFiles: number | null;
  maxBytes: number | null;
  mimeTypes: string[];
  extensions: string[];
  descMin: number | null;
  descMax: number | null;
  warning: string;
  warningI18n: Record<string, string>;
};
const i18nOf = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries(asDict(v)).filter(([, y]) => typeof y === "string" && y.trim()).map(([k, y]) => [k, String(y).trim()]));
// [{value|key|code, label|title, hint, label_i18n}] or {key: label}.
function optionsOf(raw: unknown): ConfigOption[] {
  const list = Array.isArray(raw) ? raw : Object.entries(asDict(raw)).map(([value, label]) => (typeof label === "string" ? { value, label } : { value, ...asDict(label) }));
  return list
    .map((x) => {
      if (typeof x === "string") return { value: x, label: "", hint: "", i18n: {} };
      const d = asDict(x);
      return { value: asStr(d.value ?? d.key ?? d.code ?? d.id), label: asStr(d.label ?? d.title ?? d.name), hint: asStr(d.hint ?? d.description), i18n: i18nOf(d.label_i18n ?? d.title_i18n ?? d.labels) };
    })
    .filter((o) => o.value);
}
const MB = 1024 * 1024;
export function achievementConfigOf(raw: unknown): AchievementConfig {
  const d = asDict(raw);
  const ev = asDict(d.evidence ?? d.evidence_rules ?? d.files);
  const desc = asDict(d.description);
  const mb = num(ev.max_file_size_mb ?? ev.max_size_mb ?? d.max_file_size_mb);
  const bytes = num(ev.max_file_size_bytes ?? ev.max_size_bytes ?? ev.max_file_size ?? ev.max_size ?? d.max_file_size_bytes);
  const warning = d.warning ?? d.warning_text ?? d.submit_warning ?? d.notice;
  const w = asDict(warning);
  return {
    stages: optionsOf(d.process_stages ?? d.stages),
    results: optionsOf(d.result_scopes ?? d.results),
    evidenceRequired: (ev.required ?? d.evidence_required) !== false,
    minFiles: num(ev.min_files ?? ev.minimum ?? ev.min ?? d.min_files),
    maxFiles: num(ev.max_files ?? ev.maximum ?? ev.max ?? d.max_files),
    maxBytes: bytes ?? (mb === null ? null : mb * MB),
    mimeTypes: strs(ev.mime_types ?? ev.allowed_mime_types ?? d.allowed_mime_types).map((m) => m.toLowerCase()),
    extensions: strs(ev.extensions ?? ev.allowed_extensions ?? ev.formats ?? d.allowed_extensions ?? d.file_formats).map((x) => x.toLowerCase().replace(/^\./, "")),
    descMin: num(desc.min_length ?? d.description_min_length),
    descMax: num(desc.max_length ?? d.description_max_length),
    warning: typeof warning === "string" ? warning : asStr(w.text ?? w.message ?? w.label),
    warningI18n: i18nOf(d.warning_i18n ?? w.text_i18n ?? w.i18n),
  };
}
export async function getAchievementConfig(signal?: AbortSignal): Promise<AchievementConfig> {
  return achievementConfigOf(await http("/marketplace/me/achievements/config", { signal }));
}
// What the file input may pick: the backend's types and extensions.
export const acceptOf = (c: AchievementConfig) => [...c.mimeTypes, ...c.extensions.map((x) => `.${x}`)].join(",");
// A file the config refuses before it is sent: "type", "size" or "".
export function fileIssue(f: { name: string; type: string; size: number }, c: AchievementConfig): "" | "type" | "size" {
  const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? "").toLowerCase();
  const typed = c.mimeTypes.length || c.extensions.length;
  if (typed && !c.mimeTypes.includes(f.type.toLowerCase()) && !c.extensions.includes(ext)) return "type";
  if (c.maxBytes !== null && f.size > c.maxBytes) return "size";
  return "";
}

// ── Records ──
export type AchievementStatus = "ai_analysis_pending" | "pending_review" | "approved" | "rejected" | "changes_requested" | "superseded" | "other";
export const ACHIEVEMENT_STATUSES = ["ai_analysis_pending", "pending_review", "approved", "changes_requested", "rejected", "superseded"] as const;
// The software check, as information only: running, done, or handed to an
// operator by hand (it never approves or rejects anything).
export type AiState = "running" | "done" | "manual" | "";
export type Achievement = {
  id: string;
  rootId: string;
  sourceId: string;
  version: number | null;
  status: AchievementStatus;
  stage: string;
  result: string;
  categoryId: string;
  categoryTitle: string;
  // YYYY-MM-DD, as sent.
  achievedAt: string;
  description: string;
  publicDescription: string;
  evidence: ExperienceEvidence[];
  ai: AiState;
  reason: string;
  submittedAt: string;
  reviewedAt: string;
};
export type AchievementGroup = { rootId: string; current: Achievement | null; pending: Achievement | null; latest: Achievement | null; revisionCount: number };

function statusOf(v: unknown): AchievementStatus {
  const s = asStr(v).toLowerCase();
  if (s === "pending") return "pending_review";
  return (ACHIEVEMENT_STATUSES as readonly string[]).includes(s) ? (s as AchievementStatus) : s.startsWith("superseded") ? "superseded" : "other";
}
export const isPendingStatus = (s: AchievementStatus) => s === "ai_analysis_pending" || s === "pending_review";
export function aiStateOf(v: unknown): AiState {
  const s = asStr(v).toLowerCase();
  if (!s) return "";
  if (["pending", "queued", "processing", "running", "in_progress", "ai_analysis_pending"].includes(s)) return "running";
  if (["failed", "error", "manual_review", "manual_review_required", "skipped", "unavailable"].includes(s)) return "manual";
  return "done";
}
function evidenceOf(v: unknown): ExperienceEvidence {
  const d = asDict(v);
  const id = asStr(d.id ?? d.evidence_id);
  return { id, fileName: asStr(d.file_name ?? d.name), mimeType: asStr(d.mime_type), size: num(d.size), downloadUrl: asStr(d.download_url) || (id ? `/marketplace/achievements/evidence/${encodeURIComponent(id)}` : "") };
}
export function achievementOf(v: unknown): Achievement | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  const ai = asDict(d.ai_analysis ?? d.ai);
  const status = statusOf(d.status);
  return {
    id,
    rootId: asStr(d.root_id) || id,
    sourceId: asStr(d.source_id),
    version: num(d.version),
    status,
    stage: asStr(d.process_stage),
    result: asStr(d.result_scope),
    categoryId: asStr(d.category_id),
    categoryTitle: asStr(d.category_title ?? asDict(d.category).title ?? asDict(d.category).name),
    achievedAt: day(d.achieved_at),
    description: asStr(d.description),
    publicDescription: asStr(d.public_description),
    evidence: asArr(d.evidence ?? d.evidence_files).map(evidenceOf).filter((e) => e.id),
    ai: aiStateOf(d.ai_analysis_status ?? d.ai_status ?? ai.status) || (status === "ai_analysis_pending" ? "running" : ""),
    reason: asStr(d.rejection_reason ?? d.review_reason ?? d.reason),
    submittedAt: asStr(d.submitted_at ?? d.created_at),
    reviewedAt: asStr(d.reviewed_at),
  };
}
const byVersion = (a: Achievement, b: Achievement) => (a.version ?? 0) - (b.version ?? 0) || a.submittedAt.localeCompare(b.submittedAt);

// Revisions of one achievement, together: what is approved now, what
// waits (software check or operator), and the newest one.
export function groupAchievements(items: readonly Achievement[]): AchievementGroup[] {
  const map = new Map<string, Achievement[]>();
  for (const it of items) map.set(it.rootId, [...(map.get(it.rootId) ?? []), it]);
  return [...map.entries()].map(([rootId, rows]) => {
    const sorted = rows.slice().sort(byVersion);
    return {
      rootId,
      current: sorted.filter((x) => x.status === "approved").pop() ?? null,
      pending: sorted.filter((x) => isPendingStatus(x.status)).pop() ?? null,
      latest: sorted[sorted.length - 1] ?? null,
      revisionCount: sorted.length,
    };
  });
}

export type Page<T> = { items: T[]; total: number; count: number; limit: number; offset: number; hasMore: boolean };
export function pageOf<T>(raw: unknown, item: (v: unknown) => T | null): Page<T> {
  const d = asDict(raw);
  const items = asArr(Array.isArray(raw) ? raw : d.items)
    .map(item)
    .filter((x): x is T => x !== null);
  const offset = num(d.offset) ?? 0;
  const total = num(d.total) ?? offset + items.length;
  return { items, total, count: num(d.count) ?? items.length, limit: num(d.limit) ?? items.length, offset, hasMore: d.has_more === true || (d.has_more === undefined && offset + items.length < total) };
}
const query = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]]))).toString();

export async function listMyAchievements(opts: { status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<Page<Achievement>> {
  return pageOf(await http(`/marketplace/me/achievements?${query({ status: opts.status || undefined, limit: opts.limit ?? 50, offset: opts.offset ?? 0 })}`, { signal }), achievementOf);
}

// The date picker's YYYY-MM-DD goes as it is (never a midnight timestamp).
export type AchievementInput = { sourceId?: string; stage: string; result: string; categoryId: string; achievedOn: string; description: string; evidenceIds: string[] };
export function achievementBody(input: AchievementInput): Dict {
  const body: Dict = {
    process_stage: input.stage,
    result_scope: input.result,
    category_id: input.categoryId,
    achieved_at: input.achievedOn.slice(0, 10),
    description: input.description.trim(),
    evidence_ids: input.evidenceIds,
  };
  if (input.sourceId) body.source_id = input.sourceId;
  return body;
}
export async function submitAchievement(input: AchievementInput): Promise<Achievement | null> {
  return achievementOf(await http("/marketplace/me/achievements", { method: "POST", body: JSON.stringify(achievementBody(input)) }));
}
// One file per request; `onProgress` gets 0…1.
export async function uploadAchievementEvidence(file: File, onProgress?: (f: number) => void, signal?: AbortSignal): Promise<ExperienceEvidence> {
  const form = new FormData();
  form.append("file", file);
  return evidenceOf(await httpUpload("/marketplace/me/achievements/evidence", form, { onProgress, signal }));
}
export async function downloadAchievementEvidence(ev: ExperienceEvidence): Promise<void> {
  if (!ev.downloadUrl) throw new ApiError(404, "no evidence url");
  saveBlob(await httpBlob(ev.downloadUrl), ev.fileName || "evidence");
}

// Where a refusal belongs on the form: a field ("achieved_at", "category_id",
// "description", "evidence"), the whole form ("form"), a gone record
// ("missing": read the list again), or one file row ("file").
export type AchievementErrorField = "achieved_at" | "category_id" | "description" | "process_stage" | "result_scope" | "evidence" | "file" | "form" | "missing";
const ACH_FIELD: Record<string, AchievementErrorField> = {
  achievement_future_date: "achieved_at",
  achievement_category_invalid: "category_id",
  achievement_evidence_required: "evidence",
  achievement_evidence_invalid: "evidence",
  achievement_revision_already_pending: "form",
  achievement_not_found: "missing",
  achievement_evidence_too_large: "file",
  achievement_evidence_type_not_allowed: "file",
};
const FORM_FIELDS: readonly AchievementErrorField[] = ["achieved_at", "category_id", "description", "process_stage", "result_scope"];
export function achievementErrorOf(e: unknown): { code: string; field: AchievementErrorField } | null {
  if (!(e instanceof ApiError)) return null;
  const code = asStr(asDict(e.data.detail).code) || e.code || "";
  if (ACH_FIELD[code]) return { code, field: ACH_FIELD[code] };
  if (e.status === 413) return { code: "achievement_evidence_too_large", field: "file" };
  if (e.status === 415) return { code: "achievement_evidence_type_not_allowed", field: "file" };
  // A plain 422 names the field it refused.
  const named = Object.keys(e.fieldErrors).find((k) => (FORM_FIELDS as readonly string[]).includes(k) || k === "evidence_ids");
  if (named) return { code: code || "validation", field: named === "evidence_ids" ? "evidence" : (named as AchievementErrorField) };
  return code.startsWith("achievement_") ? { code, field: "form" } : null;
}

// ── The public profile: approved, sanitized, no evidence ──
export type PublicAchievement = { id: string; stage: string; result: string; categoryId: string; categoryTitle: string; year: number | null; achievedAt: string; description: string; verified: boolean; verifiedAt: string };
export function publicAchievementOf(v: unknown): PublicAchievement | null {
  const x = asDict(v);
  const stage = asStr(x.process_stage);
  if (!stage) return null;
  const achievedAt = day(x.achieved_at);
  return {
    id: asStr(x.id),
    stage,
    result: asStr(x.result_scope),
    categoryId: asStr(x.category_id),
    categoryTitle: asStr(x.category_title),
    year: num(x.year) ?? (achievedAt ? Number(achievedAt.slice(0, 4)) || null : null),
    achievedAt,
    description: asStr(x.public_description ?? x.description),
    verified: x.lexgo_verified !== false,
    verifiedAt: asStr(x.verified_at),
  };
}
export async function listPublicAchievements(sellerUserId: string, opts: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<Page<PublicAchievement>> {
  return pageOf(await http(`/marketplace/lawyers/${encodeURIComponent(sellerUserId)}/achievements?${query({ limit: opts.limit ?? 20, offset: opts.offset ?? 0 })}`, { signal }), publicAchievementOf);
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
export async function listAchievementQueue(opts: { status?: string; sellerUserId?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<Page<AchievementQueueItem>> {
  const qs = query({ status: opts.status ?? "pending_review", seller_user_id: opts.sellerUserId || undefined, limit: opts.limit ?? 50, offset: opts.offset ?? 0 });
  return pageOf(await http(`/call-center/marketplace/achievements?${qs}`, { signal }), queueItemOf);
}

// The software's risk indicators — never a verdict. null = not reported.
export type Level = "low" | "medium" | "high" | "";
export type AiRisk = {
  status: AiState;
  documentReadable: boolean | null;
  claimSupported: boolean | null;
  stageMatches: boolean | null;
  resultMatches: boolean | null;
  // 0…1 when given as a share.
  authenticity: number | null;
  manipulation: { level: Level; score: number | null };
  aiGenerated: { level: Level; score: number | null };
  riskLevel: Level;
  riskCodes: { code: string; label: string }[];
  signature: boolean | null;
  seal: boolean | null;
  eSignature: boolean | null;
  pii: boolean | null;
  notes: string[];
};
const levelOf = (v: unknown): Level => {
  const s = asStr(v).toLowerCase();
  return s === "low" || s === "medium" || s === "high" ? s : s === "moderate" ? "medium" : s === "critical" ? "high" : "";
};
const share = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
};
const riskOf = (v: unknown) => {
  const d = asDict(v);
  if (typeof v === "string") return { level: levelOf(v), score: null };
  if (typeof v === "number") return { level: "" as Level, score: share(v) };
  return { level: levelOf(d.level ?? d.risk_level), score: share(d.score ?? d.value) };
};
export function aiRiskOf(raw: unknown): AiRisk | null {
  const d = asDict(raw);
  if (!Object.keys(d).length) return null;
  const sig = asDict(d.signature_detection ?? d.signatures);
  const pii = d.pii_detected;
  const notes = d.operator_notes;
  return {
    status: aiStateOf(d.status ?? d.state),
    documentReadable: bool(d.document_readable),
    claimSupported: bool(d.claim_supported),
    stageMatches: bool(d.stage_matches),
    resultMatches: bool(d.result_scope_matches),
    authenticity: share(d.authenticity_confidence),
    manipulation: riskOf(d.manipulation_risk),
    aiGenerated: riskOf(d.ai_generated_risk),
    riskLevel: levelOf(d.risk_level),
    riskCodes: asArr(d.risk_codes)
      .map((x) => (typeof x === "string" ? { code: x, label: "" } : { code: asStr(asDict(x).code), label: asStr(asDict(x).label ?? asDict(x).title) }))
      .filter((x) => x.code),
    signature: bool(d.signature_detected ?? sig.signature),
    seal: bool(d.seal_detected ?? sig.seal),
    eSignature: bool(d.electronic_signature_detected ?? d.e_signature_detected ?? sig.electronic_signature ?? sig.e_signature),
    pii: Array.isArray(pii) ? pii.length > 0 : bool(pii),
    notes: Array.isArray(notes) ? strs(notes) : asStr(notes) ? [asStr(notes)] : [],
  };
}

export type AchievementReviewDetail = {
  record: AchievementQueueItem | null;
  previous: Achievement | null;
  reviews: ExperienceReviewEntry[];
  checks: CheckItem[];
  diff: DiffRow[];
  room: ReviewRoom | null;
  seller: ReviewSeller | null;
  ai: AiRisk | null;
};
const reviewOf = (v: unknown): ExperienceReviewEntry => {
  const d = asDict(v);
  const dec = asStr(d.decision ?? d.status);
  return { id: asStr(d.id), decision: dec === "approved" || dec === "approve" ? "approved" : dec === "rejected" || dec === "reject" ? "rejected" : "", reason: asStr(d.reason), checklist: [], reviewedAt: asStr(d.reviewed_at) };
};
// Field-by-field when the backend sends no diff: what is shown, compared.
export function achievementDiff(next: Achievement | null, prev: Achievement | null): DiffRow[] {
  if (!next || !prev) return [];
  const rows: DiffRow[] = [];
  const add = (field: string, before: string, after: string) => {
    if (before !== after) rows.push({ field, label: "", before, after, kind: !before ? "added" : !after ? "removed" : "changed" });
  };
  add("process_stage", prev.stage, next.stage);
  add("result_scope", prev.result, next.result);
  add("category_id", prev.categoryId, next.categoryId);
  add("achieved_at", prev.achievedAt, next.achievedAt);
  add("description", prev.description, next.description);
  add("evidence", prev.evidence.map((e) => e.fileName).join("; "), next.evidence.map((e) => e.fileName).join("; "));
  return rows;
}
export async function getAchievementForReview(id: string, signal?: AbortSignal): Promise<AchievementReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/achievements/${encodeURIComponent(id)}`, { signal }));
  const raw = asDict(d.record ?? d.achievement);
  const record = queueItemOf(Object.keys(raw).length ? { ...raw, evidence: raw.evidence ?? d.evidence } : d);
  const previous = achievementOf(d.previous_approved_revision);
  const given = diffRowsOf(d.diff);
  return {
    record,
    previous,
    reviews: asArr(d.reviews).map(reviewOf),
    checks: checkItemsOf(d.checklist, strs(d.checklist_keys)),
    diff: given.length ? given : achievementDiff(record, previous),
    room: reviewRoomOf(d.communication ?? d.review_room ?? {}),
    seller: reviewSellerOf(d.seller),
    ai: aiRiskOf(d.ai_analysis ?? raw.ai_analysis ?? d.ai),
  };
}
// Our decisions in the backend's words for this endpoint.
export const DECISION_WIRE: Record<ReviewDecision, string> = { approved: "approve", rejected: "reject", changes_requested: "changes_requested" };
export function achievementReviewBody(input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows; publicDescription?: string }): Dict {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  const body: Dict = { decision: DECISION_WIRE[input.decision], reason: input.decision === "approved" ? "" : input.reason.trim(), checklist };
  if (input.decision === "approved") body.public_description = (input.publicDescription ?? "").trim();
  return body;
}
export async function reviewAchievement(id: string, input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows; publicDescription?: string }): Promise<void> {
  await http(`/call-center/marketplace/achievements/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify(achievementReviewBody(input)) });
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
