import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import {
  POLL_FAST_MS,
  POLL_SLOW_MS,
  checkoutUrlOf,
  clickErrorOf,
  clickPaymentOf,
  docPaymentOf,
  eventPaymentId,
  giftBodyOf,
  isSosPaymentNotice,
  isTerminal,
  notifPaymentOf,
  payStatusOf,
  paymentInfoOf,
  pollDelayMs,
} from "@/lib/services/clickCheckout";
import { purchaseBodyOf } from "@/lib/services/marketplace";

// TEZKOR_HIMOYA_CLICK_FRONTEND_INTEGRATION_2026_11_16.md
const URL1 = "https://lexgo.api.cognilabs.org/payments/click/checkout/opaque-token-1";
const err = (status: number, code: string, detail: Record<string, unknown> = {}) => new ApiError(status, code, undefined, { code, data: { detail: { code, ...detail } } });

describe("Click checkout URL (§2)", () => {
  it("is taken exactly as given, https only, never rebuilt", () => {
    expect(checkoutUrlOf(URL1)).toBe(URL1);
    expect(checkoutUrlOf(`  ${URL1}  `)).toBe(URL1);
    expect(checkoutUrlOf("http://lexgo.api.cognilabs.org/payments/click/checkout/x")).toBe("");
    expect(checkoutUrlOf("javascript:alert(1)")).toBe("");
    expect(checkoutUrlOf(undefined)).toBe("");
  });
});

describe("the payment a domain endpoint returns (§4, §6)", () => {
  it("reads id, amount, currency and the opaque URL from `payment`", () => {
    const p = clickPaymentOf({ work_id: "ADV-1", payment: { id: "p1", provider: "click", status: "pending", amount: 1000, currency: "UZS", payment_url: URL1 } });
    expect(p).toEqual({ id: "p1", status: "pending", amount: 1000, currency: "UZS", provider: "click", url: URL1 });
  });
  it("no payment id → nothing to pay", () => {
    expect(clickPaymentOf({ status: "file_ready" })).toBeNull();
  });
  it("a document request answered file_ready opens no checkout (§9)", () => {
    expect(docPaymentOf({ status: "file_ready" })).toEqual({ status: "file_ready", payment: null });
    expect(docPaymentOf({ status: "payment_pending", payment: { id: "p2", payment_url: URL1 } }).payment?.url).toBe(URL1);
  });
});

describe("status (§11)", () => {
  it("knows the backend's words and which of them end the watch", () => {
    expect(payStatusOf("paid")).toBe("paid");
    expect(payStatusOf("prepared")).toBe("prepared");
    expect(payStatusOf("canceled")).toBe("cancelled");
    expect(payStatusOf("something_new")).toBe("pending");
    expect(isTerminal("paid") && isTerminal("cancelled") && isTerminal("refunded") && isTerminal("failed")).toBe(true);
    expect(isTerminal("pending") || isTerminal("prepared")).toBe(false);
  });
  it("reads GET /payments/{id} with its receipt only as given", () => {
    const i = paymentInfoOf({ id: "p1", amount: 1000, currency: "UZS", status: "paid", method: "click", kind: "marketplace_full", order_id: "o1", receipt_url: "/payments/p1/receipt" });
    expect(i).toMatchObject({ id: "p1", status: "paid", amount: 1000, method: "click", orderId: "o1", receiptUrl: "/payments/p1/receipt" });
  });
  it("polls every 3 s for a minute, then every 10 s, and stops at 20 minutes", () => {
    expect(pollDelayMs(0)).toBe(POLL_FAST_MS);
    expect(pollDelayMs(59_000)).toBe(POLL_FAST_MS);
    expect(pollDelayMs(61_000)).toBe(POLL_SLOW_MS);
    expect(pollDelayMs(19 * 60_000)).toBe(POLL_SLOW_MS);
    expect(pollDelayMs(20 * 60_000)).toBeNull();
  });
});

describe("realtime is only a hint (§12)", () => {
  it("finds the payment in a notification frame and in the marketplace event", () => {
    expect(eventPaymentId({ event: "notification.created", notification: { kind: "payment_paid", data: { payment_id: "p1", target_type: "marketplace_full" } } })).toBe("p1");
    expect(eventPaymentId({ event: "marketplace.full_payment_paid", order_id: "o1", payment_id: "p2" })).toBe("p2");
    expect(eventPaymentId({ event: "call.incoming" })).toBe("");
  });
});

describe("errors (§14)", () => {
  it("maps every code the UI must handle", () => {
    expect(clickErrorOf(new ApiError(401, "x")).key).toBe("auth");
    expect(clickErrorOf(new ApiError(403, "x")).key).toBe("forbidden");
    expect(clickErrorOf(new ApiError(404, "x")).key).toBe("notFound");
    const active = clickErrorOf(err(409, "marketplace_order_already_active", { order_id: "o9" }));
    expect(active).toEqual({ key: "activeOrder", message: "", orderId: "o9" });
    expect(clickErrorOf(err(409, "payment_provider_mismatch")).key).toBe("mismatch");
    expect(clickErrorOf(err(409, "payment_not_payable")).key).toBe("notPayable");
    expect(clickErrorOf(err(410, "click_checkout_expired")).key).toBe("expired");
    expect(clickErrorOf(err(422, "marketplace_payment_provider_invalid")).key).toBe("providerInvalid");
    expect(clickErrorOf(err(422, "payment_currency_not_supported")).key).toBe("currency");
    expect(clickErrorOf(err(502, "payment_provider_unavailable")).key).toBe("unavailable");
    expect(clickErrorOf(err(502, "payment_invoice_rejected")).key).toBe("rejected");
    expect(clickErrorOf(err(503, "payment_provider_not_configured")).key).toBe("notConfigured");
    expect(clickErrorOf(new Error("boom")).key).toBe("generic");
  });
  it("shows the provider's words only when they are a plain short sentence", () => {
    expect(clickErrorOf(err(502, "payment_invoice_rejected", { message: "Hisob topilmadi" })).message).toBe("Hisob topilmadi");
    expect(clickErrorOf(err(502, "payment_invoice_rejected", { message: '{"sign_string":"abc","merchant_id":1}' })).message).toBe("");
    expect(clickErrorOf(err(502, "payment_invoice_rejected", { message: "Traceback (most recent call last): ..." })).message).toBe("");
  });
});

describe("domain bodies", () => {
  it("marketplace: payment_provider click and the contact channel (§4)", () => {
    const b = purchaseBodyOf({ paymentProvider: "click", note: "", preferredChannel: "chat", contactSpeed: "today", urgency: "today" });
    expect(b.payment_provider).toBe("click");
    expect(b.contact_channel).toBe("chat");
    expect(b.currency).toBe("UZS");
    expect("amount" in b).toBe(false);
  });
  it("gift: plan by id and term, provider click, no amount (§7)", () => {
    const plan = giftBodyOf({ kind: "plan", planId: "pl1", termMonths: 6, recipientPhone: "+998901234567", recipientHint: " Ona ", message: "" }, "click");
    expect(plan).toEqual({ plan_id: "pl1", term_months: 6, recipient_phone: "+998901234567", recipient_hint: "Ona", message: "", provider: "click" });
    const svc = giftBodyOf({ kind: "service", serviceId: "s1", recipientPhone: "", recipientHint: "", message: "Tabriklayman" }, "click");
    expect(svc).toEqual({ service_id: "s1", message: "Tabriklayman", provider: "click" });
  });
});

describe("SOS payment notice (§8)", () => {
  it("is payable from its data only with an id and an https checkout", () => {
    const data = { payment_id: "p5", amount: 1000000, payment_url: URL1, sos_id: "s1" };
    expect(notifPaymentOf(data)).toEqual({ id: "p5", status: "pending", amount: 1000000, currency: "UZS", provider: "click", url: URL1 });
    expect(notifPaymentOf({ payment_id: "p5" })).toBeNull();
    expect(notifPaymentOf({ ...data, provider: "payme" })).toBeNull();
    expect(isSosPaymentNotice("sos.payment_created", {})).toBe(true);
    expect(isSosPaymentNotice("payment_paid", { sos_id: "s1" })).toBe(true);
    expect(isSosPaymentNotice("marketplace.full_payment_paid", {})).toBe(false);
  });
});
