import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { mockBackend, signIn } from "../mock";
import { ROP, ROP_PERMS, crmServer } from "../crmServer";

// Development helper: ROP_SHOTS=/tmp/lexgo-rop-shots captures every ROP
// workspace page (desktop, phone, dark) with the mocked CRM. Skipped in
// normal runs.
const OUT = process.env.ROP_SHOTS ?? "";

const PAGES: [string, string, (p: Page) => Promise<void>][] = [
  ["overview", "/uz/admin/crm", async (p) => void (await p.locator("[data-rop-overview]").waitFor())],
  ["leads", "/uz/admin/crm/leads?tab=all", async (p) => void (await p.locator(".crm-table tbody tr").first().waitFor())],
  ["kanban", "/uz/admin/crm/kanban?tab=all", async (p) => void (await p.locator(".crm-col").first().waitFor())],
  ["lead", "/uz/admin/crm/leads/m1", async (p) => void (await p.locator(".crm-glance").waitFor())],
  ["customers", "/uz/admin/crm/customers", async (p) => void (await p.locator(".crm-ccard, .crm-clist").first().waitFor())],
  ["operators", "/uz/admin/crm/operators", async (p) => void (await p.locator(".rop-op").first().waitFor())],
  ["live", "/uz/admin/crm/live?call=lc1", async (p) => void (await p.locator(".crm-lo__detail").first().waitFor())],
  ["robots", "/uz/admin/crm/automation", async (p) => void (await p.locator("[data-rop-robots]").waitFor())],
  ["builder", "/uz/admin/crm/automation?rule=new", async (p) => void (await p.locator("[data-rop-builder]").waitFor())],
  ["runs", "/uz/admin/crm/automation/runs?run=run7", async (p) => void (await p.locator("[data-rb-run]").waitFor())],
  ["drafts", "/uz/admin/crm/automation/drafts", async (p) => void (await p.locator("[data-draft]").first().waitFor())],
  ["templates", "/uz/admin/crm/templates", async (p) => void (await p.locator(".crm-ccard").first().waitFor())],
  ["exports", "/uz/admin/crm/exports", async (p) => void (await p.locator(".crm-card").first().waitFor())],
];

for (const mode of ["desktop", "phone", "dark"] as const) {
  test(`ROP screenshots (${mode})`, async ({ page }) => {
    test.skip(!OUT, "ROP_SHOTS not set");
    test.setTimeout(600_000);
    mkdirSync(OUT, { recursive: true });
    await page.emulateMedia({ colorScheme: mode === "dark" ? "dark" : "light", reducedMotion: "reduce" });
    await page.addInitScript((dark) => localStorage.setItem("lexgo_theme", dark ? "dark" : "light"), mode === "dark");
    await page.setViewportSize(mode === "phone" ? { width: 360, height: 780 } : { width: 1440, height: 900 });
    const { routes } = crmServer(ROP_PERMS);
    await mockBackend(page, await signIn(page, ROP, routes as never));
    for (const [name, url, ready] of PAGES) {
      await page.goto(url);
      await ready(page).catch(() => undefined);
      await page.addStyleTag({ content: ".robot-edge-zone,.lgr,nextjs-portal{display:none!important}" }).catch(() => undefined);
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/rop-${name}-${mode}.png`, fullPage: false });
    }
    // The New Lead sheet with the New Customer modal above it.
    await page.goto("/uz/admin/crm/leads?tab=all");
    await page.locator(".crm-table tbody tr").first().waitFor().catch(() => undefined);
    const newLead = page.getByRole("button", { name: "Yangi lid" }).first();
    if (await newLead.isVisible().catch(() => false)) {
      await newLead.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/rop-newlead-${mode}.png` });
    }
  });
}
