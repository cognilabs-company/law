// Click checkout (TEZKOR_HIMOYA_CLICK_FRONTEND_INTEGRATION_2026_11_16.md).
//
// The backend owns everything about the money: it creates the payment from a
// domain endpoint (marketplace, plan, gift, document request, SOS), returns
// an opaque one-time checkout URL, and marks the payment paid only after
// Click's signed Complete callback. The frontend:
//   • never builds or edits a Click URL, never adds a query to it;
//   • keeps that URL in memory only — no storage, analytics, logs or errors;
//   • watches GET /payments/{id} until the backend says paid (or not);
//   • renews an expired checkout only through POST /payments/{id}/click/checkout.
import { ApiError, http } from "@/lib/http";
import type { UserEvent } from "@/lib/userSocket";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const asStr = (v: unknown, d = ""): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const asNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);

// Click's own blue (its logo, docs.click.uz) — the checkout button wears it.
export const CLICK_BLUE = "#0065FF";

// An https page, taken exactly as given: never parsed, never rebuilt.
export function checkoutUrlOf(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https:\/\/[^\s]+$/i.test(s) ? s : "";
}

// A payment the client still has to approve in Click.
export type ClickPayment = { id: string; status: string; amount: number; currency: string; provider: string; url: string };

// The `payment` object every domain endpoint returns (§4–§9).
export function clickPaymentOf(raw: unknown): ClickPayment | null {
  const d = asDict(raw);
  const p = asDict(d.payment);
  const id = asStr(p.id ?? d.payment_id);
  if (!id) return null;
  return {
    id,
    status: asStr(p.status ?? d.payment_status, "pending").toLowerCase(),
    amount: asNum(p.amount ?? d.amount),
    currency: asStr(p.currency ?? d.currency, "UZS") || "UZS",
    provider: asStr(p.provider ?? d.provider).toLowerCase(),
    url: checkoutUrlOf(p.payment_url ?? d.payment_url),
  };
}

// ── Payment status (§11) ─────────────────────────────────────────────
export type PayStatus = "pending" | "prepared" | "paid" | "cancelled" | "refunded" | "failed";
export function payStatusOf(s: string): PayStatus {
  const v = s.trim().toLowerCase();
  if (v === "paid" || v === "prepared" || v === "refunded" || v === "failed") return v;
  if (v === "cancelled" || v === "canceled") return "cancelled";
  return "pending";
}
export const isTerminal = (s: PayStatus): boolean => s === "paid" || s === "cancelled" || s === "refunded" || s === "failed";

export type PaymentInfo = {
  id: string;
  status: PayStatus;
  amount: number;
  currency: string;
  method: string;
  kind: string;
  description: string;
  orderId: string;
  receiptUrl: string;
};
export function paymentInfoOf(raw: unknown, id = ""): PaymentInfo {
  const d = asDict(raw);
  return {
    id: asStr(d.id, id) || id,
    status: payStatusOf(asStr(d.status)),
    amount: asNum(d.amount),
    currency: asStr(d.currency, "UZS") || "UZS",
    method: asStr(d.method ?? d.provider).toLowerCase(),
    kind: asStr(d.kind),
    description: asStr(d.description),
    orderId: asStr(d.order_id),
    receiptUrl: asStr(d.receipt_url),
  };
}
export async function getPayment(id: string, signal?: AbortSignal): Promise<PaymentInfo> {
  return paymentInfoOf(await http(`/payments/${encodeURIComponent(id)}`, { signal }), id);
}

// §13: a fresh checkout for the same payment. Already paid → no URL, and the
// payment is simply re-read.
export type RenewedCheckout = { status: PayStatus; url: string; idempotent: boolean };
// BACKEND_FIXES_LIVE_2026-11-23: the renewal may name the page Click sends the
// client back to. Only the production site's own pages are accepted (anything
// else is 422 return_url_not_allowed), so a preview or local build sends none
// and Click behaves as before. No hash: it is never needed to land.
const RETURN_PREFIXES = ["https://tezkorhimoya.uz/", "https://www.tezkorhimoya.uz/"];
export function checkoutReturnUrl(href: string): string {
  const s = href.split("#")[0];
  return RETURN_PREFIXES.some((p) => s.startsWith(p)) ? s : "";
}
const herePage = (): string => (typeof window === "undefined" ? "" : checkoutReturnUrl(window.location.href));
export async function renewClickCheckout(id: string, returnUrl = herePage()): Promise<RenewedCheckout> {
  const path = `/payments/${encodeURIComponent(id)}/click/checkout`;
  let raw: unknown;
  try {
    raw = await http(path, returnUrl ? { method: "POST", body: JSON.stringify({ return_url: returnUrl }) } : { method: "POST" });
  } catch (e) {
    // A refused return page must not cost the client the payment: ask again
    // without one.
    if (!returnUrl || !(e instanceof ApiError) || e.status !== 422 || clickErrorCode(e) !== "return_url_not_allowed") throw e;
    raw = await http(path, { method: "POST" });
  }
  const d = asDict(raw);
  return { status: payStatusOf(asStr(d.status)), url: checkoutUrlOf(d.payment_url), idempotent: d.idempotent === true };
}

// §11 polling: every 3 s for the first minute, then every 10 s, and no more
// after 20 minutes (null = stop).
export const POLL_FAST_MS = 3000;
export const POLL_SLOW_MS = 10_000;
export const POLL_GIVE_UP_MS = 20 * 60 * 1000;
export function pollDelayMs(elapsedMs: number): number | null {
  if (elapsedMs >= POLL_GIVE_UP_MS) return null;
  return elapsedMs < 60_000 ? POLL_FAST_MS : POLL_SLOW_MS;
}
// The checkout token lives 20 minutes; a little before that a new one is
// asked for instead of sending the client to a dead page.
export const CHECKOUT_TTL_MS = 18 * 60 * 1000;

// §12: the payment a realtime frame is about — only a hint to re-read REST.
export function eventPaymentId(e: UserEvent): string {
  const n = asDict(e.notification);
  const data = { ...asDict(n.data), ...asDict(e.data) };
  return asStr(e.payment_id ?? data.payment_id).trim();
}

// ── Errors (§14) ────────────────────────────────────────────────────
export type ClickErrorKey =
  | "auth"
  | "forbidden"
  | "notFound"
  | "activeOrder"
  | "mismatch"
  | "notPayable"
  | "expired"
  | "providerInvalid"
  | "currency"
  | "unavailable"
  | "rejected"
  | "notConfigured"
  | "generic";
export type ClickError = { key: ClickErrorKey; message: string; orderId: string };

export function clickErrorCode(e: unknown): string {
  if (!(e instanceof ApiError)) return "";
  return e.code || asStr(asDict(e.data.detail).code) || asStr(e.data.code);
}
// The provider's own words, only when they are a plain short sentence — never
// a payload, a signature or a trace.
function safeProviderText(e: ApiError): string {
  const d = asDict(e.data.detail);
  const raw = asStr(d.message ?? d.provider_message ?? d.error_note ?? (typeof e.data.detail === "string" ? e.data.detail : ""));
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s || s.length > 160 || /[{}<>[\]]|https?:|token|sign|merchant|traceback|exception/i.test(s)) return "";
  return s;
}
export function clickErrorOf(e: unknown): ClickError {
  const none = { message: "", orderId: "" };
  if (!(e instanceof ApiError)) return { key: "generic", ...none };
  const code = clickErrorCode(e);
  if (e.status === 401) return { key: "auth", ...none };
  if (code === "marketplace_order_already_active" || code === "marketplace_package_order_already_active")
    return { key: "activeOrder", message: "", orderId: asStr(asDict(e.data.detail).order_id) };
  if (code === "payment_provider_mismatch") return { key: "mismatch", ...none };
  if (code === "payment_not_payable") return { key: "notPayable", ...none };
  if (code === "click_checkout_expired" || e.status === 410) return { key: "expired", ...none };
  if (code === "marketplace_payment_provider_invalid" || code === "payment_provider_not_allowed") return { key: "providerInvalid", ...none };
  if (code === "payment_currency_not_supported" || code === "marketplace_currency_not_supported") return { key: "currency", ...none };
  if (code === "payment_invoice_rejected") return { key: "rejected", message: safeProviderText(e), orderId: "" };
  if (code === "payment_provider_not_configured" || e.status === 503) return { key: "notConfigured", ...none };
  if (code === "payment_provider_unavailable" || e.status === 502) return { key: "unavailable", ...none };
  if (e.status === 403) return { key: "forbidden", ...none };
  if (e.status === 404) return { key: "notFound", ...none };
  return { key: "generic", ...none };
}
// Errors after which Click should disappear until the provider list says
// otherwise (§14: refresh /payments/providers).
export const PROVIDER_LIST_STALE: readonly ClickErrorKey[] = ["notConfigured", "providerInvalid"];

// ── Domain purchases (§6, §7, §9) ────────────────────────────────────
export type BillingPeriod = "monthly" | "six_month" | "yearly" | "prepaid_yearly";

// §6: the server prices the plan; nothing the client computed is trusted.
export type PlanClickPurchase = { workId: string; subscriptionId: string; status: string; payment: ClickPayment | null };
export async function purchasePlanWithClick(planId: string, input: { billingPeriod: BillingPeriod; autoRenew: boolean }): Promise<PlanClickPurchase> {
  const d = asDict(
    await http(`/subscription-plans/${encodeURIComponent(planId)}/purchase`, {
      method: "POST",
      body: JSON.stringify({ billing_period: input.billingPeriod, provider: "click", currency: "UZS", auto_renew: input.autoRenew, family_members: [], provider_payload: {} }),
    }),
  );
  return { workId: asStr(d.work_id), subscriptionId: asStr(d.subscription_id), status: asStr(d.status), payment: clickPaymentOf(d) };
}

// §7: a plan (by id and term) or a single service, for someone's phone.
export type GiftClickInput =
  | { kind: "plan"; planId: string; termMonths: number; recipientPhone: string; recipientHint: string; message: string }
  | { kind: "service"; serviceId: string; recipientPhone: string; recipientHint: string; message: string };
export function giftBodyOf(input: GiftClickInput, provider: string): Record<string, unknown> {
  const who: Record<string, unknown> = {};
  if (input.recipientPhone.trim()) who.recipient_phone = input.recipientPhone.trim();
  if (input.recipientHint.trim()) who.recipient_hint = input.recipientHint.trim();
  const target = input.kind === "plan" ? { plan_id: input.planId, term_months: input.termMonths } : { service_id: input.serviceId };
  return { ...target, ...who, message: input.message.trim(), provider };
}

// §9: amount 0 — the backend charges the stored price. `file_ready` means the
// environment confirmed it already and there is nothing to open.
export type DocClickPayment = { status: string; payment: ClickPayment | null };
export function docPaymentOf(raw: unknown): DocClickPayment {
  const d = asDict(raw);
  return { status: asStr(d.status).toLowerCase(), payment: clickPaymentOf(d) };
}

// §8: an SOS payment reaches the client as a notification carrying the
// payment id, the amount and the opaque checkout URL. Read from its data.
export function notifPaymentOf(data: Record<string, unknown>): ClickPayment | null {
  const id = asStr(data.payment_id).trim();
  const url = checkoutUrlOf(data.payment_url);
  const provider = asStr(data.provider ?? data.payment_provider).toLowerCase();
  if (!id || !url || (provider && provider !== "click")) return null;
  return { id, status: "pending", amount: asNum(data.amount), currency: asStr(data.currency, "UZS") || "UZS", provider: "click", url };
}
export function isSosPaymentNotice(kind: string, data: Record<string, unknown>): boolean {
  return /sos/i.test(kind) || /sos/i.test(asStr(data.target_type)) || !!asStr(data.sos_id);
}

// Payments a Click panel is watching on screen right now. The app-wide return
// watcher leaves those alone; a panel that goes away with its payment still
// open hands it over (a tick later, so a remount is not mistaken for leaving).
const onScreen = new Map<string, number>();
export function holdPaymentOnScreen(id: string, handOver: () => void): () => void {
  onScreen.set(id, (onScreen.get(id) ?? 0) + 1);
  return () => {
    const n = (onScreen.get(id) ?? 1) - 1;
    if (n > 0) onScreen.set(id, n);
    else onScreen.delete(id);
    setTimeout(() => {
      if (!onScreen.has(id)) handOver();
    }, 0);
  };
}
export const isPaymentOnScreen = (id: string): boolean => onScreen.has(id);
