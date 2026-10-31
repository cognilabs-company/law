// Admin edits the backend cannot store yet (a203556): service categories
// have POST only. The edit is therefore kept as an overlay in the platform
// policies (PUT /admin/platform/policies/{section}, users.manage) —
// server-side, versioned, shared by every admin and readable by guests
// through the public policy endpoint:
//   order.catalog.categories[id]    → CategoryOverride
// The writers try the real admin routes first (PATCH/DELETE) and fall back
// to the overlay only when the backend says the route is missing.
// Subscription plans have no overlay any more (answers 2026-10-31 §2.1).
import { asDict, http } from "@/lib/http";
import { getAdminPolicies, getPlatformPolicies, isMissingRoute, putAdminPolicy } from "@/lib/services/backend";
import { categoryOverridesFrom, type CategoryOverride, type CategoryOverrides } from "@/lib/catalogOverlay";

export * from "@/lib/catalogOverlay";

// Where a write landed: the backend route, or the policy overlay.
export type OverlayWrite = { via: "backend" | "overlay" };

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
