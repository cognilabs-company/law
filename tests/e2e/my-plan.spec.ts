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
      current_plan_version: { version: 2, payload: { entitlements: [{ feature_key: "ai_requests", mode: "limited", limit: 50, reset_period: "month" }, { feature_key: "export", mode: "unlimited" }, { feature_key: "doc_analysis", mode: "limited", limit: 3, reset_period: "month" }] } },
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
  await expect(next).toHaveCount(2);
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
