import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// TSK-900422 — enterprise contract 2026-10-27 §4: the client pays 100%
// first (Telegram, or Payme / Click when connected); only a confirmed
// payment sends the order to the seller, who has 30 minutes to accept; the
// chat opens on acceptance. No 10% advance anywhere, and never "paid"
// before the payment's own status says so.
const SELLER = "u-adv";
// Screenshots: BUY_SHOTS=<dir>, BUY_DARK=1, BUY_NARROW=1.
const SHOTS = process.env.BUY_SHOTS ?? "";
test.use({
  viewport: process.env.BUY_NARROW ? { width: 375, height: 812 } : { width: 1440, height: 960 },
  colorScheme: process.env.BUY_DARK ? "dark" : "light",
});
const sfx = `${process.env.BUY_DARK ? "-dark" : "-light"}${process.env.BUY_NARROW ? "-phone" : ""}`;
const PRICE = 879749;
const deadline = () => new Date(Date.now() + 29 * 60_000).toISOString();

const unpaid = (provider = "click", url = "") =>
  order({
    status: "pending_payment",
    payment_status: "pending",
    contact_unlocked: false,
    price: PRICE,
    payment: { id: "pay-1", status: "pending", amount: PRICE, currency: "UZS", provider, payment_url: url },
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
const chatOpen = () =>
  order({
    status: "in_progress",
    payment_status: "paid",
    contact_unlocked: true,
    can_start_chat: true,
    secure_chat_room_id: "room-live",
    chat_url: "/secure-chats/room-live/messages",
    price: PRICE,
    payment: { id: "pay-1", status: "paid", amount: PRICE, currency: "UZS", provider: "click" },
    details: { assignment_status: "accepted", secure_chat_room_id: "room-live" },
  });

const placed = new WeakSet<object>();
const shopRoutes = (state: { order: Record<string, unknown> }, purchase: (body: Record<string, unknown>) => unknown): Routes => ({
  "/marketplace/lawyers": { items: [{ user_id: SELLER, name: "Test Advokat", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, specializations: ["oila-va-nikoh"], is_verified: true }], count: 1, total: 1 },
  [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Test Advokat", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
  [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Test xizmat", base_price: PRICE, selected_price: PRICE, effective_price: PRICE, currency: "UZS", category_title: "Оила ва никоҳ" }] },
  "POST /marketplace/services/svc-1/quote": { base_price: PRICE, total_price: PRICE, currency: "UZS", breakdown: [] },
  [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: (b: unknown) => ((placed.add(state), purchase(b as Record<string, unknown>))),
  // The order exists only once it was requested (before that, the service
  // would show as already bought).
  "/marketplace/me/orders": () => (placed.has(state) || state.order.payment_status === "paid" ? { items: [state.order], total: 1 } : { items: [], total: 0 }),
  [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
  [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "full_payment", status: String((state.order.payment as { status: string }).status), amount: PRICE }]),
  [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
  // GET /payments/providers (2026-11-21 contract §1): Click and ATMOS only.
  // A list that still names the Telegram approval or Payme never offers them.
  "/payments/providers": {
    items: [
      { provider: "telegram_manual", enabled: true, label: "Telegram orqali tasdiqlash", status: "ready" },
      { provider: "payme", enabled: true, label: "Payme", status: "configured" },
      { provider: "click", enabled: true, label: "Click", status: "configured" },
      { provider: "atmos", enabled: true, label: "ATMOS", status: "configured" },
    ],
    fallback_provider: "click",
    currency: "UZS",
  },
  "/payments/pay-1": { id: "pay-1", amount: PRICE, currency: "UZS", status: "pending", method: "click", kind: "marketplace_full" },
  "POST /payments/pay-1/atmos/checkout": { payment_id: "pay-1", status: "pending", provider: "atmos", payment_url: "https://checkout.atmos.uz/invoice/opaque" },
});
const respond = (o: Record<string, unknown>, telegramSent = true) => ({
  work_id: "ADV-5IIPV",
  order: o,
  payment: o.payment,
  telegram_sent: telegramSent,
  status: "payment_pending",
  assignment_status: "payment_pending",
  acceptance_deadline_at: null,
  next_status: "full_payment_required",
  seller_will_receive_after_payment: true,
});
async function openDialog(page: Page) {
  await page.goto(`/uz/lawyers/${SELLER}`);
  await page.getByRole("button", { name: "Sotib olish" }).last().click();
  const dialog = page.getByRole("dialog", { name: "Xizmatni sotib olish" });
  await dialog.getByRole("textbox").first().fill("Ajrashish bo'yicha maslahat kerak, bolalar masalasi bor");
  await dialog.getByText("1 soat ichida").click();
  return dialog;
}

test("pay 100% with Click first (no Telegram, no Payme); the seller gets it only once paid; the chat opens on acceptance", async ({ page }) => {
  const state = { order: unpaid("click") };
  const bodies: Record<string, unknown>[] = [];
  await mockBackend(page, await signIn(page, CLIENT, shopRoutes(state, (b) => (bodies.push(b), respond(state.order)))));
  const dialog = await openDialog(page);
  // Click is the default; ATMOS is the other way; Telegram and Payme are gone.
  await expect(dialog.getByRole("button", { name: /^Click/ })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: /^ATMOS/ })).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: /^Telegram/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Payme/ })).toHaveCount(0);
  await expect(dialog.locator(".mk-steps li")).toHaveText([/So'rov/, /To'liq to'lov/, /Mutaxassis qabuli/, /Chat va ish/]);
  await expect(dialog.getByText("To'lov · 100%")).toBeVisible();
  await expect(dialog).not.toContainText("10%");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/buy-form${sfx}.png` });
  await dialog.getByRole("button", { name: "Sotib olish" }).click();

  const now = dialog.locator(".mk-steps li[aria-current=step]");
  await expect(now).toHaveText(/To'liq to'lov/);
  await expect(dialog.getByText(/Telegram/)).toHaveCount(0);
  await expect(dialog.getByText(/To'lov tasdiqlandi/)).toHaveCount(0);
  expect(bodies[0]).toMatchObject({ payment_provider: "click", currency: "UZS", contact_speed: "within_1_hour" });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/buy-paying${sfx}.png` });

  // Click confirms on the server: now, and only now, the seller has 30 minutes.
  state.order = sentToSeller();
  await expect(now).toHaveText(/Mutaxassis qabuli/, { timeout: 20_000 });
  await expect(dialog.getByText(/Mutaxassis javobi kutilmoqda · 2\d:\d\d/)).toBeVisible({ timeout: 20_000 });

  state.order = chatOpen();
  await expect(now).toHaveText(/Chat va ish/, { timeout: 20_000 });
  await expect(dialog.getByRole("button", { name: "Advokat bilan bog'lanish" })).toBeVisible();
});

test("Click not working: a clear message and one tap to pay with ATMOS instead", async ({ page }) => {
  const state = { order: unpaid("atmos") };
  const bodies: Record<string, unknown>[] = [];
  await mockBackend(
    page,
    await signIn(
      page,
      CLIENT,
      shopRoutes(state, (b) => {
        bodies.push(b);
        if (b.payment_provider === "click") return { status: 503, json: { detail: { code: "payment_provider_unavailable", message: "Click upstream timeout 7781" } } };
        return respond(state.order);
      }),
    ),
  );
  const dialog = await openDialog(page);
  await dialog.getByRole("button", { name: "Sotib olish" }).click();
  const fallback = dialog.locator(".mk-pay__fallback");
  await expect(fallback).toContainText("Click hozircha ishlamayapti.");
  await expect(fallback).toContainText("Pul yechilmadi");
  // No raw backend text, and no Telegram.
  await expect(dialog).not.toContainText("upstream");
  await expect(dialog).not.toContainText("Telegram");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/buy-fallback${sfx}.png` });
  await fallback.getByRole("button", { name: "ATMOS orqali to'lash" }).click();
  await expect(dialog.locator(".mk-steps li[aria-current=step]")).toHaveText(/To'liq to'lov/);
  expect(bodies.map((b) => b.payment_provider)).toEqual(["click", "atmos"]);
});

test("the client's order page: paid in full, the seller's time left, nothing more to pay", async ({ page }) => {
  const state = { order: sentToSeller() };
  await mockBackend(page, await signIn(page, CLIENT, shopRoutes(state, () => respond(state.order))));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.getByText("Mutaxassis javobi kutilmoqda").first()).toBeVisible();
  await expect(page.getByRole("timer", { name: /Javob uchun qolgan vaqt: 2\d:\d\d/ })).toBeVisible();
  await expect(page.getByText(/To'lov to'liq qabul qilingan/)).toBeVisible();
  await expect(page.locator("main")).not.toContainText("10%");
});

test("the assigned lawyer gets a paid order, sees the 30 minutes and accepts it", async ({ page }) => {
  let accepted = false;
  const state = { order: sentToSeller() };
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
      "/marketplace/me/orders": () => ({ items: [state.order], total: 1 }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "full_payment", status: "paid", amount: PRICE }]),
      [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
      [`POST /orders/${ORDER_ID}/accept`]: () => ((accepted = true), (state.order = chatOpen()), { id: ORDER_ID, status: "in_progress" }),
    }),
  );
  await page.goto("/uz/portal/advocate/marketplace-orders");
  await expect(page.getByText("Yangi buyurtmalar — javob bering")).toBeVisible();
  await expect(page.locator(".mko-req")).toHaveCount(1);
  await page.goto(`/uz/portal/advocate/marketplace-orders/${ORDER_ID}`);
  await expect(page.getByText("Yangi buyurtma sizga yuborildi")).toBeVisible();
  await expect(page.getByText(/Mijoz to'liq to'lagan/).first()).toBeVisible();
  await expect(page.getByRole("timer", { name: /Javob berish uchun qolgan vaqt: 2\d:\d\d/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("10%");
  await page.getByRole("button", { name: "Qabul qilish" }).click();
  await expect.poll(() => accepted).toBe(true);
});

test("an assignment the seller list leaves out still shows, read from /orders", async ({ page }) => {
  const waiting = sentToSeller();
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "/marketplace/me/orders": { items: [], total: 0 },
      "/orders": { items: [{ id: ORDER_ID, source: "marketplace", status: "sent_to_seller", work_id: "ORD-TEST1" }, { id: "other", source: "web", status: "new" }] },
      [`/marketplace/me/orders/${ORDER_ID}`]: () => waiting,
    }),
  );
  await page.goto("/uz/portal/advocate/marketplace-orders");
  await expect(page.getByText("Yangi buyurtmalar — javob bering")).toBeVisible();
  await expect(page.locator(".mko-req")).toHaveCount(1);
});
