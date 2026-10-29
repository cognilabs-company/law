import { describe, expect, it } from "vitest";
import { canApprove, checkItemsOf, checkKeyParts, diffRowsOf, experienceItemOf, localDiff, positionsOf } from "@/lib/services/experience";
import { achievementDiff, achievementOf } from "@/lib/services/achievements";
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
  it("dynamic keys split into a label and a number; the backend's labels win", () => {
    expect(checkKeyParts("position_2_dates")).toEqual({ base: "position_dates", n: 2 });
    expect(checkKeyParts("evidence_3")).toEqual({ base: "evidence", n: 3 });
    expect(checkKeyParts("file_authenticity")).toEqual({ base: "file_authenticity", n: null });
    // Gaps closed §12: the backend's checklist is the list, in its order.
    expect(checkItemsOf([{ key: "dates_valid", label: "Sanalar mantiqan to'g'ri", hint: "h", label_i18n: { ru: "Даты логичны" } }], ["x", "y"])).toEqual([{ key: "dates_valid", label: "Sanalar mantiqan to'g'ri", hint: "h", i18n: { ru: "Даты логичны" } }]);
    // An older answer with checklist_keys only.
    expect(checkItemsOf(undefined, ["x"])).toEqual([{ key: "x", label: "", hint: "", i18n: {} }]);
  });
  it("reads the backend's diff with its labels, dropping no-ops", () => {
    expect(diffRowsOf([{ field: "workplace", label: "Ish joyi", before: "A", after: "B" }, { field: "title", before: "x", after: "x" }])).toEqual([{ field: "workplace", label: "Ish joyi", before: "A", after: "B", kind: "changed" }]);
    expect(diffRowsOf([{ field: "description", label: "Tavsif", before: "", after: "Yangi" }])[0].kind).toBe("added");
  });
  it("compares two revisions field by field when no diff is sent", () => {
    const prev = experienceItemOf({ id: "1", workplace: "A", positions: [{ title: "Yurist", started_at: "2018-01-01", is_current: true }] });
    const next = experienceItemOf({ id: "2", workplace: "A", positions: [{ title: "Yurist", started_at: "2018-01-01", ended_at: "2020-01-01" }, { title: "Advokat", started_at: "2020-02-01", is_current: true }] });
    const rows = localDiff(next, prev);
    expect(rows.map((r) => [r.field, r.kind])).toEqual([
      ["positions.0", "changed"],
      ["positions.1", "added"],
    ]);
  });
});

describe("achievements", () => {
  it("compares two achievement revisions by stage, result and date", () => {
    const a = achievementOf({ id: "1", process_stage: "inquiry", result_scope: "full", achieved_at: "2025-01-01" });
    const b = achievementOf({ id: "2", process_stage: "court", result_scope: "full", achieved_at: "2025-01-01T00:00:00Z" });
    expect(achievementDiff(b, a)).toEqual([{ field: "process_stage", label: "", before: "inquiry", after: "court", kind: "changed" }]);
  });
});
