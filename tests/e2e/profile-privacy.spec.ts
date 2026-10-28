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

// Point 3: a specialist whose price differs from the catalog's gets one
// polite line — never the formula, multipliers, range or amounts.
test("a price above the catalog's is explained in one line, without the formula", async ({ page }) => {
  await mockBackend(page, {
    [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Aziz Karimov", seller_type: "advokat", lexgo_verified: true, region: "tashkent" },
    [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Ota-onalik huquqidan mahrum qilish", base_price: 900000, selected_price: 1035000, effective_price: 1035000, currency: "UZS" }] },
    "/marketplace/pricing-policy": { regions: [{ key: "tashkent", coef: 1.15 }], experience: [{ min_years: 3, percent: 10 }] },
  });
  await page.goto(`/uz/lawyers/${SELLER}`);
  const note = page.locator(".mk-pricenote");
  await expect(note).toHaveText("Bu mutaxassis narxida uning tasdiqlangan tajribasi va natijalari hisobga olingan.", { timeout: 20000 });
  const body = await page.locator("main").innerText();
  expect(body).not.toContain("Narx qanday hisoblanadi");
  expect(body).not.toMatch(/×1[.,]\d|\+10%|70–100%/);
});
