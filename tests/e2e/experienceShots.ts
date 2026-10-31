import type { Locator, Page } from "@playwright/test";

// Screenshot runs only: EXPERIENCE_SHOTS=<dir> saves a screen at 1440 and
// 390 wide, light and dark. `target` is scrolled into view first.
export async function shots(page: Page, name: string, target?: Locator): Promise<void> {
  const dir = process.env.EXPERIENCE_SHOTS;
  if (!dir) return;
  const size = page.viewportSize() ?? { width: 1360, height: 900 };
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((s) => {
      document.documentElement.setAttribute("data-theme", s);
      document.documentElement.style.colorScheme = s;
    }, scheme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 400 ? 1000 : 860 });
      await page.waitForTimeout(300);
      if (target) await target.first().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: `${dir}/${name}-${width}-${scheme}.png` });
    }
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize(size);
}
