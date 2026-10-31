import { expect, test } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

const panel = (page: import("@playwright/test").Page) => page.locator(".mod-price");
// The order page's chat entry (OrderActions / ContactAdvocate).
const chatEntry = (page: import("@playwright/test").Page) => page.locator('[data-ai-id$=".chat"], [data-ai-id$=".contact"]');

test.describe("order price breakdown", () => {
  // TSK-787056 / contract §11: the client sees what they pay — their own
  // options, the final price and the payment — never the factors, the
  // seller's allowed range or the commission.
  test("client sees what they pay, never the factors, the range or the commission", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order(),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([
        // One full payment (TSK-900422): no 10% advance and remainder.
        { stage: "marketplace_order", status: "paid", amount: 110000 },
      ]),
    });
    const mock = await mockBackend(page, routes);
    await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p).toContainText("Shoshilinch");
    await expect(p).toContainText("110 000");
    await expect(p.getByText("Оплачено")).toBeVisible();
    await expect(p).not.toContainText(/Предоплата|Остаток|10%/);
    // The coefficients and the seller's allowed range are internal.
    await expect(p).not.toContainText("Самарканд");
    await expect(p).not.toContainText("70 000");
    await expect(p.getByText("×1.05")).toHaveCount(0);
    // The price did not move from its base: no explanation at all.
    await expect(p.locator(".mod-price__why")).toHaveCount(0);
    // The platform's share and the seller's net stay hidden from the client.
    await expect(page.getByText("Комиссия LexGo")).toHaveCount(0);
    await expect(page.getByText("90 200")).toHaveCount(0);
    await expect(page.getByText("19 800")).toHaveCount(0);
    // Paid and unlocked: the protected chat is offered.
    await expect(chatEntry(page).first()).toBeVisible();
    expect(mock.refused).toEqual([]);
  });

  test("seller sees the commission and their net", async ({ page }) => {
    const routes = await signIn(page, ADVOCATE, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order(),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }], "complaint_hold"),
    });
    await mockBackend(page, routes);
    await page.goto(`/ru/portal/advocate/marketplace-orders/${ORDER_ID}`);
    const p = panel(page);
    await expect(p).toContainText("Комиссия LexGo · 18%");
    await expect(p).toContainText("−19 800");
    await expect(p).toContainText("90 200");
    await expect(p).toContainText("Удерживается из-за жалобы");
    // A one-step payment shows that payment, not a 10/90 split.
    await expect(p.getByText("Предоплата · 10%")).toHaveCount(0);
  });

  // TSK-728950: a price part the screen has no name for reads "another
  // part", never its code.
  test("an unknown price part reads in words, never as its code", async ({ page }) => {
    const o = order();
    const snap = (o.details as Record<string, Record<string, unknown>>).pricing_snapshot;
    snap.components = [
      { code: "base_price", amount: 100000 },
      { code: "loyalty_boost_v2", amount: 5000, percent: 5 },
    ];
    const routes = await signIn(page, ADVOCATE, {
      [`/marketplace/me/orders/${ORDER_ID}`]: o,
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    });
    await mockBackend(page, routes);
    await page.goto(`/ru/portal/advocate/marketplace-orders/${ORDER_ID}`);
    const p = panel(page);
    await expect(p).toContainText("Базовая стоимость услуги");
    await expect(p).toContainText("Другая часть · 5%");
    await expect(p).not.toContainText(/loyalty|boost|_v2/);
  });

  test("an unconfirmed payment keeps the chat shut", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "accepted", payment_status: "pending", contact_unlocked: false }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([
        { stage: "marketplace_order", status: "pending", amount: 110000 },
      ]),
    });
    await mockBackend(page, routes);
    await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
    await expect(panel(page)).toContainText("Ожидается");
    await expect(chatEntry(page)).toHaveCount(0);
  });

  test("contact_unlocked=false alone keeps chat and calls shut", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order({ contact_unlocked: false }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    });
    await mockBackend(page, routes);
    await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
    await expect(panel(page)).toBeVisible();
    await expect(chatEntry(page)).toHaveCount(0);
  });

  test("a higher price for this specialist comes with the backend's diplomatic reasons only", async ({ page }) => {
    const priced = order({
      details: {
        pricing_snapshot: {
          base_price: 100000,
          selected_price: 120000,
          final_price: 120000,
          min_allowed: 70000,
          max_allowed: 150000,
          modifiers: [{ code: "experience", key: "verified_10y", multiplier: 1.2, amount: 20000 }],
          // Backend answers 2026-10-31 §1.6, §3.9: only text / text_i18n, in
          // the client's locale; an item with neither is not worded here.
          client_price_reasons: [
            { code: "lawyer_experience", text: "Mutaxassisning tasdiqlangan tajribasi narxda hisobga olingan.", label: "x", text_i18n: { uz_latn: "Tajriba", ru: "Подтверждённый опыт специалиста учтён в стоимости." }, amount: 15000, percent: 15 },
            { code: "superadvokat_premium", text: "Специалист имеет статус Суперадвоката.", amount: 9000, percent: 9 },
            { code: "some_new_code", amount: 5000, percent: 5 },
          ],
        },
      },
    });
    await mockBackend(page, await signIn(page, CLIENT, { [`/marketplace/me/orders/${ORDER_ID}`]: priced, [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "full_payment", status: "paid", amount: 120000 }]) }));
    await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
    const p = panel(page);
    await expect(p).toContainText("100 000");
    await expect(p).toContainText("120 000");
    const why = p.locator(".mod-price__why");
    await expect(why).toContainText("Почему цена немного выше");
    await expect(why).toContainText("Подтверждённый опыт специалиста учтён в стоимости.");
    // Only the sentences — not what each reason adds.
    await expect(why).not.toContainText("15 000");
    await expect(why).not.toContainText("15%");
    await expect(why).not.toContainText("Mutaxassisning tasdiqlangan");
    // A reason with only `text` keeps it; one with neither is left out —
    // never a sentence made up from its code, never a Superadvokat amount.
    await expect(why).toContainText("Специалист имеет статус Суперадвоката.");
    await expect(why.locator("li")).toHaveCount(2);
    await expect(why).not.toContainText("9 000");
    await expect(why).not.toContainText("Уровень специалиста и условия работы");
    await expect(p).not.toContainText("lawyer_experience");
    await expect(p).not.toContainText("superadvokat_premium");
    await expect(p).not.toContainText("some_new_code");
    // Nothing internal: no multiplier, no range, no factor code.
    await expect(p).not.toContainText("×1.2");
    await expect(p).not.toContainText("150 000");
    await expect(p).not.toContainText("verified_10y");
  });
});
