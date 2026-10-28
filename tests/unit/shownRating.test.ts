import { describe, expect, it } from "vitest";
import { shownRating } from "@/lib/services/trust";
import { normNearby } from "@/lib/services/marketRuntime";

describe("shownRating", () => {
  it("hides the 5.0 the backend gives a seller nobody rated", () => {
    expect(shownRating(5, { rating_status: "unrated", reviews_count: 0 })).toBe(0);
    expect(shownRating(5, {}, { reviews_count: 0 })).toBe(0);
  });

  it("keeps a real score and an unknown review count", () => {
    expect(shownRating(4.6, { rating_status: "rated", reviews_count: 0 })).toBe(4.6);
    expect(shownRating(4.6, { reviews_count: 3 })).toBe(4.6);
    expect(shownRating(4.6, {})).toBe(4.6);
  });

  it("applies to nearby sellers", () => {
    const r = normNearby({ items: [{ seller_user_id: "s1", rating: 5, rating_status: "unrated" }, { seller_user_id: "s2", seller: { rating: 4.8, reviews_count: 12 } }] });
    expect(r.items.map((x) => x.rating)).toEqual([0, 4.8]);
  });
});
