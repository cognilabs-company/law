import { expect, test } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// A purchase request goes to the seller first (enterprise contract §5): the
// backend answers 200 with the order "sent_to_seller" and its 10% advance
// "awaiting_seller_acceptance". That is not a payment: the dialog says the
// request went to the specialist, counts down their 30 minutes, and that
// nothing is charged yet. The shape below is a live order's (24 Oct 2026).
const SELLER = "u-adv";
const SHOTS = "/tmp/claude-1000/-home-abdurahmon-Desktop-law/1b23aff7-656c-46a8-a16f-81213b23ff98/scratchpad/shots";
const sent = () => {
  const deadline = new Date(Date.now() + 29 * 60_000).toISOString();
  return order({
    status: "sent_to_seller",
    payment_status: "unpaid",
    contact_unlocked: false,
    price: 879749,
    payment: { target_type: "marketplace_advance", status: "awaiting_seller_acceptance", amount: 87974, currency: "UZS", provider: "telegram_manual", provider_payload: { stage: "advance" } },
    details: {
      assignment_mode: "client_selected_external",
      assignment_status: "waiting_seller_response",
      acceptance_deadline_at: deadline,
      seller_response_minutes: 30,
      client_status: "request_received",
      client_status_message: "So‘rovingiz qabul qilindi. Xizmat boshlanishi bo‘yicha tez orada xabar beramiz.",
    },
  });
};

test("a request waiting for the seller is not shown as paid", async ({ page }) => {
  const state = { order: sent() };
  const routes = await signIn(page, CLIENT, {
    "/marketplace/lawyers": { items: [{ user_id: SELLER, name: "Test Advokat", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, specializations: ["oila-va-nikoh"], is_verified: true }], count: 1, total: 1 },
    [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Test Advokat", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
    [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Test xizmat", base_price: 879749, selected_price: 879749, effective_price: 879749, currency: "UZS", category_title: "Оила ва никоҳ" }] },
    "POST /marketplace/services/svc-1/quote": { base_price: 879749, total_price: 879749, currency: "UZS", breakdown: [] },
    [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: () => ({ work_id: "ADV-5IIPV", order: state.order, payment: state.order.payment, telegram_sent: null }),
    "/marketplace/me/orders": () => ({ items: [state.order], total: 1 }),
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "marketplace_advance", status: "awaiting_seller_acceptance", amount: 87974 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
  });
  await mockBackend(page, routes);
  await page.goto(`/uz/lawyers/${SELLER}`);
  await page.getByRole("button", { name: "Sotib olish" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Xizmatni sotib olish" });
  await dialog.getByRole("textbox").first().fill("Ajrashish bo'yicha maslahat kerak, bolalar masalasi bor");
  await dialog.getByText("1 soat ichida").click();
  await dialog.getByRole("button", { name: "Sotib olish" }).click();

  await expect(dialog.getByText("So'rov mutaxassisga yuborildi")).toBeVisible();
  await expect(dialog.getByText(/So‘rovingiz qabul qilindi/)).toBeVisible();
  await expect(dialog.getByText(/Mutaxassis javobi kutilmoqda · 2\d:\d\d/)).toBeVisible();
  await expect(dialog.getByText(/10% oldindan to'lov \(87\s974 so'm\)/)).toBeVisible();
  await expect(dialog.getByText("To'lov tasdiqlandi")).toHaveCount(0);
  await expect(dialog.locator(".mk-steps li[aria-current=step]")).toHaveText(/Mutaxassis qabuli/);
  await page.screenshot({ path: `${SHOTS}/purchase-accepting.png` });

  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.getByText("Mutaxassis javobi kutilmoqda").first()).toBeVisible();
  await expect(page.getByText(/Javob uchun qolgan vaqt: 2\d:\d\d/)).toBeVisible();
  await expect(page.getByText("To'lov Telegram orqali tasdiqlanmoqda", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/order-accepting.png`, fullPage: false });
});

test("the assigned lawyer sees the request on the order page and accepts it", async ({ page }) => {
  let accepted = false;
  const state = { order: sent() };
  const routes = await signIn(page, ADVOCATE, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    "/marketplace/me/orders": () => ({ items: [state.order], total: 1 }),
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "marketplace_advance", status: "awaiting_seller_acceptance", amount: 87974 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
    [`POST /orders/${ORDER_ID}/accept`]: () => ((accepted = true), (state.order = order({ status: "pending_payment", payment_status: "pending", price: 879749 })), { id: ORDER_ID, status: "pending_payment" }),
  });
  await mockBackend(page, routes);
  // In the list it reads as a new request to answer, not a payment wait.
  await page.goto("/uz/portal/advocate/marketplace-orders");
  await expect(page.getByText("Yangi buyurtma — javobingiz kutilmoqda")).toBeVisible();
  await page.goto(`/uz/portal/advocate/marketplace-orders/${ORDER_ID}`);
  await expect(page.getByText("Yangi buyurtma sizga yuborildi")).toBeVisible();
  await expect(page.getByText(/Javob berish uchun qolgan vaqt: 2\d:\d\d/)).toBeVisible();
  await expect(page.getByText("Javobingiz kutilmoqda")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/seller-assignment.png` });
  await page.getByRole("button", { name: "Qabul qilish" }).click();
  await expect.poll(() => accepted).toBe(true);
});

test("an assignment the seller list leaves out still shows, read from /orders", async ({ page }) => {
  const waiting = sent();
  const routes = await signIn(page, ADVOCATE, {
    // The live seller list carries only accepted orders (24 Oct 2026).
    "/marketplace/me/orders": { items: [], total: 0 },
    "/orders": { items: [{ id: ORDER_ID, source: "marketplace", status: "sent_to_seller", work_id: "ORD-TEST1" }, { id: "other", source: "web", status: "new" }] },
    [`/marketplace/me/orders/${ORDER_ID}`]: () => waiting,
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/advocate/marketplace-orders");
  await expect(page.getByText("Yangi buyurtma — javobingiz kutilmoqda")).toBeVisible();
});
