import { describe, expect, it } from "vitest";
import { entitlementIssues, entitlementsBody, entitlementsOf, validationOf, versionOf } from "@/lib/services/tariffs";

const registry = {
  items: [
    { id: "1", key: "ai_requests", title: "", description: "", unit: "request", resetPeriods: ["day", "month"] },
    { id: "2", key: "export", title: "", description: "", unit: "export", resetPeriods: ["billing_period"] },
  ],
  modes: ["unavailable", "limited", "unlimited"],
  resetPeriods: ["day", "month", "billing_period", "lifetime"],
};

describe("tariff entitlements", () => {
  it("flags a repeated feature, a missing limit and a period the feature does not allow", () => {
    expect(
      entitlementIssues(
        [
          { featureKey: "ai_requests", mode: "limited", limit: 10, resetPeriod: "month" },
          { featureKey: "ai_requests", mode: "unlimited", limit: null, resetPeriod: "" },
          { featureKey: "export", mode: "limited", limit: null, resetPeriod: "" },
          { featureKey: "export", mode: "limited", limit: 0, resetPeriod: "" },
        ],
        registry,
      ),
    ).toEqual({ 1: "duplicate", 2: "limit", 3: "duplicate" });
    expect(entitlementIssues([{ featureKey: "export", mode: "limited", limit: 5, resetPeriod: "day" }], registry)).toEqual({ 0: "reset" });
    expect(entitlementIssues([{ featureKey: "", mode: "unlimited", limit: null, resetPeriod: "" }], registry)).toEqual({ 0: "feature" });
  });

  it("sends a limit only for limited features", () => {
    expect(
      entitlementsBody([
        { featureKey: "ai_requests", mode: "limited", limit: 10, resetPeriod: "month" },
        { featureKey: "export", mode: "unlimited", limit: 3, resetPeriod: "day" },
      ]),
    ).toEqual([{ feature_key: "ai_requests", mode: "limited", limit: 10, reset_period: "month" }, { feature_key: "export", mode: "unlimited" }]);
  });

  it("reads rows and versions as sent", () => {
    expect(entitlementsOf({ entitlements: [{ feature_key: "export", mode: "unlimited", limit: null }] })).toEqual([{ featureKey: "export", mode: "unlimited", limit: null, resetPeriod: "" }]);
    expect(versionOf({ id: "v2", version: 2, status: "Draft", validation: { ok: false, errors: [{ loc: ["body", "entitlements", 0, "limit"], msg: "bad" }] } })).toMatchObject({
      id: "v2",
      version: 2,
      status: "draft",
      validation: { ok: false, errors: [{ field: "entitlements.0.limit", message: "bad" }] },
    });
    expect(validationOf({ errors: [] }).ok).toBeNull();
  });
});
