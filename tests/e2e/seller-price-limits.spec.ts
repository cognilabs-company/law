import { expect, test } from "@playwright/test";
import { ADVOCATE, mockBackend, signIn } from "./mock";

// TSK-640502: the advocate's price range for a service. The service's top
// price is the backend's pricing_limits.potential_max_price, and a
// criterion the backend names with a key the frontend doesn't know reads
// "another criterion", never the key itself.

const SERVICE = {
  id: "s1",
  title: "Ajrashish bo'yicha da'vo",
  category_title: "Oila va nikoh",
  status: "active",
  configured_price: 100000,
  effective_price: 100000,
  is_marketplace_visible: true,
};

// Trimmed from live GET /marketplace/me/services/{id}/configuration (24 Oct 2026).
const CONFIG = {
  service_id: "s1",
  selected_price: 100000,
  maximum_price: 100000,
  minimum_listing_price: 70000,
  recommended_price: 100000,
  pricing_limits: {
    base_price: 100000,
    potential_max_price: 188760,
    maximum_increase_percent: 89,
    requirements: [
      { key: "lawyer_experience", current: 3, required: 11, unit: "year", met: false, progress_percent: 27 },
      { key: "court_streak_bonus", current: { court_streak: 1 }, required: { court_streak: 5 }, unit: "mixed", met: false, progress_percent: 20 },
    ],
  },
};

test("the service's top price comes from potential_max_price; an unknown criterion reads in words", async ({ page }) => {
  const routes = await signIn(page, ADVOCATE, {
    "/lawyers/me": { lawyer_name: "Test Advokat", region: "tashkent" },
    "/lawyers/me/services/manage": { items: [SERVICE], profile: { region: "tashkent", verification_status: "approved" } },
    "/marketplace/me/services/s1/configuration": CONFIG,
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/portal/advocate/services");
  await page.getByRole("article", { name: SERVICE.title }).getByRole("button", { name: "Изменить" }).click();

  const caps = page.locator(".svcap").first();
  await expect(caps).toBeVisible();
  // 188 760 from pricing_limits.potential_max_price — not the seller's 100 000.
  await expect(caps).toContainText(/188[\s  ]?760/);
  await expect(caps).toContainText("Юридический стаж");
  await expect(caps).toContainText("Другой критерий");
  await expect(caps).toContainText("Другой показатель");
  await expect(caps).not.toContainText(/court|streak/i);
  expect(mock.refused).toEqual([]);
});
