import { expect, test } from "@playwright/test";
import { mockBackend } from "./mock";

// Even if the API ever sent a seller's private fields to a visitor, the
// public profile must not show them.
const SELLER = "u-seller-1";
const SECRETS = {
  phone: "+998 90 555 44 33",
  email: "private.lawyer@mail.uz",
  telegram: "@private_lawyer_tg",
  license_number: "LIC-77-555123",
  education: "Toshkent davlat yuridik universiteti",
  passport: "AA1234567",
};

test("public lawyer profile shows no private contact or professional fields", async ({ page }) => {
  const mock = await mockBackend(page, {
    [`/marketplace/lawyers/${SELLER}`]: {
      user_id: SELLER,
      name: "Aziz Karimov",
      seller_type: "advokat",
      region: "tashkent",
      rating: 4.8,
      reviews_count: 12,
      specializations: ["oila-va-nikoh"],
      ...SECRETS,
      telegram_username: SECRETS.telegram,
      bar_association: "Toshkent shahar advokatlar palatasi",
    },
    [`/marketplace/lawyers/${SELLER}/services`]: { items: [] },
  });
  await page.goto(`/ru/lawyers/${SELLER}`);
  await expect(page.getByRole("heading", { name: "Aziz Karimov" }).first()).toBeVisible();
  const text = await page.locator("body").innerText();
  for (const [field, value] of Object.entries(SECRETS)) expect(text, field).not.toContain(value);
  expect(text).not.toContain("555 44 33");
  expect(mock.refused).toEqual([]);
});

// TSK-787056: "how is the price formed" on a public profile explains in
// words; LexGo's internal formula — region coefficients, experience and
// rating percentages, the allowed range — never reaches the client.
test("the price explainer on a public profile never shows the internal formula", async ({ page }) => {
  await mockBackend(page, {
    [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Aziz Karimov", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12 },
    [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Ajrashish", base_price: 100000, selected_price: 120000, effective_price: 120000, currency: "UZS" }] },
    // Even if the policy endpoint answers, its numbers stay internal.
    "/marketplace/pricing/policy": { regions: [{ key: "tashkent", coef: 1.2 }], experience: [{ min_years: 10, percent: 20 }], client: { rating_min: 4.5, reviews_min: 10, percent: 7 }, min_percent: 80, max_percent: 150 },
  });
  await page.goto(`/ru/lawyers/${SELLER}`);
  await page.getByRole("button", { name: "Как считается цена?" }).click();
  const pop = page.getByRole("dialog", { name: "Как считается цена?" });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText("Регион");
  await expect(pop).toContainText("Опыт");
  await expect(pop).not.toContainText(/×\s?\d|\+\d+\s?%|\d+\s?%/);
  await expect(pop).not.toContainText("Допустимый диапазон");
});
