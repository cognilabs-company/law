import { expect, test } from "@playwright/test";
import ru from "../../messages/ru.json";
import { CLIENT, mockBackend, signIn } from "./mock";

// docs/PERFORMANCE.md: a click on a navigation link is answered at once (the
// pending bar), whatever the destination costs, and pages do not carry the
// message catalogue in their HTML.

test("a sidebar click shows the pending bar at once and the page follows", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {});
  await mockBackend(page, routes);
  await page.goto("/ru/portal/client");
  const link = page.locator('a[href$="/portal/client/documents"]').first();
  await expect(link).toBeVisible();

  // Hold the destination's server payload: the navigation stays pending.
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/portal\/client\/documents\?_rsc=/, async (route) => {
    await held;
    await route.continue();
  });

  await link.click();
  await expect(page.locator("html")).toHaveAttribute("data-nav-pending", "", { timeout: 1000 });
  await expect(page.locator(".navprog")).toHaveCSS("opacity", "1");
  release();
  await expect(page).toHaveURL(/\/ru\/portal\/client\/documents$/);
  await expect(page.locator("html")).not.toHaveAttribute("data-nav-pending");
});

test("the HTML of a page does not carry the message catalogue", async ({ request }) => {
  // A long string that only the admin studio uses.
  const find = (v: unknown): string | null => {
    if (typeof v === "string") return v.length > 40 && !/[<>&"']/.test(v) ? v : null;
    if (v && typeof v === "object") for (const x of Object.values(v)) { const s = find(x); if (s) return s; }
    return null;
  };
  const studioOnly = find((ru as Record<string, unknown>).studio);
  expect(studioOnly).toBeTruthy();
  const html = await (await request.get("/ru")).text();
  expect(html).not.toContain(studioOnly!);
});
