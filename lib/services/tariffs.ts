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
  // TSK-692647: publishing a version with a developer note creates a real
  // LexGo task; the version waits for the superadmin's approval once the
  // work is done, and is not on sale before. Shown when the backend sends it.
  devTask: PlanDevTask | null;
};
// Backend answers 2026-10-28 §4.2: a version carries only
// developer_task_id and developer_deadline_at — the task's code, status,
// assignees and any approval are not sent yet and are not guessed. The id
// only says a task exists; it is never shown.
export type PlanDevTask = { deadlineAt: string };
export function devTaskOf(d: Record<string, unknown>): PlanDevTask | null {
  return asStr(d.developer_task_id) ? { deadlineAt: asStr(d.developer_deadline_at) } : null;
}
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
    devTask: devTaskOf(d),
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

// What publishing a version would change (GET …/preview): field, price and
// feature differences against the current version, how many subscribers it
// reaches and how it applies to them.
export type PlanFieldChange = { field: string; before: unknown; after: unknown };
export type PlanPriceChange = { period: string; before: number | null; after: number | null; difference: number | null };
export type PlanFeatureChange = { featureKey: string; mode: string; limit: number | null; resetPeriod: string; unit: string; before: Dict | null };
export type PlanPreview = {
  candidateVersion: number | null;
  currentVersion: number | null;
  fields: PlanFieldChange[];
  prices: PlanPriceChange[];
  added: PlanFeatureChange[];
  removed: PlanFeatureChange[];
  changed: PlanFeatureChange[];
  activeSubscribers: number | null;
  appliesTo: string;
  consentRequired: boolean;
  material: boolean;
  contractImmutable: boolean;
};

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function featureChangeOf(v: unknown): PlanFeatureChange {
  const d = asDict(v);
  const after = d.after && typeof d.after === "object" ? asDict(d.after) : d;
  return {
    featureKey: asStr(d.feature_key ?? after.feature_key),
    mode: asStr(after.mode),
    limit: numOrNull(after.limit),
    resetPeriod: asStr(after.reset_period),
    unit: asStr(after.unit),
    before: d.before && typeof d.before === "object" ? asDict(d.before) : null,
  };
}

export async function previewPlanVersion(versionId: string, signal?: AbortSignal): Promise<PlanPreview> {
  const d = asDict(await http(`/admin/subscription-plan-versions/${encodeURIComponent(versionId)}/preview`, { signal }));
  const ch = asDict(d.changes);
  const f = asDict(ch.features);
  const sum = asDict(d.summary);
  const pol = asDict(d.renewal_policy);
  return {
    candidateVersion: numOrNull(d.candidate_version),
    currentVersion: numOrNull(asDict(d.current_version).version ?? d.current_version),
    fields: asArr(ch.fields).map((x) => {
      const r = asDict(x);
      return { field: asStr(r.field), before: r.before, after: r.after };
    }),
    prices: asArr(ch.prices).map((x) => {
      const r = asDict(x);
      return { period: asStr(r.period), before: numOrNull(r.before), after: numOrNull(r.after), difference: numOrNull(r.difference) };
    }),
    added: asArr(f.added).map(featureChangeOf),
    removed: asArr(f.removed).map(featureChangeOf),
    changed: asArr(f.changed).map(featureChangeOf),
    activeSubscribers: numOrNull(sum.active_subscribers),
    appliesTo: asStr(pol.effective_for_existing_subscribers),
    consentRequired: pol.consent_required === true,
    material: pol.material_change === true,
    contractImmutable: pol.existing_contract_immutable !== false,
  };
}
