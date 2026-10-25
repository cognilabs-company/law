import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { planGateOf } from "@/lib/planGate";

const refusal = (status: number, detail: Record<string, unknown>) => new ApiError(status, "", undefined, { data: { detail }, code: detail.code as string });

describe("planGateOf (backend 2026-10-25 subscription limits)", () => {
  it("reads an exhausted feature limit", () => {
    expect(planGateOf(refusal(402, { code: "feature_limit_exhausted", feature_key: "ai_document_analysis", limit: 5, used: 5, remaining: 0, unit: "document", resets_at: "2026-11-24T00:00:00+00:00" }))).toEqual({
      code: "feature_limit_exhausted",
      featureKey: "ai_document_analysis",
      limit: 5,
      used: 5,
      remaining: 0,
      unit: "document",
      resetsAt: "2026-11-24T00:00:00+00:00",
    });
  });
  it("knows the other plan refusals and nothing else", () => {
    for (const code of ["active_subscription_required", "feature_not_in_plan", "ai_subscription_required"]) expect(planGateOf(refusal(402, { code }))?.code).toBe(code);
    expect(planGateOf(refusal(402, { code: "manual_document_plan_required" }))).toBeNull();
    expect(planGateOf(refusal(403, { code: "feature_limit_exhausted" }))).toBeNull();
  });
});
