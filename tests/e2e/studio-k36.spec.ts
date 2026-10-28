import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import fx from "./fixtures/studio-k36.json";

// TSK-331025 — the price-coefficient constructor (K36, live schema
// 2026-10-24): ready criteria as cards with a line each, human condition
// names, fields that follow the condition, no raw codes anywhere.
test("coefficient form: ready criteria, the condition decides the fields, nothing raw", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K36": fx.k36,
      "/studio/constructors/K36/form-context": fx.formContext,
      "/studio/constructors/K36/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/new?new=K36");
  const crit = page.getByRole("radiogroup", { name: /Nimaga qarab/ });
  await expect(crit).toBeVisible({ timeout: 20000 });
  for (const c of ["Hudud", "Umumiy tajriba", "LexGo tasdiqlagan", "Mijozlar bahosi", "Yakunlash ulushi", "Superadvokat"]) await expect(crit.getByRole("radio", { name: new RegExp(`^${c}`) })).toBeVisible();
  const body = await page.locator("main").innerText();
  expect(body).not.toMatch(/lawyer_experience|Lawyer experience|Lexgo verified|Completion rate|\bgte\b/);
  // The category only matters for experience in a category or sector.
  await expect(page.getByText("Subkategoriya", { exact: true })).toHaveCount(0);
  await crit.getByRole("radio", { name: /^Kategoriyadagi tajriba/ }).check({ force: true });
  await expect(page.getByText("Subkategoriya", { exact: true })).toBeVisible();
  // The condition decides which threshold fields show.
  const op = page.getByRole("radiogroup", { name: /Shart/ });
  await op.getByRole("radio", { name: /Oraliqda/ }).check({ force: true });
  await expect(page.getByText("Dan", { exact: true })).toBeVisible();
  await expect(page.getByText("Gacha", { exact: true })).toBeVisible();
  await expect(page.getByText("Chegara", { exact: true })).toHaveCount(0);
  await op.getByRole("radio", { name: /Kamida/ }).check({ force: true });
  await expect(page.getByText("Chegara", { exact: true })).toBeVisible();
  await expect(page.getByText("Dan", { exact: true })).toHaveCount(0);
});
