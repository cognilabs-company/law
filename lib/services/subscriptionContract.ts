// A subscriber's own side of tariffs (FRONTEND_STUDIO_TARIFF_PROMOTION_
// MONITORING_CLEANUP §6): the contract fixed for the current period, the
// feature limits as the backend counts them, and consent to new terms at
// renewal. Counters are never changed here; the backend is the authority.

import { asArr, asDict, asStr, http, type Dict } from "@/lib/http";

export type FeatureAccess = { key: string; mode: string; allowed: boolean; limit: number | null; used: number | null; remaining: number | null; resetsAt: string };
export type MyFeatures = { subscriptionId: string; planId: string; planVersion: number | null; items: FeatureAccess[] };

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export async function getMyFeatures(signal?: AbortSignal): Promise<MyFeatures> {
  const d = asDict(await http("/subscriptions/me/features", { signal }));
  return {
    subscriptionId: asStr(d.subscription_id),
    planId: asStr(d.plan_id),
    planVersion: num(d.plan_version),
    items: asArr(d.items)
      .map((x) => {
        const f = asDict(x);
        return { key: asStr(f.feature_key), mode: asStr(f.mode), allowed: f.allowed !== false, limit: num(f.limit), used: num(f.used), remaining: num(f.remaining), resetsAt: asStr(f.resets_at) };
      })
      .filter((f) => f.key),
  };
}

export type ContractEntitlement = { key: string; mode: string; limit: number | null; resetPeriod: string };
export type SubscriptionContract = {
  subscriptionId: string;
  status: string;
  title: string;
  names: Record<string, string>;
  version: number | null;
  prices: Record<string, number>;
  entitlements: ContractEntitlement[];
  termsChanged: boolean;
  consent: { accepted: boolean | null; at: string } | null;
  next: { version: number | null; entitlements: ContractEntitlement[]; prices: Record<string, number> } | null;
};

const entitlementsOf = (v: unknown): ContractEntitlement[] =>
  asArr(v)
    .map((x) => {
      const e = asDict(x);
      return { key: asStr(e.feature_key), mode: asStr(e.mode), limit: num(e.limit), resetPeriod: asStr(e.reset_period) };
    })
    .filter((e) => e.key);

const pricesOf = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(asDict(v))) if (num(x) !== null) out[k] = num(x) as number;
  return out;
};

export async function getSubscriptionContract(subscriptionId: string, signal?: AbortSignal): Promise<SubscriptionContract> {
  const d = asDict(await http(`/subscriptions/${encodeURIComponent(subscriptionId)}/contract`, { signal }));
  const snap = asDict(d.snapshot);
  const meta = asDict(snap.meta);
  const names: Record<string, string> = {};
  const n = asDict(meta.name);
  for (const k of Object.keys(n)) if (typeof n[k] === "string") names[k] = n[k] as string;
  const prices = pricesOf(snap.prices);
  const consent = d.renewal_consent ? asDict(d.renewal_consent) : null;
  const next = d.current_plan_version ? asDict(d.current_plan_version) : null;
  return {
    subscriptionId: asStr(d.subscription_id) || subscriptionId,
    status: asStr(d.status),
    title: asStr(snap.title),
    names,
    version: num(snap.version ?? snap.plan_version ?? d.plan_version),
    prices,
    entitlements: entitlementsOf(d.entitlements ?? snap.entitlements),
    termsChanged: d.renewal_terms_changed === true,
    consent: consent ? { accepted: typeof consent.accepted === "boolean" ? consent.accepted : null, at: asStr(consent.accepted_at ?? consent.created_at) } : null,
    next: next ? { version: num(next.version), entitlements: entitlementsOf(asDict(next.payload ?? next).entitlements), prices: pricesOf(asDict(next.payload ?? next).prices) } : null,
  };
}

export async function giveRenewalConsent(subscriptionId: string): Promise<Dict> {
  return asDict(await http(`/subscriptions/${encodeURIComponent(subscriptionId)}/renewal-consent`, { method: "POST", body: JSON.stringify({ accepted: true }) }));
}
