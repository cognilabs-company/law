import { describe, expect, it } from "vitest";
import { orderPayoutsOf, paidBody, payoutActionable, payoutOf, payoutStageOf, payoutStatusOf, recoveryOf, settlementOf } from "@/lib/services/payouts";

// TSK-906326 — 30-30-22 payouts, as the backend answered on 2026-10-28 §3:
// every amount is the backend's.
describe("payout stages", () => {
  it("reads the backend's stage values only", () => {
    expect(payoutStageOf("acceptance")).toBe("accept");
    expect(payoutStageOf("first_checklist")).toBe("checklist");
    expect(payoutStageOf("completion")).toBe("completion");
    expect(payoutStageOf("seller_accept_30")).toBe("other");
  });
  it("maps statuses to what the operator does next", () => {
    expect(payoutStatusOf("operator_required")).toBe("due");
    expect(payoutStatusOf("provider_pending")).toBe("processing");
    expect(payoutStatusOf("provider_failed")).toBe("failed");
    expect(payoutStatusOf("recovery_required")).toBe("recovery");
    expect(payoutStatusOf("under_review")).toBe("review");
    expect(payoutStatusOf("recovered")).toBe("paid");
    expect(payoutStatusOf("paid")).toBe("paid");
    expect(["operator_required", "provider_failed", "under_review"].every((s) => payoutActionable(payoutStatusOf(s)))).toBe(true);
    expect(["provider_pending", "recovery_required", "paid"].some((s) => payoutActionable(payoutStatusOf(s)))).toBe(false);
  });
  it("takes amounts and people as given, never computing them", () => {
    const p = payoutOf({ id: "po1", order_id: "o1", stage: "acceptance", status: "operator_required", gross_percent: 30, gross_amount: 300000, commission_amount: 0, payable_amount: 300000, seller_user_id: "s1", mode: "operator_managed", transaction_reference: "" });
    expect(p).toMatchObject({ stage: "accept", percent: 30, gross: 300000, amount: 300000, status: "due", automatic: false, seller: { id: "s1", name: "" } });
  });
  it("the mark-paid body: a trimmed reference, evidence ids and a note", () => {
    expect(paidBody({ reference: "  TRX-77 ", note: " bank " })).toEqual({ transaction_reference: "TRX-77", evidence_ids: [], note: "bank" });
  });
  it("an order's stages come from the checklist, in order; the hold is the settlement's", () => {
    const settlement = settlementOf({ settlement: { status: "complaint_hold", held_amount: 220000, hold_reason: "complaint_open", release_after: "" } });
    expect(settlement).toMatchObject({ held: true, heldAmount: 220000, holdReason: "complaint_open" });
    const raw = { items: [], payouts: [{ id: "c", stage: "completion", payable_amount: 22, status: "operator_required" }, { id: "a", stage: "acceptance", payable_amount: 30, status: "paid" }, { id: "b", stage: "first_checklist", payable_amount: 30, status: "paid" }] };
    const rows = orderPayoutsOf(raw, settlement);
    expect(rows.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(rows[2].status).toBe("held");
    expect(orderPayoutsOf(raw, settlementOf({ settlement: { status: "released" } }))[2].status).toBe("due");
    expect(orderPayoutsOf({ items: [] })).toEqual([]);
  });
  it("a recovery reads its reason from payload.reason", () => {
    expect(recoveryOf({ id: "r1", order_id: "o2", amount: 60000, status: "under_review", seller_user_id: "s2", payload: { reason: "Mijozga qaytarildi" } })).toMatchObject({ amount: 60000, status: "review", reason: "Mijozga qaytarildi", seller: { id: "s2", name: "" } });
  });
});
