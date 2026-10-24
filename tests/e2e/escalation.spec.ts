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
  await expect(page.getByText("Исполнитель не смог принять заказ")).toBeVisible();
  await expect(page.getByText(/Осталось на выбор: 2\d:\d\d/)).toBeVisible();
  await expect(page.getByText("Вам предложен выбор")).toBeVisible();
  await page.getByRole("button", { name: "Другой специалист" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Другой специалист" }).click();
  await expect(page.getByText("Выбор принят: заказ отправлен другому специалисту.")).toBeVisible();
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
  await expect(page.getByText("Возврат: Ожидает")).toBeVisible();
  await expect(page.getByText("Обрабатывается вручную")).toBeVisible();
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
