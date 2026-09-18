// Pure overlay helpers for admin-edited subscription plans / service
// categories. Where the overlays live and how they are written:
// lib/services/catalogOverrides.ts. No backend imports here, so backend.ts
// can apply the overlay inside its own listing functions.
import { asArr, asDict, asNum, asStr } from "@/lib/http";
import type { BackendCategory, BackendPlan } from "@/lib/services/backend";

// ── Plans ─────────────────────────────────────────────────────────
export type PlanOverride = {
  hidden?: boolean; // "deleted" for the UI
  title?: string;
  description?: string;
  audience?: string;
  monthly_price?: number;
  six_month_price?: number;
  yearly_price?: number;
  prepaid_yearly_price?: number;
  benefits?: string[];
  is_giftable?: boolean;
  is_active?: boolean;
};
export type PlanOverrides = Record<string, PlanOverride>;

// Plans the backend seeds but the product spec (GM v1.1) does not list —
// hidden everywhere unless an admin restores them.
export const LEGACY_PLAN_SLUGS = new Set(["lexgo-ai-yurist-advokat-seller", "lexgo-ai-jismoniy-shaxs", "biznes-abonent-basic", "biznes-abonent-standard", "biznes-abonent-premium"]);

function normPlanOverride(v: unknown): PlanOverride {
  const d = asDict(v);
  const o: PlanOverride = {};
  if (typeof d.hidden === "boolean") o.hidden = d.hidden;
  if (typeof d.title === "string") o.title = d.title;
  if (typeof d.description === "string") o.description = d.description;
  if (typeof d.audience === "string") o.audience = d.audience;
  for (const k of ["monthly_price", "six_month_price", "yearly_price", "prepaid_yearly_price"] as const) if (d[k] != null) o[k] = asNum(d[k]);
  if (Array.isArray(d.benefits)) o.benefits = asArr(d.benefits).map((x) => asStr(x));
  if (typeof d.is_giftable === "boolean") o.is_giftable = d.is_giftable;
  if (typeof d.is_active === "boolean") o.is_active = d.is_active;
  return o;
}
export function planOverridesFrom(raw: Record<string, Record<string, unknown>>): PlanOverrides {
  const ov = asDict(asDict(raw.payment).plans);
  return Object.fromEntries(Object.entries(asDict(ov.overrides)).map(([slug, v]) => [slug, normPlanOverride(v)]));
}
export const isPlanHidden = (slug: string, ov: PlanOverrides): boolean => ov[slug]?.hidden ?? LEGACY_PLAN_SLUGS.has(slug);

export type OverlaidPlan = BackendPlan & { overridden: boolean; hidden: boolean };
// The backend plan with the admin overlay applied. `overridden` marks rows
// the admin changed (shown as a tag).
export function applyPlanOverride(p: BackendPlan, ov: PlanOverrides): OverlaidPlan {
  const o = ov[p.slug];
  const hidden = isPlanHidden(p.slug, ov);
  if (!o) return { ...p, overridden: false, hidden };
  const monthly = o.monthly_price ?? p.monthlyPrice;
  return {
    ...p,
    name: o.title ?? p.name,
    title: o.title ?? p.title,
    description: o.description ?? p.description,
    audience: o.audience ?? p.audience,
    price: monthly,
    monthlyPrice: monthly,
    sixMonthPrice: o.six_month_price ?? p.sixMonthPrice,
    yearlyPrice: o.yearly_price ?? p.yearlyPrice,
    prepaidYearlyPrice: o.prepaid_yearly_price ?? p.prepaidYearlyPrice,
    features: o.benefits ?? p.features,
    benefits: o.benefits ?? p.benefits,
    isGiftable: o.is_giftable ?? p.isGiftable,
    isActive: o.is_active ?? p.isActive,
    overridden: Object.keys(o).some((k) => k !== "hidden"),
    hidden,
  };
}
// Public listing: overlay applied, hidden and inactive plans dropped.
export function applyPlanOverrides(plans: BackendPlan[], ov: PlanOverrides): BackendPlan[] {
  return plans.map((p) => applyPlanOverride(p, ov)).filter((p) => !p.hidden && p.isActive);
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
