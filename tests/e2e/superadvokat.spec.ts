import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// TSK-460646 — the manual Superadvokat override: reason, period, audit
// history; only the primary superadmin can save.
const SELLER = { seller: { id: "u-adv", name: "Aziz Karimov", lexgo_id: "LG-1001", phone: "+998901112233", account_status: "active" }, seller_type: "advokat", region: "tashkent", rating: 4.9, reviews_count: 12, is_verified: true, services_count: 3, orders_total: 0, active_orders: 0, completed_orders: 0, pending_payment_orders: 0, revenue_paid: 0 };
const routesWith = (put: (b: Record<string, unknown>) => unknown, history: unknown[]) => ({
  "/admin/marketplace/overview": { stats: {} },
  "/admin/marketplace/orders": { items: [], total: 0 },
  "/admin/marketplace/sellers": { items: [SELLER], total: 1 },
  "/admin/marketplace/sellers/u-adv/superadvokat/history": () => ({ items: history, count: history.length }),
  "PUT /admin/marketplace/sellers/u-adv/superadvokat": (b: unknown) => put(b as Record<string, unknown>),
});

test("the primary superadmin grants the status with a reason and a period; the history keeps it", async ({ page }) => {
  const history: Record<string, unknown>[] = [
    // Gaps closed §17: changed_by, before / after snapshots.
    { id: "h1", status: "active", active: false, reason: "Shikoyat tasdiqlandi", starts_at: "2026-09-01T00:00:00Z", ends_at: null, changed_by_user_id: "u-boss", changed_by: { id: "u-boss", name: "Bosh admin" }, before: { active: true, starts_at: "2026-01-01T00:00:00Z", ends_at: null }, after: { active: false, starts_at: "2026-09-01T00:00:00Z", ends_at: null }, changed_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z" },
  ];
  const puts: Record<string, unknown>[] = [];
  await mockBackend(
    page,
    await signIn(
      page,
      ADMIN,
      routesWith((b) => {
        puts.push(b);
        history[0] = { ...history[0], status: "superseded" };
        history.unshift({ id: "h2", status: "active", ...b, after: { active: b.active, starts_at: b.starts_at, ends_at: b.ends_at ?? null }, before: { active: false }, changed_at: new Date().toISOString(), created_at: new Date().toISOString(), changed_by_user_id: "u-boss", changed_by: { id: "u-boss", name: "Bosh admin" } });
        return { ok: true };
      }, history) as never,
    ),
  );
  await page.goto("/uz/admin/marketplace");
  await page.getByRole("tab", { name: "Sotuvchilar" }).click();
  await page.getByRole("button", { name: "Superadvokat" }).click();
  const dlg = page.getByRole("dialog", { name: "Superadvokat maqomi" });
  await expect(dlg).toContainText("Hozir Superadvokat emas");
  await expect(dlg.locator(".sav__hist li")).toHaveCount(1);
  await expect(dlg).toContainText("Shikoyat tasdiqlandi");
  await expect(dlg.locator(".sav__hist")).toContainText("Bosh admin");
  await expect(dlg.locator(".sav__hist")).not.toContainText("u-boss");
  // A reason is required.
  await dlg.getByRole("button", { name: "Maqom berish" }).last().click();
  await expect(dlg.getByRole("alert")).toContainText("Sababni kamida 10 belgida yozing");
  expect(puts).toHaveLength(0);
  await dlg.getByRole("textbox", { name: "Sabab" }).fill("Yil advokati mukofoti uchun");
  await dlg.getByRole("button", { name: "Maqom berish" }).last().click();
  await expect(dlg).toContainText("Superadvokat maqomi berildi.");
  expect(puts[0]).toMatchObject({ active: true, reason: "Yil advokati mukofoti uchun" });
  expect(String(puts[0].starts_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(puts[0]).not.toHaveProperty("ends_at");
  await expect(dlg.locator(".sav__hist li")).toHaveCount(2);
  await expect(dlg).toContainText("Hozir Superadvokat");
});

test("another superadmin sees the lock up front; the history is not asked for", async ({ page }) => {
  // /auth/me can_set_superadvokat=false (gaps closed §16).
  const mock = await mockBackend(page, await signIn(page, { ...ADMIN, primary: false }, routesWith(() => ({ status: 403, json: { detail: { code: "primary_superadmin_required" } } }), []) as never));
  await page.goto("/uz/admin/marketplace");
  await page.getByRole("tab", { name: "Sotuvchilar" }).click();
  await page.getByRole("button", { name: "Superadvokat" }).click();
  const dlg = page.getByRole("dialog", { name: "Superadvokat maqomi" });
  await expect(dlg).toContainText("Faqat bosh superadmin o'zgartiradi");
  await expect(dlg).toContainText("Bu maqomni faqat asosiy superadmin o'zgartira oladi");
  await expect(dlg.getByRole("button", { name: "Maqom berish" }).last()).toBeDisabled();
  await expect(dlg.getByRole("textbox", { name: "Sabab" })).toBeDisabled();
  expect(mock.calls.some((c) => c.path.endsWith("/superadvokat/history"))).toBe(false);
  expect(mock.calls.some((c) => c.method === "PUT")).toBe(false);
});
