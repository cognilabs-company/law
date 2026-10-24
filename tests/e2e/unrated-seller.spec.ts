import { expect, test } from "@playwright/test";
import { mockBackend } from "./mock";

// "Unrated sellers must be shown as 'Not rated yet', not as 5.0"
// (enterprise contract §15), even when the API also sends a 5.
const SELLER = "u-new";
const seller = { user_id: SELLER, name: "Yangi Advokat", seller_type: "advokat", region: "tashkent", rating: 5, reviews_count: 0, rating_status: "unrated", specializations: ["meros"], is_verified: true };

test("an unrated seller never shows 5.0, in the list or on the profile", async ({ page }) => {
  await mockBackend(page, {
    "/marketplace/lawyers": { items: [seller], count: 1, total: 1 },
    [`/marketplace/lawyers/${SELLER}`]: seller,
    [`/marketplace/lawyers/${SELLER}/services`]: { items: [] },
  });
  await page.goto("/ru/lawyers");
  await expect(page.getByText("Yangi Advokat").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/5[,.]0/);
  // Specialisations read in Russian.
  await expect(page.getByText(/Наследство/).first()).toBeVisible();
  await page.goto(`/ru/lawyers/${SELLER}`);
  await expect(page.getByRole("heading", { name: "Yangi Advokat" }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/5[,.]0/);
});
