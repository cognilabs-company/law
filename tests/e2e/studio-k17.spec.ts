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
  await expect(page.locator("label", { hasText: "Комментарий для разработчиков" })).toBeVisible();
  // TSK-639097: it says only LexGo staff read it.
  await expect(page.locator("[data-path=\"developer_note\"] .sx-aud").first()).toContainText("Только сотрудники LexGo");
  await expect(page.getByText("Клиент не видит. При публикации", { exact: false })).toBeVisible();
  expect(mock.refused).toEqual([]);
});

// TSK-692647: in Studio K17, where tariffs are managed, the tariff shows the
// developer task its published version created and the superadmin approval.
test("a tariff in Studio shows its developer task and the approval, by code and names", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K17": fx.k17,
      "/studio/constructors/K17/form-context": fx.formContext,
      "/studio/constructors/K17/records": fx.records,
      "/studio/objects": { items: [] },
      "/studio/objects/obj-k17": { id: "obj-k17", constructor_code: "K17", title: "LexGo.AI Pro", status: "published", runtime_target_id: "plan-1", payload: { plan_id: "plan-1", title: "LexGo.AI Pro", audiences: ["client"], is_active: true, is_free: false, monthly_price: 99000, benefits: [{ value: "100 ta AI so'rov" }] } },
      "/admin/subscription-plans/plan-1/versions": {
        plan_id: "plan-1",
        items: [
          { id: "v1", version: 1, status: "published", developer_task: { task_code: "TSK-444444", title: "Tarifni ulash", status: "done", deadline_at: "2026-10-01T09:00:00Z", assignees: [{ name: "Kamron" }] }, superadmin_approval: { status: "approved", approved_by: { name: "Bosh Superadmin" }, approved_at: "2026-10-02T09:00:00Z" } },
          { id: "v2", version: 2, status: "pending_approval", developer_task: { task_code: "TSK-555555", title: "Eksport limitini ulash", status: "in_progress", deadline_at: "2026-11-10T09:00:00Z", assignees: [{ name: "Akhmad" }, { name: "9d042a95-ce4a-4e37-ac56-786b2c404372" }] }, superadmin_approval: { status: "waiting" } },
        ],
      },
    } as never),
  );
  await page.goto("/ru/admin/studio/o/obj-k17");
  const box = page.locator(".trf-devbox");
  await expect(box).toContainText("версия 2", { timeout: 20000 });
  await expect(box).toContainText("TSK-555555");
  await expect(box).toContainText("Eksport limitini ulash");
  await expect(box).toContainText("Akhmad");
  // Earlier revisions keep their own task and approval, folded below.
  await box.getByText("Предыдущие версии (1)").click();
  await expect(box.locator(".trf-devbox__rev")).toContainText("Версия 1");
  await expect(box.locator(".trf-devbox__rev")).toContainText("TSK-444444");
  await expect(box.locator(".trf-devbox__rev")).toContainText("Kamron");
  expect(await box.innerText()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|in_progress|pending_approval/);
});

// TSK-490457 AC4: before a tariff goes for approval, the backend checks it
// (its remark lands on the field, in words) and then previews where the
// change shows — nothing is worked out in the browser.
test("a tariff is checked by the backend before approval, then previewed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const payload = { plan_id: "plan-1", title: "LexGo.AI Pro", audiences: ["client"], is_active: true, is_free: false, monthly_price: 99000, six_month_price: 540000, yearly_price: 990000, benefits: [{ value: "100 ta AI so'rov" }] };
  let checks = 0;
  const previews: unknown[] = [];
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K17": fx.k17,
      "/studio/constructors/K17/form-context": fx.formContext,
      "/studio/constructors/K17/records": fx.records,
      "/studio/objects": { items: [] },
      "/studio/objects/obj-k17d": { id: "obj-k17d", constructor_code: "K17", title: "LexGo.AI Pro", status: "draft", lock_version: 1, payload, current_version: { payload } },
      "/admin/subscription-plans/plan-1/versions": { plan_id: "plan-1", items: [] },
      "POST /studio/constructors/K17/validate": () => (++checks === 1 ? { ok: false, errors: [{ field: "monthly_price", message: "Narx oldingi versiyadan past bo'lmasin" }] } : { ok: true, errors: [] }),
      "POST /studio/constructors/K17/preview": (b: unknown) => (previews.push(b), { changed_fields: ["monthly_price"], where_used: [{ title: "Tariflar sahifasi" }], risk: "low", warnings: [] }),
    } as never),
  );
  await page.goto("/ru/admin/studio/o/obj-k17d");
  const send = page.getByRole("button", { name: "Отправить на согласование" }).first();
  await send.click();
  // The remark lands on the field it names, in the reader's language.
  await expect(page.getByRole("button", { name: "Цена за 1 месяц Значение не принято" })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("textbox", { name: "Цена за 1 месяц" })).toHaveAttribute("aria-invalid", "true");
  expect(previews).toHaveLength(0);
  await send.click();
  await expect.poll(() => checks).toBe(2);
  const pv = page.getByRole("region", { name: "Проверка перед отправкой" }).or(page.locator(".sx-dlg__pv")).first();
  // What the backend sees changing, named as the form names it.
  await expect(pv).toContainText("Изменения, которые видит сервер:");
  await expect(pv).toContainText("Цена за 1 месяц");
  expect(await pv.innerText()).not.toMatch(/monthly_price/);
  // (React's dev mode may ask twice; the first answer is dropped.)
  expect(previews.length).toBeGreaterThan(0);
  expect(previews.at(-1)).toMatchObject({ monthly_price: 99000 });
});
