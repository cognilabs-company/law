import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// Switching the language from the account menu used to strip <html data-opx>
// (the old shell's cleanup ran after the new shell had set it), so every
// call-center colour variable vanished, and it dropped ?tab=, so the operator
// landed back on the first page. Only reproduces on a production build.
test("call center keeps its look and its queue after a language switch", async ({ page }) => {
  const routes = await signIn(page, CALL_CENTER, { "/call-center/urgent-advokat/requests": { items: [], count: 0 } });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=urgent");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-opx", "1");

  await page.getByRole("button", { name: "Меню аккаунта" }).click();
  await page.locator(".opx-me__lang", { hasText: "UZ" }).click();
  await page.waitForURL(/\/uz\/admin\/call-center\?tab=urgent$/);
  await page.waitForTimeout(1500);
  await expect(html).toHaveAttribute("data-opx", "1");
  await expect(html).toHaveAttribute("data-opx-theme", /dark|light/);
});
