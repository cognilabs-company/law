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
  // TSK-881437: the owner's exact name; the backend's "Bajarish ro'yxati" never shows.
  await expect(page.getByText("Ushbu xizmat doirasida bajariladigan ishlarning cheklisti").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Bajarish ro.yxati/)).toHaveCount(0);
  // TSK-331025: the K36 coefficients are picked with the price, not left in "Asosiy".
  await expect(page.locator('[data-section="K02__price"]')).toContainText("Advokat narx koeffitsiyentlari");
  await expect(page.locator('[data-section="asosiy"]')).not.toContainText("Advokat narx koeffitsiyentlari");
  // TSK-856179: the duration unit reads Kun / Soat / Daqiqa, capitalised.
  const delivery = page.locator('[data-section="K02__delivery"]');
  await delivery.scrollIntoViewIfNeeded();
  const unitText = await delivery.innerText();
  expect(unitText).toMatch(/Kun|Soat|Daqiqa/);
  expect(unitText).not.toMatch(/(^|\s)(kun|soat|daqiqa)(\s|$)/m);
  // TSK-942891: a Studio select shows hover (border and background) and a focus ring.
  const box = page.locator('[data-section="K02__delivery"] .sx-picker__box').first();
  await expect(box).toBeVisible();
  await box.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const rest = await box.evaluate((el) => { const c = getComputedStyle(el); return `${c.borderColor}|${c.backgroundColor}`; });
  await box.hover();
  await expect.poll(() => box.evaluate((el) => { const c = getComputedStyle(el); return `${c.borderColor}|${c.backgroundColor}`; })).not.toBe(rest);
  await page.mouse.move(0, 0);
  await box.locator(".sx-picker__trigger").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => box.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
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

// TSK-938937: adding a question is a real dropdown — a contrasting control
// with a chevron that opens the answer types; the picked type makes the row.
test("adding a question opens a menu of answer types and the row takes the picked one", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  const add = page.getByRole("button", { name: "Savol qo'shish" }).first();
  await expect(add).toBeVisible({ timeout: 20000 });
  await expect(add).toHaveAttribute("aria-haspopup", "menu");
  await expect(add).toHaveClass(/sx-btn--add/);
  await add.click();
  const menu = page.getByRole("menu", { name: "Savol qo'shish" });
  await expect(menu.getByRole("menuitem", { name: "Qisqa matn" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Sana" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Sana" }).click();
  await expect(menu).toHaveCount(0);
  // The new row says its answer type.
  await expect(page.locator(".sx-rep__row").filter({ hasText: "Sana" }).first()).toBeVisible();
});
