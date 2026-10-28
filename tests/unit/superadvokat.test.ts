import { describe, expect, it } from "vitest";
import { superActiveAt, superBody, superEntryOf } from "@/lib/services/superadvokat";

// TSK-460646 — the manual Superadvokat override.
describe("superadvokat override", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  it("the newest entry decides, and an ended period no longer applies", () => {
    const on = superEntryOf({ id: "1", active: true, reason: "Mukofot", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-12-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" });
    expect(superActiveAt([on], now)).toEqual({ active: true, until: "2026-12-01T00:00:00Z" });
    const ended = { ...on, endsAt: "2026-10-20T00:00:00Z" };
    expect(superActiveAt([ended], now).active).toBe(false);
    const future = { ...on, startsAt: "2026-11-01T00:00:00Z" };
    expect(superActiveAt([future], now).active).toBe(false);
    expect(superActiveAt([], now).active).toBe(false);
  });
  it("sends the reason trimmed and leaves out an empty end", () => {
    expect(superBody({ active: true, reason: "  Sabab  ", startsAt: "2026-10-28T00:00:00.000Z", endsAt: "" })).toEqual({ active: true, reason: "Sabab", starts_at: "2026-10-28T00:00:00.000Z" });
  });
});
