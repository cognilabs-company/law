import { expect, test, type Page } from "@playwright/test";
import { CALL_CENTER, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// TSK-131840 end to end, against a mocked backend: no suitable specialist →
// the client picks another specialist or a full refund. A refund can never
// be asked twice (double click, lost answer, retry), its amount shows before
// confirming and its status follows live; "another specialist" keeps the same
// order going; the operator sees the offer's steps and who did what.

const look = { colorScheme: process.env.RS_DARK ? ("dark" as const) : ("light" as const), ...(process.env.RS_NARROW ? { viewport: { width: 420, height: 900 } } : {}) };
test.use(look);
const shot = async (page: Page, name: string, target?: string) => {
  if (!process.env.RS_SHOTS) return;
  await page.waitForTimeout(350);
  const el = target ? page.locator(target).first() : null;
  if (el) await el.screenshot({ path: `${process.env.RS_SHOTS}/${name}.png` });
  else await page.screenshot({ path: `${process.env.RS_SHOTS}/${name}.png` });
};

const deadline = () => new Date(Date.now() + 24 * 60_000).toISOString();
const offered = (extra: Record<string, unknown> = {}) =>
  order({
    status: "resolution_required",
    payment_status: "paid",
    service_title: "Ajrashish bo'yicha maslahat",
    resolution: { offer: { id: "of-1", status: "pending_client_choice", options: ["reassign", "refund"], deadline_at: deadline(), message: "Kechirasiz, tanlangan advokat band. Boshqa mutaxassis yoki to'liq qaytarishni tanlang." }, refund: null, can_choose: true },
    ...extra,
  });

test("a refund is asked once — double click, lost answer and retry — then follows live to closed", async ({ page }) => {
  const st = {
    order: offered() as Record<string, unknown>,
    refund: null as null | Record<string, unknown>,
    timeline: [
      { id: "t0", type: "escalated", status: "seller_declined", at: "2026-10-26T08:00:00Z", actor: { role: "system" } },
      { id: "t1", type: "resolution_offered", status: "pending_client_choice", at: "2026-10-26T08:05:00Z", actor: { name: "Dilnoza Operator", role: "operator" }, message: "Kechirasiz, tanlangan advokat band." },
    ] as Record<string, unknown>[],
  };
  const keys: string[] = [];
  let refundsCreated = 0;
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => st.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: () => ({ items: st.timeline }),
    [`/marketplace/me/orders/${ORDER_ID}/refund`]: () => ({ order_id: ORDER_ID, refund: st.refund, provider_enabled: true }),
  });
  const mock = await mockBackend(page, routes);
  // The backend side of the choice: one refund per Idempotency-Key. The
  // first answer is processed, then lost on the way back.
  await page.route(/\/marketplace\/me\/orders\/[^/]+\/resolution$/, async (route) => {
    const key = route.request().headers()["idempotency-key"] ?? "";
    keys.push(key);
    const replay = keys.indexOf(key) !== keys.length - 1;
    if (!replay) {
      refundsCreated += 1;
      st.refund = { request_id: "rf-1", amount: 110000, currency: "UZS", status: "pending", provider_enabled: true, updated_at: "2026-10-26T08:10:00Z" };
      st.order = offered({ status: "refund_pending", resolution: { offer: { id: "of-1", status: "selected", options: [], selected_choice: "refund", selected_at: "2026-10-26T08:10:00Z" }, refund: st.refund, can_choose: false } });
      st.timeline = [...st.timeline, { id: "t2", type: "resolution_selected", status: "selected", choice: "refund", at: "2026-10-26T08:10:00Z", actor: { role: "client" } }];
    }
    if (keys.length === 1) return route.abort("failed");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ choice: "refund", status: "refund_pending", idempotent_replay: replay }) });
  });

  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  const card = page.locator(".mrs");
  await expect(card.getByRole("heading", { name: "Mos mutaxassis topilmadi" })).toBeVisible();
  await expect(card.getByText("LexGo operatoridan")).toBeVisible();
  await expect(card.getByText(/Tanlash uchun qolgan vaqt: 2\d:\d\d/)).toBeVisible();
  const refundBtn = card.getByRole("button", { name: /To'liq qaytarish/ });
  await expect(refundBtn).toContainText("110 000 so'm");
  await expect(card.getByRole("button", { name: /Boshqa mutaxassis/ })).toBeVisible();
  await expect(card.locator(".mrs-tl")).toContainText("Dilnoza Operator");
  await shot(page, "client-choice", ".mrs");

  await refundBtn.click();
  const dialog = page.getByRole("dialog", { name: "To'liq qaytarish tanlansinmi?" });
  await expect(dialog.locator(".mrs-sum")).toContainText("110 000 so'm");
  await shot(page, "client-refund-confirm");
  // A double click sends one request.
  await dialog.getByRole("button", { name: "Qaytarishni tanlash" }).dblclick();
  await expect(dialog.getByText(/Javob kelmadi/)).toBeVisible();
  expect(keys).toHaveLength(1);
  // The retry goes with the same key; the backend answers it as a replay.
  await expect(dialog.getByRole("textbox")).toHaveAttribute("readonly", "");
  await dialog.getByRole("button", { name: "Qaytarishni tanlash" }).click();
  await expect(dialog).toBeHidden();
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  expect(refundsCreated).toBe(1);

  // The buttons are gone for good; the tracker shows the amount and step.
  await expect(card.getByRole("button", { name: /To'liq qaytarish/ })).toHaveCount(0);
  await expect(card.getByRole("heading", { name: "Pulingiz qaytarilmoqda" })).toBeVisible();
  await expect(card.locator(".mrs-refund")).toContainText("110 000 so'm");
  await expect(card.locator(".mrs-refund .mrs-chip")).toHaveText("So'rov qabul qilindi");
  await expect(card.locator(".mrs-tl")).toContainText("Siz to'liq qaytarishni tanladingiz");

  // Live: the provider takes it…
  st.refund = { ...st.refund, status: "processing", updated_at: "2026-10-26T08:12:00Z" };
  await mock.push({ event: "marketplace.refund_processing", order_id: ORDER_ID });
  await expect(card.locator(".mrs-refund .mrs-chip")).toHaveText("To'lov tizimida");
  await shot(page, "client-refund-processing", ".mrs");
  // …and returns it: the order is closed, chat and calls with it.
  st.refund = { ...st.refund, status: "succeeded", updated_at: "2026-10-26T08:20:00Z" };
  st.order = { ...st.order, status: "refunded", payment_status: "refunded", chat_read_only: true, calls_enabled: false };
  st.timeline = [...st.timeline, { id: "t3", type: "refund", status: "succeeded", amount: 110000, at: "2026-10-26T08:20:00Z" }];
  await mock.push({ event: "marketplace.refund_approved", order_id: ORDER_ID });
  await expect(card.getByRole("heading", { name: "Buyurtma yopildi" })).toBeVisible();
  await expect(card.locator(".mrs-refund .mrs-chip")).toHaveText("Qaytarildi");
  await expect(card.locator(".mrs-closed")).toContainText("Qo'ng'iroqlar o'chirildi");
  await shot(page, "client-refunded-closed");
  expect(refundsCreated).toBe(1);
});

test("another specialist keeps the same order going", async ({ page }) => {
  const st = { order: offered() as Record<string, unknown> };
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => st.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
    [`POST /marketplace/me/orders/${ORDER_ID}/resolution`]: () => {
      st.order = offered({ status: "sent_to_seller", lawyer_name: "", lawyer_user_id: "", resolution: { offer: { id: "of-1", status: "selected", options: [], selected_choice: "reassign" }, can_choose: false } });
      return { choice: "reassign", status: "reassigned" };
    },
  });
  const mock = await mockBackend(page, routes);
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  const card = page.locator(".mrs");
  await card.getByRole("button", { name: /Boshqa mutaxassis/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Boshqa mutaxassis" }).click();
  await expect(card.getByRole("heading", { name: "Yangi mutaxassis" })).toBeVisible();
  await expect(card.locator(".mrs-path")).toContainText("Ko'rib chiqilmoqda");
  await expect(card).not.toContainText(/qidirilmoqda/);
  await shot(page, "client-reassign-searching", ".mrs");
  // The new specialist accepts: same order id, the work carries on.
  st.order = { ...st.order, status: "in_progress", lawyer_name: "Yangi Advokat", lawyer_user_id: "u-new", started_at: "2026-10-26T09:00:00Z" };
  await mock.push({ event: "marketplace.assignment_received", order_id: ORDER_ID });
  await expect(card.locator(".mrs-path")).toContainText("Yangi Advokat biriktirildi");
  await expect(card.locator(".mrs-path")).toContainText("buyurtma odatdagidek davom etadi");
  await expect(page).toHaveURL(new RegExp(ORDER_ID));
  await shot(page, "client-reassign-continues");
  expect(mock.calls.filter((c) => c.method === "POST" && c.path.endsWith("/resolution"))).toHaveLength(1);
});

test("the operator sees the offer's steps and who did what, live", async ({ page }) => {
  const OP = "op-77";
  const CL = "cl-55";
  const esc = (resolution: Record<string, unknown>, history: Record<string, unknown>[]) => ({
    id: "esc-1",
    status: "open",
    order_id: ORDER_ID,
    order: order({ status: "resolution_required", service_title: "Ajrashish bo'yicha maslahat", client_name: "Test Mijoz" }),
    reason: "seller_declined",
    previous_seller_user_id: "s-1",
    previous_seller_name: "Avvalgi Advokat",
    history,
    assignment_history: [{ seller_user_id: "s-1", seller_name: "Avvalgi Advokat", status: "declined", reason: "Band", rank: 1, created_at: "2026-10-26T07:50:00Z" }],
    resolution,
    actions: ["message", "cancel", "full_refund"],
    created_at: "2026-10-26T08:00:00Z",
  });
  const base = [
    { action: "escalated", reason: "seller_declined", note: "Band", at: "2026-10-26T08:00:00Z" },
    { action: "offer_resolution", actor_user_id: OP, note: "Boshqa mutaxassis yoki to'liq qaytarish", at: "2026-10-26T08:05:00Z" },
  ];
  const st = { item: esc({ offer: { id: "of-1", status: "pending_client_choice", options: ["reassign", "refund"], deadline_at: deadline() }, refund: null, can_choose: false }, base) };
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/assignment-escalations": () => ({ items: [st.item], total: 1 }),
    [`/call-center/clients/${OP}`]: { client: { id: OP, name: "Dilnoza Operator", phone: "" } },
    [`/call-center/clients/${CL}`]: { client: { id: CL, name: "Test Mijoz", phone: "+998900000005" } },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?tab=escalations");
  await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ }).click();
  const row = page.locator(".esc__item").first();
  await expect(row.locator(".esc__chip")).toHaveText("Mijoz tanlovi kutilmoqda");
  const flow = row.locator(".esc__flow");
  await expect(flow).toContainText("Taklif yuborildi");
  await expect(flow.locator('li[data-state="now"]')).toContainText("Mijoz tanlovi kutilmoqda");
  await expect(row.locator(".esc__log").last()).toContainText("Dilnoza Operator");
  await shot(page, "operator-offer-sent", ".esc__item");

  // The client chooses the refund; the event arrives and the row follows.
  st.item = esc(
    { offer: { id: "of-1", status: "selected", options: [], selected_choice: "refund" }, refund: { request_id: "rf-1", amount: 110000, currency: "UZS", status: "processing", provider_enabled: true }, can_choose: false },
    [...base, { action: "resolution_selected", actor_user_id: CL, choice: "refund", at: "2026-10-26T08:10:00Z" }, { action: "refund_processing", at: "2026-10-26T08:11:00Z" }],
  );
  await mock.push({ event: "marketplace.resolution_selected", order_id: ORDER_ID });
  await expect(flow).toContainText("Mijoz tanladi: to'liq qaytarish");
  await expect(flow.locator('li[data-state="now"]')).toContainText("Qaytarish jarayonda");
  await expect(row.locator(".esc__facts")).toContainText("To'lov tizimida · 110 000");
  await expect(row.locator(".esc__log").last()).toContainText("Test Mijoz");
  await shot(page, "operator-history", ".esc__item");
  await expect(row).not.toContainText(OP);
  await expect(row).not.toContainText(CL);
});
