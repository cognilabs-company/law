// Pure overlay helpers for admin-edited service categories. Where the
// overlay lives and how it is written: lib/services/catalogOverrides.ts. No
// backend imports here, so backend.ts can apply it inside its own listing
// functions. Subscription plans have no overlay any more (answers
// 2026-10-31 §2.1): they change only through versions on /admin/tariffs.
import { asDict } from "@/lib/http";
import type { BackendCategory, BackendPlan } from "@/lib/services/backend";

// ── Plans ─────────────────────────────────────────────────────────
// Plans the backend seeds but the product spec (GM v1.1) does not list. The
// backend still returns them as active, so the public tariff page leaves
// them out until the backend retires them (reported 2026-10-31).
export const LEGACY_PLAN_SLUGS = new Set(["lexgo-ai-yurist-advokat-seller", "lexgo-ai-jismoniy-shaxs", "biznes-abonent-basic", "biznes-abonent-standard", "biznes-abonent-premium"]);

// Public listing: inactive and legacy plans dropped.
export function sellablePlans(plans: BackendPlan[]): BackendPlan[] {
  return plans.filter((p) => p.isActive && !LEGACY_PLAN_SLUGS.has(p.slug));
}

// ── Service categories ────────────────────────────────────────────
export type CategoryOverride = { hidden?: boolean; title?: string };
export type CategoryOverrides = Record<string, CategoryOverride>;
export type OverlaidCategory = BackendCategory & { hidden: boolean; overridden: boolean };

export function categoryOverridesFrom(raw: Record<string, Record<string, unknown>>): CategoryOverrides {
  const cats = asDict(asDict(asDict(raw.order).catalog).categories);
  return Object.fromEntries(
    Object.entries(cats).map(([id, v]) => {
      const d = asDict(v);
      const o: CategoryOverride = {};
      if (typeof d.hidden === "boolean") o.hidden = d.hidden;
      if (typeof d.title === "string") o.title = d.title;
      return [id, o];
    }),
  );
}
export function applyCategoryOverrides(cats: BackendCategory[], ov: CategoryOverrides, includeHidden = false): OverlaidCategory[] {
  return cats
    .map((c) => {
      const o = ov[c.id];
      return { ...c, name: o?.title || c.name, hidden: Boolean(o?.hidden), overridden: Boolean(o?.title) };
    })
    .filter((c) => includeHidden || !c.hidden);
}
