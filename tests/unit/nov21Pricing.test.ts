import { describe, expect, it } from "vitest";
import { negotiationErrorKey } from "@/components/marketplace/order/negotiationRules";
import { configErrorOf } from "@/lib/services/sellerConfig";
import { ApiError } from "@/lib/http";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §3: no upper cap; the seller may
// lower the calculated price by at most 50%.
describe("pricing errors (§3)", () => {
  it("a proposal under the minimum and a counter-offer out of range have their own words", () => {
    expect(negotiationErrorKey("negotiation_amount_below_minimum")).toBe("belowMin");
    expect(negotiationErrorKey("counter_price_invalid")).toBe("outOfRange");
    expect(negotiationErrorKey("negotiation_amount_must_be_lower")).toBe("notLower");
  });
  it("the configuration's price errors carry the limits", () => {
    const err = (code: string, detail: Record<string, unknown>) => new ApiError(422, code, undefined, { code, data: { detail: { code, ...detail } } });
    const below = configErrorOf(err("price_below_minimum", { minimum_listing_price: 50000, pricing_limits: { max_allowed: 100000, min_allowed: 50000 } }));
    expect(below).toMatchObject({ code: "seller_price_below_minimum", field: "price", minimum: 50000 });
    const above = configErrorOf(err("price_above_maximum", { maximum_price: 100000, pricing_limits: { max_allowed: 100000, min_allowed: 50000 } }));
    expect(above).toMatchObject({ code: "seller_price_above_maximum", field: "price", maximum: 100000 });
  });
});
