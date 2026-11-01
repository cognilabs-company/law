// Pure overlay helpers for admin-edited service categories. Where the
// overlay lives and how it is written: lib/services/catalogOverrides.ts. No
// backend imports here, so backend.ts can apply it inside its own listing
// functions. Subscription plans have no overlay any more (answers
// 2026-10-31 §2.1): they change only through versions on /admin/tariffs.
import { asDict } from "@/lib/http";
import type { BackendCategory, BackendPlan } from "@/lib/services/backend";

// ── Plans ─────────────────────────────────────────────────────────
// Public listing: the plans the backend says are active, and only those.
// The five seeded plans the product spec (GM v1.1) does not list are still
// active, and there is no safe rule or retire endpoint for them yet
// (backend answers 2026-11-01 Q10): the frontend no longer hides them by a
// slug list of its own — they go once the backend makes them inactive.
export function sellablePlans(plans: BackendPlan[]): BackendPlan[] {
  return plans.filter((p) => p.isActive);
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
