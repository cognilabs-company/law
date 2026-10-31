import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// The subscriber's contract (contract §6): limits as the backend counts
// them, terms fixed for the period, and consent when the tariff changed.
test("my plan shows backend limits and asks consent for changed terms once", async ({ page }) => {
  const consents: unknown[] = [];
  const routes = await signIn(page, CLIENT, {
    "/subscriptions/me/features": {
      subscription_id: "sub-1",
      plan_id: "plan-1",
      plan_version: 1,
      items: [
        { feature_key: "ai_requests", mode: "limited", allowed: true, limit: 100, used: 37, remaining: 63, resets_at: "2026-11-01T00:00:00Z" },
        { feature_key: "export", mode: "unlimited", allowed: true, limit: null, used: 0, remaining: null },
        { feature_key: "doc_analysis", mode: "unavailable", allowed: false, limit: null, used: 0, remaining: null },
      ],
    },
    "/subscriptions/sub-1/contract": {
      subscription_id: "sub-1",
      status: "active",
      snapshot: { title: "LexGo.AI Pro", meta: { name: { uz: "LexGo.AI Pro", ru: "LexGo.AI Про" } }, prices: { monthly: 99000 } },
      entitlements: [
        { feature_key: "ai_requests", mode: "limited", limit: 100, reset_period: "month" },
        { feature_key: "export", mode: "unlimited" },
      ],
      current_plan_version: { version: 2, payload: { prices: { monthly: 129000 }, entitlements: [{ feature_key: "ai_requests", mode: "limited", limit: 50, reset_period: "month" }, { feature_key: "export", mode: "unlimited" }, { feature_key: "doc_analysis", mode: "limited", limit: 3, reset_period: "month" }] } },
      renewal_terms_changed: true,
      renewal_consent: null,
    },
    "POST /subscriptions/sub-1/renewal-consent": (b: unknown) => (consents.push(b), { accepted: true }),
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/portal/client/subscription");
  const card = page.locator(".myplan");
  await expect(card).toContainText("LexGo.AI Про");
  await expect(card).toContainText("Использовано 37 из 100");
  await expect(card).toContainText("Без лимита");
  await expect(card).toContainText("Недоступно");
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
  // The page never counts usage itself: nothing but the backend's numbers.
  expect(mock.calls.some((c) => /\/consume$/.test(c.path))).toBe(false);

  // TSK-206603: the new version's terms, before the consent — only what changes.
  const next = card.locator(".myplan__next li");
  await expect(next).toHaveCount(3);
  // The new price too, before the consent.
  const price = next.filter({ hasText: "Цена · Месяц" });
  await expect(price.locator("del")).toContainText(/99[\s\u00a0\u202f]000/);
  await expect(price.locator("ins")).toContainText(/129[\s\u00a0\u202f]000/);
  await expect(next.filter({ hasText: "Запросы к ИИ" })).toContainText("100 в месяц");
  await expect(next.filter({ hasText: "Запросы к ИИ" }).locator("ins")).toHaveText("50 в месяц");
  await expect(next.filter({ hasText: "Анализ документов" }).locator("ins")).toHaveText("3 в месяц");
  expect(await card.innerText()).not.toMatch(/ai_requests|doc_analysis|reset_period/);

  const accept = card.getByRole("button", { name: "Согласен с новыми условиями" });
  await accept.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect(card.getByText(/Новые условия начнут действовать/)).toBeVisible();
  expect(consents).toEqual([{ accepted: true }]);
  await expect(accept).toHaveCount(0);
});

test("the subscriber can decline new terms by not renewing", async ({ page }) => {
  const patches: unknown[] = [];
  const routes = await signIn(page, CLIENT, {
    "/subscriptions/me/features": { subscription_id: "sub-1", plan_id: "plan-1", plan_version: 1, items: [] },
    "/subscriptions/sub-1/contract": { subscription_id: "sub-1", status: "active", snapshot: { title: "Pro" }, renewal_terms_changed: true, renewal_consent: null },
    "PATCH /subscriptions/sub-1/auto-renew": (b: unknown) => (patches.push(b), { id: "sub-1", auto_renew: false }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/portal/client/subscription");
  await page.locator(".myplan").getByRole("button", { name: "Не продлевать" }).click();
  await expect(page.getByText(/Автопродление выключено/)).toBeVisible();
  expect(patches).toEqual([{ auto_renew: false }]);
});

// TSK-342697: auto-renew is the subscriber's switch, saved on the
// subscription itself; each change is sent once.
test("the autopay switch turns auto-renew off and on for the subscription", async ({ page }) => {
  const patches: unknown[] = [];
  const routes = await signIn(page, CLIENT, {
    "/clients/me": { id: "u-client", name: "Test Mijoz", subscription: { id: "sub-1", plan_id: "plan-1", plan_name: "LexGo.AI Pro", status: "active", auto_renew: true } },
    "/subscriptions/me/features": { subscription_id: "sub-1", plan_id: "plan-1", plan_version: 1, items: [] },
    "PATCH /subscriptions/sub-1/auto-renew": (b: unknown) => (patches.push(b), { auto_renew: (b as { auto_renew: boolean }).auto_renew }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/portal/client/subscription");
  const sw = page.getByRole("switch", { name: /Автоплатёж/ });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(sw).toContainText("Выключен");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(patches).toEqual([{ auto_renew: false }, { auto_renew: true }]);
});

// Answers 2026-10-31 §2.1/§2.2: a limited feature resets every 30 days (the
// backend's next reset shown when sent), and a consent already given reads
// from the contract's current state. There is no consent history to show.
test("my plan says limits reset every 30 days and shows a consent already given", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {
    "/subscriptions/me/features": {
      subscription_id: "sub-1",
      plan_id: "plan-1",
      plan_version: 2,
      items: [
        { feature_key: "ai_requests", mode: "limited", allowed: true, limit: 100, used: 10, remaining: 90, resets_at: "2026-11-20T00:00:00Z" },
        { feature_key: "doc_analysis", mode: "limited", allowed: true, limit: 5, used: 0, remaining: 5 },
        { feature_key: "brand_new_feature", title: { uz: "Yangi imkoniyat", ru: "Новая возможность" }, mode: "unlimited", allowed: true },
        { feature_key: "export", mode: "unavailable", allowed: false },
      ],
    },
    "/subscriptions/sub-1/contract": {
      subscription_id: "sub-1",
      status: "active",
      snapshot: { title: "LexGo.AI Pro", prices: { monthly: 99000 } },
      entitlements: [{ feature_key: "ai_requests", mode: "limited", limit: 100, reset_period: "rolling_30_days" }],
      current_plan_version: { version: 3, payload: { entitlements: [{ feature_key: "ai_requests", mode: "limited", limit: 200, reset_period: "rolling_30_days" }] } },
      renewal_terms_changed: true,
      renewal_consent: { accepted: true, accepted_at: "2026-10-30T09:00:00Z" },
    },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/portal/client/subscription");
  const card = page.locator(".myplan");
  const rows = card.locator(".myplan__list li");
  await expect(rows.filter({ hasText: "Запросы к ИИ" })).toContainText("Обновляется каждые 30 дней · следующее");
  await expect(rows.filter({ hasText: "Анализ документов" })).toContainText("Обновляется каждые 30 дней");
  // The backend's own name for a feature the page doesn't know.
  await expect(rows.filter({ hasText: "Новая возможность" })).toContainText("Без лимита");
  await expect(rows.filter({ hasText: "Экспорт" })).not.toContainText("30 дней");
  // Consent already given: said so, and not asked again.
  await expect(card.locator(".myplan__agreed")).toContainText("Вы согласились с новыми условиями");
  await expect(card.getByRole("button", { name: "Согласен с новыми условиями" })).toHaveCount(0);
  await expect(card.getByText(/истори/i)).toHaveCount(0);
  expect(await card.innerText()).not.toMatch(/brand_new_feature|rolling_30_days|Обновляется 1-го/);
  expect(mock.calls.some((c) => /subscriptions\/[^/]+\/consents/.test(c.path))).toBe(false);
  if (process.env.MYPLAN_SHOTS) {
    const dir = process.env.MYPLAN_SHOTS;
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((th) => document.documentElement.setAttribute("data-theme", th), theme);
      for (const w of [1440, 390]) {
        await page.setViewportSize({ width: w, height: 900 });
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: `${dir}/my-plan-features-${w}-${theme}.png` });
      }
    }
  }
});
