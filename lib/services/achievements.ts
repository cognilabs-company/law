// An advocate's professional achievements (final contract 2026-10-29,
// docs/LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_CONTRACT_2026_10_29.md §2–8): a
// positive result reached at one stage of a case — before investigation,
// inquiry, preliminary investigation or court — fully or partly. The form,
// its labels and its file rules come from the backend's config; each record
// is analysed by software first (advice only) and decided by a LexGo
// operator. Approved achievements count for the rating, never the price, and
// only their operator-approved public text reaches the profile. Every field
// read here is the contract's canonical name — no aliases.
import { ApiError, asArr, asDict, asStr, errorCode, http, httpBlob, httpUpload, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { labelledOf, type Labelled } from "@/lib/backendLabel";
import { DECISION_WIRE, checkItemsOf, diffRowsOf, historyOf, reviewOf, reviewRoomOf, reviewSellerOf, type CheckItem, type CheckRows, type DiffRow, type ExperienceEvidence, type ExperienceReviewEntry, type HistoryRow, type ReviewDecision, type ReviewRoom, type ReviewSeller } from "./experience";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const bool = (v: unknown): boolean | null => (v === true || v === false ? v : null);
const strs = (v: unknown): string[] => asArr(v).map((x) => asStr(x)).filter(Boolean);
const day = (v: unknown) => asStr(v).slice(0, 10);

// ── Config (§2): the only source of the form ──
export type ConfigOption = Labelled & { value: string };
// The file rules, shared with the certificate config (§9).
export type EvidenceRules = { required: boolean; minFiles: number; maxFiles: number; maxBytes: number; mimeTypes: string[]; extensions: string[] };
export type AchievementConfig = {
  stages: ConfigOption[];
  results: ConfigOption[];
  evidence: EvidenceRules;
  descMin: number;
  descMax: number;
  warning: Labelled;
  workflow: string[];
};
const optionsOf = (v: unknown): ConfigOption[] =>
  asArr(v)
    .map((x) => ({ value: asStr(asDict(x).value), ...labelledOf(x) }))
    .filter((o) => o.value);
export function evidenceRulesOf(v: unknown): EvidenceRules {
  const d = asDict(v);
  return {
    required: d.required === true,
    minFiles: num(d.min_files) ?? 0,
    maxFiles: num(d.max_files) ?? 0,
    maxBytes: num(d.max_file_size_bytes) ?? 0,
    mimeTypes: strs(d.allowed_mime_types).map((m) => m.toLowerCase()),
    // ".pdf" → "pdf"
    extensions: strs(d.allowed_extensions).map((x) => x.toLowerCase().replace(/^\./, "")),
  };
}
export function achievementConfigOf(raw: unknown): AchievementConfig {
  const d = asDict(raw);
  const desc = asDict(d.description);
  return {
    stages: optionsOf(d.process_stages),
    results: optionsOf(d.result_scopes),
    evidence: evidenceRulesOf(d.evidence),
    descMin: num(desc.min_length) ?? 0,
    descMax: num(desc.max_length) ?? 0,
    warning: { label: asStr(d.warning), i18n: labelledOf({ label_i18n: d.warning_i18n }).i18n },
    workflow: strs(d.workflow),
  };
}
export async function getAchievementConfig(signal?: AbortSignal): Promise<AchievementConfig> {
  return achievementConfigOf(await http("/marketplace/me/achievements/config", { signal }));
}
// What the file input may pick.
export const acceptOf = (r: EvidenceRules) => [...r.mimeTypes, ...r.extensions.map((x) => `.${x}`)].join(",");
// A file the rules refuse before it is sent: "type", "size" or "".
export function fileIssue(f: { name: string; type: string; size: number }, r: EvidenceRules): "" | "type" | "size" {
  const ext = (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? "").toLowerCase();
  if ((r.mimeTypes.length || r.extensions.length) && !r.mimeTypes.includes(f.type.toLowerCase()) && !r.extensions.includes(ext)) return "type";
  if (r.maxBytes > 0 && f.size > r.maxBytes) return "size";
  return "";
}

// ── Records (§4) ──
export const ACHIEVEMENT_STATUSES = ["ai_analysis_pending", "pending_review", "approved", "changes_requested", "rejected", "superseded"] as const;
export type AchievementStatus = (typeof ACHIEVEMENT_STATUSES)[number] | "other";
// The software check, as information only: running, done, or left to the
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
  // The record's own stage/result labels (final contract §3–4).
  stageLabel: Labelled | null;
  resultLabel: Labelled | null;
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

const statusOf = (v: unknown): AchievementStatus => {
  const s = asStr(v);
  return (ACHIEVEMENT_STATUSES as readonly string[]).includes(s) ? (s as AchievementStatus) : "other";
};
export const isPendingStatus = (s: AchievementStatus) => s === "ai_analysis_pending" || s === "pending_review";
// ai_analysis_status (final contract 2026-10-29 §3: exactly pending |
// completed | manual_review_required) → what is shown. Anything else is left to the
// operator, never read as done.
export function aiStateOf(v: unknown): AiState {
  const s = asStr(v);
  if (!s) return "";
  return s === "pending" ? "running" : s === "completed" ? "done" : "manual";
}
export function evidenceOf(v: unknown): ExperienceEvidence {
  const d = asDict(v);
  return { id: asStr(d.id), fileName: asStr(d.file_name), mimeType: asStr(d.mime_type), size: num(d.size), downloadUrl: asStr(d.download_url) };
}
// process_stage_label + process_stage_label_i18n (final contract §3–4);
// null when absent.
export function recordLabelOf(d: Record<string, unknown>, field: "process_stage" | "result_scope"): Labelled | null {
  const l = labelledOf({ label: d[`${field}_label`], label_i18n: d[`${field}_label_i18n`] });
  return l.label || Object.keys(l.i18n).length ? l : null;
}
export function achievementOf(v: unknown): Achievement | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  return {
    id,
    rootId: asStr(d.root_id) || id,
    sourceId: asStr(d.source_id),
    version: num(d.version),
    status: statusOf(d.status),
    stage: asStr(d.process_stage),
    result: asStr(d.result_scope),
    stageLabel: recordLabelOf(d, "process_stage"),
    resultLabel: recordLabelOf(d, "result_scope"),
    categoryId: asStr(d.category_id),
    categoryTitle: asStr(d.category_title),
    achievedAt: day(d.achieved_at),
    description: asStr(d.description),
    publicDescription: asStr(d.public_description),
    evidence: asArr(d.evidence).map(evidenceOf).filter((e) => e.id),
    ai: aiStateOf(d.ai_analysis_status),
    reason: asStr(d.rejection_reason),
    submittedAt: asStr(d.submitted_at),
    reviewedAt: asStr(d.reviewed_at),
  };
}

export type Page<T> = { items: T[]; total: number; count: number; limit: number; offset: number; hasMore: boolean };
// PaginatedContractOut.
export function pageOf<T>(raw: unknown, item: (v: unknown) => T | null): Page<T> {
  const d = asDict(raw);
  const items = asArr(d.items)
    .map(item)
    .filter((x): x is T => x !== null);
  return { items, total: num(d.total) ?? items.length, count: num(d.count) ?? items.length, limit: num(d.limit) ?? 0, offset: num(d.offset) ?? 0, hasMore: d.has_more === true };
}
// The advocate's list is paged by revision root (§4): `total` counts roots,
// `totalRecords` every revision.
export type GroupPage = { groups: AchievementGroup[]; total: number; totalRecords: number; count: number; hasMore: boolean };
export function groupPageOf(raw: unknown): GroupPage {
  const d = asDict(raw);
  const groups = asArr(d.groups)
    .map((g) => {
      const x = asDict(g);
      const latest = achievementOf(x.latest);
      return { rootId: asStr(x.root_id), current: achievementOf(x.current), pending: achievementOf(x.pending_revision), latest, revisionCount: num(x.revision_count) ?? 1 };
    })
    .filter((g) => g.rootId && (g.current || g.pending || g.latest));
  return { groups, total: num(d.total) ?? groups.length, totalRecords: num(d.total_records) ?? 0, count: num(d.count) ?? groups.length, hasMore: d.has_more === true };
}
const query = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]]))).toString();

export async function listMyAchievements(opts: { status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<GroupPage> {
  return groupPageOf(await http(`/marketplace/me/achievements?${query({ status: opts.status, limit: opts.limit ?? 50, offset: opts.offset ?? 0 })}`, { signal }));
}

// The date picker's YYYY-MM-DD goes as it is (never a midnight timestamp).
// A revision names the latest record in source_id (§3).
export type AchievementInput = { sourceId?: string; stage: string; result: string; categoryId: string; achievedOn: string; description: string; evidenceIds: string[] };
export function achievementBody(input: AchievementInput): Dict {
  return {
    source_id: input.sourceId || null,
    process_stage: input.stage,
    result_scope: input.result,
    category_id: input.categoryId,
    achieved_at: input.achievedOn.slice(0, 10),
    description: input.description.trim(),
    evidence_ids: input.evidenceIds,
  };
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
  saveBlob(await httpBlob(ev.downloadUrl || `/marketplace/achievements/evidence/${encodeURIComponent(ev.id)}`), ev.fileName || "evidence");
}

// Where a refusal belongs on the form: a field, the whole form ("form"), a
// gone record ("missing": read the list again), or one file row ("file").
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
export function achievementErrorOf(e: unknown): { code: string; field: AchievementErrorField } | null {
  if (!(e instanceof ApiError)) return null;
  const code = errorCode(e);
  if (ACH_FIELD[code]) return { code, field: ACH_FIELD[code] };
  return code.startsWith("achievement_") ? { code, field: "form" } : null;
}

// ── The public profile (§5): approved, operator-approved text only ──
export type PublicAchievement = { id: string; stage: string; result: string; stageLabel: Labelled | null; resultLabel: Labelled | null; categoryTitle: string; year: number | null; publicDescription: string; verified: boolean; verifiedAt: string };
export function publicAchievementOf(v: unknown): PublicAchievement | null {
  const x = asDict(v);
  const id = asStr(x.id);
  if (!id) return null;
  return {
    id,
    stage: asStr(x.process_stage),
    result: asStr(x.result_scope),
    stageLabel: recordLabelOf(x, "process_stage"),
    resultLabel: recordLabelOf(x, "result_scope"),
    categoryTitle: asStr(x.category_title),
    year: num(x.year),
    publicDescription: asStr(x.public_description),
    verified: x.lexgo_verified === true,
    verifiedAt: asStr(x.verified_at),
  };
}
export async function listPublicAchievements(sellerUserId: string, opts: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<Page<PublicAchievement>> {
  return pageOf(await http(`/marketplace/lawyers/${encodeURIComponent(sellerUserId)}/achievements?${query({ limit: opts.limit ?? 20, offset: opts.offset ?? 0 })}`, { signal }), publicAchievementOf);
}

// ── Call center (§6) ──
// A queue row's advocate: seller { id, lexgo_id, name, phone, role,
// account_status } (final contract §5, PaginatedReviewQueueOut).
export type AchievementQueueItem = Achievement & { sellerUserId: string; seller: ReviewSeller | null };
export const queueItemOf = (v: unknown): AchievementQueueItem | null => {
  const it = achievementOf(v);
  if (!it) return null;
  const seller = reviewSellerOf(asDict(v).seller);
  return { ...it, sellerUserId: seller?.id ?? "", seller };
};
export async function listAchievementQueue(opts: { status?: string; sellerUserId?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<Page<AchievementQueueItem>> {
  const qs = query({ status: opts.status ?? "pending_review", seller_user_id: opts.sellerUserId, limit: opts.limit ?? 50, offset: opts.offset ?? 0 });
  return pageOf(await http(`/call-center/marketplace/achievements?${qs}`, { signal }), queueItemOf);
}

// The normalized software analysis (§7), shared by achievements and
// certificates: risk indicators for the operator, never a verdict. Numbers
// are floats 0…1; null = not reported.
export type Level = "low" | "medium" | "high" | "";
export type RiskItem = Labelled & { code: string };
export type AiRisk = {
  status: AiState;
  documentReadable: boolean | null;
  claimSupported: boolean | null;
  stageMatches: boolean | null;
  resultMatches: boolean | null;
  authenticity: number | null;
  manipulation: number | null;
  aiGenerated: number | null;
  riskLevel: Level;
  // The flagged risks with the backend's labels; a code it sent no label
  // for is left out.
  risks: RiskItem[];
  signature: boolean | null;
  seal: boolean | null;
  eSignature: boolean | null;
  // How many kinds of personal data were found (the kinds stay private).
  piiCount: number;
  notes: string[];
};
const levelOf = (v: unknown): Level => {
  const s = asStr(v);
  return s === "low" || s === "medium" || s === "high" ? s : "";
};
const riskItemOf = (v: unknown): RiskItem => ({ code: asStr(asDict(v).code), ...labelledOf(v) });
// risk_codes resolved through risk_items, then the detail's risk_catalog.
export function aiRiskOf(raw: unknown, catalog: unknown = []): AiRisk | null {
  const d = asDict(raw);
  if (!Object.keys(d).length) return null;
  const known = [...asArr(d.risk_items), ...asArr(catalog)].map(riskItemOf).filter((r) => r.code && (r.label || Object.keys(r.i18n).length));
  const codes = [...new Set([...strs(d.risk_codes), ...asArr(d.risk_items).map((x) => asStr(asDict(x).code))].filter(Boolean))];
  const sig = asDict(d.signature_detection);
  return {
    status: aiStateOf(d.status),
    documentReadable: bool(d.document_readable),
    claimSupported: bool(d.claim_supported),
    stageMatches: bool(d.stage_matches),
    resultMatches: bool(d.result_scope_matches),
    authenticity: num(d.authenticity_confidence),
    manipulation: num(d.manipulation_risk),
    aiGenerated: num(d.ai_generated_risk),
    riskLevel: levelOf(d.risk_level),
    risks: codes.flatMap((c) => known.find((k) => k.code === c) ?? []),
    signature: bool(sig.signature),
    seal: bool(sig.seal),
    eSignature: bool(sig.electronic_signature),
    piiCount: asArr(d.pii_detected).length,
    notes: strs(d.operator_notes),
  };
}

export type AchievementReviewDetail = {
  record: AchievementQueueItem | null;
  previous: Achievement | null;
  reviews: ExperienceReviewEntry[];
  history: HistoryRow[];
  checks: CheckItem[];
  diff: DiffRow[];
  room: ReviewRoom | null;
  seller: ReviewSeller | null;
  ai: AiRisk | null;
  advisoryOnly: boolean;
};
export async function getAchievementForReview(id: string, signal?: AbortSignal): Promise<AchievementReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/achievements/${encodeURIComponent(id)}`, { signal }));
  return {
    record: queueItemOf(d.record),
    previous: achievementOf(d.previous_approved_revision),
    reviews: asArr(d.reviews).map(reviewOf),
    history: historyOf(d.history),
    checks: checkItemsOf(d.checklist),
    diff: diffRowsOf(d.diff),
    room: reviewRoomOf(d.communication),
    seller: reviewSellerOf(d.seller),
    ai: aiRiskOf(d.ai_analysis, d.risk_catalog),
    advisoryOnly: d.ai_advisory_only === true,
  };
}
export { DECISION_WIRE };
export function achievementReviewBody(input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows; publicDescription?: string }): Dict {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  return {
    decision: DECISION_WIRE[input.decision],
    reason: input.decision === "approved" ? "" : input.reason.trim(),
    public_description: input.decision === "approved" ? (input.publicDescription ?? "").trim() : "",
    checklist,
  };
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
