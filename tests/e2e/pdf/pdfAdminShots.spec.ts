import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "../mock";
import { adminExtra } from "./pdfAdminData";

// Superadmin pages of the owner's PDF (S1–S23), before/after evidence.
//   PDF_SHOTS=before|after PDF_THEME=light|dark npx playwright test tests/e2e/pdf/pdfAdminShots
const TAG = process.env.PDF_SHOTS || "";
const THEME = (process.env.PDF_THEME || "light") as "light" | "dark";
const OUT = join(process.cwd(), "coverage", "pdf-shots", TAG);
test.skip(!TAG, "set PDF_SHOTS=before|after");
test.setTimeout(120_000);

const PAGES = (process.env.PDF_ADMIN || "overview:/admin,ceo:/admin/ceo,services:/admin/services,tariffs:/admin/tariffs,templates:/admin/templates,register:/admin/register-requests,reviews:/admin/reviews,payments:/admin/payments,payouts:/admin/payouts,approvals:/admin/approvals,callcenter:/admin/call-center,legalaid:/admin/legal-aid,monitoring:/admin/monitoring,roles:/admin/roles,policies:/admin/policies,legal:/admin/legal")
  .split(",")
  .map((x) => x.split(":") as [string, string]);

async function theme(page: Page) {
  await page.emulateMedia({ colorScheme: THEME, reducedMotion: "reduce" });
  await page.addInitScript((th) => localStorage.setItem("lexgo_theme", th), THEME);
}

for (const [name, url] of PAGES) {
  test(`admin ${name}`, async ({ page }) => {
    await theme(page);
    await mockBackend(page, await signIn(page, ADMIN, adminExtra()));
    await page.setViewportSize({ width: 1470, height: 920 });
    await page.goto(`/uz${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    mkdirSync(OUT, { recursive: true });
    await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,nextjs-portal{display:none!important}" }).catch(() => undefined);
    await page.screenshot({ path: join(OUT, `S-${name}-desk${THEME === "light" ? "-light" : ""}.png`) });
  });
}
