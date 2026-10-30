import { expect, test } from "@playwright/test";
import { CALL_CENTER, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Declined or expired assignments (TSK-131840): the call center offers the
// client a choice, the client picks one, and every mutation carries an
// Idempotency-Key that is reused only for a retry of the same request.

const escalation = (extra: Record<string, unknown> = {}) => ({
  id: "esc-1",
  status: "open",
  order_id: ORDER_ID,
  order: order({ status: "sent_to_seller", service_title: "Ajrashish bo'yicha maslahat", client_name: "Test Mijoz" }),
  reason: "seller_declined",
  previous_seller_user_id: "s-1",
  previous_seller_name: "Avvalgi Advokat",
  history: [{ id: "h1", type: "seller_declined", message: "Band", created_at: "2026-10-24T08:00:00Z" }],
  assignment_history: [{ seller_user_id: "s-1", seller_name: "Avvalgi Advokat", status: "declined", reason: "Band", rank: 1, created_at: "2026-10-24T07:50:00Z" }],
  resolution: { offer: null, refund: null, can_choose: false },
  actions: ["offer_resolution", "reassign", "message", "cancel", "full_refund"],
  created_at: "2026-10-24T08:00:00Z",
  ...extra,
});

test("an operator offers the client a choice with an idempotency key", async ({ page }) => {
  let resolved = false;
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/assignment-escalations": () => ({ items: resolved ? [] : [escalation()], total: resolved ? 0 : 1 }),
    "POST /call-center/marketplace/assignment-escalations/esc-1/resolve": () => ((resolved = true), { action: "offer_resolution" }),
  });
  await mockBackend(page, routes);
  // The first answer is lost on the network; the retry must reuse its key.
  const keys: string[] = [];
  const bodies: unknown[] = [];
  await page.route(/assignment-escalations\/esc-1\/resolve/, async (route) => {
    keys.push(route.request().headers()["idempotency-key"] ?? "");
    bodies.push(route.request().postDataJSON());
    if (keys.length === 1) return route.abort("failed");
    return route.fallback();
  });
  await page.goto("/ru/admin/call-center?tab=escalations");
  await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ }).click();
  await expect(page.getByText("Avvalgi Advokat").first()).toBeVisible();
  await expect(page.getByText("История назначений")).toBeVisible();
  await page.getByRole("button", { name: "Предложить клиенту выбор" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Отправить предложение" }).click();
  await expect(dialog.getByText(/Ответ не пришёл/)).toBeVisible();
  // The lost request is not edited into a new one.
  await expect(dialog.getByRole("textbox").first()).toHaveAttribute("readonly", "");
  await dialog.getByRole("button", { name: "Отправить предложение" }).click();
  await expect(page.getByText("Предложение отправлено клиенту.")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(bodies[1]).toMatchObject({ action: "offer_resolution", deadline_minutes: 30 });
});

test("the client picks another specialist from the offer", async ({ page }) => {
  let choice: { body: unknown; key: string } | null = null;
  const deadline = new Date(Date.now() + 25 * 60_000).toISOString();
  const state = {
    order: order({ status: "resolution_required", resolution: { offer: { id: "of-1", status: "pending_client_choice", options: ["reassign", "refund"], deadline_at: deadline, message: "Boshqa mutaxassis yoki to'liq qaytarishni tanlang" }, refund: null, can_choose: true } }) as Record<string, unknown>,
  };
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [{ id: "t1", type: "assignment_resolution", status: "pending_client_choice", at: "2026-10-24T08:05:00Z" }] },
    [`POST /marketplace/me/orders/${ORDER_ID}/resolution`]: (b: unknown) => {
      state.order = order({ status: "sent_to_seller", resolution: { offer: { id: "of-1", status: "selected", options: [], selected_choice: "reassign" }, can_choose: false } });
      return { choice: "reassign", status: "reassigned", body: b };
    },
  });
  const mock = await mockBackend(page, routes);
  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  // The neutral continuity message (fa4ced6): the order goes on, the payment is kept.
  await expect(page.getByRole("heading", { name: "Продолжаем работу по заказу" })).toBeVisible();
  await expect(page.getByText("Выбранный специалист сейчас не может принять заказ. Ваша оплата сохраняется.")).toBeVisible();
  await expect(page.getByText(/Осталось на выбор: 2\d:\d\d/)).toBeVisible();
  await expect(page.getByText("Вам предложен выбор")).toBeVisible();
  await page.getByRole("button", { name: "Другой специалист" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Другой специалист" }).click();
  await expect(page.getByText("На рассмотрении")).toBeVisible();
  await expect(page.getByRole("button", { name: /Другой специалист/ })).toHaveCount(0);
  const c = mock.calls.find((x) => x.method === "POST" && x.path.endsWith("/resolution"));
  choice = c ? { body: c.body, key: c.headers["idempotency-key"] } : null;
  expect(choice?.body).toEqual({ choice: "reassign", reason: "" });
  expect(choice?.key).toBeTruthy();
});

test("a refund shows its status and the manual-processing label", async ({ page }) => {
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "refund_pending" }),
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
    [`/marketplace/me/orders/${ORDER_ID}/refund`]: { order_id: ORDER_ID, refund: { request_id: "r1", amount: 110000, currency: "UZS", status: "pending", provider_enabled: false }, provider_enabled: false },
  });
  await mockBackend(page, routes);
  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.locator(".mrs-refund")).toContainText("Запрос принят");
  await expect(page.locator(".mrs-refund")).toContainText("110 000");
  await expect(page.getByText(/Автоматический возврат через платёжную систему сейчас не включён/)).toBeVisible();
});

test("a refund sends the operator's reason as the message; an already-closed escalation refreshes", async ({ page }) => {
  const bodies: unknown[] = [];
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/assignment-escalations": { items: [escalation()], total: 1 },
    "POST /call-center/marketplace/assignment-escalations/esc-1/resolve": (b: unknown) => (bodies.push(b), { status: 409, json: { detail: { code: "assignment_escalation_closed", status: "resolved" } } }),
  });
  await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=escalations");
  await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ }).click();
  await page.getByRole("button", { name: "Полный возврат" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Mijoz kutishni xohlamadi");
  await dialog.getByRole("button", { name: "Начать возврат" }).click();
  await expect(page.getByText("Эта эскалация уже решена; список обновлён.")).toBeVisible();
  expect(bodies[0]).toMatchObject({ action: "full_refund", message: "Mijoz kutishni xohlamadi" });
});

test("people are shown by name, never by id, and a missing value reads as none", async ({ page }) => {
  const SELLER = "f49a16c9-7825-4682-b058-17865ef69837";
  const CLIENT_ID = "9e6f40ab-f072-45db-88bd-021daec54f6c";
  // Live shape (24 Oct 2026): the order carries ids, not names.
  const bare = escalation({
    previous_seller_user_id: SELLER,
    previous_seller_name: undefined,
    reason: "seller_acceptance_timeout",
    history: [{ action: "escalated", reason: "seller_declined", at: "2026-10-24T08:00:00Z" }],
    order: order({ status: "seller_selection", payment_status: "unpaid", price: 0, service_title: "Qarzdorlikni undirish", client: undefined, client_name: undefined, client_user_id: CLIENT_ID, lawyer_user_id: "someone-else", lawyer_name: "" }),
  });
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/assignment-escalations": { items: [bare], total: 1 },
    [`/call-center/clients/${SELLER}`]: { client: { id: SELLER, name: "Demo Advokat 1", phone: "+998901002001" } },
    [`/call-center/clients/${CLIENT_ID}`]: { client: { id: CLIENT_ID, name: "LexGo Client ONE", phone: "+998900000005" } },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?tab=escalations");
  await page.getByRole("button", { name: /Qarzdorlikni undirish/ }).click();
  const row = page.locator(".esc__item").first();
  await expect(row.getByText("Demo Advokat 1")).toBeVisible();
  await expect(row.getByText("LexGo Client ONE · +998900000005")).toBeVisible();
  await expect(row.getByText("To'lanmagan")).toBeVisible();
  await expect(row.getByText("Operatorga yuborildi")).toBeVisible();
  await expect(row.getByText("30 daqiqada javob bo'lmadi")).toBeVisible();
  await expect(row).not.toContainText(SELLER);
  await expect(row).not.toContainText(CLIENT_ID);
  await expect(row).not.toContainText("—");
});

// TSK-635882: a missed contact deadline reaches the operator live (no
// polling); the operator writes to the previous seller from the escalation;
// a reason, status or event the screen has no name for reads in words.
test("a contact-deadline escalation arrives live; the operator messages the seller; unknown codes read in words", async ({ page }) => {
  const sla = escalation({ id: "esc-2", reason: "contact_sla_breached", status: "brand_new_state", history: [{ id: "h9", type: "mystery_event_x", message: "", created_at: "2026-10-24T08:00:00Z" }] });
  let items: unknown[] = [];
  let body: Record<string, unknown> | null = null;
  const mock = await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/assignment-escalations": () => ({ items, total: items.length }),
      "POST /call-center/marketplace/assignment-escalations/esc-2/resolve": (b: unknown) => ((body = b as Record<string, unknown>), { action: "message" }),
    }),
  );
  await page.goto("/ru/admin/call-center?tab=escalations");
  await expect(page.getByText("Ajrashish bo'yicha maslahat")).toHaveCount(0);
  const reads = mock.count("GET", /assignment-escalations$/);
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  items = [sla];
  await mock.push({ event: "marketplace.contact_sla_breached", order_id: ORDER_ID });
  await expect.poll(() => mock.count("GET", /assignment-escalations$/)).toBeGreaterThan(reads);
  const row = page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ });
  await row.click();
  const item = page.locator(".esc__item").first();
  await expect(item).toContainText("С клиентом не связались в выбранный срок");
  await expect(item).toContainText("Другой статус");
  expect(await item.innerText()).not.toMatch(/brand_new_state|mystery_event_x|contact_sla_breached/);

  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Прежнему исполнителю").click();
  await dialog.getByRole("textbox").first().fill("Mijoz bilan bugun bog'laning, iltimos");
  const reason = dialog.getByRole("textbox").nth(1);
  if (await reason.count()) await reason.fill("Aloqa muddati o'tgan");
  await dialog.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.getByText("Сообщение отправлено.")).toBeVisible();
  expect(body).toMatchObject({ action: "message", target: "seller", message: "Mijoz bilan bugun bog'laning, iltimos" });
});
