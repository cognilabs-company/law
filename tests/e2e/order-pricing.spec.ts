import { expect, test } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

const panel = (page: import("@playwright/test").Page) => page.locator(".mod-price");
// The order page's chat entry (OrderActions / ContactAdvocate).
const chatEntry = (page: import("@playwright/test").Page) => page.locator('[data-ai-id$=".chat"], [data-ai-id$=".contact"]');

test.describe("order price breakdown", () => {
  test("client sees how the price was set, never the commission", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order(),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([
        { stage: "advance", status: "paid", amount: 11000 },
        { stage: "final", status: "pending", amount: 99000 },
      ]),
    });
    const mock = await mockBackend(page, routes);
    await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p).toContainText("Самарканд");
    await expect(p).toContainText("Shoshilinch");
    await expect(p).toContainText("110 000");
    await expect(p).toContainText("Предоплата · 10%");
    await expect(p.getByText("Оплачено")).toBeVisible();
    await expect(p.getByText("Ожидается")).toBeVisible();
    // A factor that changes nothing (×1.00) is not listed.
    await expect(p.getByText("×1.00")).toHaveCount(0);
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

  test("an unconfirmed advance keeps the chat shut and says why", async ({ page }) => {
    const routes = await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "accepted", payment_status: "pending", contact_unlocked: false }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([
        { stage: "advance", status: "pending", amount: 11000 },
        { stage: "final", status: "pending", amount: 99000 },
      ]),
    });
    await mockBackend(page, routes);
    await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
    await expect(panel(page)).toContainText("Ожидаем подтверждения предоплаты");
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
});
