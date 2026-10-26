import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import studio from "./fixtures/studio-mp09.json";

// Promotions (TSK-537634) have their own admin page: every MP09 "aksiya"
// with its discount, targets (old → new price), period, limit and state,
// and a way into Studio to create or change one.
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
const rec = (id: string, title: string, status: string) => ({ id, record_id: id, constructor_code: "MP09", title, status, source: "studio", studio_object_id: id, updated_at: day(-1) });
const objects: Record<string, Record<string, unknown>> = {
  o1: { title: "Kuzgi reklama", target_type: "advertising", target_ids: ["t-0", "t-1"], discount_type: "percent", discount_value: 20, starts_at: day(-3), ends_at: day(10), usage_limit: 100 },
  o2: { title: "Pro tarif −30 000", target_type: "subscription", target_ids: ["t-2"], discount_type: "fixed", discount_value: 30000, starts_at: day(5), ends_at: day(30) },
  o3: { title: "Yozgi aksiya", target_type: "advertising", target_ids: ["t-0"], discount_type: "percent", discount_value: 10, starts_at: day(-60), ends_at: day(-30) },
  o4: { title: "Yangi yil", target_type: "subscription", target_ids: ["t-3"], discount_type: "percent", discount_value: 15 },
};

test("promotions have their own page with state, prices and a way into Studio", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors/MP09/records": { items: [rec("o1", "Kuzgi reklama", "published"), rec("o2", "Pro tarif −30 000", "published"), rec("o3", "Yozgi aksiya", "published"), rec("o4", "Yangi yil", "draft")], total: 4 },
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
  // Running first, then scheduled, drafts, ended.
  await expect(cards.nth(0)).toContainText("Kuzgi reklama");
  await expect(cards.nth(0)).toContainText("Hozir amalda");
  await expect(cards.nth(0)).toContainText("−20%");
  await expect(cards.nth(0)).toContainText("119 200");
  await expect(cards.nth(0)).toContainText("100 marta");
  await expect(cards.nth(1)).toContainText("Hali boshlanmagan");
  await expect(cards.nth(1)).toContainText("69 000");
  await expect(cards.nth(2)).toContainText("Qoralama");
  await expect(cards.nth(3)).toContainText("Muddati tugagan");
  await expect(page.locator(".prm-meta")).toContainText("1");
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

test("the admin menu and the ads page lead to promotions", async ({ page }) => {
  const routes = await signIn(page, ADMIN, { "/ads/products": { items: [] } });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/ads");
  await expect(page.getByRole("link", { name: "Aksiyalar" }).first()).toHaveAttribute("href", /\/admin\/promotions$/);
});
