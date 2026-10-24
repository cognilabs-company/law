import { expect, test } from "@playwright/test";

// Post-deployment smoke check of a deployed site (SMOKE_URL), read-only:
// every request that is not a read is refused before it leaves the
// browser, so no order, payment or message can be created. Run with
//   SMOKE_URL=https://law-two-tau.vercel.app npm run smoke

const BASE = process.env.SMOKE_URL ?? "";
test.skip(!BASE, "SMOKE_URL is not set");

const PAGES = ["/uz", "/ru", "/en", "/uz/lawyers", "/ru/services", "/uz/subscription", "/ru/warranty", "/uz/login"];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    return route.fulfill({ status: 418, body: "read-only smoke check" });
  });
});

for (const path of PAGES) {
  test(`${path} loads without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), "HTTP status").toBeLessThan(400);
    await expect(page.locator("body")).not.toBeEmpty();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
}

test("the API answers through the site", async ({ request }) => {
  const res = await request.get(`${BASE}/api/backend/marketplace/runtime-capabilities`);
  expect(res.status()).toBeLessThan(500);
});
