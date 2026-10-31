import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn, type Routes } from "./mock";
import studio from "./fixtures/studio-k31.json";
import { shots } from "./experienceShots";

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

  // TSK-602765: names are unique after normalising case, spaces and
  // punctuation. A taken name offers the existing rule; the backend's 409
  // reads in words and points at that rule, never at a code.
  test("a taken rule name offers the existing rule; the backend's 409 reads in words", async ({ page }) => {
    const { mock } = await open(page, "/ru/admin/studio/o/new?new=K31&rule=new");
    await page.route(/\/studio\/objects$/, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: { code: "rule_title_exists", existing_rule_id: "rule-1", existing_rule_key: "maxfiylik-siyosati" } }) })
        : route.fallback(),
    );
    await page.getByRole("textbox", { name: /Название правила/ }).fill("  MAXFIYLIK   siyosati! ");
    const twin = page.getByText("Правило с таким названием уже есть").first();
    await expect(twin).toBeVisible();
    await expect(page.getByText("Maxfiylik siyosati", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(twin).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(/rule_title_exists|rule-1|maxfiylik-siyosati/);
    expect(mock.refused).toEqual([]);
  });

  // Backend answers 2026-10-31 §4.1: a rule the form hasn't loaded, named
  // only by existing_rule_id / existing_rule_key. The note offers "Open the
  // existing rule" under its title (the name it clashed on), never its id
  // or key.
  test("rule_title_exists for a rule not in the list offers to open it by its title", async ({ page }) => {
    const { mock } = await open(page, "/ru/admin/studio/o/new?new=K31&rule=new");
    await page.route(/\/studio\/objects$/, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: { code: "rule_title_exists", existing_rule_id: "rule-9", existing_rule_key: "qaytarish-key" } }) })
        : route.fallback(),
    );
    await page.getByRole("textbox", { name: /Название правила/ }).fill("Qaytarish tartibi");
    // Not a local twin: nothing is said before saving.
    await expect(page.getByText("Правило с таким названием уже есть")).toHaveCount(0);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    const note = page.locator(".sx-rtw");
    await expect(note.getByText("Правило с таким названием уже есть")).toBeVisible();
    await expect(note.getByText("Qaytarish tartibi", { exact: true })).toBeVisible();
    const link = note.getByRole("link", { name: "Открыть существующее правило" });
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toMatch(/\/admin\/studio\/c\/K31\?q=Qaytarish\+tartibi&source=runtime$/);
    // The name field says it in words too.
    await expect(page.getByText("Правило с таким названием уже есть — выберите существующее.").first()).toBeAttached();
    expect(await page.locator("main").innerText()).not.toMatch(/rule_title_exists|rule-9|qaytarish-key/);
    expect(mock.refused).toEqual([]);
    if (process.env.EXPERIENCE_SHOTS) await shots(page, "studio-k31-rule-title-exists", note);
  });

  // The same code as a plain string detail reads in words too.
  test("a plain string rule_title_exists detail reads in words", async ({ page }) => {
    await open(page, "/ru/admin/studio/o/new?new=K31&rule=new");
    await page.route(/\/studio\/objects$/, (route) =>
      route.request().method() === "POST" ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: "rule_title_exists" }) }) : route.fallback(),
    );
    await page.getByRole("textbox", { name: /Название правила/ }).fill("Qaytarish tartibi");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText(/Правило с таким названием уже есть/).first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(/rule_title_exists/);
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
