// Paket tariflar (subscription plans): admin CRUD with feature detection and
// the ATMOS auto-pay setting.
//
// Admin POST/PATCH/DELETE /admin/subscription-plans and PATCH
// /subscriptions/{id}/auto-renew are all live in production (2026-09-19
// backend update). Writes still go through a typed result instead of
// throwing a generic error, and fall back to keeping the choice in
// localStorage only when there's no subscription id to act on yet (no active
// subscription) or the backend genuinely doesn't have the route.
import { http, ApiError } from "@/lib/http";
import {
  getMySubscription,
  isMissingRoute,
  updateSubscriptionAutoRenew,
  type BackendPlan,
  type MySubscription,
  type PlanAudience,
} from "@/lib/services/backend";

export type { PlanAudience };

// ── Billing periods ───────────────────────────────────────────────
export type BillingPeriod = "monthly" | "six_month" | "yearly" | "prepaid_yearly";
export const BILLING_PERIODS: BillingPeriod[] = ["monthly", "six_month", "yearly", "prepaid_yearly"];

// The plan's price for a period (0 when the backend has none).
export function planPrice(plan: BackendPlan, period: BillingPeriod): number {
  return period === "monthly"
    ? plan.monthlyPrice
    : period === "six_month"
      ? plan.sixMonthPrice
      : period === "yearly"
        ? plan.yearlyPrice
        : plan.prepaidYearlyPrice;
}
// The period an admin edits by default: monthly when priced, else the first
// period that carries a price.
export function primaryPeriod(plan: BackendPlan): BillingPeriod {
  return BILLING_PERIODS.find((p) => planPrice(plan, p) > 0) ?? "monthly";
}

// ── Admin CRUD ────────────────────────────────────────────────────
export type PlanInput = {
  slug: string;
  title: string;
  description?: string;
  audience?: PlanAudience | string;
  monthly_price?: number; // whole so'm (legacy UZS), not tiyin (T0-16)
  six_month_price?: number;
  yearly_price?: number;
  prepaid_yearly_price?: number;
  benefits?: string[];
  is_giftable?: boolean;
  is_active?: boolean;
  sort_order?: number;
  // client / yurist / advokat only (2026-09-19 backend update) — the precise
  // list planForRole() prefers over the free-text `audience` guess.
  target_roles?: string[];
  // Provider that runs this plan's recurring auto-renew charge (e.g. "atmos").
  auto_charge_provider?: string;
};

// Build the price fields from one (period, price) pair; other periods keep
// what the plan already has (edit) or 0 (create — the backend completes
// 6 / 12 / prepaid-12 from monthly on its own).
export function pricesFor(period: BillingPeriod, price: number, base?: BackendPlan): Pick<PlanInput, "monthly_price" | "six_month_price" | "yearly_price" | "prepaid_yearly_price"> {
  const cur = (p: BillingPeriod) => (base ? planPrice(base, p) : 0);
  const pick = (p: BillingPeriod) => (p === period ? Math.max(0, Math.round(price)) : cur(p));
  return {
    monthly_price: pick("monthly"),
    six_month_price: pick("six_month"),
    yearly_price: pick("yearly"),
    prepaid_yearly_price: pick("prepaid_yearly"),
  };
}

// ok=false, pending=true → the route is not on the backend yet (404/405/501):
// the caller shows the "backend kutilmoqda" notice and keeps the UI usable.
export type WriteResult = { ok: true } | { ok: false; pending: boolean; detail: string };

function failed(e: unknown): WriteResult {
  if (isMissingRoute(e)) return { ok: false, pending: true, detail: "" };
  const detail = e instanceof ApiError ? e.detail || "" : "";
  return { ok: false, pending: false, detail };
}

// POST /admin/subscription-plans exists today (SubscriptionPlanCreate accepts
// audience as a free string). Throws like any other create.
export async function createPlanAdmin(input: PlanInput): Promise<unknown> {
  return http("/admin/subscription-plans", {
    method: "POST",
    body: JSON.stringify({ description: "", benefits: [], is_giftable: false, is_active: true, ...input }),
  });
}

export async function updatePlanAdmin(id: string, patch: Partial<PlanInput>): Promise<WriteResult> {
  try {
    await http(`/admin/subscription-plans/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

export async function deletePlanAdmin(id: string): Promise<WriteResult> {
  try {
    await http(`/admin/subscription-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

// ── ATMOS auto-pay ──────────────────────────────────────────────
// Falls back to a per-device localStorage flag only when there's no active
// subscription (no id to PATCH /subscriptions/{id}/auto-renew with).
const autopayKey = (uid: string) => `lexgo_autopay_${uid || "anon"}`;

export function readAutopay(uid: string): boolean {
  try {
    return localStorage.getItem(autopayKey(uid)) === "1";
  } catch {
    return false;
  }
}
function writeAutopay(uid: string, on: boolean): void {
  try {
    localStorage.setItem(autopayKey(uid), on ? "1" : "0");
  } catch {
    /* private mode / blocked storage — the toggle still works for this view */
  }
}

export type AutopayState = {
  subscription: MySubscription | null;
  enabled: boolean;
  // "backend" once PATCH /subscriptions/{id}/auto-renew answers; "local" when
  // there's no active subscription yet to attach the flag to.
  source: "backend" | "local";
};

// Current tariff + auto-pay flag. Backend value wins when it exists; otherwise
// the stored device setting.
export async function loadAutopay(uid: string): Promise<AutopayState> {
  const subscription = await getMySubscription();
  if (subscription && typeof subscription.autoRenew === "boolean") {
    return { subscription, enabled: subscription.autoRenew, source: "backend" };
  }
  return { subscription, enabled: readAutopay(uid), source: "local" };
}

// Save the toggle: PATCH the subscription when there is one (a real error
// still throws), else keep the device copy so the choice survives until the
// client has an active subscription to attach it to.
export async function saveAutopay(uid: string, on: boolean, subscriptionId?: string): Promise<AutopayState["source"]> {
  if (subscriptionId) {
    await updateSubscriptionAutoRenew(subscriptionId, { auto_renew: on });
    writeAutopay(uid, on);
    return "backend";
  }
  writeAutopay(uid, on);
  return "local";
}
