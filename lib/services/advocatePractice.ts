// An advocate's verified practice (final contract 2026-10-29 §9–12): the
// advocate uploads the advocate-status certificate, software reads it and
// suggests the values, the advocate checks and submits them, and a LexGo
// operator verifies. Tenure — active days and years, minus suspension
// periods — is worked out by the backend only; nothing here counts it, and
// the general profile can no longer change it. Canonical fields only.
import { ApiError, asArr, asDict, asStr, http, httpBlob, httpUpload, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { checkItemsOf, diffRowsOf, historyOf, reviewOf, reviewRoomOf, reviewSellerOf, type CheckItem, type CheckRows, type DiffRow, type ExperienceEvidence, type ExperienceReviewEntry, type HistoryRow, type ReviewDecision, type ReviewRoom, type ReviewSeller } from "./experience";
import { DECISION_WIRE, aiRiskOf, evidenceOf, evidenceRulesOf, pageOf, type AiRisk, type EvidenceRules, type Page } from "./achievements";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const day = (v: unknown) => asStr(v).slice(0, 10);

// ── Config (§9) ──
export async function getLicenseConfig(signal?: AbortSignal): Promise<EvidenceRules> {
  return evidenceRulesOf(asDict(await http("/marketplace/me/advocate-license/config", { signal })).evidence);
}

// ── The certificate file and what software read from it ──
export type LicenseEvidenceState = "processing" | "analyzed" | "manual_review_required" | "other";
// Suggestions only: they pre-fill fields the advocate edits.
export type LicenseFields = { holderName: string; certificateNumber: string; licenseNumber: string; issuingAuthority: string; statusStartedAt: string };
export type LicenseEvidence = ExperienceEvidence & { state: LicenseEvidenceState; suggested: LicenseFields };
const stateOf = (v: unknown): LicenseEvidenceState => {
  const s = asStr(v);
  return s === "processing" || s === "analyzed" || s === "manual_review_required" ? s : "other";
};
// The §9 field names, as in the submit body and extracted_fields.
export function licenseFieldsOf(v: unknown): LicenseFields {
  const d = asDict(v);
  return {
    holderName: asStr(d.holder_name),
    certificateNumber: asStr(d.certificate_number),
    licenseNumber: asStr(d.license_number),
    issuingAuthority: asStr(d.issuing_authority),
    statusStartedAt: day(d.advocate_status_started_at),
  };
}
const evidenceUrl = (id: string) => `/marketplace/advocate-license/evidence/${encodeURIComponent(id)}/download`;
// GET …/evidence/{id} and the upload answer: { id, status, file_name, … }.
export function licenseEvidenceOf(v: unknown): LicenseEvidence {
  const d = asDict(v);
  const id = asStr(d.id);
  return { id, fileName: asStr(d.file_name), mimeType: asStr(d.mime_type), size: num(d.size), downloadUrl: id ? evidenceUrl(id) : "", state: stateOf(d.status), suggested: licenseFieldsOf(d.extracted_fields) };
}
// marketplace.advocate_license_evidence_analyzed: { evidence_id, status,
// extracted_fields, ai_analysis } — patches the card at once.
export function licenseAnalyzedOf(e: Record<string, unknown>): { id: string; state: LicenseEvidenceState; suggested: LicenseFields } | null {
  const id = asStr(e.evidence_id);
  return id ? { id, state: stateOf(e.status), suggested: licenseFieldsOf(e.extracted_fields) } : null;
}
export async function uploadLicenseEvidence(file: File, onProgress?: (f: number) => void, signal?: AbortSignal): Promise<LicenseEvidence> {
  const form = new FormData();
  form.append("file", file);
  return licenseEvidenceOf(await httpUpload("/marketplace/me/advocate-license/evidence", form, { onProgress, signal }));
}
export async function getLicenseEvidence(id: string, signal?: AbortSignal): Promise<LicenseEvidence> {
  return licenseEvidenceOf(await http(`/marketplace/me/advocate-license/evidence/${encodeURIComponent(id)}`, { signal }));
}
export async function downloadLicenseEvidence(ev: ExperienceEvidence): Promise<void> {
  saveBlob(await httpBlob(ev.downloadUrl || evidenceUrl(ev.id)), ev.fileName || "certificate");
}

// A resubmission names the latest verification in source_id (§9).
export type LicenseInput = { sourceId?: string; evidenceId: string } & LicenseFields;
export function licenseBody(input: LicenseInput): Dict {
  return {
    source_id: input.sourceId || null,
    evidence_id: input.evidenceId,
    holder_name: input.holderName.trim(),
    certificate_number: input.certificateNumber.trim(),
    license_number: input.licenseNumber.trim(),
    issuing_authority: input.issuingAuthority.trim(),
    advocate_status_started_at: input.statusStartedAt.slice(0, 10),
  };
}
export async function submitLicense(input: LicenseInput): Promise<void> {
  await http("/marketplace/me/advocate-license/submit", { method: "POST", body: JSON.stringify(licenseBody(input)) });
}

// The first thing still missing on the form ("" = ready).
export function licenseIssue(f: LicenseFields & { evidenceId: string; state: LicenseEvidenceState | "" }, today: string): string {
  if (!f.evidenceId) return "evidence";
  if (f.state === "processing") return "processing";
  if (f.holderName.trim().length < 2) return "holder_name";
  if (!f.certificateNumber.trim()) return "certificate_number";
  if (f.issuingAuthority.trim().length < 2) return "issuing_authority";
  if (!f.statusStartedAt || f.statusStartedAt > today) return "advocate_status_started_at";
  return "";
}

const LICENSE_FIELD: Record<string, string> = {
  advocate_status_future_date: "advocate_status_started_at",
  advocate_license_evidence_invalid: "evidence",
  advocate_license_evidence_too_large: "evidence",
  advocate_license_evidence_type_not_allowed: "evidence",
  advocate_license_ai_analysis_pending: "processing",
  advocate_license_verification_pending: "form",
};
export function licenseErrorOf(e: unknown): { code: string; field: string } | null {
  if (!(e instanceof ApiError)) return null;
  const code = e.code ?? "";
  if (LICENSE_FIELD[code]) return { code, field: LICENSE_FIELD[code] };
  return code.startsWith("advocate_") ? { code, field: "form" } : null;
}

// ── The practice, as the backend counts it (§10, AdvocatePracticeOut) ──
export const VERIFICATION_STATUSES = ["not_submitted", "pending_review", "approved", "rejected", "changes_requested"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number] | "other";
export const verificationStatusOf = (v: unknown): VerificationStatus => {
  const s = asStr(v);
  if (!s) return "not_submitted";
  return (VERIFICATION_STATUSES as readonly string[]).includes(s) ? (s as VerificationStatus) : "other";
};
export type Suspension = { id: string; startedAt: string; endedAt: string; reason: string; days: number | null; evidenceIds: string[] };
export type Practice = {
  sellerUserId: string;
  statusStartedAt: string;
  verification: VerificationStatus;
  verifiedAt: string;
  activeDays: number | null;
  activeYears: number | null;
  suspendedDays: number | null;
  suspensions: Suspension[];
  certificateNumber: string;
  issuingAuthority: string;
  // The last verification: the source of a resubmission and its reason.
  latest: { id: string; status: VerificationStatus; reason: string; version: number | null } | null;
  legalBasis: { text: string; suspensionExcluded: boolean };
};
const suspensionOf = (v: unknown): Suspension | null => {
  const d = asDict(v);
  const startedAt = day(d.started_at);
  if (!startedAt) return null;
  return { id: asStr(d.id), startedAt, endedAt: day(d.ended_at), reason: asStr(d.reason), days: num(d.days), evidenceIds: asArr(d.evidence_ids).map((x) => asStr(x)).filter(Boolean) };
};
export function practiceOf(raw: unknown): Practice {
  const d = asDict(raw);
  const last = asDict(d.latest_verification);
  const basis = asDict(d.legal_basis);
  return {
    sellerUserId: asStr(d.seller_user_id),
    statusStartedAt: day(d.status_started_at),
    verification: verificationStatusOf(d.verification_status),
    verifiedAt: asStr(d.verified_at),
    activeDays: num(d.active_experience_days),
    activeYears: num(d.active_experience_years),
    suspendedDays: num(d.suspended_days),
    suspensions: asArr(d.suspensions)
      .map(suspensionOf)
      .filter((x): x is Suspension => !!x),
    certificateNumber: asStr(d.certificate_number),
    issuingAuthority: asStr(d.issuing_authority),
    latest: asStr(last.id) ? { id: asStr(last.id), status: verificationStatusOf(last.status), reason: asStr(last.reason), version: num(last.version) } : null,
    legalBasis: { text: asStr(basis.text), suspensionExcluded: basis.suspension_excluded === true },
  };
}
export async function getMyPractice(signal?: AbortSignal): Promise<Practice> {
  return practiceOf(await http("/marketplace/me/advocate-practice", { signal }));
}

// ── Call center: certificate verification (§11) ──
export type LicenseStatus = Exclude<VerificationStatus, "not_submitted">;
export type LicenseRecord = LicenseFields & {
  id: string;
  status: LicenseStatus;
  version: number | null;
  sellerUserId: string;
  sellerName: string;
  submittedAt: string;
  reason: string;
};
export function licenseRecordOf(v: unknown): LicenseRecord | null {
  const d = asDict(v);
  const id = asStr(d.id);
  if (!id) return null;
  const st = verificationStatusOf(d.status);
  return {
    id,
    status: st === "not_submitted" ? "other" : st,
    version: num(d.version),
    sellerUserId: asStr(d.seller_user_id),
    sellerName: asStr(asDict(d.seller).name),
    ...licenseFieldsOf(d),
    submittedAt: asStr(d.submitted_at),
    reason: asStr(d.rejection_reason),
  };
}
const query = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]]))).toString();
export async function listLicenseQueue(opts: { status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<Page<LicenseRecord>> {
  return pageOf(await http(`/call-center/marketplace/advocate-licenses?${query({ status: opts.status ?? "pending_review", limit: opts.limit ?? 50, offset: opts.offset ?? 0 })}`, { signal }), licenseRecordOf);
}

export type LicenseReviewDetail = {
  record: LicenseRecord | null;
  seller: ReviewSeller | null;
  evidence: ExperienceEvidence[];
  checks: CheckItem[];
  reviews: ExperienceReviewEntry[];
  history: HistoryRow[];
  diff: DiffRow[];
  ai: AiRisk | null;
  practice: Practice | null;
  room: ReviewRoom | null;
  isRevision: boolean;
  advisoryOnly: boolean;
};
export async function getLicenseForReview(id: string, signal?: AbortSignal): Promise<LicenseReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/advocate-licenses/${encodeURIComponent(id)}`, { signal }));
  const ev = evidenceOf(d.evidence);
  return {
    record: licenseRecordOf(d.record),
    seller: reviewSellerOf(d.seller),
    evidence: ev.id ? [{ ...ev, downloadUrl: ev.downloadUrl || evidenceUrl(ev.id) }] : [],
    checks: checkItemsOf(d.checklist),
    reviews: asArr(d.reviews).map(reviewOf),
    history: historyOf(d.history),
    diff: diffRowsOf(d.diff),
    ai: aiRiskOf(d.ai_analysis, d.risk_catalog),
    practice: Object.keys(asDict(d.practice)).length ? practiceOf(d.practice) : null,
    room: reviewRoomOf(d.communication),
    isRevision: Object.keys(asDict(d.previous_approved_verification)).length > 0,
    advisoryOnly: d.ai_advisory_only === true,
  };
}
export async function reviewLicense(id: string, input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows }): Promise<void> {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  await http(`/call-center/marketplace/advocate-licenses/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision: DECISION_WIRE[input.decision], reason: input.decision === "approved" ? "" : input.reason.trim(), checklist }),
  });
}
// The review chat (§11): create/reuse is idempotent; only the operator closes.
export async function openLicenseRoom(id: string): Promise<ReviewRoom> {
  const r = reviewRoomOf(await http(`/call-center/marketplace/advocate-licenses/${encodeURIComponent(id)}/communication`, { method: "POST", body: JSON.stringify({}) }));
  if (!r) throw new ApiError(0, "licence communication: no room in the answer");
  return r;
}
export async function closeLicenseRoom(id: string, current: ReviewRoom): Promise<ReviewRoom> {
  const r = reviewRoomOf(await http(`/call-center/marketplace/advocate-licenses/${encodeURIComponent(id)}/communication/close`, { method: "POST", body: JSON.stringify({}) }));
  return { ...current, ...(r ?? {}), roomId: r?.roomId || current.roomId, readOnly: true, status: r?.status || "read_only" };
}

// ── Call center: suspension periods (§12). Every write answers with the
// recounted practice object itself. ──
const suspBase = (sellerUserId: string) => `/call-center/marketplace/advocate-practice/${encodeURIComponent(sellerUserId)}/suspensions`;
export type SuspensionInput = { startedOn: string; endedOn: string; reason: string; evidenceIds: string[] };
export function suspensionBody(s: SuspensionInput): Dict {
  return { started_at: s.startedOn.slice(0, 10), ended_at: s.endedOn ? s.endedOn.slice(0, 10) : null, reason: s.reason.trim(), evidence_ids: s.evidenceIds };
}
export async function createSuspension(sellerUserId: string, s: SuspensionInput): Promise<Practice> {
  return practiceOf(await http(suspBase(sellerUserId), { method: "POST", body: JSON.stringify(suspensionBody(s)) }));
}
export async function updateSuspension(sellerUserId: string, suspensionId: string, s: { endedOn: string; reason: string }): Promise<Practice> {
  return practiceOf(await http(`${suspBase(sellerUserId)}/${encodeURIComponent(suspensionId)}`, { method: "PATCH", body: JSON.stringify({ ended_at: s.endedOn ? s.endedOn.slice(0, 10) : null, reason: s.reason.trim() }) }));
}
// A wrong period is archived (audit-safe), never erased.
export async function archiveSuspension(sellerUserId: string, suspensionId: string): Promise<Practice> {
  return practiceOf(await http(`${suspBase(sellerUserId)}/${encodeURIComponent(suspensionId)}`, { method: "DELETE" }));
}
// PDF, JPG/JPEG, PNG, WEBP, DOC, DOCX, up to 20 MB (§12).
export const SUSPENSION_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;
export const SUSPENSION_FILE_MAX = 20 * 1024 * 1024;
export async function uploadSuspensionEvidence(sellerUserId: string, file: File, onProgress?: (f: number) => void): Promise<ExperienceEvidence> {
  const form = new FormData();
  form.append("file", file);
  const ev = evidenceOf(await httpUpload(`${suspBase(sellerUserId)}/evidence`, form, { onProgress }));
  return { ...ev, downloadUrl: ev.downloadUrl || `${suspBase(sellerUserId)}/evidence/${encodeURIComponent(ev.id)}` };
}
export async function downloadSuspensionEvidence(sellerUserId: string, evidenceId: string, name: string): Promise<void> {
  saveBlob(await httpBlob(`${suspBase(sellerUserId)}/evidence/${encodeURIComponent(evidenceId)}`), name || "evidence");
}
