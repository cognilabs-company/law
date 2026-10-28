import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import fx from "./fixtures/studio-k02.json";

// The service constructor's checklist in two lists by payout stage (live
// K02 schema 2026-10-28: item.payout_stage = first_checklist | final_completion):
// the advocate's items for the second 30%, and the final 40% ones.
test("service checklist: a 30% list and a final 40% list; an item can switch between them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/new?new=K02");
  const first = page.locator('.sx-k2stage[data-stage="first_checklist"]');
  const final = page.locator('.sx-k2stage[data-stage="final_completion"]');
  await first.scrollIntoViewIfNeeded({ timeout: 30000 });
  await expect(first).toContainText("30% cheklisti — ikkinchi to'lov");
  await expect(final).toContainText("Yakuniy 40% cheklisti");
  await first.getByRole("button", { name: "30% bandini qo'shish" }).click();
  await expect(first.locator(".sx-k2stage__h em")).toHaveText("1");
  await final.getByRole("button", { name: "Yakuniy band qo'shish" }).click();
  await expect(final.locator(".sx-k2stage__h em")).toHaveText("1");
  if (process.env.K02_SHOTS) {
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.K02_SHOTS}/k02-checklist.png`, fullPage: false });
  }
  // Switching an item's stage moves it to the other list.
  await first.getByRole("radio", { name: /Yakuniy 40%/ }).first().click();
  await expect(first.locator(".sx-k2stage__h em")).toHaveText("0");
  await expect(final.locator(".sx-k2stage__h em")).toHaveText("2");
});
