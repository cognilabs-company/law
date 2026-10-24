// Subscription tariffs as versions, and the feature registry they draw
// on (FRONTEND_STUDIO_TARIFF_PROMOTION_MONITORING_CLEANUP §3, §5). A
// published version never changes: an edit is a new draft, validated by
// the backend, then published (the old one becomes superseded).

import { ApiError, asArr, asDict, asStr, http, type Dict } from "@/lib/http";

export type FeatureDef = { id: string; key: string; title: string; description: string; unit: string; resetPeriods: string[] };
export type FeatureRegistry = { items: FeatureDef[]; modes: string[]; resetPeriods: string[] };

function featureOf(v: unknown): FeatureDef {
  const d = asDict(v);
  return {
    id: asStr(d.id),
    key: asStr(d.key),
    title: asStr(d.title),
    description: asStr(d.description),
    unit: asStr(d.unit),
    resetPeriods: asArr(d.allowed_reset_periods).map((x) => asStr(x)).filter(Boolean),
  };
}

export async function listSubscriptionFeatures(signal?: AbortSignal): Promise<FeatureRegistry> {
  const d = asDict(await http("/admin/subscription-features", { signal }));
  return {
    items: asArr(d.items).map(featureOf).filter((f) => f.key),
    modes: asArr(d.modes).map((x) => asStr(x)).filter(Boolean),
    resetPeriods: asArr(d.reset_periods).map((x) => asStr(x)).filter(Boolean),
  };
}

export type FeatureInput = { key: string; title: string; description: string; unit: string; resetPeriods: string[] };

// 409 feature_key_exists: the key is taken.
export async function createSubscriptionFeature(input: FeatureInput): Promise<FeatureDef> {
  return featureOf(
    await http("/admin/subscription-features", {
      method: "POST",
      body: JSON.stringify({ key: input.key.trim(), title: input.title.trim(), description: input.description.trim(), unit: input.unit.trim(), allowed_reset_periods: input.resetPeriods }),
    }),
  );
}

export type Entitlement = { featureKey: string; mode: string; limit: number | null; resetPeriod: string };
export type ValidationIssue = { field: string; code: string; message: string };
export type PlanVersion = {
  id: string;
  version: number | null;
  status: string;
  createdAt: string;
  publishedAt: string;
  payload: Dict;
  validation: { ok: boolean | null; errors: ValidationIssue[] };
};
export type PlanVersions = { planId: string; items: PlanVersion[]; currentVersionId: string };

const issueOf = (v: unknown): ValidationIssue => {
  const d = asDict(v);
  const loc = Array.isArray(d.loc) ? (d.loc as unknown[]).map((x) => String(x)).filter((x) => x !== "body" && x !== "payload").join(".") : "";
  return { field: asStr(d.field ?? d.path) || loc, code: asStr(d.code ?? d.type), message: asStr(d.message ?? d.msg) };
};

export function validationOf(v: unknown): PlanVersion["validation"] {
  const d = asDict(v);
  const errors = asArr(d.errors).map(issueOf);
  return { ok: typeof d.ok === "boolean" ? d.ok : errors.length ? false : null, errors };
}

export function versionOf(v: unknown): PlanVersion {
  const d = asDict(v);
  const n = Number(d.version ?? d.version_number);
  return {
    id: asStr(d.id ?? d.version_id),
    version: Number.isFinite(n) ? n : null,
    status: asStr(d.status).toLowerCase(),
    createdAt: asStr(d.created_at),
    publishedAt: asStr(d.published_at),
    payload: asDict(d.payload ?? d.snapshot ?? d.data),
    validation: validationOf(d.validation),
  };
}

export async function listPlanVersions(planId: string, signal?: AbortSignal): Promise<PlanVersions> {
  const d = asDict(await http(`/admin/subscription-plans/${encodeURIComponent(planId)}/versions`, { signal }));
  return { planId: asStr(d.plan_id) || planId, items: asArr(d.items).map(versionOf).filter((v) => v.id), currentVersionId: asStr(d.current_version_id) };
}

export async function createPlanDraft(planId: string, payload: Dict): Promise<PlanVersion> {
  return versionOf(await http(`/admin/subscription-plans/${encodeURIComponent(planId)}/drafts`, { method: "POST", body: JSON.stringify(payload) }));
}

// 409 immutable_plan_version: only drafts change.
export async function updatePlanDraft(versionId: string, payload: Dict): Promise<PlanVersion> {
  return versionOf(await http(`/admin/subscription-plan-versions/${encodeURIComponent(versionId)}`, { method: "PATCH", body: JSON.stringify(payload) }));
}

export async function validatePlanVersion(versionId: string): Promise<PlanVersion["validation"]> {
  return validationOf(await http(`/admin/subscription-plan-versions/${encodeURIComponent(versionId)}/validate`, { method: "POST", body: "{}" }));
}

export async function publishPlanVersion(versionId: string): Promise<PlanVersion> {
  return versionOf(await http(`/admin/subscription-plan-versions/${encodeURIComponent(versionId)}/publish`, { method: "POST", body: "{}" }));
}

// 409 published_version_cannot_be_archived: publish a replacement first.
export async function archivePlanVersion(versionId: string): Promise<PlanVersion> {
  return versionOf(await http(`/admin/subscription-plan-versions/${encodeURIComponent(versionId)}/archive`, { method: "POST", body: "{}" }));
}

export const conflictCode = (e: unknown): string => (e instanceof ApiError ? e.code || asStr(asDict(e.data.detail).code) : "");

export function entitlementsOf(payload: Dict): Entitlement[] {
  return asArr(payload.entitlements).map((x) => {
    const r = asDict(x);
    const n = Number(r.limit);
    return { featureKey: asStr(r.feature_key), mode: asStr(r.mode) || "unavailable", limit: r.limit === null || r.limit === undefined || r.limit === "" || !Number.isFinite(n) ? null : n, resetPeriod: asStr(r.reset_period) };
  });
}

export function entitlementsBody(rows: readonly Entitlement[]): Dict[] {
  return rows.map((r) => {
    const out: Dict = { feature_key: r.featureKey, mode: r.mode };
    if (r.mode === "limited") {
      out.limit = r.limit;
      if (r.resetPeriod) out.reset_period = r.resetPeriod;
    }
    return out;
  });
}

// The same rules the backend applies, to say so before saving: a feature
// once, a positive limit when limited, a reset period the feature allows.
export function entitlementIssues(rows: readonly Entitlement[], registry: FeatureRegistry | null): Record<number, string> {
  const out: Record<number, string> = {};
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (!r.featureKey) out[i] = "feature";
    else if (seen.has(r.featureKey)) out[i] = "duplicate";
    else if (r.mode === "limited" && !(r.limit !== null && r.limit > 0)) out[i] = "limit";
    else if (r.mode === "limited" && r.resetPeriod && registry) {
      const f = registry.items.find((x) => x.key === r.featureKey);
      if (f && f.resetPeriods.length && !f.resetPeriods.includes(r.resetPeriod)) out[i] = "reset";
    }
    seen.add(r.featureKey);
  });
  return out;
}
