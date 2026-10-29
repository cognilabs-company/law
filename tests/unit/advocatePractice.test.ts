import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import {
  achievementBody,
  achievementConfigOf,
  achievementErrorOf,
  achievementOf,
  achievementReviewBody,
  aiRiskOf,
  fileIssue,
  groupAchievements,
  pageOf,
  publicAchievementOf,
} from "@/lib/services/achievements";
import { licenseBody, licenseErrorOf, licenseEvidenceOf, licenseIssue, practiceOf, suspensionBody } from "@/lib/services/advocatePractice";
import { experienceBody, experienceItemOf } from "@/lib/services/experience";
import { verifiedAdvocateYears } from "@/lib/services/tenure";
import { achievementIssue } from "@/components/portal/AchievementsPanel";
import { reviewErrorSpot } from "@/components/admin/callcenter/VerifyReview";

// Contract 2026-10-29: achievements by case stage, verified practice
// tenure and pre-advocate employment.
const err = (status: number, code: string, fieldErrors: Record<string, string> = {}) => new ApiError(status, "x", undefined, { code, data: { detail: { code } }, fieldErrors });

describe("achievement config", () => {
  const raw = {
    process_stages: [
      { value: "pre_investigation", label: "Tergovga qadar tekshiruv" },
      { value: "court", label: "Sud jarayoni", label_i18n: { ru: "Судебный процесс" } },
    ],
    result_scopes: { full: "To'liq ijobiy natija", partial: "Qisman ijobiy natija" },
    evidence: { required: true, min_files: 1, max_files: 20, max_file_size_mb: 20, allowed_mime_types: ["application/pdf", "image/png"], allowed_extensions: ["pdf", ".PNG"] },
    warning: "Faqat haqiqiy hujjat yuklang.",
  };
  it("reads stages, results, file rules and the warning; invents nothing", () => {
    const c = achievementConfigOf(raw);
    expect(c.stages.map((s) => s.value)).toEqual(["pre_investigation", "court"]);
    expect(c.stages[1].i18n).toEqual({ ru: "Судебный процесс" });
    expect(c.results.map((r) => [r.value, r.label])).toEqual([
      ["full", "To'liq ijobiy natija"],
      ["partial", "Qisman ijobiy natija"],
    ]);
    expect([c.minFiles, c.maxFiles, c.maxBytes]).toEqual([1, 20, 20 * 1024 * 1024]);
    expect(c.extensions).toEqual(["pdf", "png"]);
    expect(c.warning).toBe("Faqat haqiqiy hujjat yuklang.");
    const bare = achievementConfigOf({});
    expect([bare.stages, bare.maxFiles, bare.maxBytes, bare.mimeTypes, bare.warning]).toEqual([[], null, null, [], ""]);
  });
  it("refuses a file by the config's type and size before it is sent", () => {
    const c = achievementConfigOf(raw);
    expect(fileIssue({ name: "qaror.pdf", type: "application/pdf", size: 10 }, c)).toBe("");
    expect(fileIssue({ name: "scan.PNG", type: "", size: 10 }, c)).toBe("");
    expect(fileIssue({ name: "a.docx", type: "application/msword", size: 10 }, c)).toBe("type");
    expect(fileIssue({ name: "big.pdf", type: "application/pdf", size: 21 * 1024 * 1024 }, c)).toBe("size");
    // No rules in the config: nothing refused here (the backend decides).
    expect(fileIssue({ name: "a.xyz", type: "x/y", size: 1e9 }, achievementConfigOf({}))).toBe("");
  });
  it("names the first missing thing by the config's limits", () => {
    const c = achievementConfigOf(raw);
    const done = { key: 1, file: null, name: "a.pdf", state: "done" as const, progress: 1, error: "", evidence: { id: "e1", fileName: "a.pdf", mimeType: "", size: 1, downloadUrl: "" } };
    const d = { stage: "court", result: "partial", categoryId: "c1", achievedOn: "2026-10-15", description: "Ijobiy natija", files: [done] };
    expect(achievementIssue(d, c, "2026-10-29")).toBe("");
    expect(achievementIssue({ ...d, stage: "" }, c, "2026-10-29")).toBe("stage");
    expect(achievementIssue({ ...d, achievedOn: "2026-11-01" }, c, "2026-10-29")).toBe("date");
    expect(achievementIssue({ ...d, description: "abc" }, c, "2026-10-29")).toBe("description");
    expect(achievementIssue({ ...d, files: [] }, c, "2026-10-29")).toBe("files");
    expect(achievementIssue({ ...d, files: [{ ...done, state: "uploading" }] }, c, "2026-10-29")).toBe("uploading");
  });
});

describe("achievement records", () => {
  it("sends achieved_at as a plain day; source_id only for a revision", () => {
    const body = achievementBody({ stage: "court", result: "partial", categoryId: "c1", achievedOn: "2026-10-15", description: " Natija ", evidenceIds: ["e1"] });
    expect(body).toEqual({ process_stage: "court", result_scope: "partial", category_id: "c1", achieved_at: "2026-10-15", description: "Natija", evidence_ids: ["e1"] });
    expect(achievementBody({ sourceId: "a1", stage: "inquiry", result: "full", categoryId: "c1", achievedOn: "2026-10-15", description: "Natija", evidenceIds: [] }).source_id).toBe("a1");
  });
  it("reads the new model; the old type/title are gone", () => {
    const a = achievementOf({ id: "a1", status: "ai_analysis_pending", process_stage: "court", result_scope: "full", category_id: "c1", category_title: "Jinoyat", achieved_at: "2026-10-15T00:00:00Z", version: 2, evidence: [{ id: "e1", file_name: "q.pdf" }], achievement_type: "award_recognition", title: "X" })!;
    expect([a.status, a.stage, a.result, a.categoryTitle, a.achievedAt, a.version, a.ai]).toEqual(["ai_analysis_pending", "court", "full", "Jinoyat", "2026-10-15", 2, "running"]);
    expect(a.evidence[0].downloadUrl).toBe("/marketplace/achievements/evidence/e1");
    expect("type" in a || "title" in a).toBe(false);
    expect(achievementOf({ id: "b", status: "superseded" })!.status).toBe("superseded");
  });
  it("groups revisions by root: approved now, waiting, newest", () => {
    const rows = [
      achievementOf({ id: "1", root_id: "r", version: 1, status: "approved" })!,
      achievementOf({ id: "2", root_id: "r", version: 2, status: "ai_analysis_pending", source_id: "1" })!,
    ];
    const [g] = groupAchievements(rows);
    expect([g.current?.id, g.pending?.id, g.latest?.id, g.revisionCount]).toEqual(["1", "2", "2", 2]);
  });
  it("reads a page: items, total, has_more", () => {
    const p = pageOf({ items: [{ id: "1" }], total: 3, count: 1, limit: 1, offset: 0, has_more: true }, achievementOf);
    expect([p.items.length, p.total, p.hasMore, p.limit]).toEqual([1, 3, true, 1]);
  });
  it("binds every detail.code to its field", () => {
    expect(achievementErrorOf(err(422, "achievement_future_date"))).toEqual({ code: "achievement_future_date", field: "achieved_at" });
    expect(achievementErrorOf(err(422, "achievement_category_invalid"))?.field).toBe("category_id");
    expect(achievementErrorOf(err(422, "achievement_evidence_required"))?.field).toBe("evidence");
    expect(achievementErrorOf(err(422, "achievement_evidence_invalid"))?.field).toBe("evidence");
    expect(achievementErrorOf(err(409, "achievement_revision_already_pending"))?.field).toBe("form");
    expect(achievementErrorOf(err(404, "achievement_not_found"))?.field).toBe("missing");
    expect(achievementErrorOf(err(413, ""))).toEqual({ code: "achievement_evidence_too_large", field: "file" });
    expect(achievementErrorOf(err(415, ""))).toEqual({ code: "achievement_evidence_type_not_allowed", field: "file" });
    expect(achievementErrorOf(err(422, "", { description: "too short" }))?.field).toBe("description");
  });
  it("the public card keeps only the sanitized fields", () => {
    const p = publicAchievementOf({ process_stage: "court", result_scope: "partial", category_title: "Oila", achieved_at: "2025-06-01", description: "Xavfsiz matn", lexgo_verified: true, verified_at: "2025-07-01T10:00:00Z", evidence: [{ id: "e" }], ai_analysis: { risk_level: "high" } })!;
    expect(p).toEqual({ id: "", stage: "court", result: "partial", categoryId: "", categoryTitle: "Oila", year: 2025, achievedAt: "2025-06-01", description: "Xavfsiz matn", verified: true, verifiedAt: "2025-07-01T10:00:00Z" });
  });
});

describe("achievement review", () => {
  it("approve sends the backend's words, the checklist and the public text", () => {
    const rows = { type_and_date: { verdict: "approved" as const, note: "" }, authenticity: { verdict: "not_applicable" as const, note: " ok " } };
    expect(achievementReviewBody({ decision: "approved", reason: "x", keys: ["type_and_date", "authenticity"], rows, publicDescription: " Xavfsiz " })).toEqual({
      decision: "approve",
      reason: "",
      public_description: "Xavfsiz",
      checklist: [
        { key: "type_and_date", verdict: "approved", note: "" },
        { key: "authenticity", verdict: "not_applicable", note: "ok" },
      ],
    });
    const rej = achievementReviewBody({ decision: "rejected", reason: " Yetarli emas ", keys: [], rows: {} });
    expect([rej.decision, rej.reason, "public_description" in rej]).toEqual(["reject", "Yetarli emas", false]);
    expect(achievementReviewBody({ decision: "changes_requested", reason: "r", keys: [], rows: {} }).decision).toBe("changes_requested");
  });
  it("reads the risk indicators as advice", () => {
    const ai = aiRiskOf({ status: "completed", document_readable: true, claim_supported: false, authenticity_confidence: 82, manipulation_risk: "low", ai_generated_risk: { level: "medium", score: 0.4 }, risk_level: "medium", risk_codes: ["date_mismatch", { code: "x", label: "Belgi" }], seal_detected: true, pii_detected: ["phone"], operator_notes: "Sanani tekshiring" })!;
    expect([ai.documentReadable, ai.claimSupported, ai.authenticity, ai.manipulation.level, ai.aiGenerated, ai.riskLevel]).toEqual([true, false, 0.82, "low", { level: "medium", score: 0.4 }, "medium"]);
    expect(ai.riskCodes).toEqual([
      { code: "date_mismatch", label: "" },
      { code: "x", label: "Belgi" },
    ]);
    expect([ai.seal, ai.pii, ai.notes]).toEqual([true, true, ["Sanani tekshiring"]]);
    expect(aiRiskOf(null)).toBeNull();
  });
  it("each review refusal lands on its spot", () => {
    expect(reviewErrorSpot("achievement_checklist_incomplete")).toBe("checklist");
    expect(reviewErrorSpot("achievement_reason_required")).toBe("reason");
    expect(reviewErrorSpot("achievement_public_description_required")).toBe("public");
    expect(reviewErrorSpot("achievement_public_description_contains_pii")).toBe("public");
    expect(reviewErrorSpot("achievement_ai_analysis_pending")).toBe("blocked");
    expect(reviewErrorSpot("achievement_already_reviewed")).toBe("reviewed");
    expect(reviewErrorSpot("verification_checklist_incomplete")).toBe("checklist");
  });
});

describe("advocate certificate and tenure", () => {
  it("reads the evidence state and the software's suggestions", () => {
    const ev = licenseEvidenceOf({ id: "v1", file_name: "guv.pdf", status: "analyzed", extracted: { holder_name: "Aliyev Vali", certificate_number: "ADV-1", advocate_status_started_at: "2020-05-12" } });
    expect([ev.state, ev.suggested.holderName, ev.suggested.certificateNumber, ev.suggested.statusStartedAt, ev.downloadUrl]).toEqual(["analyzed", "Aliyev Vali", "ADV-1", "2020-05-12", "/marketplace/advocate-license/evidence/v1/download"]);
    expect(licenseEvidenceOf({ id: "v2", status: "processing" }).state).toBe("processing");
  });
  it("submits trimmed values, the day as YYYY-MM-DD, licence number only when typed", () => {
    const f = { evidenceId: "v1", holderName: " Aliyev Vali ", certificateNumber: "ADV-1", licenseNumber: " ", issuingAuthority: "Adliya", statusStartedAt: "2020-05-12" };
    expect(licenseBody(f)).toEqual({ evidence_id: "v1", holder_name: "Aliyev Vali", certificate_number: "ADV-1", issuing_authority: "Adliya", advocate_status_started_at: "2020-05-12" });
    expect(licenseBody({ ...f, licenseNumber: "L-9" }).license_number).toBe("L-9");
  });
  it("blocks while software reads; no future status date", () => {
    const base = { evidenceId: "v1", state: "analyzed" as const, holderName: "Aliyev Vali", certificateNumber: "ADV-1", licenseNumber: "", issuingAuthority: "Adliya", statusStartedAt: "2020-05-12" };
    expect(licenseIssue(base, "2026-10-29")).toBe("");
    expect(licenseIssue({ ...base, state: "processing" }, "2026-10-29")).toBe("processing");
    expect(licenseIssue({ ...base, statusStartedAt: "2027-01-01" }, "2026-10-29")).toBe("advocate_status_started_at");
    expect(licenseIssue({ ...base, evidenceId: "" }, "2026-10-29")).toBe("evidence");
  });
  it("binds the certificate errors", () => {
    expect(licenseErrorOf(err(422, "advocate_status_future_date"))?.field).toBe("advocate_status_started_at");
    expect(licenseErrorOf(err(422, "advocate_license_evidence_invalid"))?.field).toBe("evidence");
    expect(licenseErrorOf(err(409, "advocate_license_ai_analysis_pending"))?.field).toBe("processing");
    expect(licenseErrorOf(err(409, "advocate_license_verification_pending"))?.field).toBe("form");
  });
  it("shows the practice exactly as the backend counts it", () => {
    const p = practiceOf({ status_started_at: "2020-05-12", verification_status: "approved", verified_at: "2026-10-20T09:00:00Z", active_experience_days: 2300, active_experience_years: 6.3, suspended_days: 31, suspensions: [{ id: "s1", started_at: "2025-01-01", ended_at: "2025-01-31", reason: "To'xtatilgan" }], certificate_number: "ADV-1", issuing_authority: "Adliya", legal_basis: "Advokatura to'g'risidagi qonun" });
    expect([p.verification, p.activeDays, p.activeYears, p.suspendedDays, p.suspensions[0].endedAt, p.legalBasis]).toEqual(["approved", 2300, 6.3, 31, "2025-01-31", "Advokatura to'g'risidagi qonun"]);
    // The answer to a suspension write may wrap it.
    expect(practiceOf({ practice: { active_experience_years: 5 } }).activeYears).toBe(5);
    expect(practiceOf({}).verification).toBe("none");
  });
  it("a suspension body carries plain days; an open one has no end", () => {
    expect(suspensionBody({ startedOn: "2025-01-01", endedOn: "", reason: " Sabab " })).toEqual({ started_at: "2025-01-01", ended_at: null, reason: "Sabab", evidence_ids: [] });
  });
  it("tenure is read, never counted", () => {
    expect(verifiedAdvocateYears({ advocate_active_experience_years: 6 })).toBe(6);
    expect(verifiedAdvocateYears({ experience_years: 9 })).toBeNull();
  });
});

describe("pre-advocate employment", () => {
  const input = { kind: "pre_advocate_employment" as const, categoryId: "c1", subcategoryId: "s1", workplace: " Prokuratura ", positions: [{ title: "Yurist", startedOn: "2016-01-10", endedOn: "2018-04-20", isCurrent: false, description: "" }], description: "Oldingi ish", evidenceIds: ["e1"] };
  it("carries its kind and never a category", () => {
    const b = experienceBody(input);
    expect(b).toEqual({ source_id: null, experience_kind: "pre_advocate_employment", workplace: "Prokuratura", positions: [{ title: "Yurist", started_at: "2016-01-10T00:00:00Z", ended_at: "2018-04-20T00:00:00Z", is_current: false, description: "" }], description: "Oldingi ish", evidence_ids: ["e1"] });
    expect("category_id" in b || "subcategory_id" in b).toBe(false);
  });
  it("category experience keeps its category", () => {
    expect(experienceBody({ ...input, kind: "category_experience" })).toMatchObject({ category_id: "c1", subcategory_id: "s1" });
  });
  it("a record reads its kind; without one it is category experience", () => {
    expect(experienceItemOf({ id: "x", experience_kind: "pre_advocate_employment" })?.kind).toBe("pre_advocate_employment");
    expect(experienceItemOf({ id: "y" })?.kind).toBe("category_experience");
  });
});
