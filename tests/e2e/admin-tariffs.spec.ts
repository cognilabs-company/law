import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn, type Routes } from "./mock";
import fx from "./fixtures/studio-k17-v3.json";

// Tariffs (answers 2026-10-31 §2.1, owner decision §6.1): the feature
// registry and versioned plans on /admin/tariffs replaced the old plan
// editor and its policy overlay. Published versions are read-only, a change
// is a draft the backend checks before it is published, and Studio K17
// keeps the client-facing benefit lines.
const SHOTS = process.env.TARIFF_SHOTS;
const PLAN = { id: "plan-1", slug: "lexgo-pro", title: "LexGo.AI Pro", name: "LexGo.AI Pro", price: 99000, monthly_price: 99000, currency: "UZS", is_active: true, billing_type: "subscription", plan_type: "client", audiences: ["client"] };
const LITE = { id: "plan-2", slug: "lexgo-lite", title: "LexGo.AI Lite", name: "LexGo.AI Lite", price: 49000, monthly_price: 49000, currency: "UZS", is_active: true, audiences: ["client"], sort_order: 1 };
const FEATURES = {
  items: [
    { id: "f1", key: "ai_requests", title: "AI so'rovlari", unit: "request", allowed_reset_periods: ["rolling_30_days", "day"] },
    { id: "f2", key: "export", title: "Eksport", unit: "export", allowed_reset_periods: ["rolling_30_days"] },
  ],
  count: 2,
  modes: ["unavailable", "limited", "unlimited"],
  reset_periods: ["rolling_30_days", "day", "lifetime"],
};
const payload = { title: "LexGo.AI Pro", prices: { monthly: 99000 }, entitlements: [{ feature_key: "ai_requests", mode: "limited", limit: 100, reset_period: "rolling_30_days" }, { feature_key: "export", mode: "unlimited" }] };
const constructors = fx.constructors;
// A catalog after the backend's sync dropped K17: gone from the list and from every group.
const dropK17 = (v: unknown): unknown =>
  Array.isArray(v) ? v.filter((x) => x !== "K17" && (x as { code?: string })?.code !== "K17").map(dropK17) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dropK17(x)])) : v;
const noK17 = dropK17(fx.constructors);

async function open(page: Page, extra: Routes, opts: { studio?: unknown; path?: string } = {}) {
  const routes = await signIn(page, ADMIN, {
    "/admin/subscription-plans": [PLAN, LITE],
    "/subscription-plans": [PLAN, LITE],
    "/admin/subscription-features": FEATURES,
    "/studio/constructors": opts.studio ?? constructors,
    ...extra,
  });
  const mock = await mockBackend(page, routes);
  await page.goto(opts.path ?? "/ru/admin/tariffs");
  await expect(page.getByRole("heading", { name: "Пакетные тарифы", level: 2 })).toBeVisible();
  return mock;
}

test("the old plans address opens the tariffs page, which the admin menu lists", async ({ page }) => {
  await open(page, { "/admin/subscription-plans/plan-1/versions": { plan_id: "plan-1", current_version_id: "v1", items: [{ id: "v1", version: 1, status: "published", payload }] } }, { path: "/ru/admin/plans" });
  await expect(page).toHaveURL(/\/ru\/admin\/tariffs$/);
  await expect(page.getByRole("link", { name: "Пакетные тарифы" }).first()).toHaveAttribute("href", /\/admin\/tariffs$/);
});

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
  });
  const panel = page.getByRole("region", { name: /Версии «LexGo.AI Pro»/ });
  await expect(panel.getByText("Текущая", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Опубликованную версию менять нельзя/)).toBeVisible();
  // What a version grants, in words: the limited one resets every 30 days.
  const grants = panel.locator(".trf-grants").first();
  await expect(grants).toContainText("Запросы к ИИ");
  await expect(grants).toContainText("100 · Каждые 30 дней");
  await expect(grants).toContainText("Без лимита");

  const publish = panel.getByRole("button", { name: "Опубликовать" });
  await expect(publish).toBeDisabled();
  await panel.getByRole("button", { name: "Проверить" }).click();
  // The backend's issue in words — never the raw field path.
  await expect(panel.getByText("Возможность 1: Limit musbat bo'lishi kerak")).toBeVisible();
  expect(await panel.innerText()).not.toMatch(/entitlements\.0|positive|rolling_30_days|ai_requests/);
  await expect(publish).toBeDisabled();

  check = { ok: true, errors: [] };
  await panel.getByRole("button", { name: "Проверить" }).click();
  await expect(panel.getByText("Проверка пройдена — можно публиковать.")).toBeVisible();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(panel.getByText(/Версия опубликована/)).toBeVisible();
  expect(sent).toEqual(["validate", "validate", "publish"]);
});

test("picking another tariff shows its versions; a new draft starts from the current version", async ({ page }) => {
  const drafts: unknown[] = [];
  let liteItems: Record<string, unknown>[] = [{ id: "l1", version: 1, status: "published", payload: { ...payload, title: "Lite" } }];
  await open(page, {
    "/admin/subscription-plans/plan-1/versions": { plan_id: "plan-1", current_version_id: "v1", items: [{ id: "v1", version: 1, status: "published", payload }] },
    "/admin/subscription-plans/plan-2/versions": () => ({ plan_id: "plan-2", current_version_id: "l1", items: liteItems }),
    "POST /admin/subscription-plans/plan-2/drafts": (b: unknown) => {
      drafts.push(b);
      liteItems = [...liteItems, { id: "l2", version: 2, status: "draft", payload: b, validation: { ok: null, errors: [] } }];
      return liteItems[1];
    },
  });
  await page.locator(".trf-plans").getByRole("button", { name: /LexGo.AI Lite/ }).click();
  const panel = page.getByRole("region", { name: /Версии «LexGo.AI Lite»/ });
  await panel.getByRole("button", { name: /Новый черновик/ }).click();
  await expect.poll(() => drafts.length).toBe(1);
  expect(drafts[0]).toMatchObject({ title: "Lite", entitlements: payload.entitlements });
  // The new draft opens for editing right away.
  await expect(panel.getByRole("button", { name: "Сохранить черновик" })).toBeVisible();
});

test("a draft's entitlements come from the registry and follow its rules", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await open(page, {
    "/admin/subscription-plans/plan-1/versions": {
      plan_id: "plan-1",
      current_version_id: "v1",
      items: [
        { id: "v1", version: 1, status: "published", payload },
        { id: "v2", version: 2, status: "draft", payload: { ...payload, entitlements: [payload.entitlements[0]] }, validation: { ok: null, errors: [] } },
      ],
    },
    "PATCH /admin/subscription-plan-versions/v2": (body: unknown) => {
      saved = body as Record<string, unknown>;
      return { id: "v2", version: 2, status: "draft", payload: body, validation: { ok: true, errors: [] } };
    },
  });
  const panel = page.getByRole("region", { name: /Версии «LexGo.AI Pro»/ });
  await panel.getByRole("button", { name: "Изменить" }).click();
  await panel.getByRole("button", { name: "Добавить возможность" }).click();
  // The handmade Select: the registry's features, by their LexGo names.
  const features = panel.getByRole("button", { name: /Возможность/ });
  await features.last().click();
  await page.getByRole("listbox").getByRole("option", { name: "Запросы к ИИ" }).click();
  await expect(panel.getByText("Эта возможность уже есть")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Сохранить черновик" })).toBeDisabled();
  await features.last().click();
  await page.getByRole("listbox").getByRole("option", { name: "Экспорт", exact: true }).click();
  await expect(panel.locator("select")).toHaveCount(0);
  await expect(panel.getByText("Укажите положительный лимит")).toBeVisible();
  await panel.getByRole("textbox", { name: "Лимит" }).last().fill("5");
  await panel.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect((saved as unknown as { entitlements: unknown[] }).entitlements).toEqual([
    { feature_key: "ai_requests", mode: "limited", limit: 100, reset_period: "rolling_30_days" },
    { feature_key: "export", mode: "limited", limit: 5 },
  ]);
});

test("the feature registry: modes, the 30-day reset, adding a feature, and a taken key", async ({ page }) => {
  const posts: unknown[] = [];
  let items = [...FEATURES.items];
  await open(page, {
    "/admin/subscription-features": () => ({ ...FEATURES, items }),
    "/admin/subscription-plans/plan-1/versions": { plan_id: "plan-1", current_version_id: "", items: [] },
    "POST /admin/subscription-features": (b: unknown) => {
      posts.push(b);
      const key = (b as { key: string }).key;
      if (key === "ai_requests") return { status: 409, json: { detail: { code: "feature_key_exists" } } };
      const f = { id: "f3", key, title: (b as { title: string }).title, unit: "", allowed_reset_periods: ["rolling_30_days"] };
      items = [...items, f];
      return f;
    },
  });
  await page.getByRole("tab", { name: "Реестр возможностей" }).click();
  const pane = page.getByRole("tabpanel");
  await expect(pane.locator(".trf-modes li")).toHaveCount(3);
  await expect(pane.locator(".trf-modes")).toContainText("С лимитом");
  await expect(pane.getByText(/обновляются каждые 30 дней с начала подписки/)).toBeVisible();
  // Features by name, units in words; the key is never shown.
  await expect(pane.getByText("Запросы к ИИ")).toBeVisible();
  await expect(pane.locator("table")).toContainText("запросы");
  await expect(pane.locator("table")).toContainText("Каждые 30 дней");
  await expect(pane.locator("code")).toHaveCount(0);
  expect(await pane.innerText()).not.toMatch(/rolling_30_days|ai_requests|\brequest\b/);
  // There is no edit on the backend, and the page says so.
  await expect(pane.getByText(/Переименовать или удалить возможность пока нельзя/)).toBeVisible();

  await pane.getByRole("textbox", { name: "Ключ" }).fill("ai_requests");
  await pane.getByRole("textbox", { name: "Название" }).fill("AI");
  await pane.getByText("Каждые 30 дней", { exact: true }).last().click();
  await expect(pane.getByRole("checkbox", { name: "Каждые 30 дней" })).toBeChecked();
  await pane.getByRole("button", { name: "Добавить возможность" }).click();
  await expect(pane.getByText("Такой ключ уже есть — выберите другой.")).toBeVisible();

  await pane.getByRole("textbox", { name: "Ключ" }).fill("case_law_search");
  await pane.getByRole("textbox", { name: "Название" }).fill("Sud amaliyoti");
  await pane.getByRole("button", { name: "Добавить возможность" }).click();
  await expect(pane.getByText("Возможность добавлена.")).toBeVisible();
  await expect(pane.locator("table")).toContainText("Поиск судебной практики");
  expect(posts[1]).toMatchObject({ key: "case_law_search", title: "Sud amaliyoti", allowed_reset_periods: ["rolling_30_days"] });
});

test("the old plan editor is gone: no create, edit, hide or delete, and nothing written to policies", async ({ page }) => {
  const mock = await open(page, { "/admin/subscription-plans/plan-1/versions": { plan_id: "plan-1", current_version_id: "v1", items: [{ id: "v1", version: 1, status: "published", payload }] } });
  for (const name of ["Редактировать", "Удалить", "Скрыть", "Сбросить", "Деактивировать"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page.locator("input[placeholder='premium']")).toHaveCount(0);
  // A new tariff starts in Studio K17, which the catalog lists.
  await expect(page.getByRole("link", { name: "Новый тариф в Studio" })).toHaveAttribute("href", /\/admin\/studio\/o\/new\?new=K17$/);
  await expect(page.getByRole("link", { name: "Преимущества в Studio" })).toHaveAttribute("href", /\/admin\/studio\/c\/K17$/);
  // K17's role in words: benefit lines, while limits come from the version.
  await expect(page.locator(".trf-how")).toContainText("сами лимиты задаёт версия");
  expect(mock.calls.some((c) => /\/admin\/platform\/policies/.test(c.path))).toBe(false);
  expect(mock.refused).toEqual([]);
  if (SHOTS) {
    for (const width of [1440, 390]) {
      // Reload at each width so the shell lays out for it (no drawer mid-slide).
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Пакетные тарифы", level: 2 })).toBeVisible();
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
        await expect(page.locator(".trf-v").first()).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/tariffs-versions-${width}-${theme}.png`, fullPage: true });
        await page.getByRole("tab", { name: "Реестр возможностей" }).click();
        await expect(page.locator(".trf-modes")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/tariffs-registry-${width}-${theme}.png`, fullPage: true });
        await page.getByRole("tab", { name: "Тарифы и версии" }).click();
      }
    }
  }
});

test("without K17 in the Studio catalog there is no link into it", async ({ page }) => {
  await open(page, { "/admin/subscription-plans/plan-1/versions": { plan_id: "plan-1", current_version_id: "", items: [] } }, { studio: noK17 });
  await expect(page.locator(".trf-plan").first()).toBeVisible();
  await expect(page.getByText("У этого тарифа ещё нет версий (создан до версионирования).")).toBeVisible();
  await expect(page.locator('a[href*="/admin/studio/c/K17"], a[href*="new=K17"]')).toHaveCount(0);
});

test("on a phone the tariff is picked with the handmade select and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, {
    "/admin/subscription-plans/plan-1/versions": { plan_id: "plan-1", current_version_id: "v1", items: [{ id: "v1", version: 1, status: "published", payload }] },
    "/admin/subscription-plans/plan-2/versions": { plan_id: "plan-2", current_version_id: "l1", items: [{ id: "l1", version: 1, status: "published", payload }] },
  });
  await expect(page.locator(".trf-plans")).toBeHidden();
  await page.getByRole("button", { name: /^Тариф/ }).click();
  await page.getByRole("listbox").getByRole("option", { name: /LexGo.AI Lite/ }).click();
  await expect(page.getByRole("region", { name: /Версии «LexGo.AI Lite»/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
