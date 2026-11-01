import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cheapestPerDay, periodMonths, renewalTerms } from "@/lib/planCheckout";
import { LEGAL_FALLBACK_ITEMS } from "@/lib/legal";

// Launch compliance 2026-11-01: what a subscriber is told before paying,
// the honest "best price" mark, the age confirmation at sign-up, the AI label
// in every language, and no made-up figures or certifications in the copy.

type Tree = Record<string, unknown>;
const msgs = (l: string): Tree => JSON.parse(readFileSync(`messages/${l}.json`, "utf8")) as Tree;
const at = (o: Tree, path: string): unknown => path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Tree)[k] : undefined), o);
const strings = (o: unknown, out: string[] = []): string[] => {
  if (typeof o === "string") out.push(o);
  else if (o && typeof o === "object") for (const v of Object.values(o)) strings(v, out);
  return out;
};

describe("renewal terms before purchase", () => {
  it("knows how long each backend billing period runs", () => {
    expect(periodMonths("monthly")).toBe(1);
    expect(periodMonths("six_month")).toBe(6);
    expect(periodMonths("yearly")).toBe(12);
    expect(periodMonths("prepaid_yearly")).toBe(12);
  });

  it("renews at the same amount when there is no promotion", () => {
    expect(renewalTerms("monthly", 99000)).toEqual({ months: 1, payNow: 99000, renewAt: 99000, promo: false });
  });

  it("says a promotion only lowers the first period", () => {
    expect(renewalTerms("yearly", 1000000, 1069200)).toEqual({ months: 12, payNow: 1000000, renewAt: 1069200, promo: true });
  });

  it("never quotes a renewal below what is paid now", () => {
    expect(renewalTerms("six_month", 600000, 500000).renewAt).toBe(600000);
  });
});

describe("lowest price per day", () => {
  it("marks the package that is really cheapest per day", () => {
    const packs = [
      { id: "a", price: 70000, days: 7 },
      { id: "b", price: 200000, days: 30 },
      { id: "c", price: 150000, days: 14 },
    ];
    expect(cheapestPerDay(packs)).toBe("b");
  });

  it("marks nothing for a tie or a single package", () => {
    expect(cheapestPerDay([{ id: "a", price: 100, days: 1 }, { id: "b", price: 200, days: 2 }])).toBe("");
    expect(cheapestPerDay([{ id: "a", price: 100, days: 1 }])).toBe("");
  });
});

describe("sign-up consents", () => {
  it("always asks for the 18+ confirmation, even before the documents load", () => {
    expect(LEGAL_FALLBACK_ITEMS.map((d) => d.slug)).toContain("age_18");
  });
});

describe("messages", () => {
  const KEYS = [
    "aiLabel.badge",
    "aiLabel.text",
    "legal.consent.age",
    "accountData.download.title",
    "accountData.delete.title",
    "checkoutTerms.noFees",
    "checkoutTerms.renewOn",
    "checkoutTerms.renewOff",
    "checkoutTerms.refund",
    "portal.myPlan.cancel.button",
  ];
  for (const l of ["uz", "ru", "en"]) {
    it(`has the compliance strings in ${l}`, () => {
      const m = msgs(l);
      for (const k of KEYS) expect(typeof at(m, k), `${l}: ${k}`).toBe("string");
    });

    it(`keeps no made-up figures, quotes or certifications in ${l}`, () => {
      const m = msgs(l);
      for (const k of ["home.stats", "home.ticker", "home.social", "subscription.testimonials", "lawyers.stats", "auth.stat1n", "auth.stat3n"]) {
        expect(at(m, k), `${l}: ${k}`).toBeUndefined();
      }
      const all = strings(m).join("\n");
      expect(all).not.toMatch(/\bSOC ?2\b|ISO ?27001|ISO ?9001|1[ ,.]?240\+|63[ ,.]?000\+|12k\+/i);
    });
  }

  it("labels AI content as not legal advice", () => {
    expect(at(msgs("en"), "aiLabel.text")).toMatch(/not legal advice/i);
  });
});
