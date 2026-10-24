import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn, type Routes } from "./mock";

// Tariff versions (contract §5) and the feature registry (§3).
const PLAN = { id: "plan-1", slug: "lexgo-pro", title: "LexGo.AI Pro", name: "LexGo.AI Pro", price: 99000, currency: "UZS", is_active: true, billing_type: "subscription", plan_type: "client" };
const FEATURES = {
  items: [
    { id: "f1", key: "ai_requests", title: "AI so'rovlari", unit: "request", allowed_reset_periods: ["day", "month", "billing_period"] },
    { id: "f2", key: "export", title: "Eksport", unit: "export", allowed_reset_periods: ["billing_period"] },
  ],
  count: 2,
  modes: ["unavailable", "limited", "unlimited"],
  reset_periods: ["day", "month", "billing_period", "lifetime"],
};
const payload = { title: "LexGo.AI Pro", prices: { monthly: 99000 }, entitlements: [{ feature_key: "ai_requests", mode: "limited", limit: 100, reset_period: "month" }] };

async function open(page: Page, extra: Routes) {
  const routes = await signIn(page, ADMIN, {
    "/admin/subscription-plans": [PLAN],
    "/subscription-plans": [PLAN],
    "/admin/subscription-features": FEATURES,
    ...extra,
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/plans");
  await expect(page.getByText("LexGo.AI Pro").first()).toBeVisible();
  return mock;
}

test("published versions are read-only; a draft publishes only after the backend check passes", async ({ page }) => {
  let check = { ok: false, errors: [{ field: "entitlements.0.limit", code: "positive", message: "Limit musbat bo'lishi kerak" }] };
  const sent: string[] = [];
  const state = {
    versions: {
      plan_id: "plan-1",
      current_version_id: "v1",
      items: [
        { id: "v1", version: 1, status: "published", published_at: "2026-10-01T10:00:00Z", payload },
        { id: "v2", version: 2, status: "draft", created_at: "2026-10-23T10:00:00Z", payload, validation: { ok: null, errors: [] } },
      ],
    },
  };
  await open(page, {
    "/admin/subscription-plans/plan-1/versions": () => state.versions,
    "POST /admin/subscription-plan-versions/v2/validate": () => (sent.push("validate"), check),
    "POST /admin/subscription-plan-versions/v2/publish": () => {
      sent.push("publish");
      state.versions = { ...state.versions, current_version_id: "v2", items: [{ ...state.versions.items[0], status: "superseded" }, { ...state.versions.items[1], status: "published" }] };
      return state.versions.items[1];
    },
    "POST /admin/subscription-plan-versions/v1/archive": { status: 409, json: { detail: { code: "published_version_cannot_be_archived" } } },
  });
  await page.getByRole("button", { name: "Версии" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Версии/ });
  await expect(dialog.getByText("Текущая", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Опубликованную версию менять нельзя/)).toBeVisible();

  const publish = dialog.getByRole("button", { name: "Опубликовать" });
  await expect(publish).toBeDisabled();
  await dialog.getByRole("button", { name: "Проверить" }).click();
  await expect(dialog.getByText("Limit musbat bo'lishi kerak")).toBeVisible();
  await expect(publish).toBeDisabled();

  check = { ok: true, errors: [] };
  await dialog.getByRole("button", { name: "Проверить" }).click();
  await expect(dialog.getByText("Проверка пройдена — можно публиковать.")).toBeVisible();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(dialog.getByText(/Версия опубликована/)).toBeVisible();
  expect(sent).toEqual(["validate", "validate", "publish"]);
});

test("a draft's entitlements come from the registry and follow its rules", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await open(page, {
    "/admin/subscription-plans/plan-1/versions": {
      plan_id: "plan-1",
      current_version_id: "v1",
      items: [
        { id: "v1", version: 1, status: "published", payload },
        { id: "v2", version: 2, status: "draft", payload, validation: { ok: null, errors: [] } },
      ],
    },
    "PATCH /admin/subscription-plan-versions/v2": (body: unknown) => {
      saved = body as Record<string, unknown>;
      return { id: "v2", version: 2, status: "draft", payload: body, validation: { ok: true, errors: [] } };
    },
  });
  await page.getByRole("button", { name: "Версии" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Версии/ });
  await dialog.getByRole("button", { name: "Изменить" }).click();
  await dialog.getByRole("button", { name: "Добавить возможность" }).click();
  const features = dialog.getByRole("combobox", { name: "Возможность" });
  // The registry's features, by their LexGo names.
  await expect(features.last().locator("option", { hasText: "Запросы к ИИ" }).or(features.last().locator("option[value='ai_requests']"))).toHaveCount(1);
  await features.last().selectOption("ai_requests");
  await expect(dialog.getByText("Эта возможность уже есть")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
  await features.last().selectOption("export");
  await expect(dialog.getByText("Укажите положительный лимит")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Лимит" }).last().fill("5");
  await dialog.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect((saved as unknown as { entitlements: unknown[] }).entitlements).toEqual([
    { feature_key: "ai_requests", mode: "limited", limit: 100, reset_period: "month" },
    { feature_key: "export", mode: "limited", limit: 5 },
  ]);
});

test("the feature registry refuses a taken key", async ({ page }) => {
  await open(page, { "POST /admin/subscription-features": { status: 409, json: { detail: { code: "feature_key_exists" } } } });
  await page.getByRole("button", { name: "Возможности тарифов" }).click();
  const dialog = page.getByRole("dialog", { name: "Возможности тарифов" });
  await expect(dialog.getByText("ai_requests")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Ключ" }).fill("ai_requests");
  await dialog.getByRole("textbox", { name: "Название" }).fill("AI");
  await dialog.getByRole("checkbox", { name: "Каждый месяц" }).check();
  await dialog.getByRole("button", { name: "Добавить возможность" }).click();
  await expect(dialog.getByText("Такой ключ уже есть — выберите другой.")).toBeVisible();
});
