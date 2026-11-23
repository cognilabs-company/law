import { expect, test } from "@playwright/test";
import { ADMIN, ADVOCATE, mockBackend, signIn } from "./mock";
import fx from "./fixtures/studio-k02.json";

// SERVICE_PRICING_NO_MAX_PRICE (2026-11-23): there is no manual max_price.
// The seller's system price (base × the coefficients met) is the ceiling
// (pricing_limits.max_allowed), the floor is 50% of it (min_allowed), and
// the seller's price is always sent explicitly — an empty one would fall
// back to the catalog base price.

const N = "[\\s\\u00a0\\u202f]?";
const num = (s: string) => new RegExp(s.replace(" ", N));

const LIMITS = {
  base_price: 200000,
  max_allowed: 230000,
  maximum_price: 230000,
  recommended_price: 230000,
  min_allowed: 115000,
  minimum_listing_price: 115000,
  potential_max_price: 260000,
  current_increase_percent: 15,
  maximum_increase_percent: 30,
  maximum_listing_discount_percent: 50,
  currency: "UZS",
  coefficients: [
    { id: "c1", title: "Yuristlik tajribasi 5 yildan ko'p", criterion_type: "lawyer_experience", operator: "gte", current: 7, threshold: 5, increase_percent: 15, met: true },
    { id: "c2", title: "Mijozlar bahosi 4.8 dan yuqori", criterion_type: "client_rating", operator: "gte", current: 4.5, threshold: 4.8, increase_percent: 15, met: false },
  ],
  modifiers: [
    { code: "c1", label: "Yuristlik tajribasi 5 yildan ko'p", percent: 15, amount: 30000, met: true },
    { code: "c2", label: "Mijozlar bahosi 4.8 dan yuqori", percent: 15, amount: 0, met: false },
  ],
  policy: { source: "selected_service_coefficients", combination: "additive_percent", absolute_cap: null },
};

const SERVICE = {
  id: "s1",
  title: "Ajrashish bo'yicha da'vo",
  category_title: "Oila va nikoh",
  base_price: 200000,
  status: "active",
  selected_price: 230000,
  configured_price: 230000,
  effective_price: 230000,
  is_marketplace_visible: true,
  pricing_limits: LIMITS,
};

const PROFILE = { region: "tashkent", verification_status: "approved", is_verified: true, lawyer_name: "Test Advokat" };

const sellerRoutes = (extra: Record<string, unknown> = {}) => ({
  "/lawyers/me": { lawyer_name: "Test Advokat", region: "tashkent" },
  "/lawyers/me/services/manage": { items: [SERVICE], profile: PROFILE },
  "/lawyers/me/services/catalog/categories": { items: [{ id: "cat1", title: "Oila va nikoh", services_count: 2, direct_services_count: 2, children: [] }] },
  "/lawyers/me/services/catalog": {
    items: [
      { service_id: "s2", title: "Aliment undirish bo'yicha da'vo", category_title: "Oila va nikoh", base_price: 200000, selectable: true, pricing_limits: LIMITS },
      { service_id: "s1", title: SERVICE.title, category_title: "Oila va nikoh", base_price: 200000, selected: true, pricing_limits: LIMITS },
    ],
    total: 2,
  },
  ...extra,
});

test("a new service: the system price and its floor, prefilled and sent explicitly", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  const mock = await mockBackend(
    page,
    await signIn(
      page,
      ADVOCATE,
      sellerRoutes({
        "POST /lawyers/me/services/manage": (body: unknown) => (sent.push(body as Record<string, unknown>), { id: "s2", service_id: "s2", title: "Aliment undirish bo'yicha da'vo", status: "active", selected_price: (body as { selected_price: number }).selected_price, pricing_limits: LIMITS }),
        "PATCH /marketplace/me/services/s2/configuration": (body: unknown) => ({ service_id: "s2", selected_price: (body as { selected_price?: number }).selected_price ?? 0, pricing_limits: LIMITS }),
      }),
    ),
  );
  await page.goto("/uz/portal/advocate/services");
  await page.getByRole("button", { name: "Xizmat qo'shish" }).first().click();
  await page.getByRole("button", { name: /Oila va nikoh/ }).first().click();

  // The catalog row: "Tizim narxi" (max_allowed) and "Eng past" (min_allowed).
  const row = page.getByRole("button", { name: /Aliment undirish/ });
  await expect(row).toContainText("Tizim narxi");
  await expect(row).toContainText(num("230 000"));
  await expect(row).toContainText(/Eng past: 115[\s  ]?000/);
  await row.click();

  // The price starts at the system price.
  const input = page.locator(".svprice2 input").first();
  await expect(input).toHaveValue(num("230 000"));

  // The limits card: new labels, the growth target and each coefficient.
  const caps = page.locator(".svcap").first();
  await expect(caps.locator('[data-k="mine"] dt')).toHaveText("Tizim narxi");
  await expect(caps.locator('[data-k="min"] dt')).toHaveText("Eng past narx (50%)");
  await expect(caps).toContainText(num("260 000"));
  await expect(caps).toContainText("Narxni oshirish uchun");
  await expect(caps.locator(".svcap__req")).toHaveCount(2);
  await expect(caps.locator(".svcap__add").first()).toHaveText("+15% narxga");
  await expect(caps).not.toContainText(/Eng yuqori|maksimal/i);

  // Above the system price: refused before saving, in the contract's words.
  await input.fill("250000");
  await expect(page.getByText("Tizim narxidan yuqori qo'yib bo'lmaydi", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Saqlash" })).toBeDisabled();
  // Below 50% of it: refused too.
  await input.fill("100000");
  await expect(page.getByText("Tizim narxining 50% idan past qo'yib bo'lmaydi", { exact: false }).first()).toBeVisible();

  // The chips set the floor or the system price; the save carries it.
  await page.getByRole("button", { name: /^Eng past: 115/ }).click();
  await expect(input).toHaveValue(num("115 000"));
  await page.getByRole("button", { name: /^Tizim narxi: 230/ }).click();
  await page.locator(".svform__policy").click();
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].selected_price).toBe(230000);
  expect(mock.refused).toEqual([]);
});

test("a 422 for a price above the system price brings the new limits", async ({ page }) => {
  // A coefficient is no longer met: the system price fell to 200 000 since the form loaded.
  const now = { ...LIMITS, max_allowed: 200000, maximum_price: 200000, recommended_price: 200000, min_allowed: 100000, minimum_listing_price: 100000, current_increase_percent: 0 };
  await mockBackend(
    page,
    await signIn(
      page,
      ADVOCATE,
      sellerRoutes({
        "PATCH /lawyers/me/services/s1": { status: 422, json: { detail: { code: "price_above_maximum", service_id: "s1", selected_price: 230000, minimum_listing_price: 100000, maximum_price: 200000, pricing_limits: now } } },
      }),
    ),
  );
  await page.goto("/ru/portal/advocate/services");
  await page.getByRole("article", { name: SERVICE.title }).getByRole("button", { name: "Изменить" }).click();
  const caps = page.locator(".svcap").first();
  await expect(caps.locator('[data-k="mine"] dd')).toContainText(num("230 000"));
  await page.locator(".svform__policy").click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(/Нельзя ставить выше системной цены: системная цена — 200[\s  ]?000 сум/).first()).toBeVisible();
  // The card and the save button follow the limits the error sent.
  await expect(caps.locator('[data-k="mine"] dd')).toContainText(num("200 000"));
  await expect(caps.locator('[data-k="min"] dd')).toContainText(num("100 000"));
  await expect(page.getByRole("button", { name: "Сохранить" })).toBeDisabled();
});

test("Studio's service form has no max price field", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/studio/constructors": fx.constructors,
      "/studio/constructors/K02": fx.k02,
      "/studio/constructors/K02/form-context": fx.formContext,
      "/studio/constructors/K02/records": fx.records,
      "/studio/reference/service-categories": fx.categories,
      "/studio/objects": { items: [] },
    } as never),
  );
  await page.goto("/uz/admin/studio/o/new?new=K02");
  const price = page.locator('[data-section="K02__price"]');
  await expect(price).toContainText("Tavsiya narxi", { timeout: 20000 });
  await expect(price).not.toContainText(/Eng yuqori narx|mutlaq maksimal/);
  await expect(page.locator("main")).not.toContainText(/Eng yuqori narx|mutlaq maksimal|Ruxsat etilgan eng yuqori narx/);
  await expect(page.locator('[data-path="max_price"], [name="max_price"]')).toHaveCount(0);
});
