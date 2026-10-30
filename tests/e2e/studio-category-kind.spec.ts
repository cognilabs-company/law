import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import fx from "./fixtures/studio-k02.json";

// TSK-232286: adding a category first asks what is being made — a category
// or a subcategory. A subcategory can't go on without its parent; a
// top-level category goes on without one.
test("a new category asks category or subcategory first; a subcategory needs its parent", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const mock = await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/ru/admin/studio/o/new?new=K01");
  const gate = page.locator("form.sx-ck--page");
  await expect(gate).toContainText("Что вы создаёте?", { timeout: 20000 });
  await gate.getByRole("button", { name: "Продолжить" }).click();
  await expect(gate).toContainText("Выберите категорию или подкатегорию.");

  // A subcategory without its parent is stopped.
  await gate.getByText("Подкатегория", { exact: true }).click();
  await expect(gate).toContainText("Родительская категория");
  await gate.getByRole("button", { name: "Продолжить" }).click();
  await expect(gate).toContainText("Выберите родительскую категорию для подкатегории.");
  await expect(page).not.toHaveURL(/kind=/);

  // A top-level category goes on, and carries no parent.
  await gate.getByText("Категория", { exact: true }).click();
  await expect(gate).toContainText("родительская категория не выбирается и не отправляется");
  await gate.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/kind=root/);
  await expect(page).not.toHaveURL(/parent=/);
  expect(mock.refused).toEqual([]);
});
