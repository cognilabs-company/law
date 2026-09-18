// Admin edits the backend cannot store yet (a203556): subscription plans
// have POST only (no PATCH/DELETE) and the canonical ones are re-synced on
// every GET; service categories have POST only. Both edits are therefore
// kept as overlays in the platform policies (PUT /admin/platform/policies/
// {section}, users.manage) — server-side, versioned, shared by every admin
// and readable by guests through the public policy endpoint:
//   payment.plans.overrides[slug]   → PlanOverride
//   order.catalog.categories[id]    → CategoryOverride
// The plan writers try the real admin routes first (PATCH/DELETE) and fall
// back to the overlay only when the backend says the route is missing.
import { asDict, http } from "@/lib/http";
import { getAdminPolicies, getPlatformPolicies, isMissingRoute, putAdminPolicy } from "@/lib/services/backend";
import {
  LEGACY_PLAN_SLUGS,
  categoryOverridesFrom,
  planOverridesFrom,
  type CategoryOverride,
  type CategoryOverrides,
  type PlanOverride,
  type PlanOverrides,
} from "@/lib/catalogOverlay";

export * from "@/lib/catalogOverlay";

// Where a write landed: the backend route, or the policy overlay.
export type OverlayWrite = { via: "backend" | "overlay" };

// ── Plans ─────────────────────────────────────────────────────────
export async function getPlanOverrides(): Promise<PlanOverrides> {
  try {
    return planOverridesFrom((await getPlatformPolicies()).raw);
  } catch {
    return {};
  }
}
async function writePlanOverride(slug: string, patch: PlanOverride): Promise<void> {
  const items = await getAdminPolicies();
  const payment = items.payment ?? {};
  const plans = asDict(payment.plans);
  const overrides = asDict(plans.overrides);
  const cur = asDict(overrides[slug]);
  await putAdminPolicy("payment", { ...payment, plans: { ...plans, overrides: { ...overrides, [slug]: { ...cur, ...patch } } } });
}
// Edit: PATCH when the backend has it, else overlay.
export async function savePlan(plan: { id: string; slug: string }, patch: PlanOverride): Promise<OverlayWrite> {
  try {
    await http(`/admin/subscription-plans/${encodeURIComponent(plan.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return { via: "backend" };
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  await writePlanOverride(plan.slug, patch);
  return { via: "overlay" };
}
// Delete: DELETE when the backend has it, else hide through the overlay.
export async function removePlan(plan: { id: string; slug: string }): Promise<OverlayWrite> {
  try {
    await http(`/admin/subscription-plans/${encodeURIComponent(plan.id)}`, { method: "DELETE" });
    return { via: "backend" };
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  await writePlanOverride(plan.slug, { hidden: true });
  return { via: "overlay" };
}
export async function restorePlan(slug: string): Promise<void> {
  await writePlanOverride(slug, { hidden: false });
}
// Drop every admin change for the plan (the backend values show again).
export async function resetPlan(slug: string): Promise<void> {
  const items = await getAdminPolicies();
  const payment = items.payment ?? {};
  const plans = asDict(payment.plans);
  const overrides = { ...asDict(plans.overrides) };
  delete overrides[slug];
  // A legacy plan stays hidden by default; an explicit `hidden:false` restores it.
  if (LEGACY_PLAN_SLUGS.has(slug)) overrides[slug] = { hidden: false };
  await putAdminPolicy("payment", { ...payment, plans: { ...plans, overrides } });
}

// ── Service categories ────────────────────────────────────────────
export async function getCategoryOverrides(): Promise<CategoryOverrides> {
  try {
    return categoryOverridesFrom((await getPlatformPolicies()).raw);
  } catch {
    return {};
  }
}
async function writeCategoryOverride(id: string, patch: CategoryOverride): Promise<void> {
  const items = await getAdminPolicies();
  const order = items.order ?? {};
  const catalog = asDict(order.catalog);
  const categories = asDict(catalog.categories);
  const cur = asDict(categories[id]);
  await putAdminPolicy("order", { ...order, catalog: { ...catalog, categories: { ...categories, [id]: { ...cur, ...patch } } } });
}
export async function saveCategory(id: string, patch: { title: string }): Promise<OverlayWrite> {
  try {
    await http(`/admin/service-categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
    return { via: "backend" };
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  await writeCategoryOverride(id, patch);
  return { via: "overlay" };
}
export async function removeCategory(id: string): Promise<OverlayWrite> {
  try {
    await http(`/admin/service-categories/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { via: "backend" };
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
  }
  await writeCategoryOverride(id, { hidden: true });
  return { via: "overlay" };
}
export async function restoreCategory(id: string): Promise<void> {
  await writeCategoryOverride(id, { hidden: false });
}
export async function resetCategory(id: string): Promise<void> {
  const items = await getAdminPolicies();
  const order = items.order ?? {};
  const catalog = asDict(order.catalog);
  const categories = { ...asDict(catalog.categories) };
  delete categories[id];
  await putAdminPolicy("order", { ...order, catalog: { ...catalog, categories } });
}
