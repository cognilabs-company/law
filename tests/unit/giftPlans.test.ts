import { describe, expect, it } from "vitest";
import { canGiftPlan, isGiftOnlyPlan } from "@/lib/services/backend";

// TSK-342697: gift on every tariff — any active paid plan can be gifted;
// is_giftable no longer marks a gift-only plan.
const plan = (x: Partial<{ isActive: boolean; billingType: string; monthlyPrice: number; sixMonthPrice: number; yearlyPrice: number }>) => ({ isActive: true, billingType: "", monthlyPrice: 0, sixMonthPrice: 0, yearlyPrice: 0, ...x });

describe("gift on every tariff (TSK-342697)", () => {
  it("offers every active paid plan as a gift, never a free or inactive one", () => {
    expect(canGiftPlan(plan({ monthlyPrice: 99000 }))).toBe(true);
    expect(canGiftPlan(plan({ yearlyPrice: 900000 }))).toBe(true);
    expect(canGiftPlan(plan({}))).toBe(false);
    expect(canGiftPlan(plan({ monthlyPrice: 99000, isActive: false }))).toBe(false);
    expect(canGiftPlan(plan({ billingType: "gift" }))).toBe(true);
  });
  it("keeps only the gift-only billing type off self-purchase", () => {
    expect(isGiftOnlyPlan(plan({ billingType: "gift" }))).toBe(true);
    expect(isGiftOnlyPlan(plan({ billingType: "subscription" }))).toBe(false);
  });
});
