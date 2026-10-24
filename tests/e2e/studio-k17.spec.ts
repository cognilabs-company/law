import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import studio from "./fixtures/studio-k17.json";

// The tariff constructor (TSK-490457): fields follow the tariff's billing
// type, features come from the registry, limits only for limited features.
test("tariff form shows only what its type uses", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors": studio.constructors,
    "/studio/constructors/K17": studio.k17,
    "/studio/constructors/K17/form-context": studio.formContext,
    "/studio/reference/subscription-features": studio.features,
    "/studio/reference/roles": studio.roles,
    "/studio/objects": { items: [] },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/studio/o/new?new=K17");
  await expect(page.getByText("Тариф для клиента")).toBeVisible();
  // The legacy free-form objects are not offered.
  await expect(page.getByText("Правила отмены")).toHaveCount(0);

  await expect(page.getByText("Пробный период", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /^Разовая оплата/ }).check({ force: true });
  await expect(page.getByText("Пробный период", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Правила повышения тарифа")).toHaveCount(0);
  await page.getByRole("radio", { name: /^Подписка/ }).check({ force: true });
  await expect(page.getByText("Пробный период", { exact: true })).toBeVisible();

  // A feature row: limit and reset only once it is limited.
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByText("Лимит", { exact: true })).toHaveCount(0);
  await page.getByText("С лимитом", { exact: true }).first().click();
  await expect(page.getByText("Лимит", { exact: true })).toBeVisible();
  await expect(page.getByText("Обновление лимита")).toBeVisible();
  expect(mock.refused).toEqual([]);
});
