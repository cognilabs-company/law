import { describe, expect, it } from "vitest";
import { canApprove, checkItemsOf, diffRowsOf, experienceItemOf, positionsOf } from "@/lib/services/experience";
import { experienceIssue } from "@/components/portal/ExperiencePanel";

// TSK-415946 / 920636 / 874927 / 100467 / 493303.
describe("experience with several positions", () => {
  it("reads positions; an older record's single position becomes one", () => {
    expect(positionsOf({ positions: [{ title: "Yurist", started_at: "2018-01-01", ended_at: "2020-01-01" }, { title: "Advokat", started_at: "2020-02-01", is_current: true }] }).map((p) => [p.title, p.isCurrent])).toEqual([
      ["Yurist", false],
      ["Advokat", true],
    ]);
    expect(positionsOf({ position: "Advokat", started_at: "2019-05-01" })).toEqual([{ title: "Advokat", startedAt: "2019-05-01", endedAt: "", isCurrent: true, description: "" }]);
  });
  it("the card spans the earliest start to the latest end, open while one position is current", () => {
    const it = experienceItemOf({ id: "e1", workplace: "Adolat", positions: [{ title: "A", started_at: "2018-01-01", ended_at: "2020-01-01" }, { title: "B", started_at: "2020-02-01", is_current: true }] })!;
    expect([it.startedAt, it.endedAt, it.isCurrent]).toEqual(["2018-01-01", "", true]);
  });
  it("names the first missing thing and in which position", () => {
    const base = { sourceId: "", categoryId: "c", subcategoryId: "", workplace: "Adolat", description: "x".repeat(40), evidence: [] };
    const pos = (over = {}) => ({ key: 1, title: "Advokat", startedOn: "2020-01-01", endedOn: "", isCurrent: true, description: "", ...over });
    expect(experienceIssue({ ...base, positions: [pos(), pos({ key: 2, title: "" })] }, "2026-10-28")).toEqual({ key: "position", pos: 1 });
    expect(experienceIssue({ ...base, positions: [pos({ isCurrent: false, endedOn: "2019-01-01" })] }, "2026-10-28")).toEqual({ key: "ended", pos: 0 });
    expect(experienceIssue({ ...base, positions: [pos()] }, "2026-10-28")).toBeNull();
  });
});

describe("review: checklist, diff", () => {
  it("approve needs every item approved or not applicable", () => {
    expect(canApprove(["a", "b"], { a: { verdict: "approved", note: "" }, b: { verdict: "not_applicable", note: "" } })).toBe(true);
    expect(canApprove(["a", "b"], { a: { verdict: "approved", note: "" }, b: { verdict: "rejected", note: "" } })).toBe(false);
    expect(canApprove(["a"], {})).toBe(false);
    expect(canApprove([], {})).toBe(false);
  });
  it("every returned item is required, even one marked optional (answers 2026-10-31 §3.2)", () => {
    const keys = checkItemsOf([{ key: "a", label: "A" }, { key: "b", label: "B", required: false }]).map((c) => c.key);
    expect(keys).toEqual(["a", "b"]);
    expect(canApprove(keys, { a: { verdict: "approved", note: "" } })).toBe(false);
  });
  it("renders the backend's checklist as given, in its order (2026-10-29 §8)", () => {
    expect(checkItemsOf([{ key: "dates_valid", label: "Sanalar mantiqan to'g'ri", hint: "h", label_i18n: { ru: "Даты логичны" } }])).toEqual([{ key: "dates_valid", label: "Sanalar mantiqan to'g'ri", hint: "h", i18n: { ru: "Даты логичны" } }]);
    expect(checkItemsOf(undefined)).toEqual([]);
  });
  it("reads the backend's diff with its labels, dropping no-ops", () => {
    expect(diffRowsOf([{ field: "workplace", label: "Ish joyi", before: "A", after: "B" }, { field: "title", before: "x", after: "x" }])).toEqual([{ field: "workplace", label: "Ish joyi", before: "A", after: "B", kind: "changed" }]);
    expect(diffRowsOf([{ field: "description", label: "Tavsif", before: "", after: "Yangi" }])[0].kind).toBe("added");
  });
});

describe("experience errors (TSK-920636; backend answers 2026-10-31 §3.3)", () => {
  it("reads the evidence file codes as well as the record's", async () => {
    const { ApiError } = await import("@/lib/http");
    const { experienceErrorOf } = await import("@/lib/services/experience");
    const err = (code: string) => new ApiError(415, code, undefined, { code, data: { detail: { code } } });
    expect(experienceErrorOf(err("experience_evidence_type_not_allowed"))).toEqual({ code: "experience_evidence_type_not_allowed", field: "", key: "experience_evidence_type_not_allowed" });
    expect(experienceErrorOf(err("experience_evidence_too_large"))?.key).toBe("experience_evidence_too_large");
    expect(experienceErrorOf(err("experience_dates_invalid"))?.key).toBe("experience_dates_invalid");
    expect(experienceErrorOf(err("experience_future_date"))?.key).toBe("experience_future_date");
    expect(experienceErrorOf(err("payment_failed"))).toBeNull();
  });
  it("any category or subcategory code reads as one, pointing at its picker", async () => {
    const { ApiError } = await import("@/lib/http");
    const { experienceErrorOf } = await import("@/lib/services/experience");
    const err = (code: string) => new ApiError(422, code, undefined, { code, data: { detail: { code } } });
    expect(experienceErrorOf(err("subcategory_category_mismatch"))).toMatchObject({ key: "subcategory", field: "subcategory_id" });
    expect(experienceErrorOf(err("experience_subcategory_invalid"))).toMatchObject({ key: "subcategory", field: "subcategory_id" });
    expect(experienceErrorOf(err("category_not_found"))).toMatchObject({ key: "category", field: "category_id" });
  });
  it("reads a plain string detail code the same way", async () => {
    const { toApiError } = await import("@/lib/http");
    const { experienceErrorOf } = await import("@/lib/services/experience");
    const e = await toApiError(new Response(JSON.stringify({ detail: "experience_evidence_too_large" }), { status: 413 }));
    expect(experienceErrorOf(e)?.key).toBe("experience_evidence_too_large");
  });
});

describe("evidence file check before upload (§3.3)", () => {
  const MB = 1024 * 1024;
  it("takes PDF, JPEG, PNG, WebP, DOC and DOCX up to 20 MB", async () => {
    const { evidenceFileIssue, EVIDENCE_ACCEPT } = await import("@/lib/services/experience");
    expect(evidenceFileIssue({ name: "a.pdf", type: "application/pdf", size: 20 * MB })).toBe("");
    expect(evidenceFileIssue({ name: "a.webp", type: "image/webp", size: 1 })).toBe("");
    expect(evidenceFileIssue({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1 })).toBe("");
    expect(evidenceFileIssue({ name: "a.pdf", type: "application/pdf", size: 20 * MB + 1 })).toBe("size");
    expect(evidenceFileIssue({ name: "a.gif", type: "image/gif", size: 1 })).toBe("type");
    expect(evidenceFileIssue({ name: "a.zip", type: "application/zip", size: 1 })).toBe("type");
    for (const x of [".pdf", ".docx", "image/webp"]) expect(EVIDENCE_ACCEPT).toContain(x);
  });
  it("judges a file the browser gave no type by its extension", async () => {
    const { evidenceFileIssue } = await import("@/lib/services/experience");
    expect(evidenceFileIssue({ name: "Diplom.DOC", type: "", size: 1 })).toBe("");
    expect(evidenceFileIssue({ name: "spravka.docx", type: "application/octet-stream", size: 1 })).toBe("");
    expect(evidenceFileIssue({ name: "run.exe", type: "", size: 1 })).toBe("type");
  });
});

describe("experience statuses and review rooms (TSK-712239, TSK-365169)", () => {
  it("keeps changes_requested, reads the room's call types and the reviewer's name", async () => {
    const { experienceItemOf, reviewRoomOf, reviewOf } = await import("@/lib/services/experience");
    expect(experienceItemOf({ id: "e5", status: "changes_requested" })?.status).toBe("changes_requested");
    expect(reviewRoomOf({ room_id: "r", call_types: ["video"] })?.callTypes).toEqual(["video"]);
    expect(reviewRoomOf({ room_id: "r", calls_url: "/secure-chats/r/calls" })?.callTypes).toEqual(["audio", "video"]);
    expect(reviewRoomOf({ room_id: "r", status: "read_only" })?.callTypes).toEqual([]);
    expect(reviewOf({ decision: "rejected", reviewer: { name: "Dilshod" } }).reviewer).toBe("Dilshod");
  });
});
