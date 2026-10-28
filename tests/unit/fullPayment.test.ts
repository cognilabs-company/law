import { describe, expect, it } from "vitest";
import { awaitingSeller, phaseOfStatus, purchaseBodyOf, purchaseOf, trackPhaseOf } from "@/lib/services/marketplace";

// TSK-900422 — enterprise contract 2026-10-27 §4: request → 100% payment →
// the seller's 30-minute acceptance → chat. No 10% advance.
describe("full payment first", () => {
  it("the request names the provider and the currency", () => {
    const b = purchaseBodyOf({ paymentProvider: "telegram_manual", note: "Ish", preferredChannel: "chat", contactSpeed: "within_1_hour" });
    expect(b.payment_provider).toBe("telegram_manual");
    expect(b.currency).toBe("UZS");
    expect(b.contact_speed).toBe("within_1_hour");
    expect(purchaseBodyOf({ note: "x", preferredChannel: "chat" }).payment_provider).toBeUndefined();
  });

  it("reads the initial response: pending payment, the one 100% payment, nothing for the seller yet", () => {
    const r = purchaseOf({
      work_id: "ADV-1",
      order: { id: "o1", status: "pending_payment", payment_status: "pending", price: 100000 },
      payment: { id: "p1", status: "pending", amount: 100000, currency: "UZS", provider: "payme", payment_url: "https://checkout.paycom.uz/abc" },
      telegram_sent: false,
      status: "payment_pending",
      assignment_status: "payment_pending",
      acceptance_deadline_at: null,
      next_status: "full_payment_required",
    });
    expect(r.accepting).toBe(false);
    expect(phaseOfStatus(r.status)).toBe("pending");
    expect(r.payment).toEqual({ id: "p1", status: "pending", amount: 100000, currency: "UZS", provider: "payme", url: "https://checkout.paycom.uz/abc" });
    expect(r.amount).toBe(100000);
  });

  it("never follows a non-https provider link", () => {
    const r = purchaseOf({ order: { id: "o1", status: "pending_payment" }, payment: { id: "p1", status: "pending", amount: 1, payment_url: "javascript:alert(1)" } });
    expect(r.payment?.url).toBe("");
  });

  it("the bare payment statuses read as waiting for payment, never as paid", () => {
    for (const s of ["payment_pending", "pending_payment", "waiting_payment", "full_payment_required"]) expect(phaseOfStatus(s)).toBe("pending");
  });

  it("paid and sent to the seller is the 30-minute window; accepted with a room is the chat", () => {
    const waiting = { status: "sent_to_seller", paymentStatus: "paid", canStartChat: false, assignment: { status: "waiting_seller_response", mode: "", deadlineAt: "2026-10-28T10:30:00Z", responseMinutes: 30 } };
    expect(awaitingSeller(waiting)).toBe(true);
    expect(trackPhaseOf(waiting)).toBe("accepting");
    expect(trackPhaseOf({ status: "in_progress", paymentStatus: "paid", canStartChat: true, assignment: { status: "accepted", mode: "", deadlineAt: "", responseMinutes: 5 } })).toBe("chat");
  });
});

describe("client-safe price reasons (TSK-787056)", () => {
  it("reads strings, localised dicts and {text} items, in order; empty when none", async () => {
    const { clientReasonsOf } = await import("@/lib/services/marketplace");
    expect(clientReasonsOf(undefined, ["A"])).toEqual([{ uz: "A" }]);
    expect(clientReasonsOf([{ uz: "Tajriba", ru: "Опыт", internal_formula: "x*1.2" }])).toEqual([{ uz: "Tajriba", ru: "Опыт" }]);
    expect(clientReasonsOf({ items: [{ text: "Hudud" }, { text: "  " }] })).toEqual([{ uz: "Hudud" }]);
    expect(clientReasonsOf(null, [], "")).toEqual([]);
  });
});
