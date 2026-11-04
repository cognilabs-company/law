import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { Who } from "../mock";

// LexGo 1920 redesign: shared helpers for the screenshot walks that are
// compared against reference/design-lexgo-1920/*.png.

export const SHOTS = join(process.cwd(), "reference", "design-lexgo-1920", "shots");
mkdirSync(SHOTS, { recursive: true });

export const LAWYER: Who = { id: "u-law", name: "Dilnoza Misolova", phone: "+998900000007", role: "lawyer", backendRole: "yurist" };
export const CLIENT_M: Who = { id: "u-client", name: "Malika Namunova", phone: "+998900000005", role: "client", backendRole: "client" };
export const ADVOCATE_S: Who = { id: "u-adv", name: "Sardor Misolov", phone: "+998900000006", role: "advocate", backendRole: "advokat" };

export const WIDTHS = { desktop: { width: 1920, height: 1080 }, laptop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, phone: { width: 360, height: 780 } } as const;
export type Width = keyof typeof WIDTHS;

// Light theme, the design's language, the robot and toasts out of the way.
export async function prepare(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("lexgo_theme", "light");
    localStorage.setItem("lexgo_sidebar_collapsed", "0");
  });
}

export async function shoot(page: Page, name: string, width: Width = "desktop", fullPage = true): Promise<void> {
  await page.setViewportSize(WIDTHS[width]);
  await page.waitForTimeout(600);
  // The scrolling column is .pbody, not the window: expand it so a full-page
  // capture shows the whole page as the design images do.
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog{display:none!important}" }).catch(() => undefined);
  if (fullPage) {
    await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>(".portal");
      const b = document.querySelector<HTMLElement>(".pbody");
      if (p && b) {
        const h = Math.max(window.innerHeight, b.scrollHeight + 0);
        p.style.height = `${h}px`;
      }
    });
    await page.waitForTimeout(250);
  }
  // JPEG keeps the committed evidence small; the comparison is by eye.
  await page.screenshot({ path: join(SHOTS, `${name}-${width}.jpg`), fullPage, type: "jpeg", quality: 72 });
  await page.evaluate(() => {
    const p = document.querySelector<HTMLElement>(".portal");
    if (p) p.style.height = "";
  });
}
