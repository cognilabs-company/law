import { describe, expect, it } from "vitest";
import { executorTypesOf, normService } from "@/lib/services/backend";
import { LEGACY_PLAN_SLUGS, sellablePlans } from "@/lib/catalogOverlay";
import { inStudioCatalog, studioCodeOf } from "@/lib/studio/catalogLink";
import { normEntityCards } from "@/components/admin/studio/sx/home/entityModel";

// Backend answers 2026-10-31: §4.2 executor types, §4.7 links only to
// constructors in the catalog, §4.8 dashboard cards parsed defensively, and
// §2.1 plans listed without the old admin overlay.

describe("executor types (§4.2)", () => {
  it("prefers the runtime list and falls back to the singular field", () => {
    expect(executorTypesOf({ executor_types: ["advokat", "yurist", "advokat", ""], executor_type: "ai_lawyer" })).toEqual(["advokat", "yurist"]);
    expect(executorTypesOf({ executor_types: [], executor_type: "yurist" })).toEqual(["yurist"]);
    expect(executorTypesOf({ executor_type: "  " })).toEqual([]);
    const s = normService({ id: "s1", title: "Konsultatsiya", executor_types: ["yurist", "advokat"], executor_type: "yurist" });
    expect(s.executorTypes).toEqual(["yurist", "advokat"]);
    expect(normService({ id: "s2", title: "Eski", executor_type: "advokat" }).executorTypes).toEqual(["advokat"]);
  });
});

describe("Studio catalog links (§4.7)", () => {
  const items = [{ code: "K17" }, { code: "k02" }, { code: "K10" }];
  it("links only to a listed, live constructor", () => {
    expect(inStudioCatalog("K17", items)).toBe(true);
    expect(inStudioCatalog("K02", items)).toBe(true);
    // K10 is retired even if a stale catalog still lists it.
    expect(inStudioCatalog("K10", items)).toBe(false);
    expect(inStudioCatalog("K37", items)).toBe(false);
    expect(inStudioCatalog("", items)).toBe(false);
  });
  it("reads the constructor a Studio URL opens", () => {
    expect(studioCodeOf("/admin/studio/c/K37")).toBe("K37");
    expect(studioCodeOf("/admin/studio/c/K12-PROMO?tab=all")).toBe("K12-PROMO");
    expect(studioCodeOf("/admin/studio/o/new?new=MP09")).toBe("MP09");
    expect(studioCodeOf("/admin/promotions")).toBe("");
  });
});

describe("Studio dashboard cards (§4.8)", () => {
  it("reads counts on the card or nested, plain or *_count, and keyed objects", () => {
    const flat = normEntityCards([{ key: "services", constructor_code: "K02", total: 10, active_count: 7, inactive_count: 2, incomplete_count: 1, list_url: "/studio/constructors/K02/records" }]);
    expect(flat?.[0]).toMatchObject({ key: "services", code: "K02", total: 10, active: 7, inactive: 2, incomplete: 1, listUrl: "/studio/constructors/K02/records" });
    const nested = normEntityCards({ packages: { code: "K03-M", counts: { total: "4", active: 3, inactive: 1, incomplete: 0 }, urls: { list: "/studio/constructors/K03-M/records?status=active" } } });
    expect(nested?.[0]).toMatchObject({ key: "packages", code: "K03-M", total: 4, active: 3, inactive: 1, incomplete: 0, listUrl: "/studio/constructors/K03-M/records?status=active" });
    // Missing counts stay unknown, never made up.
    expect(normEntityCards([{ code: "K02" }])?.[0]).toMatchObject({ total: 0, active: null, inactive: null, incomplete: null, listUrl: "" });
    expect(normEntityCards(null)).toBeNull();
    expect(normEntityCards([{ title: "no code" }])).toEqual([]);
  });
});

describe("plans without the admin overlay (§2.1)", () => {
  it("lists active plans as the backend sends them, minus the GM-retired seeds", () => {
    const plan = (slug: string, isActive = true) => ({ slug, isActive }) as never;
    const legacy = [...LEGACY_PLAN_SLUGS][0];
    expect(sellablePlans([plan("lexgo-ai-pro"), plan("old", false), plan(legacy)]).map((p: { slug: string }) => p.slug)).toEqual(["lexgo-ai-pro"]);
  });
});
