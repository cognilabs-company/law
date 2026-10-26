import { expect, test } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import studio from "./fixtures/studio-mp09.json";

// MP09 creates a discount directly: no "existing campaign" picker, targets
// follow the chosen target type, and the payload carries no campaign_id.
test("a promotion picks targets of its type only and sends no campaign_id", async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors": studio.constructors,
    "/studio/constructors/MP09": studio.mp09,
    "/studio/constructors/MP09/form-context": studio.formContext,
    "/studio/reference/promotion-targets": studio.targets,
    "/studio/objects": { items: [], total: 0 },
    "POST /studio/constructors/MP09/validate": { ok: true, errors: [] },
    "POST /studio/objects": (body: unknown) => {
      created = body as Record<string, unknown>;
      return { id: "obj-mp09", constructor_code: "MP09", title: "x", status: "draft" };
    },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/studio/o/new?new=MP09");
  await expect(page.getByText("Скидка на тарифы подписки")).toBeVisible();
  await expect(page.getByText(/Существующ|Mavjud kampaniya/)).toHaveCount(0);

  await page.getByText("Скидка на тарифы подписки").click();
  const picker = page.getByRole("combobox", { name: /Пакеты или тарифы/ });
  await picker.click();
  await expect(page.getByRole("option", { name: /LexGo\.AI Pro/ })).toBeVisible();
  // Each target shows its type and price, to weigh a fixed discount against.
  await expect(page.getByRole("option", { name: /LexGo\.AI Pro/ })).toContainText("99 000");
  await expect(page.getByRole("option", { name: /Profile boost/ })).toHaveCount(0);
  await page.getByRole("option", { name: /LexGo\.AI Pro/ }).click();
  await page.keyboard.press("Escape");

  // Switching the type empties the pick and offers the other targets.
  await page.getByText("Скидка на рекламные пакеты").click();
  await page.getByRole("combobox", { name: /Пакеты или тарифы/ }).click();
  await expect(page.getByRole("option", { name: /Profile boost/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /LexGo\.AI Pro/ })).toHaveCount(0);
  await page.getByRole("option", { name: /Profile boost/ }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("textbox", { name: /Название|Nomi|title/i }).first().fill("Kuzgi chegirma");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => created).not.toBeNull();
  const payload = (created as unknown as { payload: Record<string, unknown> }).payload;
  expect(payload).not.toHaveProperty("campaign_id");
  expect(payload).toMatchObject({ target_type: "advertising", target_ids: ["t-0"] });
  expect(mock.refused).toEqual([]);
});

// The editor shows what the buyer will pay for each chosen target, never
// below zero, before anything is submitted (TSK-537634).
test("a promotion previews the discounted price of each chosen target", async ({ page }) => {
  const routes = await signIn(page, ADMIN, {
    "/studio/constructors": studio.constructors,
    "/studio/constructors/MP09": studio.mp09,
    "/studio/constructors/MP09/form-context": studio.formContext,
    "/studio/reference/promotion-targets": studio.targets,
    "/studio/objects": { items: [], total: 0 },
    "POST /studio/constructors/MP09/validate": { ok: true, errors: [] },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/studio/o/new?new=MP09");
  const preview = page.locator(".sx-promo");
  await expect(preview).toContainText("Xaridor uchun natija");
  await expect(preview).toContainText("kamida bitta reklama paketi yoki tarifni tanlang");

  await page.getByText("Reklama paketlariga chegirma").click();
  await page.getByRole("combobox", { name: /paket|tarif/i }).first().click();
  await page.getByRole("option", { name: /Profile boost/ }).click();
  await page.getByRole("option", { name: /Marketplace banner/ }).click();
  await page.keyboard.press("Escape");
  await expect(preview.getByRole("row")).toHaveCount(3);
  await expect(preview).toContainText("149 000");

  await page.getByRole("radiogroup", { name: "Chegirma turi" }).getByText("Foiz", { exact: true }).click();
  await page.getByRole("textbox", { name: /Chegirma (foizi|miqdori)/ }).fill("20");
  await expect(preview.locator(".sx-promo__off")).toHaveText("−20%");
  await expect(preview.getByRole("row", { name: /Profile boost/ })).toContainText("119 200");
  await expect(preview.getByRole("row", { name: /Marketplace banner/ })).toContainText("239 200");
  await expect(preview.locator(".sx-promo__state")).toHaveText("Muddatsiz");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(preview).toBeVisible();
  const box = await preview.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
