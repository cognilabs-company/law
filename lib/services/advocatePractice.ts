// An advocate's verified practice (contract 2026-10-29 §4): the advocate
// uploads the advocate-status certificate, software reads it and suggests
// the values, the advocate checks and submits them, and a LexGo operator
// verifies. Tenure — active days and years, minus suspension periods — is
// worked out by the backend only; nothing here counts it, and the general
// profile can no longer change it.
import { ApiError, asArr, asDict, asStr, http, httpBlob, httpUpload, type Dict } from "@/lib/http";
import { saveBlob } from "@/lib/download";
import { checkItemsOf, diffRowsOf, reviewSellerOf, type CheckItem, type CheckRows, type DiffRow, type ExperienceEvidence, type ExperienceReviewEntry, type ReviewDecision, type ReviewSeller } from "./experience";
import { DECISION_WIRE, pageOf, type Page } from "./achievements";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const day = (v: unknown) => asStr(v).slice(0, 10);
const strs = (v: unknown): string[] => asArr(v).map((x) => asStr(x)).filter(Boolean);

// ── The certificate file and what software read from it ──
export type LicenseEvidenceState = "processing" | "analyzed" | "manual_review_required" | "other";
// Suggestions only: they pre-fill fields the advocate edits.
export type LicenseFields = { holderName: string; certificateNumber: string; licenseNumber: string; issuingAuthority: string; statusStartedAt: string };
export type LicenseEvidence = ExperienceEvidence & { state: LicenseEvidenceState; suggested: LicenseFields };
const stateOf = (v: unknown): LicenseEvidenceState => {
  const s = asStr(v).toLowerCase();
  return s === "processing" || s === "analyzed" || s === "manual_review_required" ? s : s === "pending" || s === "queued" ? "processing" : s === "failed" ? "manual_review_required" : "other";
};
export function licenseFieldsOf(v: unknown): LicenseFields {
  const d = asDict(v);
  return {
    holderName: asStr(d.holder_name ?? d.full_name),
    certificateNumber: asStr(d.certificate_number),
    licenseNumber: asStr(d.license_number),
    issuingAuthority: asStr(d.issuing_authority),
    statusStartedAt: day(d.advocate_status_started_at ?? d.status_started_at ?? d.issued_at),
  };
}
const evidenceUrl = (id: string) => `/marketplace/advocate-license/evidence/${encodeURIComponent(id)}/download`;
export function licenseEvidenceOf(v: unknown): LicenseEvidence {
  const d = asDict(v);
  const id = asStr(d.id ?? d.evidence_id);
  const ai = asDict(d.ai_analysis ?? d.analysis);
  return {
    id,
    fileName: asStr(d.file_name ?? d.name),
    mimeType: asStr(d.mime_type),
    size: num(d.size),
    downloadUrl: asStr(d.download_url) || (id ? evidenceUrl(id) : ""),
    state: stateOf(d.status ?? d.state ?? ai.status),
    suggested: licenseFieldsOf(d.extracted ?? d.extracted_fields ?? d.suggested ?? d.suggestions ?? ai.extracted ?? ai.extracted_fields ?? ai),
  };
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

export type LicenseInput = { evidenceId: string } & LicenseFields;
export function licenseBody(input: LicenseInput): Dict {
  const body: Dict = {
    evidence_id: input.evidenceId,
    holder_name: input.holderName.trim(),
    certificate_number: input.certificateNumber.trim(),
    issuing_authority: input.issuingAuthority.trim(),
    advocate_status_started_at: input.statusStartedAt.slice(0, 10),
  };
  if (input.licenseNumber.trim()) body.license_number = input.licenseNumber.trim();
  return body;
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
  advocate_license_ai_analysis_pending: "processing",
  advocate_license_verification_pending: "form",
};
export function licenseErrorOf(e: unknown): { code: string; field: string } | null {
  if (!(e instanceof ApiError)) return null;
  const code = asStr(asDict(e.data.detail).code) || e.code || "";
  if (LICENSE_FIELD[code]) return { code, field: LICENSE_FIELD[code] };
  const named = Object.keys(e.fieldErrors).find((k) => ["holder_name", "certificate_number", "license_number", "issuing_authority", "advocate_status_started_at", "evidence_id"].includes(k));
  if (named) return { code: code || "validation", field: named === "evidence_id" ? "evidence" : named };
  return code.startsWith("advocate_") ? { code, field: "form" } : null;
}

// ── The practice, as the backend counts it ──
export type VerificationStatus = "none" | "pending_review" | "approved" | "rejected" | "changes_requested" | "other";
export const verificationStatusOf = (v: unknown): VerificationStatus => {
  const s = asStr(v).toLowerCase();
  if (!s || s === "unverified" || s === "not_submitted" || s === "none") return "none";
  if (s === "pending" || s === "pending_review" || s === "submitted" || s === "ai_analysis_pending") return "pending_review";
  if (s === "approved" || s === "verified") return "approved";
  return s === "rejected" || s === "changes_requested" ? s : "other";
};
export type Suspension = { id: string; startedAt: string; endedAt: string; reason: string; days: number | null };
export type Practice = {
  statusStartedAt: string;
  verification: VerificationStatus;
  verifiedAt: string;
  activeDays: number | null;
  activeYears: number | null;
  suspendedDays: number | null;
  suspensions: Suspension[];
  certificateNumber: string;
  licenseNumber: string;
  issuingAuthority: string;
  legalBasis: string;
  // The last verification's operator reason (rejected / changes requested).
  reason: string;
};
const suspensionOf = (v: unknown): Suspension | null => {
  const d = asDict(v);
  const startedAt = day(d.started_at);
  if (!startedAt) return null;
  return { id: asStr(d.id), startedAt, endedAt: day(d.ended_at), reason: asStr(d.reason), days: num(d.days ?? d.suspended_days) };
};
const textOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join("; ");
  const d = asDict(v);
  return asStr(d.text ?? d.title ?? d.label ?? d.description);
};
export function practiceOf(raw: unknown): Practice {
  const top = asDict(raw);
  const d = Object.keys(asDict(top.practice)).length ? asDict(top.practice) : top;
  const last = asDict(d.latest_verification ?? d.verification ?? d.pending_verification);
  return {
    statusStartedAt: day(d.status_started_at ?? d.advocate_status_started_at),
    verification: verificationStatusOf(d.verification_status ?? d.advocate_status_verification_status ?? last.status),
    verifiedAt: asStr(d.verified_at ?? d.advocate_status_verified_at),
    activeDays: num(d.active_experience_days ?? d.advocate_active_experience_days),
    activeYears: num(d.active_experience_years ?? d.advocate_active_experience_years),
    suspendedDays: num(d.suspended_days),
    suspensions: asArr(d.suspensions)
      .map(suspensionOf)
      .filter((x): x is Suspension => !!x),
    certificateNumber: asStr(d.certificate_number),
    licenseNumber: asStr(d.license_number),
    issuingAuthority: asStr(d.issuing_authority),
    legalBasis: textOf(d.legal_basis),
    reason: asStr(last.reason ?? last.rejection_reason ?? d.rejection_reason),
  };
}
export async function getMyPractice(signal?: AbortSignal): Promise<Practice> {
  return practiceOf(await http("/marketplace/me/advocate-practice", { signal }));
}

// ── Call center: certificate verification ──
export type LicenseStatus = "pending_review" | "approved" | "rejected" | "changes_requested" | "other";
const licenseStatusOf = (v: unknown): LicenseStatus => {
  const s = verificationStatusOf(v);
  return s === "none" ? "other" : s;
};
export type LicenseRecord = LicenseFields & {
  id: string;
  status: LicenseStatus;
  sellerUserId: string;
  sellerName: string;
  evidence: ExperienceEvidence[];
  submittedAt: string;
  reason: string;
};
export function licenseRecordOf(v: unknown): LicenseRecord | null {
  const d = asDict(v);
  const id = asStr(d.id ?? d.verification_id);
  if (!id) return null;
  const seller = asDict(d.seller);
  const ev = asArr(d.evidence).length ? asArr(d.evidence) : Object.keys(asDict(d.evidence)).length ? [d.evidence] : d.evidence_id ? [{ id: d.evidence_id, file_name: d.evidence_file_name }] : [];
  return {
    id,
    status: licenseStatusOf(d.status),
    sellerUserId: asStr(d.seller_user_id ?? seller.id),
    sellerName: asStr(d.seller_name ?? seller.name ?? seller.full_name),
    ...licenseFieldsOf(d),
    evidence: ev.map((x) => licenseEvidenceOf(x)).filter((x) => x.id),
    submittedAt: asStr(d.submitted_at ?? d.created_at),
    reason: asStr(d.reason ?? d.rejection_reason),
  };
}
const query = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]]))).toString();
export async function listLicenseQueue(opts: { status?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<Page<LicenseRecord>> {
  return pageOf(await http(`/call-center/marketplace/advocate-licenses?${query({ status: opts.status ?? "pending_review", limit: opts.limit ?? 50, offset: opts.offset ?? 0 })}`, { signal }), licenseRecordOf);
}

// What software made of the certificate, for the operator only.
export type LicenseAi = { status: LicenseEvidenceState; extracted: LicenseFields; confidence: number | null; notes: string[]; mismatches: string[] };
function licenseAiOf(raw: unknown): LicenseAi | null {
  const d = asDict(raw);
  if (!Object.keys(d).length) return null;
  const c = num(d.confidence ?? d.authenticity_confidence);
  const notes = d.operator_notes ?? d.notes;
  return {
    status: stateOf(d.status ?? d.state),
    extracted: licenseFieldsOf(d.extracted ?? d.extracted_fields ?? d),
    confidence: c === null ? null : c > 1 ? Math.min(1, c / 100) : c,
    notes: Array.isArray(notes) ? strs(notes) : asStr(notes) ? [asStr(notes)] : [],
    mismatches: strs(d.mismatched_fields ?? d.mismatches),
  };
}
export type LicenseReviewDetail = { record: LicenseRecord | null; seller: ReviewSeller | null; checks: CheckItem[]; reviews: ExperienceReviewEntry[]; diff: DiffRow[]; ai: LicenseAi | null; practice: Practice | null; isRevision: boolean };
export async function getLicenseForReview(id: string, signal?: AbortSignal): Promise<LicenseReviewDetail> {
  const d = asDict(await http(`/call-center/marketplace/advocate-licenses/${encodeURIComponent(id)}`, { signal }));
  const raw = asDict(d.record ?? d.verification);
  const record = licenseRecordOf(Object.keys(raw).length ? { ...raw, evidence: raw.evidence ?? d.evidence } : d);
  const prev = asDict(d.previous_approved_verification ?? d.previous_approved_revision);
  return {
    record,
    seller: reviewSellerOf(d.seller),
    checks: checkItemsOf(d.checklist, strs(d.checklist_keys)),
    reviews: asArr(d.reviews).map((v) => {
      const x = asDict(v);
      const dec = asStr(x.decision ?? x.status);
      return { id: asStr(x.id), decision: dec === "approve" || dec === "approved" ? "approved" : dec === "reject" || dec === "rejected" ? "rejected" : "", reason: asStr(x.reason), checklist: [], reviewedAt: asStr(x.reviewed_at) };
    }),
    diff: diffRowsOf(d.diff),
    ai: licenseAiOf(d.ai_analysis ?? raw.ai_analysis ?? asDict(d.evidence).ai_analysis),
    practice: Object.keys(asDict(d.practice)).length ? practiceOf(d.practice) : null,
    isRevision: Object.keys(prev).length > 0,
  };
}
export async function reviewLicense(id: string, input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows }): Promise<void> {
  const checklist = input.keys.map((key) => ({ key, verdict: input.rows[key]?.verdict || "not_applicable", note: (input.rows[key]?.note ?? "").trim() }));
  await http(`/call-center/marketplace/advocate-licenses/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision: DECISION_WIRE[input.decision], reason: input.decision === "approved" ? "" : input.reason.trim(), checklist }),
  });
}

// ── Call center: suspension periods (the answer is the recounted practice) ──
export type SuspensionInput = { startedOn: string; endedOn: string; reason: string };
export function suspensionBody(s: SuspensionInput): Dict {
  return { started_at: s.startedOn.slice(0, 10), ended_at: s.endedOn ? s.endedOn.slice(0, 10) : null, reason: s.reason.trim(), evidence_ids: [] };
}
export async function createSuspension(sellerUserId: string, s: SuspensionInput): Promise<Practice> {
  return practiceOf(await http(`/call-center/marketplace/advocate-practice/${encodeURIComponent(sellerUserId)}/suspensions`, { method: "POST", body: JSON.stringify(suspensionBody(s)) }));
}
export async function updateSuspension(sellerUserId: string, suspensionId: string, s: { endedOn: string; reason: string }): Promise<Practice> {
  return practiceOf(
    await http(`/call-center/marketplace/advocate-practice/${encodeURIComponent(sellerUserId)}/suspensions/${encodeURIComponent(suspensionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ ended_at: s.endedOn ? s.endedOn.slice(0, 10) : null, reason: s.reason.trim() }),
    }),
  );
}
