import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { mockBackend, signIn } from "../mock";
import { mocksFor } from "../design1920/data";
import { ADVOCATE_S } from "../design1920/shots";
import { advocateExtra } from "./pdfData";

// Before/after evidence for the owner's PDF «Tezkor Himoya platforma
// o'zgarishlar» (2026-11-27). Not a regression test: run on demand with
//   PDF_SHOTS=before|after npx playwright test tests/e2e/pdf
const TAG = process.env.PDF_SHOTS || "";
const OUT = join(process.cwd(), "coverage", "pdf-shots", TAG);
test.skip(!TAG, "set PDF_SHOTS=before|after to take the shots");

const SIZES = { desk: { width: 1470, height: 920 }, phone: { width: 375, height: 812 } } as const;

async function dark(page: Page) {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("lexgo_theme", "dark");
    localStorage.setItem("lexgo_sidebar_collapsed", "0");
  });
}

async function shoot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,nextjs-portal{display:none!important}" }).catch(() => undefined);
  for (const [size, vp] of Object.entries(SIZES)) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${name}-${size}.png`) });
  }
}

const K = [
  ["K1-orders", "/uz/portal/advocate/marketplace-orders"],
  ["K2-calendar", "/uz/portal/advocate/calendar"],
  ["K3-tasks", "/uz/portal/advocate/tasks"],
  ["K4-ai", "/uz/portal/advocate/assistant"],
  ["K5-messages", "/uz/portal/advocate/messages?room=r1"],
  ["K6-meetings", "/uz/portal/advocate/meetings"],
  ["K7-promotion", "/uz/portal/advocate/promotion"],
  ["K8-tariffs", "/uz/portal/advocate/subscription"],
] as const;

for (const [name, url] of K) {
  test(`pdf ${name}`, async ({ page }) => {
    await dark(page);
    const mock = await mockBackend(page, await signIn(page, ADVOCATE_S, { ...mocksFor("advocate"), ...advocateExtra() }));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shoot(page, name);
    writeFileSync(join(OUT, `${name}.calls.json`), JSON.stringify([...new Set(mock.calls.filter((c) => c.method === "GET").map((c) => c.path))], null, 1));
  });
}
