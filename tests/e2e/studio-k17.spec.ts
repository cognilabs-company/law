import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import fx from "./fixtures/studio-k17-v3.json";

// TSK-342697 — the K17 tariff constructor on schema v3 (live 2026-10-27):
// audiences as cards, three prices unless free, the client's numbered
// benefit lines, a developer note that never reaches the client. No old
// types, per-feature toggles or trial.
test("tariff form v3: audiences, prices unless free, numbered benefits, nothing legacy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mock = await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K17": fx.k17,
      "/studio/constructors/K17/form-context": fx.formContext,
      "/studio/constructors/K17/records": fx.records,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/ru/admin/studio/o/new?new=K17");
  // Audiences are cards with a line each, not a dropdown.
  const who = page.getByRole("group", { name: "Для кого" }).last();
  await expect(who).toBeVisible({ timeout: 20000 });
  for (const a of ["Клиент", "Адвокат", "Юрист", "Организация"]) await expect(who.getByRole("checkbox", { name: new RegExp(`^${a}`) })).toBeVisible();
  // Nothing from the old tariff model.
  for (const gone of ["Тип тарифа", "Пробный период", "Правила отмены", "Правила повышения тарифа"]) await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
  // Prices go away for a free plan.
  await expect(page.getByText("Цена за 6 месяцев")).toBeVisible();
  await page.getByText("Бесплатный тариф", { exact: true }).click();
  await expect(page.getByText("Цена за 6 месяцев")).toHaveCount(0);
  await page.getByText("Бесплатный тариф", { exact: true }).click();
  await expect(page.getByText("Цена за 6 месяцев")).toBeVisible();
  // The client's lines, added in order.
  await expect(page.getByText(/клиент увидит их по порядку 1, 2, 3/)).toBeVisible();
  await page.getByRole("button", { name: "Добавить пункт" }).click();
  await expect(page.getByText("Комментарий для разработчиков")).toBeVisible();
  await expect(page.getByText("Клиент не видит. При публикации", { exact: false })).toBeVisible();
  expect(mock.refused).toEqual([]);
});
