import { describe, expect, it } from "vitest";
import { marketSignalOf } from "@/lib/services/marketplace";
import { isGiftOnlyPlan, sosUsageOf } from "@/lib/services/backend";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §8.
describe("order events (§8)", () => {
  it("a revoked assignment is its own signal, with the order", () => {
    const sig = marketSignalOf({ event: "marketplace.assignment_revoked", order_id: "o-1", reason: "reassigned", revoked_at: "2026-11-21T10:00:00Z" });
    expect(sig).toMatchObject({ kind: "reassigned", sub: "revoked", orderId: "o-1" });
  });
  it("the deadline reminder carries minutes_left", () => {
    const sig = marketSignalOf({ event: "marketplace.assignment_deadline_soon", data: { order_id: "o-2", minutes_left: 5, remaining_minutes: 5 } });
    expect(sig).toMatchObject({ kind: "assigned", sub: "soon", orderId: "o-2", minutesLeft: 5 });
  });
});


describe("subscriptions and SOS (§9)", () => {
  it("reads the SOS minutes as sent", () => {
    expect(sosUsageOf({ active: true, limit_seconds: 1800, used_seconds: 420, remaining_seconds: 1380, reset_at: "2026-12-18T09:00:00+00:00" })).toEqual({ active: true, limitSeconds: 1800, usedSeconds: 420, remainingSeconds: 1380, resetAt: "2026-12-18T09:00:00+00:00" });
    expect(sosUsageOf({ active: true, limit_seconds: 1800, used_seconds: 2000 })?.remainingSeconds).toBe(0);
    expect(sosUsageOf(null)).toBeNull();
  });
  it("a gift-only plan is a gift and nothing else", () => {
    expect(isGiftOnlyPlan({ billingType: "gift" })).toBe(true);
    expect(isGiftOnlyPlan({ billingType: "subscription" })).toBe(false);
  });
});
