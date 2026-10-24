import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// A client's whole path: a seller's profile, a purchase request, the
// payment confirmed by the backend, then the order with its protected chat.
const SELLER = "u-adv";

test("client buys a service and reaches the protected chat once payment is confirmed", async ({ page }) => {
  let purchase: Record<string, unknown> | null = null;
  const state = { order: order({ status: "pending_payment", payment_status: "pending", contact_unlocked: false }) };
  const routes = await signIn(page, CLIENT, {
    "/marketplace/lawyers": { items: [{ user_id: SELLER, name: "Test Advokat", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, specializations: ["oila-va-nikoh"], is_verified: true }], count: 1, total: 1 },
    [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Test Advokat", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, specializations: ["oila-va-nikoh"], is_verified: true },
    [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Test xizmat", base_price: 110000, selected_price: 110000, effective_price: 110000, currency: "UZS", category_title: "Оила ва никоҳ" }] },
    "POST /marketplace/services/svc-1/quote": { base_price: 110000, total_price: 110000, currency: "UZS", breakdown: [] },
    [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: (body: unknown) => {
      purchase = body as Record<string, unknown>;
      return { work_id: "MP-TEST1", order: { id: ORDER_ID, status: "pending_payment", price: 110000, currency: "UZS" }, payment: { amount: 110000, currency: "UZS", telegram_sent: true } };
    },
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "marketplace_order", status: state.order.contact_unlocked ? "paid" : "pending", amount: 110000 }]),
  });
  const mock = await mockBackend(page, routes);

  // Browse: the marketplace lists the seller; open their profile.
  await page.goto("/ru/lawyers");
  // Specialisations read in Russian too.
  await expect(page.getByText(/Семья и брак/).first()).toBeVisible();
  await page.getByRole("link", { name: "Test Advokat", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/lawyers/${SELLER}`));
  // The category reads in Russian, not as the backend's Cyrillic Uzbek.
  await expect(page.getByText("Семья и брак").first()).toBeVisible();
  await page.getByRole("button", { name: "Купить" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Покупка услуги" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").first().fill("Ajrashish bo'yicha maslahat kerak, bolalar masalasi bor");
  await dialog.getByText("В течение часа").click();
  await dialog.getByRole("button", { name: "Купить" }).click();

  await expect.poll(() => purchase).not.toBeNull();
  // The client never sends a price: the backend sets what is paid.
  expect(JSON.stringify(purchase)).not.toMatch(/"(price|amount|total|selected_price)"/);
  expect(purchase).toMatchObject({ note: "Ajrashish bo'yicha maslahat kerak, bolalar masalasi bor" });

  // Payment is confirmed by the backend (Telegram), announced on the socket.
  state.order = order({ status: "paid", payment_status: "paid", contact_unlocked: true });
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  await mock.push({ event: "marketplace.order_paid", order_id: ORDER_ID, work_id: "MP-TEST1" });
  await mock.push({ event: "notification.created", notification: { data: { event: "order_payment_updated", order_id: ORDER_ID } } });

  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.locator('[data-ai-id$=".chat"], [data-ai-id$=".contact"]').first()).toBeVisible();
  await expect(page.locator(".mod-price")).toContainText("Оплачено");
  expect(mock.refused).toEqual([]);
});
