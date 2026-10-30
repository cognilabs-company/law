import { expect, test } from "@playwright/test";
import { CALL_CENTER, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// The LexGo guarantee (enterprise contract §10): the client asks, the call
// center decides; nothing is shown as done before that.
test("a client asks for a replacement under the guarantee and sees it under review", async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  const state: { order: Record<string, unknown> } = { order: order({ status: "in_progress", started_at: new Date().toISOString(), warranty_url: `/marketplace/me/orders/${ORDER_ID}/warranty` }) };
  const routes = await signIn(page, CLIENT, {
    [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    "/marketplace/runtime-capabilities": { warranty: { replacement: true, full_refund: true, call_center_review: true } },
    [`POST /marketplace/me/orders/${ORDER_ID}/warranty`]: (b: unknown) => {
      sent = b as Record<string, unknown>;
      state.order = { ...state.order, warranty: { status: "pending", resolution: "replacement", reason: (b as { reason: string }).reason } };
      return { status: "pending", resolution: "replacement" };
    },
  });
  await mockBackend(page, routes);
  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  await page.getByRole("button", { name: "Воспользоваться гарантией" }).click();
  const dialog = page.getByRole("dialog", { name: "Запрос по гарантии" });
  await dialog.getByRole("button", { name: "Отправить запрос" }).click();
  await expect(dialog.getByText("Выберите причину")).toBeVisible();
  await dialog.getByText("Исполнитель не ответил вовремя").click();
  await dialog.getByRole("textbox").fill("Ikki kundan beri javob yo'q, muddat ham o'tib ketdi");
  // Files go to a replacement seller only with explicit consent (24 Oct 2026).
  await dialog.getByRole("switch", { name: "Разрешаю передать файлы новому исполнителю" }).click();
  await dialog.getByRole("button", { name: "Отправить запрос" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toEqual({ kind: "no_response", reason: "Ikki kundan beri javob yo'q, muddat ham o'tib ketdi", allow_material_transfer: true });
  await expect(page.getByText("Запрос рассматривает колл-центр")).toBeVisible();
  await expect(page.getByRole("button", { name: "Воспользоваться гарантией" })).toHaveCount(0);
});

test("the call center moves files to a replacement only with the client's consent", async ({ page }) => {
  const claim = (consent: boolean) => ({
    id: "w1",
    status: "new",
    kind: "no_response",
    reason: "Javob yo'q",
    allow_material_transfer: consent,
    order: { id: ORDER_ID, work_id: "MP-TEST1", status: "in_progress", price: 110000, currency: "UZS", service_id: "svc-1" },
    client: { id: "c1", name: "Test Mijoz", lexgo_id: "LGC-1", phone: "+998900000005" },
    seller: { id: "s-old", name: "Avvalgi Advokat", lexgo_id: "LGA-1", phone: "" },
    available_resolutions: ["replacement", "full_refund"],
    created_at: "2026-10-24T08:00:00Z",
  });
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/warranty": { items: [claim(true)], total: 1, has_more: false },
  });
  await mockBackend(page, routes);
  await page.goto("/uz/admin/call-center?tab=warranty");
  await page.locator(".esc__row").first().click();
  await page.getByRole("button", { name: "Qaror chiqarish" }).click();
  const dialog = page.getByRole("dialog", { name: "Kafolat bo'yicha qaror" });
  await dialog.getByText("Boshqa ijrochi", { exact: true }).click();
  const sw = dialog.getByRole("switch", { name: "Buyurtma fayllarini yangi ijrochiga o'tkazish" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByText("Mijoz rozilik bergan", { exact: false })).toBeVisible();
});

// TSK-714974: when the backend names which guarantee cases apply to this
// order, the client is offered only those.
test("the client is offered only the guarantee cases the backend names", async ({ page }) => {
  const o = order({ status: "in_progress", started_at: new Date().toISOString(), warranty_url: `/marketplace/me/orders/${ORDER_ID}/warranty`, warranty_eligible_kinds: ["sla_breach", "abandoned"] });
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: o,
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
      "/marketplace/runtime-capabilities": { warranty: { replacement: true, full_refund: true, call_center_review: true } },
    }),
  );
  await page.goto(`/ru/portal/client/marketplace-orders/${ORDER_ID}`);
  await page.getByRole("button", { name: "Воспользоваться гарантией" }).click();
  const dialog = page.getByRole("dialog", { name: "Запрос по гарантии" });
  await expect(dialog.getByText("Нарушен срок работы")).toBeVisible();
  await expect(dialog.getByText("Работа брошена без причины")).toBeVisible();
  await expect(dialog.getByText("Исполнитель не ответил вовремя")).toHaveCount(0);
  await expect(dialog.getByText("Работа исполнителя ограничена")).toHaveCount(0);
});
