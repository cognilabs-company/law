import { describe, expect, it } from "vitest";
import { normSellerConfig } from "@/lib/services/marketRuntime";
import { priceExplanationOf } from "@/lib/services/sellerServices";
import { modifierEffect, readPriceModifiers } from "@/lib/services/marketplacePricing";

// Trimmed from live GET /marketplace/me/services/{id}/configuration (24 Oct 2026):
// the criteria and growth come only inside pricing_limits.
const live = {
  service_id: "s1",
  maximum_price: 100000,
  minimum_listing_price: 70000,
  recommended_price: 100000,
  price_explanation: [{ code: "region", label: "Hudud koeffitsiyenti", value: 1.0, amount: 0 }],
  pricing_limits: {
    base_price: 100000,
    potential_max_price: 188760,
    maximum_increase_percent: 89,
    requirements: [
      { key: "lawyer_experience", current: 0, required: 11, unit: "year", met: false, progress_percent: 0 },
      { key: "seller_performance", current: { wins: 20 }, required: { any_of: [{ wins: 50 }, { success_rate: 85, total_cases: 20 }] }, unit: "mixed", met: false, progress_percent: 94 },
    ],
  },
};

describe("seller service configuration", () => {
  it("reads the backend's growth percent and criteria from pricing_limits", () => {
    const c = normSellerConfig(live, "s1");
    expect(c.maxIncreasePercent).toBe(89);
    // TSK-640502: the service's overall maximum is pricing_limits.potential_max_price.
    expect(c.serviceMaximumPrice).toBe(188760);
    expect(c.maximumPrice).toBe(100000);
    expect(c.minimumListingPrice).toBe(70000);
    expect(c.requirements.map((r) => [r.key, r.met, r.progress])).toEqual([
      ["lawyer_experience", false, 0],
      ["seller_performance", false, 94],
    ]);
    expect(c.requirements[1].anyOf).toHaveLength(2);
  });

  it("prefers the top-level fields the contract describes", () => {
    const c = normSellerConfig({ ...live, maximum_increase_percent: 30 }, "s1");
    expect(c.maxIncreasePercent).toBe(30);
  });

  it("drops a factor that changes nothing", () => {
    expect(priceExplanationOf(live.price_explanation)).toEqual({ text: "", lines: [], factors: [] });
  });
});

describe("price modifiers", () => {
  it("reads the order snapshot's factors", () => {
    const mods = readPriceModifiers([
      { code: "region", key: "samarkand", multiplier: 1.05, amount: 45000 },
      { code: "lawyer_experience", years: 4, percent: 10, amount: 94500 },
    ]);
    expect(mods.map((m) => [m.code, m.amount])).toEqual([
      ["region", 45000],
      ["experience", 94500],
    ]);
    expect(modifierEffect(mods[0])).toEqual({ text: "×1.05", tone: "up" });
    expect(modifierEffect(mods[1])).toEqual({ text: "+10%", tone: "up" });
  });
});
