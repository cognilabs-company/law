import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

// Ratings are recomputed by the backend's policy; the admin only asks,
// after a confirmation, once.
test("admin recalculates marketplace ratings after confirming", async ({ page }) => {
  const calls: unknown[] = [];
  const routes = await signIn(page, ADMIN, {
    "/admin/reviews": [],
    "POST /admin/marketplace/ratings/recalculate": (b: unknown) => (calls.push(b), { updated: 12 }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/reviews");
  await page.getByRole("button", { name: "Пересчитать рейтинги" }).click();
  const dialog = page.getByRole("dialog", { name: "Пересчёт рейтингов маркетплейса" });
  await expect(dialog.getByText(/«ещё не оценён»/)).toBeVisible();
  expect(calls).toEqual([]);
  await dialog.getByRole("button", { name: "Пересчитать" }).click();
  await expect(page.getByText("Обновлено специалистов: 12").first()).toBeVisible();
  expect(calls).toHaveLength(1);
});
