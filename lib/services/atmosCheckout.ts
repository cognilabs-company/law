// ATMOS checkout for marketplace purchases
// (TEZKOR_HIMOYA_ATMOS_FRONTEND_INTEGRATION_2026_11_17.md).
//
// The backend owns the money: the purchase request creates the order and its
// ATMOS invoice, ATMOS calls the backend back, and only the backend marks the
// payment paid. The frontend:
//   • offers ATMOS only while GET /payments/providers says enabled=true;
//   • opens payment.payment_url exactly as given, only from a click;
//   • keeps that URL in memory only — no storage, analytics, logs or errors;
//   • reads GET /marketplace/me/orders/{order_id} (the authoritative answer)
//     until the payment is settled;
//   • renews an expired invoice only through POST /payments/{id}/atmos/checkout.
import { ApiError, http } from "@/lib/http";
import { checkoutUrlOf, payStatusOf, type PayStatus } from "./clickCheckout";
import { isOrderPending, type MarketOrder } from "./marketplace";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const asStr = (v: unknown, d = ""): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const asNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);
const filled = (v: unknown): Dict | null => {
  const d = asDict(v);
  return Object.keys(d).length ? d : null;
};

export const ATMOS = "atmos";

// ── The order, as GET /marketplace/me/orders/{order_id} tells it ─────
// "paid" | "failed" | "cancelled" | … from the payment first, then the order.
export type AtmosOrderState = {
  orderId: string;
  paymentId: string;
  provider: string;
  pay: PayStatus;
  orderStatus: string;
  orderPaymentStatus: string;
  assignmentStatus: string;
  deadlineAt: string;
  clientStatus: string;
  clientMessage: string;
  amount: number;
  currency: string;
};

const STOPPED = new Set(["cancelled", "canceled", "declined", "rejected", "refunded", "expired", "closed"]);

export function atmosOrderStateOf(raw: unknown, orderId = ""): AtmosOrderState {
  const top = asDict(raw);
  const order = filled(top.order) ?? top;
  const details = asDict(order.details);
  const payment = filled(top.payment) ?? asDict(order.payment);
  const pick = (k: string): string => asStr(details[k] ?? order[k] ?? top[k]).trim();
  const orderPaymentStatus = asStr(order.payment_status ?? top.payment_status).trim().toLowerCase();
  const paymentStatus = asStr(payment.status).trim().toLowerCase();
  // Either word "paid" from the backend is enough; nothing else is.
  const pay: PayStatus = paymentStatus === "paid" || orderPaymentStatus === "paid" ? "paid" : payStatusOf(paymentStatus || orderPaymentStatus);
  return {
    orderId: asStr(order.id ?? order.order_id ?? top.order_id, orderId) || orderId,
    paymentId: asStr(payment.id ?? top.payment_id),
    provider: asStr(payment.provider ?? order.payment_provider).toLowerCase(),
    pay,
    orderStatus: asStr(order.status ?? top.status).trim().toLowerCase(),
    orderPaymentStatus,
    assignmentStatus: pick("assignment_status").toLowerCase(),
    deadlineAt: pick("acceptance_deadline_at"),
    clientStatus: pick("client_status").toLowerCase(),
    clientMessage: pick("client_status_message"),
    amount: asNum(payment.amount),
    currency: asStr(payment.currency ?? order.currency, "UZS") || "UZS",
  };
}

// Where the screen stands: still to pay, paid, or the payment/order ended
// without money (an error card, a cancellation, an expired order).
export type AtmosOutcome = "pending" | "paid" | "failed";
export function atmosOutcomeOf(s: Pick<AtmosOrderState, "pay" | "orderStatus">): AtmosOutcome {
  if (s.pay === "paid") return "paid";
  if (s.pay === "failed" || s.pay === "cancelled" || s.pay === "refunded" || STOPPED.has(s.orderStatus)) return "failed";
  return "pending";
}

// The seller's 30 minutes start only after the backend confirmed the payment
// and put the order in front of the seller; never from the screen's own clock.
export function sellerDeadlineOf(s: Pick<AtmosOrderState, "pay" | "assignmentStatus" | "deadlineAt">): string {
  return s.pay === "paid" && s.assignmentStatus === "waiting_seller_response" ? s.deadlineAt : "";
}

export async function getAtmosOrderState(orderId: string, signal?: AbortSignal): Promise<AtmosOrderState> {
  return atmosOrderStateOf(await http(`/marketplace/me/orders/${encodeURIComponent(orderId)}`, { signal }), orderId);
}

// ── Renewing the checkout ──────────────────────────────────────────
// A fresh invoice page for the same payment. Already paid → no URL: the
// order is re-read and nothing is opened.
export type AtmosRenewal = { status: PayStatus; url: string };
export function atmosRenewalOf(raw: unknown): AtmosRenewal {
  const d = asDict(raw);
  const p = filled(d.payment) ?? d;
  return { status: payStatusOf(asStr(p.status ?? d.status)), url: checkoutUrlOf(p.payment_url ?? d.payment_url) };
}
export async function renewAtmosCheckout(paymentId: string): Promise<AtmosRenewal> {
  return atmosRenewalOf(await http(`/payments/${encodeURIComponent(paymentId)}/atmos/checkout`, { method: "POST" }));
}

// ── Errors ─────────────────────────────────────────────────────────
export type AtmosErrorKey =
  | "auth"
  | "notConfigured"
  | "providerInvalid"
  | "authFailed"
  | "unavailable"
  | "rejected"
  | "urlRejected"
  | "fiscal"
  | "notPayable"
  | "activeOrder"
  | "timeout"
  | "forbidden"
  | "notFound"
  | "generic";
export type AtmosError = { key: AtmosErrorKey; message: string; orderId: string };

export function atmosErrorCode(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  return e.code || asStr(asDict(e.data.detail).code) || asStr(e.data.code);
}
// ATMOS's own words, only when they are a plain short sentence — never a
// payload, a link, a token or a trace.
function safeProviderText(e: ApiError): string {
  const d = asDict(e.data.detail);
  const raw = asStr(d.provider_message ?? d.message ?? (typeof e.data.detail === "string" ? e.data.detail : ""));
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s || s.length > 160 || /[{}<>[\]]|https?:|www\.|token|sign|secret|key|merchant|card|otp|traceback|exception/i.test(s)) return "";
  return s;
}
export function atmosErrorOf(e: unknown): AtmosError {
  const none = { message: "", orderId: "" };
  if (!(e instanceof ApiError)) return { key: "generic", ...none };
  const code = atmosErrorCode(e);
  if (e.status === 401) return { key: "auth", ...none };
  if (code === "marketplace_order_already_active" || code === "marketplace_package_order_already_active")
    return { key: "activeOrder", message: "", orderId: asStr(asDict(e.data.detail).order_id ?? e.data.order_id) };
  if (code === "payment_not_payable") return { key: "notPayable", ...none };
  if (code === "atmos_fiscal_items_amount_mismatch") return { key: "fiscal", ...none };
  if (code === "payment_provider_checkout_url_rejected") return { key: "urlRejected", ...none };
  if (code === "payment_provider_auth_failed") return { key: "authFailed", ...none };
  if (code === "payment_invoice_rejected") return { key: "rejected", message: safeProviderText(e), orderId: "" };
  if (code === "payment_provider_unavailable") return { key: "unavailable", ...none };
  if (code === "marketplace_payment_provider_invalid") return { key: "providerInvalid", ...none };
  if (code === "payment_provider_not_configured" || e.status === 503) return { key: "notConfigured", ...none };
  // No answer at all, or the gateway gave up waiting: the order may exist.
  if ((e.status === 0 && e.detail !== "aborted") || e.status === 408 || e.status === 504) return { key: "timeout", ...none };
  if (e.status === 502) return { key: "unavailable", ...none };
  if (e.status === 403) return { key: "forbidden", ...none };
  if (e.status === 404) return { key: "notFound", ...none };
  return { key: "generic", ...none };
}
// ATMOS disappears until the provider list says otherwise.
export const ATMOS_LIST_STALE: readonly AtmosErrorKey[] = ["notConfigured", "providerInvalid"];
// A retry is offered (after the duplicate check below)…
export const ATMOS_RETRYABLE: readonly AtmosErrorKey[] = ["authFailed", "unavailable", "rejected", "timeout", "generic"];
// …and support is named when the fix is on our side, not the client's.
export const ATMOS_SUPPORT: readonly AtmosErrorKey[] = ["authFailed", "urlRejected", "fiscal"];
// After these the order may already exist, so the client's orders are read
// before anything is sent again.
export const ATMOS_MAYBE_CREATED: readonly AtmosErrorKey[] = ["timeout", "authFailed", "urlRejected", "unavailable", "generic"];
// Codes the purchase form treats as an ATMOS problem rather than a form error.
export const ATMOS_ERROR_CODES: readonly string[] = [
  "payment_provider_not_configured",
  "payment_provider_auth_failed",
  "payment_provider_unavailable",
  "payment_invoice_rejected",
  "payment_provider_checkout_url_rejected",
  "atmos_fiscal_items_amount_mismatch",
  "marketplace_payment_provider_invalid",
];

// ── Duplicate guard ────────────────────────────────────────────────
// The order a failed or timed-out purchase may still have created: same
// seller, same service or package, still unpaid, made in the last minutes.
export const RECENT_ORDER_MS = 10 * 60 * 1000;
export function recentPendingOrder(
  list: readonly MarketOrder[],
  target: { serviceId: string; packageId?: string; sellerUserId: string },
  since: number,
): MarketOrder | null {
  const hit = list.find((o) => {
    if (!isOrderPending(o)) return false;
    if (target.sellerUserId && o.lawyerUserId && o.lawyerUserId !== target.sellerUserId) return false;
    const same = target.packageId ? o.packageId === target.packageId : o.serviceId === target.serviceId;
    if (!same) return false;
    const at = Date.parse(o.createdAt);
    return !Number.isFinite(at) || at >= since - 60_000;
  });
  return hit ?? null;
}
