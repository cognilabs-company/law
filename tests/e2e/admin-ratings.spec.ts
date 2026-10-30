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

// TSK-332221: the admin sees the backend's rating formula — each factor's
// share, the rules and penalties — and whether every rating follows it.
test("admin sees how the rating is worked out and whether every rating is current", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/admin/reviews": [],
    "/admin/marketplace/ratings/policy": {
      constructor_code: "K37",
      policy: { client_reviews_weight: 45, completion_rate_weight: 15, response_score_weight: 10, acceptance_rate_weight: 10, verified_experience_weight: 15, verified_achievements_weight: 5, cold_start_score: 60, review_confidence_count: 10, complaint_penalty_points: 5, complaint_penalty_cap: 25, refund_penalty_points: 3, refund_penalty_cap: 15, policy_version: 3, source: "default" },
      studio_url: "/admin/studio/c/K37",
    },
    "/admin/marketplace/ratings/status": { policy_version: 3, profiles: 79, current: 75, stale: 4, missing: 0, revision_pending: 0, ready: true, reconciliation_hours: 6 },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/reviews");
  const card = page.locator(".rpol");
  await expect(card).toContainText("Политика: версия 3");
  const weights = card.locator(".rpol__weights li");
  await expect(weights).toHaveCount(6);
  await expect(weights.first()).toContainText("Оценки клиентов");
  await expect(weights.first()).toContainText("45%");
  await expect(card).toContainText("Новый специалист начинает с 60 баллов.");
  await expect(card).toContainText("Каждая обоснованная жалоба −5 баллов (всего не больше −25).");
  await expect(card.locator(".rpol__status")).toContainText("4 рейтингов ещё не обновлены (всего 79)");
  await expect(card.getByRole("link", { name: "Изменить в Studio" })).toHaveAttribute("href", /\/admin\/studio\/c\/K37$/);
  expect(await card.innerText()).not.toMatch(/_weight|cold_start|client_reviews/);
});
