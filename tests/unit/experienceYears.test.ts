import { describe, expect, it } from "vitest";
import { approvedYears, type ExperienceGroup, type ExperienceItem } from "@/lib/services/experience";

const item = (positions: { startedAt: string; endedAt?: string; isCurrent?: boolean }[], years: number | null = null): ExperienceItem =>
  ({
    id: "e",
    rootId: "r",
    sourceId: "",
    positions: positions.map((p) => ({ title: "Yurist", startedAt: p.startedAt, endedAt: p.endedAt ?? "", isCurrent: p.isCurrent ?? false, description: "" })),
    years,
  }) as unknown as ExperienceItem;
const group = (current: ExperienceItem): ExperienceGroup => ({ rootId: "r", current, pending: null, latest: current, revisionCount: 1 });

describe("approvedYears", () => {
  it("counts overlapping workplaces once", () => {
    const a = group(item([{ startedAt: "2016-01-01", endedAt: "2022-01-01" }], 6));
    const b = group(item([{ startedAt: "2019-01-01", endedAt: "2022-01-01" }], 3));
    expect(approvedYears([a, b], "2026-10-28")).toBe(6);
  });

  it("adds separate periods and runs a current position to today", () => {
    const a = group(item([{ startedAt: "2010-01-01", endedAt: "2012-01-01" }]));
    const b = group(item([{ startedAt: "2020-10-28", isCurrent: true }]));
    expect(approvedYears([a, b], "2026-10-28")).toBe(8);
  });

  it("falls back to the backend's years when a record has no dates", () => {
    expect(approvedYears([group(item([], 4)), group(item([], 2))], "2026-10-28")).toBe(6);
  });
});
