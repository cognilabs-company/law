import { beforeEach, describe, expect, it, vi } from "vitest";

// TEZKOR_HIMOYA_CLICK_WEB_FRONTEND_INTEGRATION_2026_11_17.md: a marketplace
// payment is read from its order, a checkout link works once, the error
// codes of §8, and a purchase lost on the way is looked for before another.
const http = vi.hoisted(() => vi.fn());
vi.mock("@/lib/http", async (orig) => ({ ...(await orig<typeof import("@/lib/http")>()), http }));

import { ApiError } from "@/lib/http";
import { CHECKOUT_TTL_MS, checkoutLinkUsable, clickErrorOf, eventOrderId, eventPaymentId, orderPaymentInfoOf } from "@/lib/services/clickCheckout";
import { clickPaymentDue, findLostMarketPurchase, normMarketOrder } from "@/lib/services/marketplace";

const ORDER = "order-1";
const err = (status: number, code: string) => new ApiError(status, code, undefined, { code, data: { detail: { code } } });
const unpaid = (extra: Record<string, unknown> = {}) => ({
  id: ORDER,
  status: "pending_payment",
  payment_status: "pending",
  price: 1000,
  currency: "UZS",
  payment: { id: "pay-1", provider: "click", status: "pending", amount: 1000, currency: "UZS" },
  details: { assignment_status: "payment_pending", client_status: "payment_required", client_status_message: "To'lovni kutmoqdamiz" },
  ...extra,
});

describe("the payment, read from its order (§5)", () => {
  it("pending while the order waits for it", () => {
    const p = orderPaymentInfoOf(unpaid(), ORDER, "pay-1");
    expect(p).toMatchObject({ id: "pay-1", status: "pending", amount: 1000, currency: "UZS", orderId: ORDER, orderClosed: false });
  });
  it("paid once payment.status or the order's payment_status says so", () => {
    expect(orderPaymentInfoOf(unpaid({ payment: { id: "pay-1", status: "paid", amount: 1000 } }), ORDER, "pay-1").status).toBe("paid");
    expect(orderPaymentInfoOf(unpaid({ status: "sent_to_seller", payment_status: "paid" }), ORDER, "pay-1").status).toBe("paid");
  });
  it("a cancelled order closes the payment, with the backend's own words", () => {
    const p = orderPaymentInfoOf(unpaid({ status: "cancelled", payment_status: "cancelled", details: { client_status_message: "Buyurtma bekor qilindi" } }), ORDER, "pay-1");
    expect(p).toMatchObject({ status: "cancelled", orderClosed: true, message: "Buyurtma bekor qilindi" });
  });
  it("another payment on the order says nothing about this one", () => {
    const p = orderPaymentInfoOf(unpaid({ payment: { id: "pay-extra", status: "paid", amount: 50 } }), ORDER, "pay-1");
    expect(p.status).toBe("pending");
    expect(p.amount).toBe(0);
  });
  it("reads an order wrapped as { order }", () => {
    expect(orderPaymentInfoOf({ order: unpaid({ payment_status: "paid" }) }, ORDER, "pay-1").status).toBe("paid");
  });
  it("realtime frames name the order and the payment", () => {
    const e = { event: "marketplace.full_payment_paid", order_id: ORDER, payment_id: "pay-1", payment_status: "paid" };
    expect(eventOrderId(e)).toBe(ORDER);
    expect(eventPaymentId(e)).toBe("pay-1");
    expect(eventOrderId({ event: "notification.created", notification: { data: { order_id: ORDER } } })).toBe(ORDER);
  });
});

describe("a checkout link works once (§6)", () => {
  const URL = "https://lexgo.api.cognilabs.org/payments/click/checkout/opaque";
  it("a fresh, unused link opens as given", () => {
    expect(checkoutLinkUsable({ url: URL, at: Date.now(), used: false })).toBe(true);
    expect(checkoutLinkUsable({ url: URL, at: 0, used: false })).toBe(true);
  });
  it("a used, old or missing link is never opened again", () => {
    expect(checkoutLinkUsable({ url: URL, at: Date.now(), used: true })).toBe(false);
    expect(checkoutLinkUsable({ url: URL, at: Date.now() - CHECKOUT_TTL_MS - 1, used: false })).toBe(false);
    expect(checkoutLinkUsable({ url: "", at: Date.now(), used: false })).toBe(false);
  });
});

describe("error codes (§8)", () => {
  it("maps each code to its handling", () => {
    expect(clickErrorOf(err(410, "click_checkout_expired")).key).toBe("expired");
    expect(clickErrorOf(err(409, "payment_not_payable")).key).toBe("notPayable");
    expect(clickErrorOf(err(404, "payment_not_found")).key).toBe("notFound");
    expect(clickErrorOf(err(503, "payment_provider_not_configured")).key).toBe("notConfigured");
    const active = clickErrorOf(new ApiError(409, "marketplace_order_already_active", undefined, { code: "marketplace_order_already_active", data: { detail: { code: "marketplace_order_already_active", order_id: ORDER } } }));
    expect(active).toMatchObject({ key: "activeOrder", orderId: ORDER });
  });
});

describe("Pay with Click on the order (§7)", () => {
  it("keeps the order's payment id, provider and amount — never a checkout URL", () => {
    const o = normMarketOrder(unpaid({ payment: { id: "pay-1", provider: "click", status: "pending", amount: 1000, currency: "UZS", payment_url: "https://x/y" } }));
    expect(o.fullPayment).toEqual({ id: "pay-1", status: "pending", provider: "click", amount: 1000, currency: "UZS" });
  });
  it("is due only for an unpaid, open Click order", () => {
    expect(clickPaymentDue(normMarketOrder(unpaid()))).toBe(true);
    expect(clickPaymentDue(normMarketOrder(unpaid({ payment_status: "paid", payment: { id: "pay-1", provider: "click", status: "paid" } })))).toBe(false);
    expect(clickPaymentDue(normMarketOrder(unpaid({ status: "cancelled" })))).toBe(false);
    expect(clickPaymentDue(normMarketOrder(unpaid({ payment: { id: "pay-1", provider: "telegram_manual", status: "pending" } })))).toBe(false);
    expect(clickPaymentDue(normMarketOrder(unpaid({ payment: null })))).toBe(false);
  });
});

describe("a purchase lost on the way (§8)", () => {
  const since = Date.parse("2026-11-17T10:00:00Z");
  const row = (extra: Record<string, unknown>) => ({ id: "o-x", work_id: "ADV-X", status: "pending_payment", payment_status: "pending", service_id: "svc-1", lawyer_user_id: "u-adv", created_at: "2026-11-17T10:00:05Z", ...extra });
  beforeEach(() => http.mockReset());

  it("finds the order it made: same service and seller, still open, placed since", async () => {
    http.mockResolvedValue({ items: [row({ id: "o-other", service_id: "svc-2" }), row({ id: "o-1", work_id: "ADV-1" })], count: 2 });
    await expect(findLostMarketPurchase({ serviceId: "svc-1", sellerUserId: "u-adv", since })).resolves.toEqual({ orderId: "o-1", workId: "ADV-1", status: "pending_payment" });
    expect(http.mock.calls[0][0]).toMatch(/^\/marketplace\/me\/orders\?role_view=client/);
  });
  it("leaves closed, other sellers' and old orders alone", async () => {
    http.mockResolvedValue({ items: [row({ status: "cancelled" }), row({ lawyer_user_id: "u-other" }), row({ created_at: "2026-11-16T10:00:00Z" })] });
    await expect(findLostMarketPurchase({ serviceId: "svc-1", sellerUserId: "u-adv", since })).resolves.toBeNull();
  });
});
