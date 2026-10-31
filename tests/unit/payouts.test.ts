import { describe, expect, it } from "vitest";
import { orderPayoutDataOf, orderPayoutsOf, paidBody, payoutPlanOf, PLANNED_STAGES, payoutActionable, payoutOf, payoutStageOf, payoutStatusOf, recoveryOf, settlementOf } from "@/lib/services/payouts";

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
  it("an order's stages come from the financials, in order; the hold is the settlement's", () => {
    const settlement = settlementOf({ settlement: { status: "complaint_hold", held_amount: 220000, hold_reason: "complaint_open", release_after: "" } });
    expect(settlement).toMatchObject({ held: true, heldAmount: 220000, holdReason: "complaint_open" });
    const payouts = [{ id: "c", stage: "completion", payable_amount: 22, status: "operator_required" }, { id: "a", stage: "acceptance", payable_amount: 30, status: "paid" }, { id: "b", stage: "first_checklist", payable_amount: 30, status: "paid" }];
    const rows = orderPayoutsOf({ payouts, settlement: { status: "complaint_hold" } });
    expect(rows.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(rows[2].status).toBe("held");
    expect(orderPayoutsOf({ payouts, settlement: { status: "rework_hold" } })[2].status).toBe("held");
    expect(orderPayoutsOf({ payouts, settlement: { status: "released" } })[2].status).toBe("due");
    // A client's financials: no payout rows at all.
    expect(orderPayoutsOf({ payouts: [], settlement: {} })).toEqual([]);
  });
  // Backend answers 2026-10-31 §1.10: the snapshot's planned stages, the
  // created payout rows and the payout-stage rows are read apart.
  it("planned stages come from the snapshot, else the confirmed 30/30/40 plan", () => {
    expect(payoutPlanOf({ snapshot: { payout_plan: [{ stage: "completion", gross_percent: 40 }, { stage: "acceptance", gross_percent: 30 }, { stage: "first_checklist", gross_percent: 30 }] } }).map((p) => [p.stage, p.percent])).toEqual([
      ["accept", 30],
      ["checklist", 30],
      ["completion", 40],
    ]);
    expect(payoutPlanOf({ snapshot: {} })).toEqual(PLANNED_STAGES);
    expect(payoutPlanOf({ financial_snapshot: { payout_stages: [{ stage: "mystery", percent: 10 }] } })).toEqual(PLANNED_STAGES);
  });
  it("a payout-stage row stands in for a stage with no payout row; a payout row wins", () => {
    const d = orderPayoutDataOf({
      payouts: [{ id: "a", stage: "acceptance", payable_amount: 30, status: "paid" }],
      payout_stages: [{ id: "sa", stage: "acceptance", status: "operator_required" }, { id: "sb", stage: "first_checklist", payable_amount: 30, status: "provider_pending" }],
      settlement: { status: "pending" },
    });
    expect(d.rows.map((r) => [r.id, r.status])).toEqual([
      ["a", "paid"],
      ["sb", "processing"],
    ]);
    expect(d.plan).toEqual(PLANNED_STAGES);
  });
  it("a recovery reads its normalized top-level fields, never the payload", () => {
    expect(recoveryOf({ id: "r1", order_id: "o2", work_id: "ADV-2", service_title: "Meros", amount: 60000, status: "under_review", seller_user_id: "s2", seller: { id: "s2", name: "Malika" }, reason: "Mijozga qaytarildi", payload: { reason: "eski" } })).toMatchObject({ amount: 60000, status: "review", workId: "ADV-2", reason: "Mijozga qaytarildi", seller: { id: "s2", name: "Malika" } });
  });
});
