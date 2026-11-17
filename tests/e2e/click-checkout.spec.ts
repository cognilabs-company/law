import { expect, test, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// TEZKOR_HIMOYA_CLICK_FRONTEND_INTEGRATION_2026_11_16.md, against a mocked
// backend (no money moves): Click is offered only when /payments/providers
// says so, the purchase sends payment_provider "click", the opaque checkout is
// opened unchanged in a new tab, nothing reads "paid" until GET /payments/{id}
// does, an old link is renewed only through the backend, and a paid payment
// offers its receipt.
const SELLER = "u-adv";
const PRICE = 1000;
const URL1 = "https://lexgo.api.cognilabs.org/payments/click/checkout/opaque-token-1";
const URL2 = "https://lexgo.api.cognilabs.org/payments/click/checkout/opaque-token-2";
// Screenshots: CLICK_SHOTS=<dir>, CLICK_DARK=1, CLICK_NARROW=1.
const SHOTS = process.env.CLICK_SHOTS ?? "";
test.use({
  viewport: process.env.CLICK_NARROW ? { width: 375, height: 812 } : { width: 1470, height: 920 },
  colorScheme: process.env.CLICK_DARK ? "dark" : "light",
  locale: "uz-UZ",
});
const sfx = `${process.env.CLICK_DARK ? "-dark" : "-light"}${process.env.CLICK_NARROW ? "-phone" : ""}`;
const deadline = () => new Date(Date.now() + 29 * 60_000).toISOString();

const unpaid = () =>
  order({
    status: "pending_payment",
    payment_status: "pending",
    contact_unlocked: false,
    price: PRICE,
    payment: { id: "pay-1", status: "pending", amount: PRICE, currency: "UZS", provider: "click", payment_url: URL1 },
    details: { assignment_status: "payment_pending", client_status: "payment_required" },
  });
const sentToSeller = () =>
  order({
    status: "sent_to_seller",
    payment_status: "paid",
    contact_unlocked: false,
    price: PRICE,
    payment: { id: "pay-1", status: "paid", amount: PRICE, currency: "UZS", provider: "click" },
    details: { assignment_mode: "client_selected_external", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline(), seller_response_minutes: 30, client_status: "sent_to_seller" },
  });

type State = { order: Record<string, unknown>; pay: string; placed: boolean };
const routes = (state: State, bodies: Record<string, unknown>[], extra: Routes = {}): Routes => ({
  "/marketplace/lawyers": { items: [{ user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true }], count: 1, total: 1 },
  [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
  [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Click test xizmati - 1 000 so‘m", base_price: PRICE, selected_price: PRICE, effective_price: PRICE, currency: "UZS", category_title: "Test" }] },
  "POST /marketplace/services/svc-1/quote": { base_price: PRICE, total_price: PRICE, currency: "UZS", breakdown: [] },
  [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: (b: unknown) => {
    bodies.push(b as Record<string, unknown>);
    state.placed = true;
    return { work_id: "ADV-CLK01", status: "payment_pending", assignment_status: "payment_pending", acceptance_deadline_at: null, next_status: "full_payment_required", seller_will_receive_after_payment: true, payment_opens_after_seller_acceptance: false, order: state.order, payment: state.order.payment };
  },
  "/marketplace/me/orders": () => (state.placed ? { items: [state.order], total: 1 } : { items: [], total: 0 }),
  [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
  [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "full_payment", status: state.pay, amount: PRICE }]),
  [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
  // The production answer (§1): Click only, Telegram as the fallback.
  "/payments/providers": { items: [{ provider: "click", enabled: true, label: "Click", status: "configured" }], fallback_provider: "telegram_manual", currency: "UZS" },
  "/payments/pay-1": () => ({ id: "pay-1", amount: PRICE, currency: "UZS", status: state.pay, method: "click", kind: "marketplace_full", order_id: ORDER_ID, receipt_url: state.pay === "paid" ? "/payments/pay-1/receipt" : null }),
  "POST /payments/pay-1/click/checkout": { payment_id: "pay-1", status: "pending", provider: "click", payment_url: URL2, provider_payment_id: "c-1" },
  ...extra,
});

async function openDialog(page: Page) {
  await page.goto(`/uz/lawyers/${SELLER}`);
  // The dev server's own issue badge sits over the footer on a phone.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.getByRole("button", { name: "Sotib olish" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Xizmatni sotib olish" });
  await dialog.getByRole("textbox").first().fill("Click orqali to'lovni sinab ko'ryapman");
  return dialog;
}

test("marketplace: Click by default, the opaque link in a new tab, paid only when the backend says so, then the receipt", async ({ page, context }) => {
  const state: State = { order: unpaid(), pay: "pending", placed: false };
  const bodies: Record<string, unknown>[] = [];
  const opened: string[] = [];
  await context.route(/payments\/click\/checkout\/opaque-token/, (r) => {
    opened.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Click Up ilovasida tasdiqlang</h1>" });
  });
  const mock = await mockBackend(page, await signIn(page, CLIENT, routes(state, bodies)));
  const dialog = await openDialog(page);

  // Only Click is on (§1), and it is the chosen way to pay.
  const clickOpt = dialog.getByRole("button", { name: /^Click/ });
  await expect(clickOpt).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: /^Telegram/ })).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-form${sfx}.png` });
  await dialog.getByRole("button", { name: "Sotib olish" }).click();

  // §4: the request names Click; no amount, no ids in anything the page built.
  expect(bodies[0]).toMatchObject({ payment_provider: "click", currency: "UZS", contact_channel: "chat" });
  expect("amount" in bodies[0]).toBe(false);
  const panel = dialog.locator(".ckp");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("img", { name: "Click" })).toBeVisible();
  await expect(panel).toContainText("1 000");
  await expect(panel).toContainText("UZS");
  await expect(panel).toContainText("Click Up ilovasini oching va hisob-fakturani tasdiqlang");
  await expect(panel.getByRole("status")).toHaveText("To'lov kutilmoqda");
  await expect(dialog.getByText(/To'lov tasdiqlandi/)).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-pending${sfx}.png` });

  // The Click button opens the backend's page exactly as given, in a new tab.
  const [tab] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "Click orqali to'lash" }).click()]);
  await tab.waitForURL(URL1);
  expect(opened).toEqual([URL1]);
  await tab.close();
  // The link never lands in storage (§2).
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("opaque-token");

  // A spent link: a new one comes only from POST /payments/{id}/click/checkout (§13).
  const [tab2] = await Promise.all([context.waitForEvent("page"), panel.getByRole("button", { name: "Yangi havola olish" }).click()]);
  // The tab opens inside the click, then goes to the backend's new page.
  await tab2.waitForURL(URL2);
  expect(mock.count("POST", /^\/payments\/pay-1\/click\/checkout$/)).toBe(1);
  await tab2.close();

  // Click's signed callback lands: REST says paid, the order goes to the lawyer.
  state.pay = "paid";
  state.order = sentToSeller();
  await mock.push({ event: "marketplace.full_payment_paid", order_id: ORDER_ID, payment_id: "pay-1", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline() });
  await expect(dialog.locator(".ckp--slim")).toBeVisible({ timeout: 15_000 });
  // Click web contract 2026-11-17 §7: "Payment confirmed".
  await expect(dialog.locator(".ckp--slim").getByRole("status")).toHaveText("To'lov tasdiqlandi");
  await expect(dialog.locator(".mk-steps li[aria-current=step]")).toHaveText(/Mutaxassis qabuli/, { timeout: 15_000 });
  await expect(dialog.getByRole("button", { name: "Chekni yuklab olish" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-paid${sfx}.png` });
});

test("marketplace: a duplicate active order goes straight to that order (§14; web contract 2026-11-17 §8)", async ({ page }) => {
  const state: State = { order: unpaid(), pay: "pending", placed: false };
  await mockBackend(
    page,
    await signIn(
      page,
      CLIENT,
      routes(state, [], {
        [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: { status: 409, json: { detail: { code: "marketplace_order_already_active", order_id: ORDER_ID, work_id: "ADV-OLD01", status: "pending_payment" } } },
      }),
    ),
  );
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  await page.waitForURL(new RegExp(`/portal/client/marketplace-orders/${ORDER_ID}$`));
});

test("Click switched off: it is not offered at all (§1)", async ({ page }) => {
  const state: State = { order: unpaid(), pay: "pending", placed: false };
  await mockBackend(
    page,
    await signIn(
      page,
      CLIENT,
      routes(state, [], {
        "/payments/providers": { items: [{ provider: "telegram_manual", enabled: true, label: "Telegram", status: "ready" }, { provider: "click", enabled: false, label: "Click", status: "disabled" }], fallback_provider: "telegram_manual", currency: "UZS" },
      }),
    ),
  );
  const dialog = await openDialog(page);
  await expect(dialog.getByRole("button", { name: /^Telegram/ })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: /^Click/ })).toHaveCount(0);
});

const PRO = { id: "p-pro", slug: "lexgo-ai-pro", name: "Pro", price: 99000, monthly_price: 99000, six_month_price: 564300, yearly_price: 1000000, is_active: true, audiences: ["client"], entitlements: { ai_requests: 1000 } };
const FREE = { id: "p-free", slug: "lexgo-ai-free", name: "Free", price: 0, monthly_price: 0, is_active: true, audiences: ["client"], entitlements: { ai_requests: 5 } };
const CLICK_ONLY = { items: [{ provider: "click", enabled: true, label: "Click", status: "configured" }], fallback_provider: "telegram_manual", currency: "UZS" };

test("plan: the server prices it, Click pays it, the subscription is re-read once paid (§6)", async ({ page, context }) => {
  let pay = "pending";
  const bodies: Record<string, unknown>[] = [];
  await context.route(/payments\/click\/checkout\/opaque-token/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Click</h1>" }));
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/subscription-plans": [FREE, PRO],
      "/subscription-plans/p-pro/quote": (_b: unknown, url: URL) => ({ plan_id: "p-pro", billing_period: url.searchParams.get("billing_period") ?? "monthly", currency: "UZS", months: 1, base_amount: 99000, discount_amount: 0, amount: 99000, campaign: null }),
      "/payments/providers": CLICK_ONLY,
      "POST /subscription-plans/p-pro/purchase": (b: unknown) => {
        bodies.push(b as Record<string, unknown>);
        return { work_id: "SUB-CLK01", subscription_id: "sub-1", status: "pending_payment", pricing: {}, payment: { id: "pay-s", provider: "click", status: "pending", amount: 99000, currency: "UZS", payment_url: URL1 } };
      },
      "/payments/pay-s": () => ({ id: "pay-s", amount: 99000, currency: "UZS", status: pay, method: "click", kind: "subscription" }),
    }),
  );
  await page.goto("/uz/portal/client/subscription");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]').getByRole("button").last().click();
  await page.locator('[data-ai-id="pricing.checkout-review.pay"]').click();
  const dialog = page.getByRole("dialog", { name: "Click orqali to'lov" });
  await expect(dialog.locator(".ckp")).toContainText("99 000");
  expect(bodies[0]).toMatchObject({ billing_period: "monthly", provider: "click", currency: "UZS", family_members: [], provider_payload: {} });
  expect("amount" in bodies[0]).toBe(false);
  // Never the generic POST /payments for a plan (§10).
  expect(mock.count("POST", /^\/payments$/)).toBe(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-plan${sfx}.png` });
  pay = "paid";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(dialog.getByText("To'lov tasdiqlandi")).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("button", { name: "Chekni yuklab olish" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-plan-paid${sfx}.png` });
});

test("gift: no code or link before payment; after Click confirms, the link (§7)", async ({ page }) => {
  let pay = "pending";
  const bodies: Record<string, unknown>[] = [];
  const gift = () => ({ id: "g1", work_id: "GFT-CLK01", plan_name: "Pro", recipient_phone: "+998901234567", term_months: 6, status: pay === "paid" ? "unclaimed" : "pending_payment", gift_code: "ABC123", share_url: "https://tezkorhimoya.uz/gift/ABC123", payment_id: "pay-g" });
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/subscription-plans": [FREE, { ...PRO, allowed_gift_durations: [6] }],
      "/services": { items: [], total: 0 },
      "/payments/providers": CLICK_ONLY,
      "/gifts": () => ({ items: bodies.length ? [gift()] : [] }),
      "POST /gifts": (b: unknown) => {
        bodies.push(b as Record<string, unknown>);
        return { ...gift(), payment: { id: "pay-g", provider: "click", status: "pending", amount: 564300, currency: "UZS", payment_url: URL1 } };
      },
      "/payments/pay-g": () => ({ id: "pay-g", amount: 564300, currency: "UZS", status: pay, method: "click", kind: "gift" }),
    }),
  );
  await page.goto("/uz/portal/client/gifts");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.locator('[data-ai-target="button:give-gift"]').click();
  const dialog = page.getByRole("dialog").filter({ has: page.locator('input[type="tel"], .ckp') });
  await dialog.locator('input[type="tel"]').fill("901234567");
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.locator(".ckp")).toContainText("564 300");
  expect(bodies[0]).toMatchObject({ plan_id: "p-pro", term_months: 6, recipient_phone: "+998901234567", provider: "click" });
  // The code and the link wait for the payment.
  await expect(dialog).not.toContainText("ABC123");
  await expect(page.locator("main")).not.toContainText("tezkorhimoya.uz/gift");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-gift${sfx}.png` });
  pay = "paid";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator('.plx-share input[readonly]')).toHaveValue("https://tezkorhimoya.uz/gift/ABC123", { timeout: 15_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-gift-paid${sfx}.png` });
});

test("SOS: the operator's payment arrives live and opens the Click dialog (§8)", async ({ page }) => {
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/payments/providers": CLICK_ONLY,
      "/payments/pay-sos": { id: "pay-sos", amount: 1000000, currency: "UZS", status: "pending", method: "click", kind: "sos" },
    }),
  );
  await page.goto("/uz/portal/client/sos");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await expect.poll(() => mock.sockets.filter((s) => s.url.includes("/ws/users/me")).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await mock.push({ event: "notification.created", notification: { kind: "sos.payment_requested", title: "SOS huquqiy yordam", data: { payment_id: "pay-sos", amount: 1000000, payment_url: URL1, sos_id: "sos-1" } }, unread_count: 1 });
  const dialog = page.getByRole("dialog", { name: "Click orqali to'lov" });
  await expect(dialog.locator(".ckp")).toContainText("1 000 000");
  await expect(dialog.locator(".ckp")).toContainText("SOS huquqiy yordam");
  await expect(dialog.getByRole("button", { name: "Click orqali to'lash" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/click-sos${sfx}.png` });
});
