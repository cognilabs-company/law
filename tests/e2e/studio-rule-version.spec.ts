import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn, type Routes } from "./mock";
import studio from "./fixtures/studio-k31.json";

// A published rule as GET /studio/reference/service-rules lists it.
const RULE = {
  id: "rule-1",
  value: "rule-1",
  label: "Maxfiylik siyosati v1.0",
  title: "Maxfiylik siyosati",
  version: "1.0",
  next_version: "1.1",
  rule_key: "maxfiylik-siyosati",
  body: "Mijoz ma'lumotlari uchinchi shaxslarga berilmaydi.",
  audience: "executor",
  scope_type: "global",
  scope_id: "",
  service_id: "",
  category_id: "",
  seller_selectable: true,
  effective_at: "2026-10-22T04:00:00+00:00",
};

async function open(page: Page, url: string) {
  const created: { body: Record<string, unknown> | null } = { body: null };
  const routes: Routes = await signIn(page, ADMIN, {
    "/studio/constructors": studio.constructors,
    "/studio/constructors/K31": studio.k31,
    "/studio/constructors/K31/form-context": studio.formContext,
    "/studio/reference/service-rules": { key: "service-rules", items: [RULE], total: 1, count: 1, limit: 50, offset: 0, has_more: false },
    "/studio/objects": { items: [], total: 0 },
    "POST /studio/constructors/K31/validate": { ok: true, errors: [] },
    "POST /studio/objects": (body: unknown) => {
      created.body = body as Record<string, unknown>;
      return { id: "obj-new", constructor_code: "K31", title: (body as { title?: string }).title ?? "", status: "draft", current_version: { payload: (body as { payload?: unknown }).payload } };
    },
  });
  const mock = await mockBackend(page, routes);
  await page.goto(url);
  return { created, mock };
}

test.describe("Studio service rule versions (K31)", () => {
  test("a new version continues the published rule; the backend numbers it", async ({ page }) => {
    const { created, mock } = await open(page, "/ru/admin/studio/o/new?new=K31");
    await page.getByText("Новая версия существующего правила").first().click();
    await page.getByRole("radio", { name: /Maxfiylik siyosati/ }).click();
    await page.getByRole("button", { name: "Создать новую версию" }).click();

    await expect(page.getByText("Новая версия правила «Maxfiylik siyosati»")).toBeVisible();
    await expect(page.getByText(/v1\.0 → v1\.1/).first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Название правила/ })).toHaveValue("Maxfiylik siyosati");
    // Keeping the rule's own name is not a duplicate.
    await expect(page.getByText(/уже есть|already/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect.poll(() => created.body).not.toBeNull();
    const payload = (created.body as { payload: Record<string, unknown> }).payload;
    expect(payload).toMatchObject({ creation_mode: "new_version", existing_rule_id: "rule-1", title: "Maxfiylik siyosati", audience: "executor", scope_type: "global" });
    // Nothing is cloned.
    expect(mock.calls.some((c) => /\/clone$/.test(c.path))).toBe(false);
  });

  test("a brand-new rule says so and continues nothing", async ({ page }) => {
    const { created } = await open(page, "/ru/admin/studio/o/new?new=K31&rule=new");
    await expect(page.getByText("Совершенно новое правило").first()).toBeVisible();
    await page.getByRole("textbox", { name: /Название правила/ }).fill("Qaytarish tartibi");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect.poll(() => created.body).not.toBeNull();
    const payload = (created.body as { payload: Record<string, unknown> }).payload;
    expect(payload.creation_mode).toBe("new");
    expect(payload).not.toHaveProperty("existing_rule_id");
  });
});
