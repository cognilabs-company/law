import { expect, test } from "@playwright/test";
import { ADVOCATE, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Decision actions go out once even when two clicks land in the same tick
// (lib/useSameTickGuard).
test("a seller's cancellation request is sent once", async ({ page }) => {
  const sent: unknown[] = [];
  const routes = await signIn(page, ADVOCATE, {
    [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "in_progress", started_at: new Date().toISOString(), can_request_cancellation: true, cancellation_review_url: `/marketplace/orders/${ORDER_ID}/cancellation-review` }),
    [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "marketplace_order", status: "paid", amount: 110000 }]),
    [`POST /marketplace/orders/${ORDER_ID}/cancellation-review`]: (b: unknown) => (sent.push(b), { id: "rev-1", order_id: ORDER_ID, status: "open", reason: (b as { reason: string }).reason }),
  });
  await mockBackend(page, routes);
  await page.goto(`/ru/portal/advocate/marketplace-orders/${ORDER_ID}`);
  await page.getByRole("button", { name: "Запросить отмену" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Запрос на отмену заказа" });
  await dialog.getByRole("textbox").fill("Mijoz kerakli hujjatlarni bermayapti, uch marta so'radim, javob yo'q");
  const submit = dialog.getByRole("button", { name: "Отправить запрос" });
  await submit.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(800);
  expect(sent).toHaveLength(1);
});
