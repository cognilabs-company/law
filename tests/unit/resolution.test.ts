import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { normMarketOrder } from "@/lib/services/marketplace";
import { escalationClosed, escalationOf, idemKeyFor, idemLost, idemSettle, refundFinal, refundPreviewOf, refundStepOf, resolutionOf, type IdemSlot } from "@/lib/services/resolution";

// TSK-131840: one refund per payment from the frontend's side — one key per
// user action, the same key only for a retry after a lost answer — plus the
// refund's steps, the amount shown before confirming, and who did what.

describe("idempotency keys", () => {
  it("keeps one key for the same action and makes a new one for another", () => {
    const slot: IdemSlot = { current: null };
    const a = idemKeyFor(slot, "order-1:refund:");
    expect(a).toBeTruthy();
    expect(idemKeyFor(slot, "order-1:refund:")).toBe(a); // a double click, the same tick or not
    const b = idemKeyFor(slot, "order-1:reassign:");
    expect(b).not.toBe(a);
  });
  it("reuses the key only after a lost answer; any server answer settles it", () => {
    const slot: IdemSlot = { current: null };
    const a = idemKeyFor(slot, "s");
    idemSettle(slot, new ApiError(0, "network"));
    expect(idemKeyFor(slot, "s")).toBe(a); // the retry of the same request
    idemSettle(slot, new ApiError(409, "conflict"));
    expect(slot.current).toBeNull();
    const c = idemKeyFor(slot, "s");
    expect(c).not.toBe(a);
    idemSettle(slot);
    expect(slot.current).toBeNull();
  });
  it("tells a lost answer from a real one, and an already-closed resolution", () => {
    expect(idemLost(new ApiError(0, "x"))).toBe(true);
    expect(idemLost(new ApiError(500, "x"))).toBe(false);
    expect(idemLost(undefined)).toBe(false);
    expect(idemLost(new Error("offline"))).toBe(true);
    for (const code of ["assignment_escalation_closed", "resolution_offer_closed", "resolution_already_selected"]) {
      const e = new ApiError(409, "closed");
      e.code = code;
      expect(escalationClosed(e)).toBe(true);
    }
    expect(escalationClosed(new ApiError(409, "other"))).toBe(false);
  });
});

describe("refund steps", () => {
  it("maps every provider word onto requested → processing → refunded / rejected", () => {
    expect(refundStepOf("pending")).toBe("requested");
    expect(refundStepOf("refund_pending")).toBe("requested");
    expect(refundStepOf("processing")).toBe("processing");
    expect(refundStepOf("approved")).toBe("processing");
    expect(refundStepOf("succeeded")).toBe("refunded");
    expect(refundStepOf("REFUNDED")).toBe("refunded");
    expect(refundStepOf("failed")).toBe("rejected");
    expect(refundStepOf("rejected")).toBe("rejected");
    expect(refundStepOf("not_charged")).toBe("none");
    expect(refundStepOf("something_new")).toBe("requested");
  });
  it("knows when a refund is final", () => {
    expect(refundFinal("refunded")).toBe(true);
    expect(refundFinal("rejected")).toBe(true);
    expect(refundFinal("none")).toBe(true);
    expect(refundFinal("processing")).toBe(false);
  });
});

describe("the refund amount shown before confirming", () => {
  const base = { id: "o1", status: "resolution_required", price: 110000 };
  it("prefers the backend's figure", () => {
    const o = normMarketOrder({ ...base, payment_status: "paid", resolution: { offer: { id: "of", status: "pending_client_choice", options: ["refund"], refund_amount: 99000 }, can_choose: true } });
    expect(refundPreviewOf(o)).toEqual({ amount: 99000, currency: "UZS", source: "backend" });
  });
  it("falls back to what was paid", () => {
    const o = normMarketOrder({ ...base, payment_status: "paid", resolution: { offer: { id: "of", status: "pending_client_choice", options: ["refund"] }, can_choose: true } });
    expect(refundPreviewOf(o)).toEqual({ amount: 110000, currency: "UZS", source: "paid" });
  });
  it("says nothing goes back when nothing was charged", () => {
    const o = normMarketOrder({ ...base, payment_status: "unpaid", resolution: { offer: { id: "of", status: "pending_client_choice", options: ["refund"] }, can_choose: true } });
    expect(refundPreviewOf(o).source).toBe("none");
  });
});

describe("history and offers", () => {
  it("names who acted, by id when the backend sends no name", () => {
    const e = escalationOf({ id: "esc", order: { id: "o1" }, history: [{ action: "offer_resolution", actor_user_id: "op-1", note: "Tanlang", at: "2026-10-26T08:00:00Z" }, { action: "resolution_selected", actor: { id: "cl-1", name: "Mijoz" }, choice: "refund" }] });
    expect(e?.history[0]).toMatchObject({ type: "offer_resolution", actorId: "op-1", message: "Tanlang" });
    expect(e?.history[1]).toMatchObject({ type: "resolution_selected", actor: "Mijoz", actorId: "cl-1", choice: "refund" });
  });
  it("reads the offer's refund preview and selection time", () => {
    const r = resolutionOf({ offer: { id: "of", status: "selected", selected_choice: "refund", selected_at: "2026-10-26T08:05:00Z", refund_preview: { amount: 50000, currency: "UZS" } }, can_choose: false });
    expect(r?.offer).toMatchObject({ selectedChoice: "refund", selectedAt: "2026-10-26T08:05:00Z", refundAmount: 50000 });
  });
});
