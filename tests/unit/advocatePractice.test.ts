import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { labelIn, labelledOf } from "@/lib/backendLabel";
import {
  achievementBody,
  achievementConfigOf,
  achievementErrorOf,
  achievementOf,
  achievementReviewBody,
  aiRiskOf,
  fileIssue,
  groupPageOf,
  publicAchievementOf,
  queueItemOf,
} from "@/lib/services/achievements";
import { analyzedEvidenceId, licenseBody, licenseRecordOf, licenseErrorOf, licenseEvidenceOf, licenseIssue, practiceOf, suspensionBody } from "@/lib/services/advocatePractice";
import { checkItemsOf, experienceBody, experienceItemOf, historyOf, reviewOf, reviewRoomOf } from "@/lib/services/experience";
import { verifiedAdvocateYears } from "@/lib/services/tenure";
import { achievementIssue } from "@/components/portal/AchievementsPanel";
import { reviewErrorSpot } from "@/components/admin/callcenter/VerifyReview";
import { AI, CHECK, CONFIG, GROUPS, LICENSE_EVIDENCE, PRACTICE, ROOM, item } from "./fixtures/achievementsContract";

// Final contract 2026-10-29 (backend 69c11a6): canonical fields only.
const err = (status: number, code: string) => new ApiError(status, "x", undefined, { code, data: { detail: { code } } });

describe("backend labels", () => {
  it("label_i18n in the page's language (uz → uz_latn), else label; none → empty", () => {
    const l = labelledOf(CONFIG.process_stages[0]);
    expect(labelIn(l, "uz")).toBe("Tergovga qadar tekshiruv");
    expect(labelIn(l, "ru")).toBe("Доследственная проверка");
    expect(labelIn(l, "en")).toBe("Pre-investigation review");
    expect(labelIn(labelledOf({ label: "Faqat label" }), "ru")).toBe("Faqat label");
    expect(labelIn(labelledOf({}), "ru")).toBe("");
  });
});

describe("achievement config (§2)", () => {
  const c = achievementConfigOf(CONFIG);
  it("reads the options, the file rules, the limits, the warning and the workflow", () => {
    expect(c.stages.map((s) => s.value)).toEqual(["pre_investigation"]);
    expect(c.results.map((r) => r.value)).toEqual(["full"]);
    expect(c.evidence).toEqual({ required: true, minFiles: 1, maxFiles: 20, maxBytes: 20971520, mimeTypes: CONFIG.evidence.allowed_mime_types, extensions: ["docx", "jpg", "pdf", "png"] });
    expect([c.descMin, c.descMax]).toEqual([5, 5000]);
    expect(labelIn(c.warning, "uz")).toBe("...");
    expect(c.workflow).toEqual(CONFIG.workflow);
  });
  it("refuses a file by the config's type and size before it is sent", () => {
    expect(fileIssue({ name: "qaror.pdf", type: "application/pdf", size: 10 }, c.evidence)).toBe("");
    expect(fileIssue({ name: "scan.PNG", type: "", size: 10 }, c.evidence)).toBe("");
    expect(fileIssue({ name: "a.mp4", type: "video/mp4", size: 10 }, c.evidence)).toBe("type");
    expect(fileIssue({ name: "big.pdf", type: "application/pdf", size: 20971521 }, c.evidence)).toBe("size");
  });
  it("names the first missing thing by the config's rules", () => {
    const done = { key: 1, file: null, name: "a.pdf", state: "done" as const, progress: 1, error: "", evidence: { id: "e1", fileName: "a.pdf", mimeType: "", size: 1, downloadUrl: "" } };
    const d = { stage: "court", result: "full", categoryId: "c1", achievedOn: "2026-10-15", description: "Ijobiy natija", files: [done] };
    expect(achievementIssue(d, c, "2026-10-29")).toBe("");
    expect(achievementIssue({ ...d, stage: "" }, c, "2026-10-29")).toBe("stage");
    expect(achievementIssue({ ...d, achievedOn: "2026-11-01" }, c, "2026-10-29")).toBe("date");
    expect(achievementIssue({ ...d, description: "abc" }, c, "2026-10-29")).toBe("description");
    expect(achievementIssue({ ...d, files: [] }, c, "2026-10-29")).toBe("files");
  });
});

describe("advocate's achievements (§3–4)", () => {
  it("the list is the backend's groups, paged by root", () => {
    const p = groupPageOf(GROUPS);
    expect([p.total, p.totalRecords, p.count, p.hasMore]).toEqual([1, 2, 1, false]);
    const [g] = p.groups;
    expect([g.rootId, g.current?.status, g.pending?.id, g.latest?.version, g.revisionCount]).toEqual(["r1", "approved", "a2", 2, 2]);
  });
  it("reads every private field by its canonical name", () => {
    const a = achievementOf(item({ status: "changes_requested", rejection_reason: "Qaror o'qilmaydi", ai_analysis_status: "completed" }))!;
    expect([a.status, a.stage, a.result, a.categoryTitle, a.achievedAt, a.version, a.sourceId, a.reason, a.ai]).toEqual(["changes_requested", "court", "full", "Jinoyat ishlari", "2026-10-20", 2, "a1", "Qaror o'qilmaydi", "done"]);
    expect(a.evidence[0]).toEqual({ id: "e1", fileName: "decision.pdf", mimeType: "application/pdf", size: 12345, downloadUrl: "/marketplace/achievements/evidence/e1" });
    // Exactly pending | completed | manual_review_required (check 2026-10-29);
    // anything else is left to the operator, never "done".
    expect(["pending", "completed", "manual_review_required", "processing", ""].map((x) => achievementOf(item({ ai_analysis_status: x }))!.ai)).toEqual(["running", "done", "manual", "manual", ""]);
  });
  it("record labels win once the backend sends them; until then none", () => {
    expect(achievementOf(item())!.stageLabel).toBeNull();
    const a = achievementOf(item({ process_stage_label: "Sud jarayoni", process_stage_label_i18n: { ru: "Судебный процесс" } }))!;
    expect(labelIn(a.stageLabel, "ru")).toBe("Судебный процесс");
  });
  it("submits the §3 body: plain day, source_id null for a new record", () => {
    expect(achievementBody({ stage: "court", result: "full", categoryId: "category-uuid", achievedOn: "2026-10-20", description: " What was achieved ", evidenceIds: ["evidence-uuid"] })).toEqual({
      source_id: null,
      process_stage: "court",
      result_scope: "full",
      category_id: "category-uuid",
      achieved_at: "2026-10-20",
      description: "What was achieved",
      evidence_ids: ["evidence-uuid"],
    });
    expect(achievementBody({ sourceId: "a2", stage: "inquiry", result: "partial", categoryId: "c", achievedOn: "2026-10-20", description: "x", evidenceIds: [] }).source_id).toBe("a2");
  });
  it("binds every detail.code to its field", () => {
    expect(achievementErrorOf(err(422, "achievement_future_date"))).toEqual({ code: "achievement_future_date", field: "achieved_at" });
    expect(achievementErrorOf(err(422, "achievement_category_invalid"))?.field).toBe("category_id");
    expect(achievementErrorOf(err(409, "achievement_revision_already_pending"))?.field).toBe("form");
    expect(achievementErrorOf(err(404, "achievement_not_found"))?.field).toBe("missing");
    expect(achievementErrorOf(err(413, "achievement_evidence_too_large"))?.field).toBe("file");
    expect(achievementErrorOf(err(415, "achievement_evidence_type_not_allowed"))?.field).toBe("file");
    expect(achievementErrorOf(err(500, ""))).toBeNull();
  });
  it("the public card keeps public_description only, never the private text (§5)", () => {
    const p = publicAchievementOf({ id: "a1", process_stage: "court", result_scope: "partial", category_title: "Oila", year: 2025, public_description: "Xavfsiz matn", description: "Maxfiy matn", lexgo_verified: true, verified_at: "2025-07-01T10:00:00Z", evidence: [{ id: "e" }] })!;
    expect(p).toEqual({ id: "a1", stage: "court", result: "partial", stageLabel: null, resultLabel: null, categoryTitle: "Oila", year: 2025, publicDescription: "Xavfsiz matn", verified: true, verifiedAt: "2025-07-01T10:00:00Z" });
  });
});

describe("review (§6–8)", () => {
  it("the §6 review body: backend decision words, checklist, public text", () => {
    const rows = { type_and_date: { verdict: "approved" as const, note: "" } };
    expect(achievementReviewBody({ decision: "approved", reason: "x", keys: ["type_and_date"], rows, publicDescription: " Safe public summary without personal data. " })).toEqual({
      decision: "approve",
      reason: "",
      public_description: "Safe public summary without personal data.",
      checklist: [{ key: "type_and_date", verdict: "approved", note: "" }],
    });
    expect(achievementReviewBody({ decision: "rejected", reason: " Yetarli emas ", keys: [], rows: {} })).toMatchObject({ decision: "reject", reason: "Yetarli emas", public_description: "" });
    expect(achievementReviewBody({ decision: "changes_requested", reason: "r", keys: [], rows: {} }).decision).toBe("changes_requested");
  });
  it("reads the normalized §7 analysis", () => {
    const ai = aiRiskOf(AI)!;
    expect([ai.status, ai.documentReadable, ai.authenticity, ai.manipulation, ai.aiGenerated, ai.riskLevel]).toEqual(["done", true, 0.92, 0.04, 0.03, "low"]);
    expect([ai.signature, ai.seal, ai.eSignature, ai.piiCount, ai.notes, ai.risks]).toEqual([true, true, false, 0, [], []]);
    expect(aiRiskOf(null)).toBeNull();
  });
  it("shows a risk only with the backend's label; an unlabelled code is left out", () => {
    const catalog = [{ code: "date_mismatch", label: "Sana mos emas", label_i18n: { ru: "Дата не совпадает" } }];
    const ai = aiRiskOf({ ...AI, risk_codes: ["date_mismatch", "unknown_code"], risk_items: [{ code: "pii_present", label: "Shaxsga oid ma'lumot bor" }], pii_detected: ["phone"] }, catalog)!;
    expect(ai.risks.map((r) => [r.code, labelIn(r, "ru")])).toEqual([
      ["date_mismatch", "Дата не совпадает"],
      ["pii_present", "Shaxsga oid ma'lumot bor"],
    ]);
    expect(ai.piiCount).toBe(1);
  });
  it("renders the §8 checklist as given", () => {
    expect(checkItemsOf([CHECK])).toEqual([{ key: "evidence_supports_claim", label: "Dalillar ma’lumotni tasdiqlaydi", hint: "Dalillar ma’lumotni tasdiqlaydi", i18n: { uz_latn: "...", uz_cyrl: "...", ru: "..." } }]);
  });
  it("a queue row's advocate is the seller object (check 2026-10-29)", () => {
    const row = queueItemOf({ ...item(), seller: { id: "u-adv", lexgo_id: "LGA-7K2Q", name: "Test Advokat", phone: "+998901112233", role: "advokat", account_status: "blocked" } })!;
    expect([row.sellerUserId, row.seller]).toEqual(["u-adv", { id: "u-adv", name: "Test Advokat", lexgoId: "LGA-7K2Q", phone: "+998901112233", role: "advokat", status: "blocked" }]);
    expect(licenseRecordOf({ id: "lv1", status: "pending_review", seller: { id: "u-adv", name: "Test Advokat" } })!.sellerUserId).toBe("u-adv");
  });
  it("the review room, history and past reviews", () => {
    expect(reviewRoomOf(ROOM)).toEqual({ roomId: "room-1", status: "", readOnly: false, closedAt: "" });
    expect(historyOf([{ id: "a2", version: 2, status: "pending_review" }, { id: "a1", version: 1, status: "approved" }]).map((h) => h.id)).toEqual(["a1", "a2"]);
    // Final contract §5: decision is the stored status, decision_action the sent word.
    expect(reviewOf({ id: "r", decision: "approved", decision_action: "approve" }).decision).toBe("approved");
    expect(reviewOf({ id: "r", decision: "changes_requested", decision_action: "changes_requested" }).decision).toBe("changes_requested");
    expect(reviewOf({ id: "r", decision: "approve" }).decision).toBe("");
  });
  it("each review refusal lands on its spot", () => {
    expect(reviewErrorSpot("achievement_checklist_incomplete")).toBe("checklist");
    expect(reviewErrorSpot("achievement_reason_required")).toBe("reason");
    expect(reviewErrorSpot("achievement_public_description_contains_pii")).toBe("public");
    expect(reviewErrorSpot("achievement_ai_analysis_pending")).toBe("blocked");
    expect(reviewErrorSpot("achievement_already_reviewed")).toBe("reviewed");
    expect(reviewErrorSpot("advocate_license_checklist_incomplete")).toBe("checklist");
    expect(reviewErrorSpot("advocate_license_already_reviewed")).toBe("reviewed");
  });
});

describe("advocate certificate and practice (§9–12)", () => {
  it("reads the evidence state and extracted_fields", () => {
    const ev = licenseEvidenceOf({ ...LICENSE_EVIDENCE, extracted_fields: { holder_name: "Aliyev Vali", certificate_number: "ADV-1", advocate_status_started_at: "2020-05-12", issue_date: "2020-05-12" } });
    expect([ev.state, ev.suggested.holderName, ev.suggested.certificateNumber, ev.suggested.statusStartedAt, ev.downloadUrl]).toEqual(["analyzed", "Aliyev Vali", "ADV-1", "2020-05-12", "/marketplace/advocate-license/evidence/v1/download"]);
  });
  it("the analyzed event names the evidence to read again", () => {
    expect(analyzedEvidenceId({ event: "marketplace.advocate_license_evidence_analyzed", evidence_id: "v1" })).toBe("v1");
    expect(analyzedEvidenceId({ event: "x" })).toBe("");
  });
  it("submits the §9 body; a resubmission names the latest verification", () => {
    const f = { evidenceId: "v1", holderName: " Full name ", certificateNumber: "C-1", licenseNumber: "", issuingAuthority: "Adliya", statusStartedAt: "2020-01-10" };
    expect(licenseBody(f)).toEqual({ source_id: null, evidence_id: "v1", holder_name: "Full name", certificate_number: "C-1", license_number: "", issuing_authority: "Adliya", advocate_status_started_at: "2020-01-10" });
    expect(licenseBody({ ...f, sourceId: "lv2" }).source_id).toBe("lv2");
  });
  it("blocks while software reads; no future status date", () => {
    const base = { evidenceId: "v1", state: "analyzed" as const, holderName: "Aliyev Vali", certificateNumber: "ADV-1", licenseNumber: "", issuingAuthority: "Adliya", statusStartedAt: "2020-05-12" };
    expect(licenseIssue(base, "2026-10-29")).toBe("");
    expect(licenseIssue({ ...base, state: "processing" }, "2026-10-29")).toBe("processing");
    expect(licenseIssue({ ...base, statusStartedAt: "2027-01-01" }, "2026-10-29")).toBe("advocate_status_started_at");
  });
  it("binds the certificate errors", () => {
    expect(licenseErrorOf(err(422, "advocate_status_future_date"))?.field).toBe("advocate_status_started_at");
    expect(licenseErrorOf(err(413, "advocate_license_evidence_too_large"))?.field).toBe("evidence");
    expect(licenseErrorOf(err(415, "advocate_license_evidence_type_not_allowed"))?.field).toBe("evidence");
    expect(licenseErrorOf(err(409, "advocate_license_ai_analysis_pending"))?.field).toBe("processing");
    expect(licenseErrorOf(err(409, "advocate_license_verification_pending"))?.field).toBe("form");
  });
  it("shows the §10 practice exactly as the backend counts it", () => {
    const p = practiceOf(PRACTICE);
    expect([p.sellerUserId, p.verification, p.activeDays, p.activeYears, p.suspendedDays]).toEqual(["u-adv", "approved", 2300, 6.3, 15]);
    expect(p.suspensions[0]).toEqual({ id: "s1", startedAt: "2024-01-01", endedAt: "2024-01-15", reason: "...", days: 15, evidenceIds: [] });
    expect(p.latest).toEqual({ id: "lv2", status: "approved", reason: "", version: 2 });
    expect(p.legalBasis).toEqual({ text: "...", suspensionExcluded: true });
    expect(practiceOf({ ...PRACTICE, verification_status: null, latest_verification: null }).verification).toBe("not_submitted");
  });
  it("a suspension body carries plain days and its documents", () => {
    expect(suspensionBody({ startedOn: "2025-01-01", endedOn: "", reason: " Sabab ", evidenceIds: ["d1"] })).toEqual({ started_at: "2025-01-01", ended_at: null, reason: "Sabab", evidence_ids: ["d1"] });
  });
  it("public tenure is read, never counted (§14)", () => {
    expect(verifiedAdvocateYears({ advocate_active_experience_years: 6.3, experience_years: 9 })).toBe(6.3);
    expect(verifiedAdvocateYears({ experience_years: 9 })).toBeNull();
  });
});

describe("pre-advocate employment (§13)", () => {
  const input = { kind: "pre_advocate_employment" as const, categoryId: "c1", subcategoryId: "s1", workplace: " Organization ", positions: [{ title: "Legal counsel", startedOn: "2018-01-01", endedOn: "2020-06-30", isCurrent: false, description: "..." }], description: "Overall verified experience description", evidenceIds: ["uuid"] };
  it("carries its kind and never a category", () => {
    const b = experienceBody(input);
    expect(b).toEqual({ source_id: null, experience_kind: "pre_advocate_employment", workplace: "Organization", positions: [{ title: "Legal counsel", started_at: "2018-01-01T00:00:00Z", ended_at: "2020-06-30T00:00:00Z", is_current: false, description: "..." }], description: "Overall verified experience description", evidence_ids: ["uuid"] });
    expect("category_id" in b || "subcategory_id" in b).toBe(false);
  });
  it("legacy records read as category experience", () => {
    expect(experienceItemOf({ id: "x", experience_kind: "pre_advocate_employment" })?.kind).toBe("pre_advocate_employment");
    expect(experienceItemOf({ id: "y", experience_kind: "category_experience" })?.kind).toBe("category_experience");
  });
});

describe("final contract 2026-10-29 (backend 0829278)", () => {
  it("every review endpoint gets the action words", async () => {
    const { DECISION_WIRE } = await import("@/lib/services/experience");
    expect(DECISION_WIRE).toEqual({ approved: "approve", rejected: "reject", changes_requested: "changes_requested" });
  });
  it("records carry their own stage and result labels", () => {
    const a = achievementOf(item({ process_stage_label: "Sud jarayoni", process_stage_label_i18n: { uz_latn: "Sud jarayoni", ru: "Судебный процесс" }, result_scope_label: "To‘liq ijobiy natija", result_scope_label_i18n: { ru: "Полный положительный результат" } }))!;
    expect([labelIn(a.stageLabel, "ru"), labelIn(a.resultLabel, "ru"), labelIn(a.stageLabel, "uz")]).toEqual(["Судебный процесс", "Полный положительный результат", "Sud jarayoni"]);
    expect(publicAchievementOf({ id: "p", process_stage: "court", process_stage_label: "Sud jarayoni" })!.stageLabel?.label).toBe("Sud jarayoni");
  });
});
