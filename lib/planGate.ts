import { ApiError, type Dict } from "@/lib/http";

// HTTP 402 refusals that send the user to choose a plan (backend contract
// "subscription usage limits", 2026-10-25): the feature's limit is used up,
// there is no active subscription, the plan does not include the feature,
// or the general AI allowance is spent.
export const PLAN_GATE_CODES = ["feature_limit_exhausted", "active_subscription_required", "feature_not_in_plan", "ai_subscription_required"] as const;
export type PlanGateCode = (typeof PLAN_GATE_CODES)[number];

export type PlanGate = {
  code: PlanGateCode;
  featureKey: string;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  unit: string;
  resetsAt: string;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function planGateOf(e: unknown): PlanGate | null {
  if (!(e instanceof ApiError) || e.status !== 402) return null;
  const d = e.data.detail && typeof e.data.detail === "object" && !Array.isArray(e.data.detail) ? (e.data.detail as Dict) : {};
  const code = (typeof d.code === "string" ? d.code : e.code) as PlanGateCode;
  if (!(PLAN_GATE_CODES as readonly string[]).includes(code)) return null;
  return {
    code,
    featureKey: typeof d.feature_key === "string" ? d.feature_key : "",
    limit: num(d.limit) ?? num(d.monthly_limit),
    used: num(d.used),
    remaining: num(d.remaining),
    unit: typeof d.unit === "string" ? d.unit : "",
    resetsAt: typeof d.resets_at === "string" ? d.resets_at : "",
  };
}
