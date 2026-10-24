import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import studio from "./fixtures/studio-k31.json";

// Constructors removed from Studio (23 Oct 2026) cannot be opened from an
// old link: it lands on the Studio home with the contract's message.
for (const url of ["/ru/admin/studio/c/SEC01", "/ru/admin/studio/o/new?new=K10"]) {
  test(`a stale link (${url}) lands on the Studio home`, async ({ page }) => {
    const routes = await signIn(page, ADMIN, {
      "/studio/constructors": studio.constructors,
      "/studio/constructors/SEC01": { status: 404, json: { detail: "Studio constructor topilmadi" } },
      "/studio/constructors/K10": { status: 404, json: { detail: "Studio constructor topilmadi" } },
    });
    await mockBackend(page, routes);
    await page.goto(url);
    await expect(page).toHaveURL(/\/admin\/studio\?retired=/);
    await expect(page.getByText("Этим конструктором больше не управляют из Studio.")).toBeVisible();
  });
}
