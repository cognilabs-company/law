import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import {
  ATMOS_MAYBE_CREATED,
  ATMOS_RETRYABLE,
  ATMOS_SUPPORT,
  atmosErrorOf,
  atmosOrderStateOf,
  atmosOutcomeOf,
  atmosRenewalOf,
  recentPendingOrder,
  sellerDeadlineOf,
} from "@/lib/services/atmosCheckout";
import { PURCHASE_PROVIDERS, normMarketOrder, purchaseBodyOf, purchaseOf } from "@/lib/services/marketplace";
import { checkoutProvidersOf } from "@/lib/services/paymentProviders";

// TEZKOR_HIMOYA_ATMOS_FRONTEND_INTEGRATION_2026_11_17.md
const URL1 = "https://checkout.atmos.uz/invoice/opaque-token-1";
const err = (status: number, code: string, detail: Record<string, unknown> = {}) => new ApiError(status, code, undefined, { code, data: { detail: { code, ...detail } } });

describe("ATMOS provider availability", () => {
  it("is offered only when the backend says enabled=true", () => {
    const off = checkoutProvidersOf({ items: [{ provider: "atmos", enabled: false, label: "ATMOS", status: "disabled" }] });
    expect(off.items.find((p) => p.provider === "atmos")?.enabled).toBe(false);
    const on = checkoutProvidersOf({ items: [{ provider: "atmos", enabled: true, label: "ATMOS", status: "configured" }] });
    expect(on.items.find((p) => p.provider === "atmos")?.enabled).toBe(true);
    expect(PURCHASE_PROVIDERS).toContain("atmos");
  });

  it("the purchase names ATMOS and UZS and never an amount", () => {
    const body = purchaseBodyOf({ paymentProvider: "atmos", note: "", preferredChannel: "chat", contactSpeed: "today", urgency: "today", selectedOptionIds: [] });
    expect(body).toMatchObject({ payment_provider: "atmos", currency: "UZS", contact_channel: "chat", contact_speed: "today", urgency: "today", selected_option_ids: [] });
    expect("amount" in body).toBe(false);
  });

  it("reads the 201 answer: pending order, pending payment with its checkout", () => {
    const p = purchaseOf({
      order: { id: "order-1", status: "pending_payment", payment_status: "pending" },
      payment: { id: "pay-1", provider: "atmos", status: "pending", amount: 1000, currency: "UZS", payment_url: URL1 },
      status: "payment_pending",
      assignment_status: "payment_pending",
      acceptance_deadline_at: null,
      seller_will_receive_after_payment: true,
    });
    expect(p.orderId).toBe("order-1");
    expect(p.accepting).toBe(false);
    expect(p.deadlineAt).toBe("");
    expect(p.payment).toMatchObject({ id: "pay-1", provider: "atmos", status: "pending", amount: 1000, url: URL1 });
  });
});

describe("ATMOS order state (GET /marketplace/me/orders/{id})", () => {
  it("pending until the backend says paid", () => {
    const s = atmosOrderStateOf({ id: "order-1", status: "pending_payment", payment_status: "pending", payment: { id: "pay-1", status: "pending", provider: "atmos", amount: 1000 }, details: { assignment_status: "payment_pending" } }, "order-1");
    expect(s).toMatchObject({ orderId: "order-1", paymentId: "pay-1", provider: "atmos", pay: "pending", assignmentStatus: "payment_pending", amount: 1000 });
    expect(atmosOutcomeOf(s)).toBe("pending");
    expect(sellerDeadlineOf(s)).toBe("");
  });

  it("paid: the seller's deadline comes from the backend only", () => {
    const deadline = "2026-11-17T10:30:00Z";
    const s = atmosOrderStateOf({
      order: { id: "order-1", status: "sent_to_seller", payment_status: "paid", details: { assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline, client_status: "sent_to_seller", client_status_message: "Advokat 30 daqiqada javob beradi" } },
      payment: { id: "pay-1", status: "paid", provider: "atmos" },
    });
    expect(atmosOutcomeOf(s)).toBe("paid");
    expect(sellerDeadlineOf(s)).toBe(deadline);
    expect(s.clientMessage).toBe("Advokat 30 daqiqada javob beradi");
  });

  it("a deadline without a paid payment never starts the clock", () => {
    const s = atmosOrderStateOf({ id: "o", status: "pending_payment", payment_status: "pending", assignment_status: "waiting_seller_response", acceptance_deadline_at: "2026-11-17T10:30:00Z", payment: { id: "p", status: "pending" } });
    expect(sellerDeadlineOf(s)).toBe("");
  });

  it("an error card or a cancelled order ends without activating", () => {
    expect(atmosOutcomeOf(atmosOrderStateOf({ id: "o", status: "pending_payment", payment: { id: "p", status: "failed" } }))).toBe("failed");
    expect(atmosOutcomeOf(atmosOrderStateOf({ id: "o", status: "cancelled", payment_status: "pending", payment: { id: "p", status: "pending" } }))).toBe("failed");
  });

  it("the order keeps its payment for the order page", () => {
    const o = normMarketOrder({ id: "o", status: "pending_payment", payment_status: "pending", payment: { id: "pay-1", provider: "ATMOS", status: "pending", amount: 1000, payment_url: URL1 } });
    expect(o.payment).toEqual({ id: "pay-1", provider: "atmos", status: "pending", amount: 1000, currency: "UZS" });
    expect(JSON.stringify(o)).not.toContain("opaque-token");
  });
});

describe("ATMOS checkout renewal", () => {
  it("takes the new https URL as given", () => {
    expect(atmosRenewalOf({ payment_id: "pay-1", status: "pending", payment_url: URL1 })).toEqual({ status: "pending", url: URL1 });
    expect(atmosRenewalOf({ payment: { id: "pay-1", status: "pending", payment_url: URL1 } })).toEqual({ status: "pending", url: URL1 });
  });
  it("already paid: nothing to open", () => {
    expect(atmosRenewalOf({ status: "paid" })).toEqual({ status: "paid", url: "" });
  });
  it("never a non-https page", () => {
    expect(atmosRenewalOf({ status: "pending", payment_url: "http://checkout.atmos.uz/x" }).url).toBe("");
    expect(atmosRenewalOf({ status: "pending", payment_url: "javascript:alert(1)" }).url).toBe("");
  });
});

describe("ATMOS errors", () => {
  it("maps every documented code", () => {
    expect(atmosErrorOf(err(503, "payment_provider_not_configured")).key).toBe("notConfigured");
    expect(atmosErrorOf(err(502, "payment_provider_auth_failed")).key).toBe("authFailed");
    expect(atmosErrorOf(err(502, "payment_provider_unavailable")).key).toBe("unavailable");
    expect(atmosErrorOf(err(502, "payment_invoice_rejected")).key).toBe("rejected");
    expect(atmosErrorOf(err(502, "payment_provider_checkout_url_rejected")).key).toBe("urlRejected");
    expect(atmosErrorOf(err(422, "atmos_fiscal_items_amount_mismatch")).key).toBe("fiscal");
    expect(atmosErrorOf(err(409, "payment_not_payable")).key).toBe("notPayable");
    expect(atmosErrorOf(err(409, "marketplace_order_already_active", { order_id: "order-9" }))).toEqual({ key: "activeOrder", message: "", orderId: "order-9" });
    expect(atmosErrorOf(err(401, "not_authenticated")).key).toBe("auth");
  });

  it("no answer is a timeout, not an abort", () => {
    expect(atmosErrorOf(new ApiError(0, "network_error")).key).toBe("timeout");
    expect(atmosErrorOf(new ApiError(504)).key).toBe("timeout");
    expect(atmosErrorOf(new ApiError(0, "aborted")).key).toBe("generic");
  });

  it("shows ATMOS's own words only when they are safe", () => {
    expect(atmosErrorOf(err(502, "payment_invoice_rejected", { provider_message: "Invoice amount is too small" })).message).toBe("Invoice amount is too small");
    expect(atmosErrorOf(err(502, "payment_invoice_rejected", { provider_message: "see https://checkout.atmos.uz/x?token=abc" })).message).toBe("");
    expect(atmosErrorOf(err(502, "payment_invoice_rejected", { provider_message: "card 8600 expired" })).message).toBe("");
    expect(atmosErrorOf(err(502, "payment_invoice_rejected", { provider_message: "x".repeat(200) })).message).toBe("");
  });

  it("retry, support and the duplicate check go where the contract says", () => {
    expect(ATMOS_RETRYABLE).not.toContain("fiscal");
    expect(ATMOS_RETRYABLE).not.toContain("urlRejected");
    expect(ATMOS_SUPPORT).toEqual(expect.arrayContaining(["authFailed", "urlRejected", "fiscal"]));
    expect(ATMOS_MAYBE_CREATED).toContain("timeout");
  });
});

describe("duplicate guard after a failed purchase", () => {
  const since = Date.parse("2026-11-17T10:00:00Z");
  const row = (extra: Record<string, unknown>) =>
    normMarketOrder({ id: "order-1", status: "pending_payment", payment_status: "pending", service_id: "svc-1", lawyer_user_id: "u-adv", created_at: "2026-11-17T10:00:05Z", ...extra });

  it("finds the order the request already made", () => {
    expect(recentPendingOrder([row({})], { serviceId: "svc-1", sellerUserId: "u-adv" }, since)?.id).toBe("order-1");
  });
  it("ignores other services, other sellers, paid and old orders", () => {
    const t = { serviceId: "svc-1", sellerUserId: "u-adv" };
    expect(recentPendingOrder([row({ service_id: "svc-2" })], t, since)).toBeNull();
    expect(recentPendingOrder([row({ lawyer_user_id: "u-other" })], t, since)).toBeNull();
    expect(recentPendingOrder([row({ status: "sent_to_seller", payment_status: "paid" })], t, since)).toBeNull();
    expect(recentPendingOrder([row({ created_at: "2026-11-17T09:00:00Z" })], t, since)).toBeNull();
  });
  it("matches a package by its package id", () => {
    expect(recentPendingOrder([row({ package_id: "pkg-1" })], { serviceId: "svc-x", packageId: "pkg-1", sellerUserId: "u-adv" }, since)?.id).toBe("order-1");
  });
});
