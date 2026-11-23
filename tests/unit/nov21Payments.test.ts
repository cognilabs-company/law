import { describe, expect, it } from "vitest";
import { planCheckoutOf } from "@/lib/services/planCheckout";
import { normDocLawyerSubmit } from "@/lib/services/backend";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §1: every payment is Click or
// ATMOS; the plan purchase answers with the payment and its payment_url, or
// "approved" for a free plan that is already active.
describe("plan purchase through Click or ATMOS (§1.3)", () => {
  it("reads the payment, its provider and its link", () => {
    const r = planCheckoutOf({
      id: "req-1",
      work_id: "SUB-AB12C",
      status: "awaiting_payment",
      payment_id: "pay-9",
      subscription_id: "sub-1",
      amount: 99000,
      provider: "atmos",
      payment_url: "https://checkout.atmos.uz/invoice/opaque",
      payment: { id: "pay-9", status: "pending", amount: 99000, currency: "UZS", provider: "atmos" },
    });
    expect(r.approved).toBe(false);
    expect(r.provider).toBe("atmos");
    expect(r.paymentId).toBe("pay-9");
    expect(r.paymentUrl).toBe("https://checkout.atmos.uz/invoice/opaque");
    expect(r.payment?.url).toBe("https://checkout.atmos.uz/invoice/opaque");
    expect(r.workId).toBe("SUB-AB12C");
  });
  it("a free plan is approved at once, with nothing to open", () => {
    const r = planCheckoutOf({ status: "approved", amount: 0, provider: "click", payment_url: "" });
    expect(r.approved).toBe(true);
    expect(r.paymentUrl).toBe("");
  });
  it("never follows a link that is not https", () => {
    expect(planCheckoutOf({ status: "awaiting_payment", payment_url: "javascript:alert(1)" }).paymentUrl).toBe("");
    expect(planCheckoutOf({ status: "awaiting_payment", payment_url: "http://my.click.uz/x" }).paymentUrl).toBe("");
  });
});


describe("document review fee: Click or ATMOS, no Telegram (§1.3)", () => {
  it("the gate carries its provider and payment_url; the top-level payment fills a missing link", () => {
    const r = normDocLawyerSubmit({
      request: { id: "dr-1", status: "payment_required" },
      payment_required: true,
      payment_gate: { id: "g1", status: "pending", payment_id: "pay-7", amount: 45000, currency: "UZS", page_count: 14, included_pages: 10, extra_pages: 4, provider: "click" },
      payment: { id: "pay-7", provider: "click", payment_url: "https://lexgo.api.cognilabs.org/payments/click/checkout/opaque" },
    });
    expect(r.gate?.provider).toBe("click");
    expect(r.gate?.paymentUrl).toBe("https://lexgo.api.cognilabs.org/payments/click/checkout/opaque");
    expect(r.gate?.extraPages).toBe(4);
    expect(r.gate && "telegramSent" in r.gate).toBe(false);
  });
});
