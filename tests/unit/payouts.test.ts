import { describe, expect, it } from "vitest";
import { orderPayoutsOf, paidBody, payoutOf, payoutStageOf, payoutStatusOf, recoveryOf, settlementHeld } from "@/lib/services/payouts";

// TSK-906326 — 30-30-40 payouts: every amount is the backend's.
describe("payout stages", () => {
  it("reads the stage names the backend may use", () => {
    expect(payoutStageOf("seller_accept_30")).toBe("accept");
    expect(payoutStageOf("first_checklist_complete")).toBe("checklist");
    expect(payoutStageOf("completion_40")).toBe("completion");
    expect(payoutStageOf("final_settlement")).toBe("completion");
    expect(payoutStageOf("bonus")).toBe("other");
  });
  it("maps statuses to what the operator does next", () => {
    expect(payoutStatusOf("required")).toBe("due");
    expect(payoutStatusOf("operator_required")).toBe("due");
    expect(payoutStatusOf("paid")).toBe("paid");
    expect(payoutStatusOf("held")).toBe("held");
    expect(payoutStatusOf("scheduled")).toBe("waiting");
  });
  it("takes amounts and people as given, never computing them", () => {
    const p = payoutOf({ id: "po1", order_id: "o1", work_id: "ADV-1", stage: "seller_accept", stage_percent: 30, amount: 30000, status: "required", seller: { id: "s1", name: "Aziz Karimov" } });
    expect(p).toMatchObject({ stage: "accept", percent: 30, amount: 30000, status: "due", workId: "ADV-1", seller: { id: "s1", name: "Aziz Karimov" } });
    expect(payoutOf({ id: "x", stage: "completion", net_amount: 22000 }).amount).toBe(22000);
  });
  it("the mark-paid body: a trimmed reference, evidence and a note", () => {
    expect(paidBody({ reference: "  TRX-77 ", note: " bank " })).toEqual({ transaction_reference: "TRX-77", evidence_ids: [], note: "bank" });
  });
  it("orders an order's stages accept → checklist → completion and spots a hold", () => {
    const raw = { payouts: [{ id: "c", stage: "completion", amount: 22 }, { id: "a", stage: "accept", amount: 30 }, { id: "b", stage: "first_checklist", amount: 30 }], settlement: { status: "held_for_complaint" } };
    expect(orderPayoutsOf(raw).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(settlementHeld(raw)).toBe(true);
    expect(orderPayoutsOf({ payments: [] })).toEqual([]);
  });
  it("a recovery keeps the client-visible reason and the seller", () => {
    expect(recoveryOf({ id: "r1", work_id: "ADV-2", amount: 60000, status: "pending", seller_user_id: "s2", reason: "refund_after_payout" })).toMatchObject({ amount: 60000, status: "due", seller: { id: "s2", name: "" } });
  });
});
