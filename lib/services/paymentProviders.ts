// TSK-664399 — Click / Payme production readiness, read side.
// GET /admin/payments/provider-readiness: one row per real provider (payme,
// click, atmos) with its state; the whole set stays feature-flagged until the
// merchant contracts land (mode "feature_flagged_until_contracts").
// GET /admin/payments/reconciliation-v2[?provider=]: per-provider totals and
// the payments whose provider record does not match ours.
// Payment ids are kept only as React keys — never rendered (UI law).
import { ApiError, http } from "@/lib/http";

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown, d = ""): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const asNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0);

// The real checkout providers, in the order the screen shows them.
export const LIVE_PROVIDERS = ["click", "payme", "atmos"] as const;

// What a provider's state means for the screen: ready to take money, set up
// but not yet proven, switched off, or failing.
export type ProviderTone = "ok" | "warn" | "off" | "bad";
export function providerTone(status: string, configured: boolean): ProviderTone {
  const s = status.toLowerCase();
  // Backend 2026-10-28 (gaps closed §3): configured | disabled.
  if (s === "configured" || s === "enabled" || s === "ready") return "ok";
  if (s === "error" || s === "failed" || s === "unreachable" || s === "invalid_credentials") return "bad";
  if (s === "disabled" || s === "not_configured" || !configured) return "off";
  return "warn";
}

export type ProviderReadiness = { key: string; configured: boolean; status: string; detail: string; latencyMs: number | null; checkedAt: string; tone: ProviderTone };
export type Readiness = { providers: ProviderReadiness[]; allEnabled: boolean; flagged: boolean; requirements: string[] };

export function readinessOf(raw: unknown): Readiness {
  const d = asDict(raw);
  const providers = asArr(d.items).map((x) => {
    const r = asDict(x);
    const configured = r.configured === true;
    const status = asStr(r.status, configured ? "configured_not_verified" : "disabled");
    return {
      key: asStr(r.key).toLowerCase(),
      configured,
      status,
      detail: asStr(r.detail),
      latencyMs: r.latency_ms === undefined || r.latency_ms === null ? null : asNum(r.latency_ms),
      checkedAt: asStr(r.checked_at),
      tone: providerTone(status, configured),
    };
  });
  providers.sort((a, b) => rank(a.key) - rank(b.key));
  return {
    providers,
    allEnabled: d.all_enabled === true,
    flagged: /flag/i.test(asStr(d.mode)),
    requirements: asArr(d.requirements).map((x) => asStr(x)).filter(Boolean),
  };
}
const rank = (k: string) => {
  const i = (LIVE_PROVIDERS as readonly string[]).indexOf(k);
  return i < 0 ? 99 : i;
};

export async function getProviderReadiness(signal?: AbortSignal): Promise<Readiness> {
  return readinessOf(await http("/admin/payments/provider-readiness", { signal }));
}

export type ReconProvider = { provider: string; count: number; paidCount: number; amount: number; paidAmount: number; discrepancies: number };
// Gaps closed §4: each row names its order (work_id), payment (payment_work_id) and service.
export type Discrepancy = { key: string; workId: string; paymentWorkId: string; serviceTitle: string; provider: string; status: string; amount: number; paidAmount: number; reasons: string[] };
export type ReasonGroup = { reason: string; count: number; amount: number; providers: string[] };
export type Reconciliation = { providers: ReconProvider[]; discrepancies: Discrepancy[]; reasons: ReasonGroup[]; discrepancyCount: number; checkedCount: number; generatedAt: string };

export function reconciliationOf(raw: unknown): Reconciliation {
  const d = asDict(raw);
  const providers = asArr(d.providers).map((x) => {
    const r = asDict(x);
    return { provider: asStr(r.provider).toLowerCase(), count: asNum(r.count), paidCount: asNum(r.paid_count), amount: asNum(r.amount), paidAmount: asNum(r.paid_amount), discrepancies: asNum(r.discrepancies) };
  });
  providers.sort((a, b) => b.count - a.count);
  const discrepancies = asArr(d.discrepancies).map((x, i) => {
    const r = asDict(x);
    return {
      key: asStr(r.payment_id) || `row-${i}`,
      workId: asStr(r.work_id),
      paymentWorkId: asStr(r.payment_work_id),
      serviceTitle: asStr(r.service_title),
      provider: asStr(r.provider).toLowerCase(),
      status: asStr(r.status),
      amount: asNum(r.amount),
      paidAmount: asNum(r.paid_amount),
      reasons: asArr(r.reasons).map((y) => asStr(y)).filter(Boolean),
    };
  });
  return {
    providers,
    discrepancies,
    reasons: groupReasons(discrepancies),
    discrepancyCount: asNum(d.discrepancy_count) || discrepancies.length,
    checkedCount: asNum(d.checked_count),
    generatedAt: asStr(d.generated_at),
  };
}

// One line per kind of mismatch: how many payments, how much money, where.
export function groupReasons(rows: Discrepancy[]): ReasonGroup[] {
  const by = new Map<string, ReasonGroup>();
  for (const r of rows) {
    for (const reason of r.reasons.length ? r.reasons : ["unknown"]) {
      const g = by.get(reason) ?? { reason, count: 0, amount: 0, providers: [] };
      g.count += 1;
      g.amount += r.amount;
      if (r.provider && !g.providers.includes(r.provider)) g.providers.push(r.provider);
      by.set(reason, g);
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}

export async function getReconciliationV2(provider = "", signal?: AbortSignal): Promise<Reconciliation> {
  const q = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  return reconciliationOf(await http(`/admin/payments/reconciliation-v2${q}`, { signal }));
}

// ── Checkout return: "paid" only after the provider's confirmed callback ──
// ── Checkout providers (gaps closed §1): GET /payments/providers, public.
// Only enabled ones are offered, under the backend's own label; when the
// picked one fails, the backend's fallback takes over.
export type CheckoutProvider = { provider: string; enabled: boolean; label: string; status: string };
export type CheckoutProviders = { items: CheckoutProvider[]; fallback: string };
export function checkoutProvidersOf(raw: unknown): CheckoutProviders {
  const d = asDict(raw);
  const items = asArr(d.items)
    .map((x) => {
      const r = asDict(x);
      return { provider: asStr(r.provider), enabled: r.enabled === true, label: asStr(r.label), status: asStr(r.status) };
    })
    .filter((p) => p.provider);
  return { items, fallback: asStr(d.fallback_provider) || "telegram_manual" };
}
export async function getCheckoutProviders(signal?: AbortSignal): Promise<CheckoutProviders> {
  return checkoutProvidersOf(await http("/payments/providers", { signal }));
}

// The client leaves for the provider page; when they come back nothing is
// assumed — the payment is watched in GET /payments/{id} until the backend
// (which only marks it paid from a verified callback) says paid or failed.
export const PENDING_KEY = "lexgo.pendingPayment";
export type PendingPayment = { id: string; amount: number; at: number };
export const PENDING_TTL_MS = 30 * 60 * 1000;

export function rememberPendingPayment(p: { id: string; amount: number }, now = Date.now()): void {
  if (!p.id) return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: p.id, amount: p.amount, at: now }));
  } catch {
    /* storage off: the payments history still shows the result */
  }
}
export function readPendingPayment(now = Date.now()): PendingPayment | null {
  try {
    const v = asDict(JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"));
    const p = { id: asStr(v.id), amount: asNum(v.amount), at: asNum(v.at) };
    if (!p.id || now - p.at > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
// Leave for the provider's page (same tab — a popup after an await is
// blocked), remembering the payment so the return is watched.
export function goToPaymentPage(url: string, paymentId?: string, amount = 0): void {
  if (paymentId) rememberPendingPayment({ id: paymentId, amount });
  window.location.assign(url);
}
export function forgetPendingPayment(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to forget */
  }
}

// Where a watched payment stands (gaps closed §2): pending | paid | failed |
// cancelled | refunded; an unknown or inaccessible payment is "gone".
export type PaymentOutcome = "waiting" | "paid" | "failed" | "gone";
export function paymentOutcome(status: string): PaymentOutcome {
  const s = status.toLowerCase();
  if (s === "paid") return "paid";
  if (s === "failed" || s === "cancelled" || s === "refunded") return "failed";
  return "waiting";
}
export async function getPaymentState(id: string, signal?: AbortSignal): Promise<{ outcome: PaymentOutcome; amount: number }> {
  try {
    const d = asDict(await http(`/payments/${encodeURIComponent(id)}`, { signal }));
    return { outcome: paymentOutcome(asStr(d.status)), amount: asNum(d.amount) };
  } catch (e) {
    if (e instanceof ApiError && (e.code === "payment_not_found" || e.status === 404)) return { outcome: "gone", amount: 0 };
    throw e;
  }
}
