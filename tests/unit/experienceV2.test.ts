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
  it("renders the backend's checklist as given, in its order (2026-10-29 §8)", () => {
    expect(checkItemsOf([{ key: "dates_valid", label: "Sanalar mantiqan to'g'ri", hint: "h", label_i18n: { ru: "Даты логичны" } }])).toEqual([{ key: "dates_valid", label: "Sanalar mantiqan to'g'ri", hint: "h", i18n: { ru: "Даты логичны" } }]);
    expect(checkItemsOf(undefined)).toEqual([]);
  });
  it("reads the backend's diff with its labels, dropping no-ops", () => {
    expect(diffRowsOf([{ field: "workplace", label: "Ish joyi", before: "A", after: "B" }, { field: "title", before: "x", after: "x" }])).toEqual([{ field: "workplace", label: "Ish joyi", before: "A", after: "B", kind: "changed" }]);
    expect(diffRowsOf([{ field: "description", label: "Tavsif", before: "", after: "Yangi" }])[0].kind).toBe("added");
  });
});
