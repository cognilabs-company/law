import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn, type Routes } from "./mock";
import studio from "./fixtures/studio-k26.json";

// Document services' global settings are one record (TSK-136097): "new"
// opens the existing one; only when none exists is a form offered.
const base: Routes = {
  "/studio/constructors": studio.constructors,
  "/studio/constructors/K26": studio.k26,
  "/studio/constructors/K26/form-context": studio.formContext,
};

test("new global settings open the existing record", async ({ page }) => {
  const routes = await signIn(page, ADMIN, { ...base, "/studio/objects": { items: [{ id: "k26-obj", constructor_code: "K26", title: "Hujjat xizmati siyosati", status: "approved" }], total: 1 } });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/studio/o/new?new=K26");
  await expect(page).toHaveURL(/\/admin\/studio\/o\/k26-obj\?single=1/);
});

test("without a record the create form appears", async ({ page }) => {
  const routes = await signIn(page, ADMIN, { ...base, "/studio/objects": { items: [], total: 0 } });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/studio/o/new?new=K26");
  await expect(page.getByText("Цены за страницы")).toBeVisible();
});
