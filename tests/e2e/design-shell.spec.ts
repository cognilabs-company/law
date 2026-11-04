import { expect, test } from "@playwright/test";
import { mockBackend, signIn, type Who } from "./mock";
import { ADVOCATE_S, CLIENT_M, LAWYER, prepare, shoot } from "./design1920/shots";
import { mocksFor } from "./design1920/data";

// LexGo 1920 design: every cabinet page sits in the same shell — the dark
// navy sidebar with grouped sections, and the header with the date line or
// breadcrumb, the big title, search, help, bell, language and avatar menu.

const PAGES: Record<"client" | "advocate" | "lawyer", string[]> = {
  client: ["", "sos", "urgent", "services", "lawyers", "ai", "works", "marketplace-orders", "documents", "messages", "subscription", "support", "feedback", "profile", "notifications"],
  advocate: ["", "opportunities", "marketplace-orders", "urgent", "document-requests", "cases", "clients", "calendar", "tasks", "files", "organization", "assistant", "messages", "meetings", "services", "referrals", "subscription", "profile", "support", "feedback"],
  lawyer: ["", "marketplace", "marketplace-orders", "urgent", "document-requests", "cases", "clients", "calendar", "tasks", "files", "documents", "assistant", "chat", "meetings", "services", "referrals", "subscription", "profile", "support", "feedback"],
};
const WHO: Record<string, Who> = { client: CLIENT_M, advocate: ADVOCATE_S, lawyer: LAWYER };

for (const role of ["client", "advocate", "lawyer"] as const) {
  test(`${role}: the 1920 shell frames every sidebar page`, async ({ page }) => {
    test.setTimeout(600_000);
    await prepare(page);
    const routes = await signIn(page, WHO[role], mocksFor(role));
    await mockBackend(page, routes);
    for (const p of PAGES[role]) {
      await page.goto(`/uz/portal/${role}${p ? `/${p}` : ""}`);
      await expect(page.locator(".portal.lx .lx-sb")).toBeVisible();
      await expect(page.locator(".lx-top h1")).not.toBeEmpty();
      await page.waitForTimeout(1200);
      const name = `shell-${role}-${p || "dashboard"}`;
      // Full length for the pages drawn in the design, the first screen for the rest.
      const full = ["", "lawyers", "feedback"].includes(p);
      await shoot(page, name, "desktop", full);
      if (process.env.LX_ALL_WIDTHS) {
        await shoot(page, name, "phone", full);
        await page.setViewportSize({ width: 1920, height: 1080 });
      }
      // no horizontal overflow at the design width
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  });
}
