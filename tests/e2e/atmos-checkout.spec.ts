import { expect, test, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// TEZKOR_HIMOYA_ATMOS_FRONTEND_INTEGRATION_2026_11_17.md, against a mocked
// backend (no money moves, no real ATMOS): ATMOS is offered only while
// /payments/providers says enabled, the purchase names it, its checkout opens
// unchanged only from a click and only once, nothing reads "paid" until
// GET /marketplace/me/orders/{id} does, a spent link is renewed only through
// the backend, and the documented refusals end where the contract says.
const SELLER = "u-adv";
const PRICE = 1000;
const URL1 = "https://checkout.atmos.uz/invoice/opaque-token-1";
const URL2 = "https://checkout.atmos.uz/invoice/opaque-token-2";
// Screenshots: ATMOS_SHOTS=<dir>, ATMOS_NARROW=1.
const SHOTS = process.env.ATMOS_SHOTS ?? "";
test.use({ viewport: process.env.ATMOS_NARROW ? { width: 375, height: 812 } : { width: 1470, height: 920 }, locale: "uz-UZ" });
const sfx = process.env.ATMOS_NARROW ? "-phone" : "";
const deadline = () => new Date(Date.now() + 29 * 60_000).toISOString();

const ATMOS_ON = { items: [{ provider: "telegram_manual", enabled: true, label: "Telegram", status: "ready" }, { provider: "atmos", enabled: true, label: "ATMOS", status: "configured" }], fallback_provider: "telegram_manual", currency: "UZS" };
const ATMOS_OFF = { items: [{ provider: "telegram_manual", enabled: true, label: "Telegram", status: "ready" }, { provider: "atmos", enabled: false, label: "ATMOS", status: "disabled" }], fallback_provider: "telegram_manual", currency: "UZS" };

const unpaid = (payStatus = "pending", withUrl = true) =>
  order({
    status: "pending_payment",
    payment_status: payStatus,
    contact_unlocked: false,
    can_start_chat: false,
    price: PRICE,
    created_at: new Date().toISOString(),
    payment: { id: "pay-1", status: payStatus, amount: PRICE, currency: "UZS", provider: "atmos", ...(withUrl ? { payment_url: URL1 } : {}) },
    details: { assignment_status: "payment_pending", client_status: "payment_required" },
  });
const sentToSeller = () =>
  order({
    status: "sent_to_seller",
    payment_status: "paid",
    contact_unlocked: false,
    can_start_chat: false,
    price: PRICE,
    payment: { id: "pay-1", status: "paid", amount: PRICE, currency: "UZS", provider: "atmos" },
    details: { assignment_mode: "client_selected_external", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline(), seller_response_minutes: 30, client_status: "sent_to_seller" },
  });

type State = { order: Record<string, unknown>; placed: boolean };
const routes = (state: State, bodies: Record<string, unknown>[], extra: Routes = {}): Routes => ({
  "/marketplace/lawyers": { items: [{ user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true }], count: 1, total: 1 },
  [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
  [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "ATMOS test xizmati", base_price: PRICE, selected_price: PRICE, effective_price: PRICE, currency: "UZS", category_title: "Test" }] },
  "POST /marketplace/services/svc-1/quote": { base_price: PRICE, total_price: PRICE, currency: "UZS", breakdown: [] },
  [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: (b: unknown) => {
    bodies.push(b as Record<string, unknown>);
    state.placed = true;
    return { status: 201, json: { order: state.order, payment: state.order.payment, status: "payment_pending", assignment_status: "payment_pending", acceptance_deadline_at: null, seller_will_receive_after_payment: true } };
  },
  "/marketplace/me/orders": () => (state.placed ? { items: [state.order], total: 1 } : { items: [], total: 0 }),
  [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
  [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "full_payment", status: state.order.payment_status as string, amount: PRICE }]),
  [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
  "/payments/providers": ATMOS_ON,
  "/payments/pay-1": () => ({ id: "pay-1", amount: PRICE, currency: "UZS", status: state.order.payment_status, method: "atmos", kind: "marketplace_full", order_id: ORDER_ID }),
  "POST /payments/pay-1/atmos/checkout": { payment_id: "pay-1", status: "pending", provider: "atmos", payment_url: URL2 },
  ...extra,
});

async function openDialog(page: Page) {
  await page.goto(`/uz/lawyers/${SELLER}`);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.getByRole("button", { name: "Sotib olish" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Xizmatni sotib olish" });
  await dialog.getByRole("textbox").first().fill("ATMOS orqali to'lovni sinab ko'ryapman");
  return dialog;
}

test("ATMOS switched off: it is not offered at all", async ({ page }) => {
  const state: State = { order: unpaid(), placed: false };
  await mockBackend(page, await signIn(page, CLIENT, routes(state, [], { "/payments/providers": ATMOS_OFF })));
  const dialog = await openDialog(page);
  await expect(dialog.getByRole("button", { name: /^Telegram/ })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: /^ATMOS/ })).toHaveCount(0);
});

test("marketplace: ATMOS checkout opens once from a click, stays pending until the backend says paid, then the seller's clock", async ({ page, context }) => {
  const state: State = { order: unpaid(), placed: false };
  const bodies: Record<string, unknown>[] = [];
  const opened: string[] = [];
  await context.route(/checkout\.atmos\.uz\/invoice\/opaque-token/, (r) => {
    opened.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<h1>ATMOS</h1>" });
  });
  const mock = await mockBackend(page, await signIn(page, CLIENT, routes(state, bodies)));
  const dialog = await openDialog(page);

  await dialog.getByRole("button", { name: /^ATMOS/ }).click();
  await expect(dialog.getByRole("button", { name: /^ATMOS/ })).toHaveAttribute("aria-pressed", "true");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/atmos-form${sfx}.png` });
  await dialog.getByRole("button", { name: "Sotib olish" }).click();

  // The request names ATMOS; no amount is built on this side.
  expect(bodies[0]).toMatchObject({ payment_provider: "atmos", currency: "UZS", contact_channel: "chat", selected_option_ids: [] });
  expect("amount" in bodies[0]).toBe(false);
  const panel = dialog.locator(".ckp--atmos");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("1 000");
  await expect(panel.getByRole("status").first()).toHaveText("To'lov kutilmoqda");
  // Nothing opened before the client asks.
  expect(opened).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/atmos-pending${sfx}.png` });

  // The button opens the backend's page exactly as given, in a new tab.
  const [tab] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "ATMOS orqali to'lash" }).click()]);
  await tab.waitForURL(URL1);
  await expect(panel.getByRole("status").first()).toHaveText("To'lovni ATMOS'da yakunlang");
  // A second press does not open a second window.
  const pages = context.pages().length;
  await panel.getByRole("button", { name: "ATMOS sahifasiga qaytish" }).click();
  await page.waitForTimeout(300);
  expect(context.pages().length).toBe(pages);
  expect(opened).toEqual([URL1]);

  // Closing the checkout without paying keeps the order pending.
  await tab.close();
  await expect(panel.getByRole("status").first()).toHaveText("To'lov tasdig'i kutilmoqda", { timeout: 5000 });
  await expect(dialog.getByText("To'lov tasdiqlandi")).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("opaque-token");

  // A spent link: a new one only from POST /payments/{id}/atmos/checkout.
  const [tab2] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "Yangi havola olish" }).click()]);
  await tab2.waitForURL(URL2);
  expect(mock.count("POST", /^\/payments\/pay-1\/atmos\/checkout$/)).toBe(1);
  await tab2.close();

  // ATMOS calls the backend; the order says paid; the seller's 30 minutes show.
  state.order = sentToSeller();
  await mock.push({ event: "marketplace.full_payment_paid", order_id: ORDER_ID, payment_id: "pay-1", payment_status: "paid", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline(), response_minutes: 30 });
  await expect(dialog.locator(".ckp--atmos.ckp--slim")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator(".mk-steps li[aria-current=step]")).toHaveText(/Mutaxassis qabuli/, { timeout: 15_000 });
  await expect(dialog.getByText(/2\d:\d\d/).first()).toBeVisible();
  // The frontend never calls the callback.
  expect(mock.count("POST", /atmos\/callback/)).toBe(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/atmos-paid${sfx}.png` });
});

test("refused checkout URL: nothing opens, support is named, and orders are checked first", async ({ page, context }) => {
  const state: State = { order: unpaid(), placed: false };
  const opened: string[] = [];
  await context.route(/checkout\.atmos\.uz/, (r) => (opened.push(r.request().url()), r.fulfill({ status: 200, body: "" })));
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, routes(state, [], { [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: { status: 502, json: { detail: { code: "payment_provider_checkout_url_rejected", payment_url: URL1 } } } })),
  );
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: /^ATMOS/ }).click();
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  const box = dialog.locator('[data-ai-id="marketplace.purchase.atmos-error"]');
  await expect(box).toContainText("To'lov sahifasini xavfsiz ochib bo'lmadi");
  await expect(box.getByRole("link", { name: "Qo'llab-quvvatlashga yozish" })).toHaveAttribute("href", /\/portal\/client\/support$/);
  await expect(box.getByRole("button", { name: "Qayta urinish" })).toHaveCount(0);
  expect(mock.count("GET", /^\/marketplace\/me\/orders$/)).toBeGreaterThan(0);
  expect(opened).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/atmos-url-rejected${sfx}.png` });
});

test("a timed-out purchase finds the order it made instead of making another", async ({ page }) => {
  const state: State = { order: unpaid(), placed: false };
  const mock = await mockBackend(
    page,
    await signIn(
      page,
      CLIENT,
      routes(state, [], {
        [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: () => {
          state.placed = true;
          return { status: 504, json: { detail: "Gateway Timeout" } };
        },
      }),
    ),
  );
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: /^ATMOS/ }).click();
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  await expect(dialog.locator('a[href$="/portal/client/marketplace-orders/' + ORDER_ID + '"]').first()).toBeVisible();
  expect(mock.count("POST", /purchase-request$/)).toBe(1);
});

test("fiscal mismatch: a plain refusal, no automatic retry", async ({ page }) => {
  const state: State = { order: unpaid(), placed: false };
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, routes(state, [], { [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: { status: 422, json: { detail: { code: "atmos_fiscal_items_amount_mismatch" } } } })),
  );
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: /^ATMOS/ }).click();
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  const box = dialog.locator('[data-ai-id="marketplace.purchase.atmos-error"]');
  await expect(box).toContainText("To'lov sozlamalarida xatolik bor");
  await expect(box.getByRole("button", { name: "Qayta urinish" })).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(mock.count("POST", /purchase-request$/)).toBe(1);
});

test("order page after a refresh: the unpaid ATMOS order renews its checkout and opens it", async ({ page, context }) => {
  const state: State = { order: unpaid("pending", false), placed: true };
  await context.route(/checkout\.atmos\.uz\/invoice\/opaque-token/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>ATMOS</h1>" }));
  const mock = await mockBackend(page, await signIn(page, CLIENT, routes(state, [])));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const panel = page.locator(".ckp--atmos");
  await expect(panel).toContainText("1 000");
  await expect(panel.getByRole("status").first()).toHaveText("To'lov kutilmoqda");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/atmos-order-page${sfx}.png` });
  // No link kept anywhere: the backend gives a fresh one.
  const [tab] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "ATMOS orqali to'lash" }).click()]);
  await tab.waitForURL(URL2);
  expect(mock.count("POST", /^\/payments\/pay-1\/atmos\/checkout$/)).toBe(1);
  await tab.close();
});

test("order page: an error card fails the payment and the order is not activated", async ({ page }) => {
  const state: State = { order: unpaid("failed", false), placed: true };
  await mockBackend(page, await signIn(page, CLIENT, routes(state, [])));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  const panel = page.locator(".ckp--atmos");
  await expect(panel.getByRole("status").first()).toHaveText("To'lov o'tmadi");
  await expect(panel).toContainText("buyurtma faollashmadi");
  await expect(panel.getByRole("button", { name: "ATMOS orqali to'lash" })).toHaveCount(0);
});

test("order page while ATMOS is off: an honest Unavailable, no active button", async ({ page }) => {
  const state: State = { order: unpaid("pending", false), placed: true };
  await mockBackend(page, await signIn(page, CLIENT, routes(state, [], { "/payments/providers": ATMOS_OFF })));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  const panel = page.locator(".ckp--atmos");
  await expect(panel.getByRole("status").first()).toHaveText("Hozircha mavjud emas");
  await expect(panel.getByRole("button", { name: "Hozircha mavjud emas" })).toBeDisabled();
});
