import { expect, test } from "@playwright/test";
import { ADMIN, ADVOCATE, mockBackend, signIn } from "./mock";
import { shots } from "./experienceShots";

// Backend contracts added on 24 Oct 2026: document services' global
// settings, a tariff version's change preview and the seller rating
// breakdown. Payloads trimmed from the live responses of that day.

const SHOTS = process.env.SHOTS ?? "";
const settings = { allowed_formats: ["pdf", "doc", "docx"], max_file_mb: 25, included_pages: 10, page_pricing: [{ min_pages: 11, max_pages: 30, amount: 12000 }], extra_page_price: 15000, modes: ["manual", "lawyer", "review", "analysis"], plan_requirements: {}, review_policy: {}, download_policy: {}, currency: "UZS" };

test("document settings: rules in effect, history, and a draft published after confirming", async ({ page }) => {
  let published = false;
  const routes = await signIn(page, ADMIN, {
    "/document-service-settings/runtime": () => ({ settings, version: published ? 2 : 1, settings_id: published ? "v2" : "v1" }),
    "/admin/document-service-settings": () => ({
      active: { id: published ? "v2" : "v1", version: published ? 2 : 1, status: "published", settings, published_at: "2026-10-24T10:00:00Z" },
      versions: [
        { id: "v1", version: 1, status: published ? "superseded" : "published", settings, published_at: "2026-10-24T10:00:00Z" },
        { id: "v2", version: 2, status: published ? "published" : "draft", settings: { ...settings, extra_page_price: 18000 }, created_at: "2026-10-24T11:00:00Z" },
      ],
    }),
    "POST /admin/document-service-settings/v2/publish": () => ((published = true), { id: "v2", version: 2, status: "published", settings }),
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/admin/document-settings");
  await expect(page.getByRole("heading", { level: 2, name: "Hujjat xizmatlari sozlamalari" })).toBeVisible();
  await expect(page.getByText("15 000 so'm").first()).toBeVisible();
  await expect(page.getByText("11–30 sahifa").first()).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/docsettings.png`, fullPage: true });
  await page.getByRole("button", { name: "Nashr qilish" }).click();
  const dialog = page.getByRole("dialog", { name: "Versiya 2 ni nashr qilasizmi?" });
  await dialog.getByRole("button", { name: "Nashr qilish" }).click();
  await expect(page.getByText("Versiya 2 nashr qilindi.")).toBeVisible();
  expect(mock.count("POST", /\/admin\/document-service-settings\/v2\/publish$/)).toBe(1);
});

// TSK-136097: an earlier version comes back with a rollback after a
// confirmation; the history says who made each version live.
test("document settings: an earlier version comes back after confirming, and the history names who", async ({ page }) => {
  let rolled = false;
  const routes = await signIn(page, ADMIN, {
    "/document-service-settings/runtime": () => ({ settings, version: rolled ? 1 : 2, settings_id: rolled ? "v1" : "v2" }),
    "/admin/document-service-settings": () => ({
      active: { id: rolled ? "v1" : "v2", version: rolled ? 1 : 2, status: "published", settings, published_at: "2026-10-25T10:00:00Z" },
      versions: [
        { id: "v1", version: 1, status: rolled ? "published" : "superseded", settings, published_at: "2026-10-24T10:00:00Z", published_by: { name: "Dilnoza Admin" } },
        { id: "v2", version: 2, status: rolled ? "superseded" : "published", settings: { ...settings, extra_page_price: 18000 }, published_at: "2026-10-25T10:00:00Z", published_by: { name: "Akmal Admin" } },
      ],
    }),
    "POST /admin/document-service-settings/v1/rollback": () => ((rolled = true), { id: "v1", version: 1, status: "published", settings }),
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/admin/document-settings");
  await expect(page.locator(".dss-v__by").filter({ hasText: "Faollashtirgan:" }).filter({ hasText: "Dilnoza Admin" }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Shu versiyaga qaytish" }).click();
  const dialog = page.getByRole("dialog", { name: "Versiya 1 ga qaytasizmi?" });
  await dialog.getByRole("button", { name: "Shu versiyaga qaytish" }).click();
  await expect(page.getByText("Versiya 1 qayta faollashtirildi.")).toBeVisible();
  expect(mock.count("POST", /\/admin\/document-service-settings\/v1\/rollback$/)).toBe(1);
});

// Backend answers 2026-10-31 §4.5: a version names its publisher only by
// published_by_user_id. The page shows that person's name from the staff
// directory it may read (GET /admin/users), a neutral "Administrator" when
// it can't, and never the id.
test("document settings: the publisher id reads as a name, else a neutral word, never the id", async ({ page }) => {
  const PUB = "6f1c2b9e-0000-4000-8000-00000000a001";
  const GONE = "6f1c2b9e-0000-4000-8000-00000000a0ff";
  const routes = await signIn(page, ADMIN, {
    "/document-service-settings/runtime": { settings, version: 2, settings_id: "v2" },
    "/admin/document-service-settings": {
      active: { id: "v2", version: 2, status: "published", settings, published_at: "2026-10-25T10:00:00Z", published_by_user_id: PUB },
      versions: [
        { id: "v1", version: 1, status: "superseded", settings, published_at: "2026-10-24T10:00:00Z", published_by_user_id: GONE },
        { id: "v2", version: 2, status: "published", settings: { ...settings, extra_page_price: 18000 }, published_at: "2026-10-25T10:00:00Z", published_by_user_id: PUB },
      ],
    },
    "/admin/users": { items: [{ id: PUB, name: "Malika Rahimova", role: "admin", roles: [], phone: "+998901234567", account_status: "active" }] },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/document-settings");
  const by = page.locator(".dss-v__by");
  await expect(by.filter({ hasText: "Malika Rahimova" })).toHaveCount(1, { timeout: 20000 });
  await expect(by.filter({ hasText: "Malika Rahimova" }).locator(".staffp__av")).toHaveText("MR");
  await expect(by.filter({ hasText: "Administrator" })).toHaveCount(1);
  expect(await page.locator("main").innerText()).not.toMatch(/6f1c2b9e|published_by/);
  await shots(page, "docsettings-publisher", by.first());
});

test("document settings: a draft is checked before it is sent", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/document-service-settings/runtime": { settings, version: 1, settings_id: null },
    "/admin/document-service-settings": { active: null, versions: [] },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/admin/document-settings");
  await page.getByRole("button", { name: "Yangi versiya tayyorlash" }).click();
  for (const f of ["PDF", "DOC", "DOCX"]) await page.getByRole("button", { name: f, exact: true }).first().click();
  await page.getByRole("button", { name: "Qoralama sifatida saqlash" }).click();
  await expect(page.getByText("Kamida bitta formatni tanlang")).toBeVisible();
  expect(mock.count("POST", /\/admin\/document-service-settings$/)).toBe(0);
});

test("document settings: plan, review and download rules go into the draft", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  const routes = await signIn(page, ADMIN, {
    "/document-service-settings/runtime": { settings, version: 1, settings_id: null },
    "/admin/document-service-settings": { active: null, versions: [] },
    "/subscription-plans": [{ id: "p-pro", slug: "pro", name: "LexGo.AI Pro", price: 99000, is_active: true, audiences: ["client"] }],
    "POST /admin/document-service-settings": (body: unknown) => ((sent = body as Record<string, unknown>), { id: "v2", version: 2, status: "draft", settings: body }),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/document-settings");
  await expect(page.getByText("Hamma uchun ochiq")).toBeVisible();
  await page.getByRole("button", { name: "Yangi versiya tayyorlash" }).click();
  await page.getByRole("switch", { name: "Faqat tarifi borlar foydalana oladi" }).click();
  await page.getByRole("button", { name: "Qoralama sifatida saqlash" }).click();
  await expect(page.getByText("Kamida bitta tarif tanlang")).toBeVisible();
  expect(sent).toBeNull();
  await page.getByRole("button", { name: "LexGo.AI Pro" }).click();
  await page.getByRole("switch", { name: /mutaxassis tekshiradi/ }).click();
  await page.getByRole("button", { name: "Advokat", exact: true }).click();
  await page.getByRole("switch", { name: "Faylga suv belgisi qo'yiladi" }).click();
  await page.getByRole("button", { name: "Qoralama sifatida saqlash" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toMatchObject({
    plan_requirements: { required: true, plan_ids: ["p-pro"] },
    review_policy: { enabled: true, reviewer_type: "advokat", sla_minutes: 1440 },
    download_policy: { watermark: true, plan_required: false },
  });
});

test("tariff draft shows what publishing would change", async ({ page }) => {
  const plan = { id: "p1", slug: "shaxsiy-advokat-standard", name: "Shaxsiy advokat Standard", title: "Shaxsiy advokat Standard", price: 149000, is_active: true, audiences: ["client"] };
  const routes = await signIn(page, ADMIN, {
    "/admin/subscription-plans": [plan],
    "/admin/subscription-plans/p1/versions": { plan_id: "p1", current_version_id: "v1", items: [{ id: "v1", version: 1, status: "published", payload: {} }, { id: "v2", version: 2, status: "draft", payload: {} }] },
    "/admin/subscription-plan-versions/v2/preview": {
      version_id: "v2",
      changes: {
        fields: [{ field: "auto_renew", before: true, after: false }],
        prices: [{ period: "monthly", before: 149000, after: 159000, difference: 10000 }],
        features: { added: [{ feature_key: "template_download", mode: "limited", limit: 20, reset_period: "month" }], removed: [{ feature_key: "manual_document_fill", mode: "unlimited" }], changed: [] },
      },
      summary: { active_subscribers: 13 },
      renewal_policy: { effective_for_existing_subscribers: "next_renewal", existing_contract_immutable: true, consent_required: true, material_change: true },
    },
  });
  await mockBackend(page, routes);
  // The tariffs page (answers 2026-10-31 §2.1) shows the first tariff's versions straight away.
  await page.goto("/uz/admin/tariffs");
  await page.getByRole("button", { name: "O'zgarishlarni ko'rish" }).click();
  await expect(page.getByText("Amaldagi obunachilarga keyingi yangilanishda qo'llanadi.", { exact: false })).toBeVisible();
  await expect(page.getByText("+10 000")).toBeVisible();
  await expect(page.getByText("Qo'shiladi")).toBeVisible();
  await expect(page.getByText("Olib tashlanadi")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/plan-preview.png` });
});

test("a seller sees their rating and what it is made of; unrated reads as such", async ({ page }) => {
  const routes = await signIn(page, ADVOCATE, {
    "/marketplace/me/rating": {
      seller_user_id: "u-adv",
      public_rating: 2.35,
      ranking_score: 46.97,
      reviews_count: 0,
      rating_status: "unrated",
      components: { client_reviews: 0, completion_rate: 80, response_score: 19.72, acceptance_rate: 20, verified_experience: 0 },
      metrics: { completed_orders: 4, terminal_orders: 5, average_response_seconds: 1445, verified_experience_years: 0 },
      calculated_at: "2026-10-24T15:54:39Z",
      policy_version: 2,
      unrated_display: "Hali baholanmagan",
      penalties: { substantiated_complaints: 1, complaint_points: 4.5, refunds: 0, refund_points: 0 },
      weights: { client_reviews: 45, completion_rate: 20, response_score: 10, acceptance_rate: 10, verified_experience: 15, cold_start_replaces_client_reviews: true },
    },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/advocate");
  const card = page.locator(".rbd");
  await expect(card.getByText("Hali baholanmagan")).toBeVisible();
  await expect(card.getByText("2.4")).toHaveCount(0);
  await expect(card.getByText("Yakunlangan buyurtmalar").first()).toBeVisible();
  await expect(card.getByText("4 / 5")).toBeVisible();
  await expect(card.getByText("24 daqiqa")).toBeVisible();
  // The seller's own card also shows the weights and penalties (private).
  await expect(card.getByText("ulushi 45%")).toBeVisible();
  await expect(card.getByText("Asosli shikoyatlar: 1")).toBeVisible();
  await expect(card.getByText("−4.5")).toBeVisible();
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/rating.png` });
});
