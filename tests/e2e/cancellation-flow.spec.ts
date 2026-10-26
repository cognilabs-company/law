import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Marketplace cancellation, reassignment and refund (contract 2026-10-26),
// against a mocked backend shaped like production: the call-center queue
// updates live, the operator opens a separate discussion (never the private
// service chat), decisions carry one Idempotency-Key, a reassigned paid order
// hides the candidate from the client and asks no second payment, the
// replacement seller accepts within 30 minutes, closed rooms stay readable,
// and a 403 room is a privacy boundary.

const look = { colorScheme: process.env.CF_DARK ? ("dark" as const) : ("light" as const), ...(process.env.CF_NARROW ? { viewport: { width: 420, height: 900 } } : {}) };
test.use(look);
const shot = async (page: Page, name: string, target?: string) => {
  if (!process.env.CF_SHOTS) return;
  await page.waitForTimeout(350);
  if (target) await page.locator(target).first().screenshot({ path: `${process.env.CF_SHOTS}/${name}.png` });
  else await page.screenshot({ path: `${process.env.CF_SHOTS}/${name}.png` });
};

const SERVICE_ROOM = "room-service-1";
const CLIENT_ID = CLIENT.id;
const SELLER_ID = "u-adv";

// Production shape (26 Oct 2026): ids in `parties`, the order under context.
const review = (extra: Record<string, unknown> = {}) => ({
  id: "rev-1",
  status: "open",
  record_type: "cancellation_review",
  reason: "Mutaxassis uch kundan beri javob bermayapti",
  requester: { id: CLIENT_ID, name: "Test Mijoz", role: "client" },
  requester_role: "client",
  parties: { client_user_id: CLIENT_ID, lawyer_user_id: SELLER_ID },
  resolution_options: ["continue", "new_price", "cancel", "reassign", "refund"],
  chat: { room_id: null, status: null, read_only: false, participant_user_ids: [], messages_url: null, close_url: null },
  history: [{ id: "h1", type: "created", actor: { id: CLIENT_ID, name: "Test Mijoz", role: "client" }, at: "2026-10-26T13:00:00Z" }],
  context: {
    order: { id: ORDER_ID, work_id: "MP-TEST1", service_title: "Ajrashish bo'yicha maslahat", status: "cancellation_review", payment_status: "paid", price: 110000, client_user_id: CLIENT_ID, lawyer_user_id: SELLER_ID, secure_chat_room_id: SERVICE_ROOM },
    checklist: [],
    additional_payment: null,
    result_files: [],
  },
  created_at: "2026-10-26T13:00:00Z",
  ...extra,
});

test("operator: live queue, a separate discussion, no service chat, one refund per key", async ({ page }) => {
  const st = { items: [] as unknown[], chat: null as null | Record<string, unknown> };
  const chatBodies: unknown[] = [];
  const keys: string[] = [];
  let refunds = 0;
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/cancellation-reviews": () => ({ items: st.items, total: st.items.length, count: st.items.length, limit: 50, offset: 0 }),
    "/call-center/marketplace/cancellation-reviews/rev-1": () => review(st.chat ? { chat: st.chat } : {}),
    "POST /call-center/marketplace/cancellation-reviews/rev-1/chat": (b: unknown) => {
      chatBodies.push(b);
      st.chat = { room_id: "room-disc-1", status: "active", read_only: false, participant_user_ids: [CALL_CENTER.id, CLIENT_ID], messages_url: "/secure-chats/room-disc-1/messages", close_url: "/call-center/marketplace/cancellation-reviews/rev-1/chat/close" };
      return st.chat;
    },
    "POST /call-center/marketplace/cancellation-reviews/rev-1/chat/close": () => {
      st.chat = { ...st.chat, status: "closed", read_only: true, closed_at: "2026-10-26T13:20:00Z" };
      return st.chat;
    },
    [`/call-center/clients/${CLIENT_ID}`]: { client: { id: CLIENT_ID, name: "Test Mijoz", phone: "+998900000005" } },
    [`/call-center/clients/${SELLER_ID}`]: { client: { id: SELLER_ID, name: "Test Advokat", phone: "" } },
  });
  const mock = await mockBackend(page, routes);
  await page.route(/cancellation-reviews\/rev-1\/resolve$/, async (route) => {
    const key = route.request().headers()["idempotency-key"] ?? "";
    keys.push(key);
    if (keys.indexOf(key) === keys.length - 1) refunds += 1;
    if (keys.length === 1) return route.abort("failed"); // processed, answer lost
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...review({ status: "resolved", resolution: { action: "refund" } }), idempotent_replay: true }) });
  });

  await page.goto("/uz/admin/call-center?tab=cancellations");
  await expect(page.getByText("Mutaxassis uch kundan beri javob bermayapti")).toHaveCount(0);
  await expect.poll(() => mock.sockets.some((x) => /\/ws\/users/.test(x.url))).toBe(true);
  // A new request arrives over the socket: the queue refetches by itself.
  st.items = [review()];
  await mock.push({ event: "marketplace.cancellation_review_created", order_id: ORDER_ID, review_id: "rev-1" });
  await expect(page.getByText("Mutaxassis uch kundan beri javob bermayapti")).toBeVisible();
  await expect(page.locator(".mk-toast").first()).toContainText("Yangi bekor qilish so'rovi");
  await expect(page.getByText("Mijozning sababi")).toBeVisible();
  // The private service chat is never offered to the operator.
  await expect(page.locator(`a[href*="${SERVICE_ROOM}"]`)).toHaveCount(0);

  // A separate discussion, with the client only.
  const disc = page.locator(".ccx-disc").first();
  await expect(disc).toContainText("Bu xizmat chati emas");
  await disc.getByRole("button", { name: "Muhokama ochish" }).click();
  await disc.getByRole("button", { name: "Muhokamani ochish" }).click();
  await expect(disc).toContainText("Ochiq");
  expect(chatBodies[0]).toMatchObject({ include_client: true, include_current_seller: false });
  await expect(disc.locator(".ccx-disc__people")).toContainText("Test Mijoz");
  await expect(disc.locator(`a[href*="room-disc-1"]`)).toBeVisible();
  await shot(page, "operator-discussion", ".ccx-disc");
  await disc.getByRole("button", { name: "Muhokamani yopish" }).click();
  await disc.getByRole("button", { name: "Yopish", exact: true }).click();
  await expect(disc).toContainText("Yopilgan");
  await expect(disc.getByRole("button", { name: "Muhokamani yopish" })).toHaveCount(0);
  await expect(disc.getByRole("link", { name: /Tarixni ko'rish/ })).toBeVisible();

  // Decision: a paid order can't be just cancelled; the refund is sent once.
  await page.getByRole("button", { name: "Qaror qabul qilish" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Bekor qilish so'rovi bo'yicha qaror" });
  await expect(dialog).toContainText("Mijoz va ijrochining shaxsiy chati sizga ochilmaydi");
  await dialog.getByText("Pulni qaytarish").first().click();
  await expect(dialog).toContainText("Bitta to'lov uchun faqat bitta qaytarish yaratiladi");
  await dialog.getByLabel("Mijoz va ijrochiga ko'rinadigan sabab").fill("To'langan summa to'liq qaytariladi");
  const save = dialog.getByRole("button", { name: "Pulni qaytarish" }).last();
  await save.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect.poll(() => keys.length).toBe(1);
  await expect(save).toBeEnabled();
  await save.click(); // the retry after the lost answer
  await expect(dialog).toContainText("Qaytarish so'rovi yaratildi");
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(1);
  expect(refunds).toBe(1);
  await shot(page, "operator-resolved");
});

test("a paid order's cancel option is closed for the operator", async ({ page }) => {
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/cancellation-reviews": { items: [review()], total: 1, count: 1, limit: 50, offset: 0 },
    "/call-center/marketplace/cancellation-reviews/rev-1": review(),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?tab=cancellations");
  await page.getByRole("button", { name: "Qaror qabul qilish" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Bekor qilish so'rovi bo'yicha qaror" });
  await expect(dialog.getByText("To'langan buyurtmani shunchaki bekor qilib bo'lmaydi")).toBeVisible();
});

test("client: asks to cancel, waits for a replacement without seeing it, then talks to the new specialist", async ({ page }) => {
  const deadline = new Date(Date.now() + 28 * 60_000).toISOString();
  const sent: unknown[] = [];
  const st = {
    order: order({ status: "in_progress", started_at: "2026-10-26T10:00:00Z", can_request_cancellation: true, cancellation_review_url: `/marketplace/orders/${ORDER_ID}/cancellation-review`, secure_chat_room_id: SERVICE_ROOM, can_start_chat: true, calls_enabled: true }) as Record<string, unknown>,
  };
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => st.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { order_id: ORDER_ID, items: [], count: 0 },
    [`POST /marketplace/orders/${ORDER_ID}/cancellation-review`]: (b: unknown) => (sent.push(b), { id: "rev-1", order_id: ORDER_ID, status: "open", reason: (b as { reason: string }).reason }),
  });
  const mock = await mockBackend(page, routes);
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await page.getByRole("button", { name: "Bekor qilishni so'rash" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Buyurtmani bekor qilishni so'rash" });
  await dialog.getByRole("textbox").fill("Ish to'xtab qoldi");
  await dialog.getByRole("button", { name: "So'rov yuborish" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ reason: "Ish to'xtab qoldi" });

  // The call center hands the paid order to another seller.
  st.order = order({
    status: "sent_to_seller",
    payment_status: "paid",
    assignment_status: "waiting_seller_response",
    acceptance_deadline_at: deadline,
    waiting_replacement_acceptance: true,
    client_status_message: "Call-markaz so'rovingizni ko'rib chiqmoqda.",
    lawyer: null,
    lawyer_user_id: "u-new",
    lawyer_name: "Yashirin Nomzod",
    secure_chat_room_id: SERVICE_ROOM,
    can_start_chat: false,
    can_create_call: false,
    calls_enabled: false,
    chat_read_only: true,
    reassignment_history: [{ id: "ra-1", status: "waiting_seller_response", previous_seller: { id: SELLER_ID, name: "Test Advokat" }, new_seller: null, operator: { name: "Dilnoza Operator" }, client_visible_reason: "Xizmatni boshqa mutaxassis davom ettiradi", reassigned_at: "2026-10-26T18:30:00Z", acceptance_deadline_at: deadline }],
  });
  await mock.push({ event: "marketplace.reassignment_started", order_id: ORDER_ID });
  const pending = page.locator(".mrp");
  await expect(pending).toContainText("Call-markaz so'rovingizni ko'rib chiqmoqda.");
  await expect(pending).toContainText("To'lovingiz o'zgarmaydi");
  await expect(page.locator("main")).not.toContainText("Yashirin Nomzod");
  await expect(page.locator("main")).not.toContainText(/qidirilmoqda/);
  await expect(page.getByText(/10% oldindan to'lov/)).toHaveCount(0);
  const history = page.locator(".mrh");
  await expect(history).toContainText("Mutaxassisni Dilnoza Operator almashtirdi");
  await expect(history).toContainText("Sabab: Xizmatni boshqa mutaxassis davom ettiradi");
  await expect(history).toContainText("Yangi mutaxassis qabul qilgach ko'rsatiladi");
  await shot(page, "client-waiting-replacement");

  // The replacement accepts: a fresh room, the seller shown, chat open.
  st.order = order({
    status: "accepted",
    payment_status: "paid",
    assignment_status: "accepted",
    waiting_replacement_acceptance: false,
    lawyer: { id: "u-new", name: "Yangi Advokat" },
    lawyer_user_id: "u-new",
    lawyer_name: "Yangi Advokat",
    secure_chat_room_id: "room-service-2",
    can_start_chat: true,
    can_create_call: true,
    calls_enabled: true,
    chat_read_only: false,
    reassignment_history: [{ id: "ra-1", status: "accepted", previous_seller: { id: SELLER_ID, name: "Test Advokat" }, new_seller: { id: "u-new", name: "Yangi Advokat" }, operator: { name: "Dilnoza Operator" }, client_visible_reason: "Xizmatni boshqa mutaxassis davom ettiradi", reassigned_at: "2026-10-26T18:30:00Z", accepted_at: "2026-10-26T18:40:00Z" }],
  });
  await mock.push({ event: "marketplace.reassignment_accepted", order_id: ORDER_ID });
  await expect(history).toContainText("Yangi: Yangi Advokat");
  await expect(page.locator(".mrp")).toHaveCount(0);
  // The contact menu now leads to the fresh room, not the old one.
  await page.getByRole("button", { name: /Advokat bilan bog'lanish/ }).first().click();
  await expect(page.locator('a[href*="room-service-2"]').first()).toBeVisible();
  await expect(page.locator(`a[href*="${SERVICE_ROOM}"]`)).toHaveCount(0);
  await shot(page, "client-replacement-accepted");
});

test("replacement seller: a paid order, 30 minutes, accept without any payment step", async ({ page }) => {
  const deadline = new Date(Date.now() + 29 * 60_000).toISOString();
  let accepted = 0;
  const st = {
    order: order({ status: "sent_to_seller", payment_status: "paid", assignment_status: "waiting_seller_response", acceptance_deadline_at: deadline, client_name: "Test Mijoz", secure_chat_room_id: "", can_start_chat: false, calls_enabled: false }) as Record<string, unknown>,
  };
  const routes = await signIn(page, ADVOCATE, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => st.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`POST /orders/${ORDER_ID}/accept`]: () => {
      accepted += 1;
      st.order = order({ status: "accepted", payment_status: "paid", assignment_status: "accepted", secure_chat_room_id: "room-service-2", can_start_chat: true, calls_enabled: true });
      return st.order;
    },
  });
  await mockBackend(page, routes);
  await page.goto(`/uz/portal/advocate/marketplace-orders/${ORDER_ID}`);
  const card = page.locator(".mod-assign");
  await expect(card).toContainText("Sizga to'langan buyurtma topshirildi");
  await expect(card).toContainText("qo'shimcha to'lov bo'lmaydi");
  await expect(card).toContainText("Avvalgi mutaxassis bilan yozishmalar sizga ko'rinmaydi");
  await expect(card.locator(".mod-assign__clock")).toHaveText(/2\d:\d\d/);
  await expect(page.getByText(/10% oldindan/)).toHaveCount(0);
  await shot(page, "seller-replacement-offer", ".mod-assign");
  await card.getByRole("button", { name: /Qabul qilish/ }).first().click();
  await expect.poll(() => accepted).toBe(1);
  await expect(page.locator(".mod-assign")).toHaveCount(0);
});

test("a closed room stays readable without a composer; a 403 room is a privacy boundary", async ({ page }) => {
  let privateReads = 0;
  const routes = await signIn(page, CLIENT, {
    "/secure-chats": { items: [{ id: "room-disc-1", title: "Bekor qilish bo'yicha aniqlik kiritish", room_type: "cancellation_discussion", read_only: true, status: "closed", participants: [{ user_id: CLIENT_ID }, { user_id: CALL_CENTER.id, name: "Dilnoza Operator" }] }] },
    "/secure-chats/room-disc-1": { id: "room-disc-1", title: "Bekor qilish bo'yicha aniqlik kiritish", room_type: "cancellation_discussion", read_only: true, status: "closed", participants: [{ user_id: CLIENT_ID }, { user_id: CALL_CENTER.id, name: "Dilnoza Operator" }] },
    "/secure-chats/room-disc-1/messages": { messages: [{ id: "m1", sender_user_id: CALL_CENTER.id, message_type: "text", filtered_content: "Masala hal qilindi", created_at: "2026-10-26T13:10:00Z" }] },
    "/secure-chats/room-old": () => (privateReads++, { status: 403, json: { detail: { code: "secure_chat_forbidden" } } }),
    "/secure-chats/room-old/messages": () => (privateReads++, { status: 403, json: { detail: { code: "secure_chat_forbidden" } } }),
  });
  await mockBackend(page, routes);
  await page.goto("/uz/portal/chat/room-disc-1");
  await expect(page.getByText("Masala hal qilindi")).toBeVisible();
  await expect(page.getByText("Bekor qilish muhokamasi").first()).toBeVisible();
  await expect(page.getByText(/Bu chat yopilgan/)).toBeVisible();
  await expect(page.locator("textarea, [contenteditable=true]").filter({ visible: true })).toHaveCount(0);
  await shot(page, "closed-discussion");

  await page.goto("/uz/portal/chat/room-old");
  await expect(page.getByText("Bu chat sizga ochiq emas")).toBeVisible();
  const reads = privateReads;
  await page.waitForTimeout(2500);
  expect(privateReads).toBe(reads); // no retry, no other endpoint
  await expect(page.getByRole("button", { name: /Qayta urinish/ })).toHaveCount(0);
});
