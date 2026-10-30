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

// TSK-331025: a coefficient is versioned like every Studio record — its
// versions are listed with who made them, a replaced one reads in words,
// and going back to an earlier one asks for a reason and sends one request.
test("a coefficient's versions: who made each, a replaced one in words, and a rollback with a reason", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const payload = { title: "Staj 10 yildan ko'p", criterion_type: "experience_years", operator: "gte", threshold: 10, increase_percent: 15, is_active: true };
  const rollbacks: unknown[] = [];
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K36": fx.k36,
      "/studio/constructors/K36/form-context": fx.formContext,
      "/studio/constructors/K36/records": fx.records,
      "/studio/objects": { items: [] },
      "/studio/objects/obj-k36": {
        id: "obj-k36", constructor_code: "K36", title: "Staj 10+", status: "published", payload, current_version_id: "v3",
        versions: [
          { id: "v3", version: "3", status: "published", payload, created_at: "2026-10-20T10:00:00Z", created_by: { name: "Akhmad" } },
          { id: "v2", version: "2", status: "approved", payload: { ...payload, increase_percent: 12 }, created_at: "2026-10-15T10:00:00Z", created_by: { name: "Kamron" } },
          { id: "v1", version: "1", status: "superseded", payload: { ...payload, increase_percent: 10 }, created_at: "2026-10-10T10:00:00Z", created_by: { name: "Kamron" } },
        ],
      },
      "POST /admin/studio/objects/obj-k36/rollback": (b: unknown) => (rollbacks.push(b), { id: "obj-k36", constructor_code: "K36", title: "Staj 10+", status: "published", payload, current_version_id: "v2", versions: [] }),
    } as never),
  );
  await page.goto("/uz/admin/studio/o/obj-k36");
  await page.getByRole("button", { name: "Yozuv amallari" }).click();
  await page.getByRole("menuitem", { name: /Versiyalar/ }).click();
  const drawer = page.getByRole("dialog", { name: "Yozuv tafsilotlari" });
  const rows = drawer.getByRole("tabpanel").getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Akhmad");
  await expect(rows.nth(2)).toContainText("Almashtirilgan");
  expect(await drawer.innerText()).not.toMatch(/superseded/);
  await rows.nth(1).getByRole("button", { name: "Shu versiyaga qaytish" }).click();
  const dlg = page.getByRole("dialog", { name: "2-versiyaga qaytish" });
  await dlg.getByRole("textbox").fill("Oldingi foiz qaytarildi");
  await dlg.getByRole("button", { name: "Qaytarish" }).click();
  await expect.poll(() => rollbacks.length).toBe(1);
  expect(rollbacks[0]).toEqual({ version_id: "v2", note: "Oldingi foiz qaytarildi" });
});
