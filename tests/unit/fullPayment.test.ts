import { describe, expect, it } from "vitest";
import { awaitingSeller, marketSignalOf, phaseOfStatus, purchaseBodyOf, purchaseOf, trackPhaseOf } from "@/lib/services/marketplace";

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

  it("sends the client's region only when it is known", () => {
    expect(purchaseBodyOf({ note: "x", preferredChannel: "chat", region: " Toshkent " }).region).toBe("Toshkent");
    expect("region" in purchaseBodyOf({ note: "x", preferredChannel: "chat", region: "" })).toBe(false);
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

  it("an order waiting for the client's choice is not a paid order opening its chat", () => {
    expect(phaseOfStatus("resolution_required")).toBe("resolution");
    expect(trackPhaseOf({ status: "resolution_required", paymentStatus: "paid", canStartChat: false, assignment: { status: "waiting_seller_response", mode: "", deadlineAt: "", responseMinutes: 30 } })).toBe("resolution");
  });

  it("tells the full payment, the acceptance and a payout apart", () => {
    expect(marketSignalOf({ event: "marketplace.full_payment_paid", order_id: "o1" })).toMatchObject({ kind: "paid", sub: "full_payment", orderId: "o1" });
    expect(marketSignalOf({ event: "marketplace.order_accepted", order_id: "o1", room_id: "r1" })).toMatchObject({ kind: "paid", sub: "accepted", roomId: "r1" });
    expect(marketSignalOf({ event: "marketplace.payout_paid", order_id: "o1" })).toMatchObject({ kind: "other", sub: "payout_paid" });
    expect(marketSignalOf({ event: "marketplace.payout_created", order_id: "o1" })).toMatchObject({ kind: "other", sub: "payout_created" });
  });
});

describe("client-safe price reasons (TSK-787056)", () => {
  // Backend answers 2026-10-31 §1.6, §3.9: only code, text and text_i18n are
  // read — never an amount or percent; the code is never shown.
  it("reads text and translations only; a reason with no words is dropped", async () => {
    const { clientReasonsOf } = await import("@/lib/services/marketplace");
    const [r] = clientReasonsOf([{ code: "lawyer_experience", text: "Tajriba inobatga olingan.", label: "x", text_i18n: { uz_latn: "Tajriba", ru: "Опыт", en: " " }, amount: 45000, percent: 10 }]);
    expect(r).toEqual({ code: "lawyer_experience", text: "Tajriba inobatga olingan.", i18n: { uz_latn: "Tajriba", ru: "Опыт" } });
    expect(clientReasonsOf([{ code: "region", amount: 0 }])).toEqual([]);
    expect(clientReasonsOf([{ code: "region", label: "Region" }])).toEqual([]);
    expect(clientReasonsOf(null)).toEqual([]);
    expect(clientReasonsOf([{ amount: 5 }])).toEqual([]);
  });
  it("picks the client's locale first, then the backend's text", async () => {
    const { clientReasonText } = await import("@/lib/services/marketplace");
    const r = { code: "x", text: "Matn", i18n: { uz_latn: "Lotin", ru: "Русский" } };
    expect(clientReasonText(r, "ru")).toBe("Русский");
    expect(clientReasonText(r, "uz")).toBe("Lotin");
    expect(clientReasonText(r, "en")).toBe("Matn");
    expect(clientReasonText({ code: "x", text: "", i18n: {} }, "en")).toBe("");
  });
});
