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

// The backend's own health check, through the site's proxy (TSK-961148).
test("the backend reports healthy", async ({ request }) => {
  const res = await request.get(`${BASE}/api/backend/health`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: "ok" });
});

// The deployment names its build, so a release can be matched to a commit.
test("the deployed build names its commit", async ({ request }) => {
  const res = await request.get(`${BASE}/api/version`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { sha?: unknown };
  expect(typeof body.sha).toBe("string");
});

// Beyond page loads: a signed-out visitor is sent to sign in, never shown
// a portal; and the read-only guard itself holds, so this check can never
// write to production.
test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto(`${BASE}/uz/portal/client`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 20_000 });
});

test("a write from the page never leaves the browser", async ({ page }) => {
  await page.goto(`${BASE}/uz`, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(async (url) => (await fetch(url, { method: "POST", body: "{}" })).status, `${BASE}/api/backend/health`);
  expect(status).toBe(418);
});
