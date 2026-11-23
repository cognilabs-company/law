import { describe, expect, it } from "vitest";
import { marketSignalOf } from "@/lib/services/marketplace";

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
