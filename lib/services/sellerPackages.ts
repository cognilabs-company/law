import { ApiError, http, asDict, asStr, asArr, type Dict } from "@/lib/http";
import { normPackage, type BackendPackage } from "@/lib/services/backend";

export type SellerPackageStatus = "active" | "disabled";

export type EligibilityRuleResult = { ruleId: string; title: string; passed: boolean | null; reasons: string[] };

export type SellerPackageEligibility = {
  eligible: boolean;
  extendedVerified: boolean;
  baseVerified: boolean;
  reasons: string[];
  missingServiceIds: string[];
  ruleResults?: EligibilityRuleResult[];
};

export type TierFailure = { code: string; message: string; reasons: string[]; rules: EligibilityRuleResult[] };

export type SellerPackage = {
  id: string;
  pkg: BackendPackage;
  enabled: boolean;
  status: SellerPackageStatus;
  priceEditable: boolean;
  eligibility: SellerPackageEligibility;
};

const strs = (v: unknown) => asArr(v).map((s) => asStr(s)).filter(Boolean);

const textOf = (v: unknown): string => {
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  const d = asDict(v);
  return asStr(d.message ?? d.text ?? d.reason ?? d.label ?? d.detail ?? d.title ?? d.code).trim();
};

const texts = (...vals: unknown[]): string[] => {
  const out: string[] = [];
  for (const v of vals) {
    const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    for (const x of list) {
      const s = textOf(x);
      if (s && !out.includes(s)) out.push(s);
    }
  }
  return out;
};

const flag = (...vals: unknown[]): boolean | null => {
  for (const v of vals) if (typeof v === "boolean") return v;
  return null;
};

export function normEligibilityRuleResult(v: unknown): EligibilityRuleResult {
  const d = asDict(v);
  const rule = asDict(d.rule);
  return {
    ruleId: asStr(d.rule_id ?? d.eligibility_rule_id ?? d.id ?? rule.id).trim(),
    title: asStr(d.title ?? d.rule_title ?? d.name ?? rule.title).trim(),
    passed: flag(d.passed, d.eligible, d.satisfied, d.ok, d.matched),
    reasons: texts(d.reasons, d.failed_reasons, d.failures, d.failed_conditions, d.messages, d.reason, d.message),
  };
}

function ruleResultsOf(...vals: unknown[]): EligibilityRuleResult[] {
  for (const v of vals) {
    if (!Array.isArray(v)) continue;
    const rows = v.map(normEligibilityRuleResult).filter((r) => r.ruleId || r.title || r.reasons.length);
    if (rows.length) return rows;
  }
  return [];
}

export const TIER_NOT_ELIGIBLE_CODES: readonly string[] = ["tier_not_eligible", "package_tier_not_eligible", "seller_tier_not_eligible"];

export function tierFailureOf(e: unknown): TierFailure | null {
  if (!(e instanceof ApiError)) return null;
  const top = e.data;
  const detail = asDict(top.detail);
  const ctx = asDict(detail.context ?? top.context);
  const code = (e.code || asStr(detail.code) || asStr(top.code)).trim().toLowerCase();
  const rules = ruleResultsOf(detail.eligibility_rule_results, ctx.eligibility_rule_results, top.eligibility_rule_results, detail.rule_results);
  if (!TIER_NOT_ELIGIBLE_CODES.includes(code) && !rules.length) return null;
  const message = asStr(detail.message).trim() || (typeof top.detail === "string" ? top.detail.trim() : "");
  const ruleReasons = new Set(rules.flatMap((r) => r.reasons));
  const reasons = texts(detail.reasons, ctx.reasons, top.reasons).filter((r) => !ruleReasons.has(r) && r !== message);
  return { code, message, reasons, rules };
}

export function failedRules(rules: readonly EligibilityRuleResult[]): EligibilityRuleResult[] {
  return rules.filter((r) => r.passed !== true);
}

export function normSellerPackage(raw: unknown): SellerPackage {
  const x = asDict(raw);
  const nested = asDict(x.package ?? x.service_package);
  const pkg = normPackage(Object.keys(nested).length ? { ...nested, id: nested.id ?? x.package_id } : { ...x, id: x.package_id ?? x.id });
  const el = asDict(x.eligibility ?? x.package_eligibility);
  const enabled = x.enabled === true || x.is_enabled === true;
  const st = asStr(x.status ?? x.seller_status).toLowerCase();
  return {
    id: pkg.id || asStr(x.package_id ?? x.id),
    pkg,
    enabled,
    status: enabled && (st === "" || st === "active" || st === "enabled") ? "active" : "disabled",
    priceEditable: x.price_editable === true,
    eligibility: {
      eligible: el.eligible !== false,
      extendedVerified: el.extended_verified === true,
      baseVerified: el.base_verified === true,
      reasons: texts(el.reasons),
      missingServiceIds: strs(el.missing_service_ids),
      ruleResults: ruleResultsOf(el.eligibility_rule_results, x.eligibility_rule_results),
    },
  };
}

function listOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const d = asDict(raw);
  return asArr(d.items ?? d.packages ?? d.data);
}

function itemOf(raw: unknown): SellerPackage | null {
  const d = asDict(raw);
  const inner: Dict = asDict(d.item ?? d.seller_package ?? d.result);
  const src = Object.keys(inner).length ? inner : d;
  if (!Object.keys(src).length || !("enabled" in src || "status" in src)) return null;
  const item = normSellerPackage(src);
  return item.id ? item : null;
}

export async function listMyPackages(signal?: AbortSignal): Promise<SellerPackage[]> {
  return listOf(await http("/lawyers/me/packages/manage", { signal })).map(normSellerPackage).filter((p) => p.id);
}

export async function enableMyPackage(packageId: string): Promise<SellerPackage | null> {
  return itemOf(await http(`/lawyers/me/packages/${encodeURIComponent(packageId)}/enable`, { method: "POST" }));
}

export async function setMyPackageStatus(packageId: string, status: SellerPackageStatus): Promise<SellerPackage | null> {
  return itemOf(
    await http(`/lawyers/me/packages/${encodeURIComponent(packageId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  );
}
