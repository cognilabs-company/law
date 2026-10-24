import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// Advertising opens only after the TZ market conditions (backend verdict).
test("ads page shows the backend's readiness and test-only mode", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/admin/marketplace/advertising-readiness": { ready: false, clients: { current: 104, required: 500, met: false }, rated_verified_sellers: { current: 50, required: 50, met: true }, premium_minimum_rating: 4.0 },
    "/ads": { items: [] },
    "/admin/ads": { items: [] },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/ads");
  const card = page.locator(".adsr");
  await expect(card).toContainText("Только админ и тестовый режим");
  await expect(card).toContainText("104 / 500");
  await expect(card).toContainText("Нужно ещё 396");
  await expect(card).toContainText("Выполнено");
  await expect(card).toContainText("не ниже 4.0");
});
