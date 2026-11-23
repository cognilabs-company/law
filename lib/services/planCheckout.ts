import { asDict, asNum, asStr, http } from "@/lib/http";
import { checkoutUrlOf, clickPaymentOf, type ClickPayment } from "@/lib/services/clickCheckout";

// Plan purchase through Click or ATMOS (2026-11-21 contract §1.3): POST
// /subscription-plans/{plan_id}/purchase with the chosen provider. The
// Telegram approval is gone; the answer carries the payment and its
// payment_url, or status "approved" for a free plan that is already active.
// Nothing is marked paid here — the backend activates the plan when Click or
// ATMOS confirms (§1.2 step 5).
export type PlanCheckout = {
  status: string;
  approved: boolean;
  provider: string;
  workId: string;
  subscriptionId: string;
  amount: number;
  paymentId: string;
  paymentUrl: string;
  payment: ClickPayment | null;
};

export function planCheckoutOf(raw: unknown): PlanCheckout {
  const d = asDict(raw);
  const p = asDict(d.payment);
  const status = asStr(d.status).toLowerCase();
  const payment = clickPaymentOf(d);
  const provider = (asStr(d.provider) || asStr(p.provider)).toLowerCase();
  return {
    status,
    approved: status === "approved" || status === "active",
    provider,
    workId: asStr(d.work_id),
    subscriptionId: asStr(d.subscription_id),
    amount: asNum(d.amount ?? p.amount),
    paymentId: asStr(d.payment_id ?? p.id),
    paymentUrl: checkoutUrlOf(d.payment_url ?? p.payment_url),
    payment: payment ? { ...payment, provider: payment.provider || provider, url: payment.url || checkoutUrlOf(d.payment_url) } : null,
  };
}

// provider "" → not sent: the backend picks Click, or ATMOS when Click is off.
export async function purchasePlanVia(planId: string, input: { billingPeriod: string; provider: string; autoRenew: boolean }): Promise<PlanCheckout> {
  const body: Record<string, unknown> = { billing_period: input.billingPeriod, currency: "UZS", auto_renew: input.autoRenew, family_members: [], provider_payload: {} };
  if (input.provider) body.provider = input.provider;
  return planCheckoutOf(await http(`/subscription-plans/${encodeURIComponent(planId)}/purchase`, { method: "POST", body: JSON.stringify(body) }));
}

// §1.2 step 3: an empty payment_url means the provider was down for a moment;
// a fresh link comes from POST /payments/{id}/click|atmos/checkout.
export async function renewCheckout(provider: string, paymentId: string): Promise<string> {
  const via = provider === "atmos" ? "atmos" : "click";
  const d = asDict(await http(`/payments/${encodeURIComponent(paymentId)}/${via}/checkout`, { method: "POST" }));
  return checkoutUrlOf(d.payment_url);
}
