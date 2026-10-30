import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import studio from "./fixtures/studio-mp09.json";

// Promotions (TSK-537634) have their own admin page: every MP09 "aksiya"
// with its discount, targets (old → new price), period, limit and state,
// and a way into Studio to create or change one.
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
const rec = (id: string, title: string, status: string, runtime: Record<string, unknown> = {}) => ({
  id,
  record_id: id,
  constructor_code: "MP09",
  title,
  status,
  source: "studio",
  studio_object_id: id,
  updated_at: day(-1),
  actions: { pause: `/admin/promotion-campaigns/c-${id}/pause`, resume: `/admin/promotion-campaigns/c-${id}/resume` },
  ...runtime,
});
// The backend's own prices (contract 2026-10-26 §2) — deliberately not the
// browser's arithmetic, so the page is seen to show these.
const PRICES: Record<string, [string, number, number]> = { "t-0": ["Profile boost - 7 days", 149000, 118000], "t-1": ["Marketplace banner - 7 days", 299000, 238000], "t-2": ["LexGo.AI Pro", 99000, 69000], "t-3": ["Business Standard", 490000, 416500] };
const preview = (body: unknown) => ({
  ok: true,
  targets: ((body as { target_ids?: string[] }).target_ids ?? []).map((id) => ({ id, label: PRICES[id][0], base_price: PRICES[id][1], discount_amount: PRICES[id][1] - PRICES[id][2], final_price: PRICES[id][2], currency: "UZS" })),
  warnings: [],
});
const objects: Record<string, Record<string, unknown>> = {
  o1: { title: "Kuzgi reklama", target_type: "advertising", target_ids: ["t-0", "t-1"], discount_type: "percent", discount_value: 20, starts_at: day(-3), ends_at: day(10), usage_limit: 100 },
  o2: { title: "Pro tarif −30 000", target_type: "subscription", target_ids: ["t-2"], discount_type: "fixed", discount_value: 30000, starts_at: day(5), ends_at: day(30) },
  o3: { title: "Yozgi aksiya", target_type: "advertising", target_ids: ["t-0"], discount_type: "percent", discount_value: 10, starts_at: day(-60), ends_at: day(-30) },
  o4: { title: "Yangi yil", target_type: "subscription", target_ids: ["t-3"], discount_type: "percent", discount_value: 15 },
};

test("promotions have their own page with state, prices and a way into Studio", async ({ page }) => {
  let paused = false;
  let pausedWith: unknown = null;
  let resumed = 0;
  let resumedWith: unknown = null;
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors/MP09/records": () => ({
      items: [
        rec("o1", "Kuzgi reklama", "published", { runtime_status: paused ? "paused" : "active", used_count: 37, usage_limit: 100, remaining: 63, pause_reason: paused ? "Vaqtincha to'xtatildi" : "", paused_at: paused ? day(0) : null }),
        rec("o2", "Pro tarif −30 000", "published", { runtime_status: "scheduled", used_count: 0, usage_limit: null }),
        rec("o3", "Yozgi aksiya", "published", { runtime_status: "exhausted", used_count: 50, usage_limit: 50, remaining: 0 }),
        rec("o4", "Yangi yil", "draft"),
      ],
      total: 4,
    }),
    "POST /studio/constructors/MP09/preview": preview,
    "POST /admin/promotion-campaigns/c-o1/pause": (b: unknown) => ((paused = true), (pausedWith = b), { status: "paused" }),
    "POST /admin/promotion-campaigns/c-o1/resume": (b: unknown) => ((paused = false), (resumed += 1), (resumedWith = b), { status: "active" }),
    "/studio/objects/(o\\d)": (_b: unknown, url: URL) => {
      const id = url.pathname.split("/").at(-1) as string;
      return { id, constructor_code: "MP09", title: objects[id].title, status: id === "o4" ? "draft" : "published", payload: objects[id] };
    },
    "/studio/reference/promotion-targets": studio.targets,
    "/studio/constructors": studio.constructors,
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/admin/promotions");
  await expect(page.getByRole("heading", { name: "Aksiyalar", level: 2 })).toBeVisible();
  const cards = page.locator(".prm-card");
  await expect(cards).toHaveCount(4);
  // Running first, then scheduled, drafts, used up.
  await expect(cards.nth(0)).toContainText("Kuzgi reklama");
  await expect(cards.nth(0)).toContainText("Hozir amalda");
  await expect(cards.nth(0)).toContainText("−20%");
  await expect(cards.nth(0)).toContainText("118 000");
  await expect(cards.nth(0)).toContainText("37 / 100 ishlatildi");
  await expect(cards.nth(1)).toContainText("Hali boshlanmagan");
  await expect(cards.nth(1)).toContainText("69 000");
  await expect(cards.nth(2)).toContainText("Qoralama");
  await expect(cards.nth(3)).toContainText("Limit tugagan");
  await expect(cards.nth(3)).toContainText("50 / 50 ishlatildi");

  // Pause with a required reason.
  await cards.nth(0).getByRole("button", { name: "To'xtatish" }).click();
  const dialog = page.getByRole("dialog", { name: /Kuzgi reklama/ });
  const go = dialog.getByRole("button", { name: "To'xtatish" });
  await expect(go).toBeDisabled();
  await dialog.getByRole("textbox").fill("Vaqtincha to'xtatildi");
  await go.click();
  await expect.poll(() => pausedWith).toEqual({ reason: "Vaqtincha to'xtatildi" });
  await expect(page.locator(".prm-card", { hasText: "Kuzgi reklama" })).toContainText("To'xtatilgan");
  // Resume: the sale runs again.
  await page.locator(".prm-card", { hasText: "Kuzgi reklama" }).getByRole("button", { name: "Davom ettirish" }).click();
  const confirm = page.getByRole("dialog", { name: /Kuzgi reklama/ });
  await confirm.getByRole("textbox").fill("Byudjet tasdiqlandi");
  await confirm.getByRole("button", { name: "Davom ettirish" }).click();
  await expect.poll(() => resumed).toBe(1);
  expect(resumedWith).toEqual({ reason: "Byudjet tasdiqlandi" });
  await expect(page.locator(".prm-card", { hasText: "Kuzgi reklama" })).toContainText("Hozir amalda");
  await page.getByRole("tab", { name: "Tariflar" }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Yangi aksiya" })).toHaveAttribute("href", /\/admin\/studio\/o\/new\?new=MP09$/);
  await expect(cards.first().getByRole("link", { name: /Ochish/ })).toHaveAttribute("href", /\/admin\/studio\/o\/o2$/);
  if (process.env.SHOTS) {
    await page.getByRole("tab", { name: "Hammasi" }).click();
    await page.screenshot({ path: `${process.env.SHOTS}/promos-desktop.png`, fullPage: true });
  }
  expect(mock.refused).toEqual([]);
});

// TSK-537634: a promotion the backend reports as expired reads "ended" by
// name, sorts after the live ones and offers no pause.
test("an expired promotion reads as ended, after the running one, with no pause", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors/MP09/records": {
      items: [
        rec("o3", "Yozgi aksiya", "published", { runtime_status: "expired", used_count: 12, usage_limit: null }),
        rec("o1", "Kuzgi reklama", "published", { runtime_status: "active", used_count: 37, usage_limit: 100, remaining: 63 }),
      ],
      total: 2,
    },
    "POST /studio/constructors/MP09/preview": preview,
    "/studio/objects/(o\\d)": (_b: unknown, url: URL) => {
      const id = url.pathname.split("/").at(-1) as string;
      return { id, constructor_code: "MP09", title: objects[id].title, status: "published", payload: objects[id] };
    },
    "/studio/reference/promotion-targets": studio.targets,
    "/studio/constructors": studio.constructors,
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/promotions");
  const cards = page.locator(".prm-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Kuzgi reklama");
  await expect(cards.nth(1)).toContainText("Yozgi aksiya");
  await expect(cards.nth(1)).toContainText("Muddati tugagan");
  await expect(cards.nth(1).getByRole("button", { name: /To'xtatish/ })).toHaveCount(0);
  expect(await cards.nth(1).innerText()).not.toMatch(/expired/);
});

test("the admin menu and the ads page lead to promotions", async ({ page }) => {
  const routes = await signIn(page, ADMIN, { "/ads/products": { items: [] } });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/ads");
  await expect(page.getByRole("link", { name: "Aksiyalar" }).first()).toHaveAttribute("href", /\/admin\/promotions$/);
});
