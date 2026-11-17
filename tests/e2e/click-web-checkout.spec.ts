import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Mock, type Routes } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// TEZKOR_HIMOYA_CLICK_WEB_FRONTEND_INTEGRATION_2026_11_17.md against a mocked
// backend (no money moves, no real checkout opens):
//   • an unpaid Click order is paid from its own page after a refresh (§10.6);
//   • every open asks the backend for a new one-time link (§6, §10.7);
//   • "waiting for confirmation" after opening, never success (§7);
//   • paid only when GET /marketplace/me/orders/{id} says so, then the
//     seller's 30 minutes (§5, §10.5);
//   • a cancelled order stops and shows the backend's words (§7);
//   • 503 rests Click with retry and support (§8);
//   • a double click sends one purchase, a lost answer is looked for before
//     a second one (§8, §9, §10.8).
const SELLER = "u-adv";
const PRICE = 1000;
const ORDER_PATH = new RegExp(`^/marketplace/me/orders/${ORDER_ID}$`);
const RENEW = /^\/payments\/pay-1\/click\/checkout$/;
const PURCHASE = `/marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`;
const checkoutUrl = (n: number) => `https://lexgo.api.cognilabs.org/payments/click/checkout/opaque-token-w${n}`;
const deadline = () => new Date(Date.now() + 29 * 60_000).toISOString();

test.use({ viewport: { width: 1470, height: 920 }, colorScheme: "light", locale: "uz-UZ" });

const unpaid = (extra: Record<string, unknown> = {}) =>
  order({
    status: "pending_payment",
    payment_status: "pending",
    contact_unlocked: false,
    can_start_chat: false,
    price: PRICE,
    service_title: "Click test xizmati",
    created_at: new Date().toISOString(),
    payment: { id: "pay-1", status: "pending", amount: PRICE, currency: "UZS", provider: "click" },
    details: { assignment_status: "payment_pending", client_status: "payment_required" },
    ...extra,
  });
const paidWithSeller = () =>
  order({
    status: "sent_to_seller",
    payment_status: "paid",
    contact_unlocked: false,
    can_start_chat: false,
    price: PRICE,
    service_title: "Click test xizmati",
    payment: { id: "pay-1", status: "paid", amount: PRICE, currency: "UZS", provider: "click" },
    details: { assignment_mode: "client_selected_external", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline(), seller_response_minutes: 30, client_status: "sent_to_seller", client_status_message: "To'lov tasdiqlandi. Advokat 30 daqiqa ichida javob beradi." },
  });

type State = { order: Record<string, unknown>; placed: boolean; links: number };
const routes = (state: State, extra: Routes = {}): Routes => ({
  "/marketplace/lawyers": { items: [{ user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true }], count: 1, total: 1 },
  [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
  [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Click test xizmati", base_price: PRICE, selected_price: PRICE, effective_price: PRICE, currency: "UZS", category_title: "Test" }] },
  "POST /marketplace/services/svc-1/quote": { base_price: PRICE, total_price: PRICE, currency: "UZS", breakdown: [] },
  [`POST ${PURCHASE}`]: () => {
    state.placed = true;
    state.links += 1;
    return { work_id: "MP-TEST1", status: "payment_pending", assignment_status: "payment_pending", acceptance_deadline_at: null, next_status: "full_payment_required", order: state.order, payment: { ...(state.order.payment as object), payment_url: checkoutUrl(state.links) } };
  },
  "/marketplace/me/orders": () => (state.placed ? { items: [state.order], count: 1 } : { items: [], count: 0 }),
  [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
  [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "full_payment", status: String((state.order.payment as { status: string }).status), amount: PRICE }]),
  [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
  "/payments/providers": { items: [{ provider: "click", enabled: true, label: "Click", status: "configured" }], fallback_provider: "telegram_manual", currency: "UZS" },
  // §6: each renewal is a new one-time link.
  "POST /payments/pay-1/click/checkout": () => {
    state.links += 1;
    return { payment_id: "pay-1", status: "pending", provider: "click", payment_url: checkoutUrl(state.links), provider_payment_id: "pay-1" };
  },
  ...extra,
});

// The Click page itself is never reached: the backend's checkout URL is
// answered here, and every URL the browser was sent to is recorded.
async function fakeCheckout(context: BrowserContext): Promise<string[]> {
  const opened: string[] = [];
  await context.route(/payments\/click\/checkout\/opaque-token/, (r) => {
    opened.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Click</h1>" });
  });
  return opened;
}

async function openOrder(page: Page, state: State, extra: Routes = {}): Promise<Mock> {
  const mock = await mockBackend(page, await signIn(page, CLIENT, routes(state, extra)));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await expect(page.locator(".odx-pay .ckp")).toBeVisible();
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me")), { timeout: 15_000 }).toBe(true);
  return mock;
}

test("order page: an unpaid Click order is paid from the order, a new link each time, paid only when the order says so", async ({ page, context }) => {
  const state: State = { order: unpaid(), placed: true, links: 0 };
  const opened = await fakeCheckout(context);
  const mock = await openOrder(page, state);
  const panel = page.locator(".odx-pay .ckp");

  // §7: "Pay with Click", the backend's amount, no Telegram note.
  await expect(panel).toContainText("1 000");
  await expect(panel).toContainText("Click test xizmati");
  await expect(panel.getByRole("status")).toHaveText("To'lov kutilmoqda");
  await expect(page.getByText(/Telegram orqali tasdiqlanmoqda/)).toHaveCount(0);
  await expect(page.locator(".mod-head__lead")).toHaveText("To'lovni Click orqali qiling — tasdiqlangach buyurtma ijrochiga yuboriladi.");

  // §6: the purchase's link may be spent, so the order page asks for a new one.
  const [tab] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "Click orqali to'lash" }).click()]);
  await tab.waitForURL(checkoutUrl(1));
  expect(mock.count("POST", RENEW)).toBe(1);
  // §7: opened, not answered yet — waiting, never success.
  await expect(panel.getByRole("status")).toHaveText("To'lov tasdig'i kutilmoqda");
  await expect(page.getByText("To'lov tasdiqlandi")).toHaveCount(0);
  // §10.3: the Click page closed without paying leaves the order pending —
  // and closing it reads the order again (§5).
  const reads = mock.count("GET", ORDER_PATH);
  await tab.close();
  await expect.poll(() => mock.count("GET", ORDER_PATH)).toBeGreaterThan(reads);
  await expect(panel.getByRole("status")).toHaveText("To'lov tasdig'i kutilmoqda");

  // A second try never reopens the used link: the backend gives another.
  await page.waitForTimeout(1600);
  const [tab2] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "Click orqali to'lash" }).click()]);
  await tab2.waitForURL(checkoutUrl(2));
  expect(mock.count("POST", RENEW)).toBe(2);
  expect(opened).toEqual([checkoutUrl(1), checkoutUrl(2)]);
  await tab2.close();
  // No second order, ever (§10.7).
  expect(mock.count("POST", /purchase-request$/)).toBe(0);

  // §5: Click's Complete callback landed; the socket says so, the order confirms.
  state.order = paidWithSeller();
  await mock.push({ event: "marketplace.full_payment_paid", order_id: ORDER_ID, payment_id: "pay-1", payment_status: "paid", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline(), response_minutes: 30 });
  // §10.5: then the seller's 30 minutes, with the backend's deadline.
  await expect(page.locator(".odx-wait")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".odx-wait").getByRole("timer")).toHaveText(/^(29|30):\d\d$/);
  await expect(page.locator(".odx-pay")).toHaveCount(0);
  // The polling stopped with it.
  const after = mock.count("GET", ORDER_PATH);
  await page.waitForTimeout(4000);
  expect(mock.count("GET", ORDER_PATH) - after).toBeLessThanOrEqual(1);
});

test("order page: the backend cancels the order — Click stops and the backend's words show", async ({ page }) => {
  const state: State = { order: unpaid(), placed: true, links: 0 };
  const mock = await openOrder(page, state);
  state.order = unpaid({ status: "cancelled", payment_status: "cancelled", payment: { id: "pay-1", status: "cancelled", amount: PRICE, provider: "click" }, details: { client_status: "cancelled", client_status_message: "To'lov 20 daqiqada qilinmagani uchun buyurtma bekor qilindi." } });
  await mock.push({ event: "marketplace.order_cancelled", order_id: ORDER_ID });
  await expect(page.locator(".sx.mod")).toHaveAttribute("data-phase", "cancelled", { timeout: 15_000 });
  await expect(page.getByText("To'lov 20 daqiqada qilinmagani uchun buyurtma bekor qilindi.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Click orqali to'lash" })).toHaveCount(0);
  const after = mock.count("GET", ORDER_PATH);
  await page.waitForTimeout(4000);
  expect(mock.count("GET", ORDER_PATH) - after).toBeLessThanOrEqual(1);
});

test("order page: Click not configured (503) rests the button, with try again and support (§8)", async ({ page, context }) => {
  const state: State = { order: unpaid(), placed: true, links: 0 };
  await fakeCheckout(context);
  const mock = await openOrder(page, state, {
    "POST /payments/pay-1/click/checkout": { status: 503, json: { detail: { code: "payment_provider_not_configured" } } },
  });
  const panel = page.locator(".odx-pay .ckp");
  await panel.getByRole("button", { name: "Click orqali to'lash" }).click();
  expect(mock.count("POST", RENEW)).toBe(1);
  await expect(panel.getByRole("alert")).toContainText("Click vaqtincha o'chirilgan");
  await expect(panel.getByRole("button", { name: "Click orqali to'lash" })).toBeDisabled();
  await expect(panel.getByRole("link", { name: "Qo'llab-quvvatlash" })).toHaveAttribute("href", /\/portal\/client\/support$/);
  await panel.getByRole("button", { name: "Qayta urinish" }).click();
  await expect(panel.getByRole("button", { name: "Click orqali to'lash" })).toBeEnabled();
});

test("order page: payment_not_found is not retried; the order is read again (§8)", async ({ page }) => {
  const state: State = { order: unpaid(), placed: true, links: 0 };
  const mock = await openOrder(page, state, {
    "POST /payments/pay-1/click/checkout": { status: 404, json: { detail: { code: "payment_not_found" } } },
  });
  const panel = page.locator(".odx-pay .ckp");
  const reads = mock.count("GET", ORDER_PATH);
  await panel.getByRole("button", { name: "Click orqali to'lash" }).click();
  await expect(panel.getByRole("alert")).toContainText("To'lov topilmadi");
  await expect(panel.getByRole("button", { name: "Click orqali to'lash" })).toHaveCount(0);
  await expect.poll(() => mock.count("GET", ORDER_PATH)).toBeGreaterThan(reads);
  expect(mock.count("POST", RENEW)).toBe(1);
});

async function openDialog(page: Page) {
  await page.goto(`/uz/lawyers/${SELLER}`);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.getByRole("button", { name: "Sotib olish" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Xizmatni sotib olish" });
  await dialog.getByRole("textbox").first().fill("Click orqali to'lovni sinab ko'ryapman");
  return dialog;
}

test("purchase: a double click sends one request (§9, §10.8); the dialog reads the order, not the payment (§5)", async ({ page, context }) => {
  const state: State = { order: unpaid(), placed: false, links: 0 };
  await fakeCheckout(context);
  const mock = await mockBackend(page, await signIn(page, CLIENT, routes(state)));
  // A slow answer, so the second press lands while the first is on its way.
  await page.route(/purchase-request$/, async (r) => {
    await new Promise((res) => setTimeout(res, 800));
    await r.fallback();
  });
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "Sotib olish" }).dblclick();
  const panel = dialog.locator(".ckp");
  await expect(panel).toBeVisible();
  expect(mock.count("POST", /purchase-request$/)).toBe(1);

  // The purchase's own link opens once, as given; a second press within the
  // same moment is the same press.
  const [tab] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "Click orqali to'lash" }).dblclick()]);
  await tab.waitForURL(checkoutUrl(1));
  await page.waitForTimeout(500);
  expect(context.pages().length).toBe(2);
  expect(mock.count("POST", RENEW)).toBe(0);
  await tab.close();

  // Paid: the order says so (GET /marketplace/me/orders/{id}), never /payments.
  state.order = paidWithSeller();
  await mock.push({ event: "marketplace.full_payment_paid", order_id: ORDER_ID, payment_id: "pay-1", payment_status: "paid", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline() });
  await expect(dialog.locator(".ckp--slim").getByRole("status")).toHaveText("To'lov tasdiqlandi", { timeout: 15_000 });
  await expect(dialog.locator(".mk-steps li[aria-current=step]")).toHaveText(/Mutaxassis qabuli/, { timeout: 15_000 });
  expect(mock.count("GET", /^\/payments\/pay-1$/)).toBe(0);
});

test("purchase: a lost answer is looked for before a second order is made (§8)", async ({ page }) => {
  const state: State = { order: unpaid(), placed: false, links: 0 };
  const mock = await mockBackend(page, await signIn(page, CLIENT, routes(state)));
  // The backend made the order, but its answer never arrived.
  let sent = 0;
  await page.route(/purchase-request$/, async (r) => {
    sent += 1;
    state.placed = true;
    await r.abort("internetdisconnected");
  });
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  await expect(dialog.getByText(/Aloqa uzildi/)).toBeVisible();
  await page.unroute(/purchase-request$/);

  // Sending again first reads the client's orders, finds that one, and goes to it.
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  await page.waitForURL(new RegExp(`/portal/client/marketplace-orders/${ORDER_ID}$`));
  await expect(page.locator(".odx-pay .ckp")).toBeVisible();
  expect(sent).toBe(1);
  expect(mock.count("POST", /purchase-request$/)).toBe(0);
});

test("purchase: an order already active goes straight to it, where it is paid (§8)", async ({ page }) => {
  const state: State = { order: unpaid(), placed: false, links: 0 };
  await mockBackend(
    page,
    await signIn(
      page,
      CLIENT,
      routes(state, {
        [`POST ${PURCHASE}`]: { status: 409, json: { detail: { code: "marketplace_order_already_active", order_id: ORDER_ID, work_id: "MP-TEST1", status: "pending_payment" } } },
      }),
    ),
  );
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  await page.waitForURL(new RegExp(`/portal/client/marketplace-orders/${ORDER_ID}$`));
  await expect(page.locator(".odx-pay").getByRole("button", { name: "Click orqali to'lash" })).toBeVisible();
});
