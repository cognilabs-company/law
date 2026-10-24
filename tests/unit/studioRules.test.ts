import { describe, expect, it } from "vitest";
import { GENERIC_LAYOUTS } from "@/components/admin/studio/sx/ctor/generic";
import { mp09Validate } from "@/components/admin/studio/sx/ctor/k12";
import { isRetiredStudioCode, retiredGroupHref, retiredMoveOf } from "@/lib/studio/retired";

describe("removed Studio constructors", () => {
  it.each(["SEC01", "K10", "k12-m", "MP08", "INT03"])("%s is gone and lands on the Studio home", (code) => {
    expect(isRetiredStudioCode(code)).toBe(true);
    const move = retiredMoveOf(code);
    expect(move && retiredGroupHref(move)).toBe(`/admin/studio?retired=${code.toUpperCase()}`);
  });

  it("a moved constructor still goes to its group", () => {
    expect(retiredGroupHref(retiredMoveOf("K05")!)).toBe("/admin/studio/g/services_packages?retired=K05");
  });

  it("live constructors are untouched", () => {
    expect(isRetiredStudioCode("K31")).toBe(false);
    expect(retiredMoveOf("K17")).toBeNull();
  });
});

describe("K17 entitlements", () => {
  const validate = GENERIC_LAYOUTS.K17.validate!;
  it("refuses a repeated feature and a limited one without a positive limit", () => {
    expect(
      validate({
        entitlements: [
          { feature_key: "ai_requests", mode: "limited", limit: 10 },
          { feature_key: "ai_requests", mode: "unlimited" },
          { feature_key: "export", mode: "limited", limit: 0 },
        ],
      }),
    ).toEqual({ "entitlements.1.feature_key": "@code:entitlement_duplicate", "entitlements.2.limit": "@code:entitlement_limit_required" });
    expect(validate({ entitlements: [{ feature_key: "export", mode: "unlimited" }] })).toEqual({});
  });
});

describe("MP09 promotion", () => {
  it("checks the discount, the usage limit and the dates", () => {
    expect(mp09Validate({ target_type: "subscription", discount_type: "percent", discount_value: 120, usage_limit: 0, starts_at: "2026-11-02T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" })).toEqual({
      discount_value: "@code:maximum:100",
      usage_limit: "@code:minimum:1",
      ends_at: "@code:campaign_ends_before_start",
    });
    expect(mp09Validate({ target_type: "advertising", discount_type: "fixed", discount_value: 0 })).toEqual({ discount_value: "@code:minimum:1" });
    expect(mp09Validate({ target_type: "advertising", discount_type: "fixed", discount_value: 15000 })).toEqual({});
  });
});
