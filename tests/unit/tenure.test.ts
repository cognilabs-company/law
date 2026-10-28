import { describe, expect, it } from "vitest";
import { yearsSince } from "@/lib/tenure";

describe("yearsSince", () => {
  it("counts only full years", () => {
    expect(yearsSince("2018-10-28", "2026-10-28")).toBe(8);
    expect(yearsSince("2018-10-29", "2026-10-28")).toBe(7);
    expect(yearsSince("2026-01-15", "2026-10-28")).toBe(0);
  });

  it("rejects future and malformed dates", () => {
    expect(yearsSince("2027-01-01", "2026-10-28")).toBeNull();
    expect(yearsSince("2026-10-29", "2026-10-28")).toBeNull();
    expect(yearsSince("", "2026-10-28")).toBeNull();
  });
});
