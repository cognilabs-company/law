import { describe, expect, it } from "vitest";
import { REGION_KEYS } from "@/lib/lawyers";
import { regionKeyByText } from "@/lib/labels";
import { regionLabelIn, regionsOf } from "@/lib/useRegions";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md §5.1: 14 fixed keys.
describe("regions (§5.1)", () => {
  it("knows all 14 keys, including the four that were missing", () => {
    expect(REGION_KEYS).toHaveLength(14);
    for (const k of ["tashkent_region", "karakalpakstan", "syrdarya", "surkhandarya"]) expect(REGION_KEYS).toContain(k);
  });
  it("reads GET /regions and labels each key in the page's language", () => {
    const rows = regionsOf({ items: [{ key: "tashkent", labels: { uz_latn: "Toshkent shahri", uz_cyrl: "Тошкент шаҳри", ru: "Город Ташкент", en: "Tashkent city" } }, { key: "", labels: {} }], total: 14 });
    expect(rows).toHaveLength(1);
    expect(regionLabelIn(rows[0], "uz")).toBe("Toshkent shahri");
    expect(regionLabelIn(rows[0], "ru")).toBe("Город Ташкент");
    expect(regionLabelIn(rows[0], "en")).toBe("Tashkent city");
  });
  it("free text maps to the right key: the region is not the city", () => {
    const label = (k: string) => ({ tashkent: "Toshkent shahri", tashkent_region: "Toshkent viloyati", surkhandarya: "Surxondaryo", syrdarya: "Sirdaryo" })[k] ?? k;
    expect(regionKeyByText("Toshkent viloyati", label)).toBe("tashkent_region");
    expect(regionKeyByText("Toshkent shahri", label)).toBe("tashkent");
    expect(regionKeyByText("Surxondaryo viloyati", label)).toBe("surkhandarya");
    expect(regionKeyByText("Sirdaryo", label)).toBe("syrdarya");
    expect(regionKeyByText("", label)).toBe("");
  });
});
