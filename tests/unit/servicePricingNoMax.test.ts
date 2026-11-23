import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { normSellerConfig } from "@/lib/services/marketRuntime";
import { catalogPricingOf, normCatalogItem, priceExplanationOf, serviceErrorOf } from "@/lib/services/sellerServices";
import { readPriceModifiers } from "@/lib/services/marketplacePricing";
import { negotiationErrorKey } from "@/components/marketplace/order/negotiationRules";
import { K02_LAYOUT, k02Transform } from "@/components/admin/studio/sx/ctor/services";
import { ctorWarnings } from "@/components/admin/studio/sx/ctor/warnings";

// SERVICE_PRICING_NO_MAX_PRICE (2026-11-23): a service has no manual
// max_price any more. The system price (base × the coefficients the seller
// meets) is the ceiling — max_allowed / maximum_price — and the floor is 50%
// of it — min_allowed / minimum_listing_price.
const LIMITS = {
  base_price: 200000,
  max_allowed: 230000,
  maximum_price: 230000,
  recommended_price: 230000,
  min_allowed: 115000,
  minimum_listing_price: 115000,
  potential_max_price: 260000,
  current_increase_percent: 15,
  maximum_increase_percent: 30,
  maximum_listing_discount_percent: 50,
  currency: "UZS",
  coefficients: [
    { id: "c1", title: "Yuristlik tajribasi 5 yildan ko'p", criterion_type: "lawyer_experience", operator: "gte", current: 7, threshold: 5, increase_percent: 15, met: true },
    { id: "c2", title: "Mijozlar bahosi 4.8 dan yuqori", criterion_type: "client_rating", operator: "gte", current: 4.5, threshold: 4.8, increase_percent: 15, met: false },
  ],
  modifiers: [
    { code: "c1", label: "Yuristlik tajribasi 5 yildan ko'p", percent: 15, amount: 30000, met: true },
    { code: "c2", label: "Mijozlar bahosi 4.8 dan yuqori", percent: 15, amount: 0, met: false },
  ],
  policy: { source: "selected_service_coefficients", combination: "additive_percent", absolute_cap: null },
};

describe("catalog pricing_limits", () => {
  it("reads the system price, its 50% floor and how far it can grow", () => {
    const p = catalogPricingOf(LIMITS)!;
    expect(p.maximum).toBe(230000);
    expect(p.minimum).toBe(115000);
    expect(p.recommended).toBe(230000);
    expect(p.discountPercent).toBe(50);
    expect(p.base).toBe(200000);
    expect(p.growth?.potential).toBe(260000);
    expect(p.growth?.currentPct).toBe(15);
    expect(p.growth?.maxPct).toBe(30);
    expect(p.growth?.requirements.map((r) => [r.key, r.label, r.met, r.required, r.increasePct, r.operator])).toEqual([
      ["lawyer_experience", "Yuristlik tajribasi 5 yildan ko'p", true, 5, 15, "gte"],
      ["client_rating", "Mijozlar bahosi 4.8 dan yuqori", false, 4.8, 15, "gte"],
    ]);
  });

  it("works from the max_allowed / min_allowed names alone", () => {
    const p = catalogPricingOf({ base_price: 200000, max_allowed: 230000, min_allowed: 115000 })!;
    expect([p.maximum, p.minimum, p.recommended]).toEqual([230000, 115000, 230000]);
  });

  it("explains the price with the coefficients met only", () => {
    const e = priceExplanationOf(LIMITS.modifiers)!;
    expect(e.factors).toEqual([{ key: "c1", label: "Yuristlik tajribasi 5 yildan ko'p", effect: "+15%" }]);
    expect(e.lines).toEqual([]);
    expect(normCatalogItem({ service_id: "s2", title: "Aliment", pricing_limits: LIMITS }).pricing?.explanation?.factors).toHaveLength(1);
  });

  it("never counts an unmet coefficient as one of the price's factors", () => {
    expect(readPriceModifiers(LIMITS.modifiers).map((m) => m.label)).toEqual(["Yuristlik tajribasi 5 yildan ko'p"]);
  });
});

describe("seller service configuration", () => {
  it("takes the ceiling and floor from pricing_limits and prefers the coefficients", () => {
    const c = normSellerConfig({ service_id: "s1", selected_price: 200000, pricing_limits: { ...LIMITS, maximum_price: undefined, minimum_listing_price: undefined, requirements: [{ key: "old", met: false }] } }, "s1");
    expect(c.maximumPrice).toBe(230000);
    expect(c.minimumListingPrice).toBe(115000);
    expect(c.serviceMaximumPrice).toBe(260000);
    expect(c.maxIncreasePercent).toBe(30);
    expect(c.currentIncreasePercent).toBe(15);
    expect(c.requirements.map((r) => r.key)).toEqual(["lawyer_experience", "client_rating"]);
  });
});

describe("price errors", () => {
  const err = (code: string) =>
    new ApiError(422, "x", undefined, {
      code,
      data: { detail: { code, service_id: "s1", selected_price: 300000, minimum_listing_price: 100000, maximum_price: 200000, pricing_limits: { ...LIMITS, max_allowed: 200000, maximum_price: 200000, recommended_price: 200000, min_allowed: 100000, minimum_listing_price: 100000 } } },
    });

  it("price_above_maximum: the system price and the limits as they are now", () => {
    const e = serviceErrorOf(err("price_above_maximum"));
    expect(e.kind).toBe("aboveMax");
    expect([e.min, e.max]).toEqual([100000, 200000]);
    expect([e.limits?.min, e.limits?.max]).toEqual([100000, 200000]);
  });

  it("price_below_minimum: the 50% floor and the limits as they are now", () => {
    const e = serviceErrorOf(err("price_below_minimum"));
    expect(e.kind).toBe("belowMin");
    expect(e.min).toBe(100000);
    expect(e.limits?.max).toBe(200000);
  });

  it("a counter-offer outside the order's bounds", () => {
    expect(negotiationErrorKey("counter_price_invalid")).toBe("counterRange");
    expect(negotiationErrorKey("negotiation_amount_above_max")).toBe("aboveMax");
  });
});

describe("Studio service form", () => {
  it("has no max price field, sends none and warns about none", () => {
    const listed = K02_LAYOUT.sections!.flatMap((s) => s.fields.map((f) => (typeof f === "string" ? f : String((f as { path?: string }).path ?? ""))));
    expect(listed).not.toContain("max_price");
    expect(K02_LAYOUT.fields!.find((f) => f.path === "max_price")?.hidden).toBe(true);
    expect(k02Transform({ title: "X", base_price: 100000, max_price: 50000 })).not.toHaveProperty("max_price");
    expect(ctorWarnings("K02", { base_price: 100000, max_price: 50000 }, null, { isNew: true })).toEqual([]);
  });
});
