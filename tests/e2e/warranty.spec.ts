import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";
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
  await dialog.getByRole("button", { name: "Отправить запрос" }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toEqual({ kind: "no_response", reason: "Ikki kundan beri javob yo'q, muddat ham o'tib ketdi" });
  await expect(page.getByText("Запрос рассматривает колл-центр")).toBeVisible();
  await expect(page.getByRole("button", { name: "Воспользоваться гарантией" })).toHaveCount(0);
});
