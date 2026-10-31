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
    // K37 is in the Studio catalog, so its link shows (§4.7).
    "/studio/constructors": { items: [{ code: "K37", title: "Reyting siyosati" }], groups: [], journeys: [] },
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

// TSK-332221: from a review, the admin sees how that seller's rating is
// made up, factor by factor — and a status or seller kind the screen does
// not know reads in words, never its code.
test("a review's detail shows the seller's rating breakdown, never raw codes", async ({ page }) => {
  const REVIEW = { id: "rv1", status: "escalated_x", lawyer_name: "Aziz Karimov", lawyer_user_id: "u-s1", seller_type: "notarius_x", rating: 2, comment: "Kech javob berdi", created_at: "2026-10-29T10:00:00Z" };
  const mock = await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/admin/reviews": [REVIEW],
      "/admin/reviews/rv1": { review: REVIEW, seller: { id: "u-s1", name: "Aziz Karimov", phone: "" } },
      "/marketplace/lawyers/u-s1/rating": { rating_status: "rated", public_rating: 4.3, reviews_count: 14, components: { client_reviews: 82, completion_rate: 95, verified_achievements: 60, brand_new_factor: 40 } },
    }),
  );
  await page.goto("/ru/admin/reviews");
  await expect(page.locator(".rvw__st").first()).toHaveText("Другой статус");
  expect(await page.locator("main").innerText()).not.toMatch(/escalated_x|notarius_x/);
  await page.getByRole("button", { name: "Детали отзыва" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Детали отзыва" });
  await expect(dlg).toContainText("Из чего складывается рейтинг");
  await expect(dlg).toContainText("Оценки клиентов");
  await expect(dlg).toContainText("Подтверждённые достижения");
  await expect(dlg).toContainText("Другой фактор");
  await expect(dlg).toContainText("Другой статус");
  await expect(dlg).toContainText("Другой вид специалиста");
  expect(await dlg.innerText()).not.toMatch(/escalated_x|notarius_x|brand_new_factor|verified_achievements/);
  expect(mock.refused).toEqual([]);
});

// Answers 2026-10-31 §5.3: the weights are the backend's own numbers (here
// not the defaults), none are made up when it sends none, no rating is
// worked out here, and without K37 in the catalog there is no Studio link.
test("the policy shows only the backend's weights and links to Studio only when K37 is listed", async ({ page }) => {
  let policy: Record<string, unknown> = { client_reviews_weight: 40, completion_rate_weight: 20, response_score_weight: 10, acceptance_rate_weight: 10, verified_experience_weight: 12, verified_achievements_weight: 8, policy_version: 4 };
  const routes = await signIn(page, ADMIN, {
    "/admin/reviews": [],
    "/admin/marketplace/ratings/policy": () => ({ constructor_code: "K37", policy, studio_url: "/admin/studio/c/K37" }),
    "/studio/constructors": { items: [{ code: "K02", title: "Xizmatlar" }], groups: [], journeys: [] },
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/reviews");
  const card = page.locator(".rpol");
  const weights = card.locator(".rpol__weights li");
  await expect(weights).toHaveCount(6);
  await expect(weights.first()).toContainText("Оценки клиентов");
  await expect(weights.first()).toContainText("40%");
  await expect(weights.filter({ hasText: "Подтверждённые достижения" })).toContainText("8%");
  expect(await card.innerText()).not.toMatch(/45%/);
  await expect(card.getByRole("link", { name: "Изменить в Studio" })).toHaveCount(0);
  if (process.env.RATING_SHOTS) {
    const dir = process.env.RATING_SHOTS;
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((th) => document.documentElement.setAttribute("data-theme", th), theme);
      for (const w of [1440, 390]) {
        await page.setViewportSize({ width: w, height: 900 });
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: `${dir}/rating-policy-${w}-${theme}.png` });
      }
    }
  }
  // A policy without weights shows none rather than a default table.
  policy = { cold_start_score: 60, policy_version: 5 };
  await page.reload();
  await expect(card).toContainText("60");
  await expect(card.locator(".rpol__weights")).toHaveCount(0);
});
