import { expect, test } from "@playwright/test";
import { ADMIN, CLIENT, mockBackend, signIn } from "./mock";

// Backend contract of 26 Oct 2026: advertising activation, plan quotes with
// promotions, per-mode document plan rules and runtime document access.

const readiness = (mode: string, ready: boolean) => ({
  ready,
  mode,
  activated_at: mode === "active" ? "2026-10-26T10:00:00Z" : null,
  activated_by: mode === "active" ? { id: "u-admin", name: "Test Superadmin" } : null,
  paused_at: null,
  reason: "",
  clients: { current: ready ? 510 : 104, required: 500, met: ready, excluded_nonproduction: 10 },
  rated_verified_sellers: { current: ready ? 52 : 26, required: 50, met: ready, excluded_nonproduction: 4 },
  premium_minimum_rating: 4,
  checkout_enabled: mode === "active",
});

test("advertising: activation waits for readiness and goes through a reasoned confirmation", async ({ page }) => {
  let state = readiness("test", false);
  let activatedWith: unknown = null;
  const routes = await signIn(page, ADMIN, {
    "/ads/products": { items: [] },
    "/admin/marketplace/advertising-readiness": () => state,
    "POST /admin/marketplace/advertising-activation": (b: unknown) => ((activatedWith = b), (state = readiness("active", true)), state),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/ads");
  const panel = page.locator(".adsr");
  await expect(panel).toContainText("Test rejimi");
  await expect(panel).toContainText("10 ta test/demo hisobga olinmadi");
  await expect(panel.getByRole("button", { name: "Sotuvni ochish" })).toBeDisabled();

  state = readiness("test", true);
  await page.reload();
  await panel.getByRole("button", { name: "Sotuvni ochish" }).click();
  const dialog = page.getByRole("dialog", { name: "Reklama sotuvini ochasizmi?" });
  const go = dialog.getByRole("button", { name: "Sotuvni ochish" });
  await expect(go).toBeDisabled();
  await dialog.getByRole("textbox").fill("Production reklama tasdiqlandi");
  await go.click();
  await expect.poll(() => activatedWith).toEqual({ reason: "Production reklama tasdiqlandi" });
  await expect(panel).toContainText("Sotuv ochiq");
  await expect(panel).toContainText("Test Superadmin");
  await expect(panel.getByRole("button", { name: "Sotuvni to'xtatish" })).toBeVisible();
});

test("plans: a running promotion shows on the card from the backend's quote", async ({ page }) => {
  const quotes: string[] = [];
  const routes = await signIn(page, CLIENT, {
    "/subscription-plans": [
      { id: "p-free", slug: "lexgo-ai-free", name: "LexGo.AI Free", price: 0, monthly_price: 0, is_active: true, audiences: ["client"] },
      { id: "p-pro", slug: "lexgo-ai-pro", name: "LexGo.AI Pro", price: 99000, monthly_price: 99000, is_active: true, audiences: ["client"] },
    ],
    "/subscription-plans/p-pro/quote": (_b: unknown, url: URL) => (
      quotes.push(url.searchParams.get("billing_period") ?? ""),
      { plan_id: "p-pro", billing_period: "monthly", months: 1, base_amount: 99000, discount_amount: 30000, amount: 69000, currency: "UZS", campaign: { id: "c1", title: "Kuzgi chegirma", discount_type: "fixed", discount_value: 30000, ends_at: "2026-11-01T00:00:00Z" } }
    ),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/client/subscription");
  const card = page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]');
  await expect(card).toContainText("Aksiya −30 000");
  await expect(card).toContainText("Kuzgi chegirma: 69 000");
  expect(quotes[0]).toBe("monthly");
});

test("document settings: a per-mode plan rule and download plans go into the draft", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  const settings = { allowed_formats: ["pdf", "docx"], max_file_mb: 25, included_pages: 10, page_pricing: [], extra_page_price: 15000, modes: ["manual", "lawyer", "review", "analysis"], plan_requirements: {}, review_policy: {}, download_policy: {}, currency: "UZS" };
  const routes = await signIn(page, ADMIN, {
    "/document-service-settings/runtime": { settings, version: 1, settings_id: null },
    "/admin/document-service-settings": { active: null, versions: [] },
    "/subscription-plans": [{ id: "p-pro", slug: "pro", name: "LexGo.AI Pro", price: 99000, is_active: true, audiences: ["client"] }],
    "POST /admin/document-service-settings": (b: unknown) => ((sent = b as Record<string, unknown>), { id: "v2", version: 2, status: "draft", settings: b }),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/document-settings");
  await page.getByRole("button", { name: "Yangi versiya tayyorlash" }).click();
  await page.getByRole("switch", { name: /Hujjat tahlili/ }).click();
  await page.locator(".dss-mode[data-on]").getByRole("button", { name: "LexGo.AI Pro" }).click();
  await page.getByRole("switch", { name: "Yuklab olish uchun tarif kerak" }).click();
  await page.getByRole("group", { name: "Yuklab olishga ruxsat beruvchi tariflar" }).getByRole("button", { name: "LexGo.AI Pro" }).click();
  await page.getByRole("button", { name: "Qoralama sifatida saqlash" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toMatchObject({
    plan_requirements: { required: false, per_mode: { analysis: { required: true, plan_ids: ["p-pro"] } } },
    download_policy: { plan_required: true, plan_ids: ["p-pro"] },
  });
});

test("document analysis follows the runtime access for this user", async ({ page }) => {
  const settings = { allowed_formats: ["pdf"], max_file_mb: 25, included_pages: 10, page_pricing: [], extra_page_price: 15000, modes: ["analysis"], plan_requirements: {}, review_policy: {}, download_policy: {}, currency: "UZS" };
  const routes = await signIn(page, CLIENT, {
    "/document-service-settings/runtime": { settings, version: 2, settings_id: "s2", access: { analysis: { allowed: false, code: "document_plan_not_allowed", mode: "analysis", plan_id: "p-free" } } },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/client/doc-analysis");
  await expect(page.getByRole("link", { name: "Tarifni tanlash" })).toBeVisible();
});
