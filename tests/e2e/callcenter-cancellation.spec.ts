import { expect, test } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

const REVIEW = {
  id: "rev-1",
  order_id: "ord-1",
  status: "open",
  reason: "Mutaxassis javob bermayapti",
  work_id: "MP-77",
  service_title: "Test xizmat",
  client_name: "Test Mijoz",
  seller_name: "Test Advokat",
  created_at: "2026-10-24T05:00:00Z",
};

test("call center refunds a cancellation once, however fast the button is pressed", async ({ page }) => {
  const resolves: unknown[] = [];
  const routes = await signIn(page, CALL_CENTER, {
    "/call-center/marketplace/cancellation-reviews": { items: [REVIEW], count: 1, total: 1 },
    "/call-center/marketplace/cancellation-reviews/rev-1": REVIEW,
    "POST /call-center/marketplace/cancellation-reviews/rev-1/resolve": (body: unknown) => {
      resolves.push(body);
      return { ...REVIEW, status: "resolved", action: "refund", resolution: { action: "refund" } };
    },
  });
  const mock = await mockBackend(page, routes);
  await page.goto("/ru/admin/call-center?tab=cancellations");
  await expect(page.getByText("Mutaxassis javob bermayapti")).toBeVisible();

  await page.getByRole("button", { name: "Принять решение" }).click();
  await page.getByText("Вернуть деньги").click();
  await page.getByPlaceholder(/Например: поговорили/).fill("Mijoz bilan gaplashildi, pul qaytariladi");
  // With "refund" picked, the confirm button says what it will do.
  const save = page.getByRole("dialog", { name: "Решение по запросу на отмену" }).getByRole("button", { name: "Вернуть деньги" }).last();
  // A double press must not send the decision twice: two clicks in the
  // same tick, before the first request can come back.
  await expect(save).toBeEnabled();
  await save.evaluate((b: HTMLButtonElement) => {
    b.click();
    b.click();
  });
  await expect.poll(() => resolves.length).toBe(1);
  await page.waitForTimeout(800);
  expect(resolves).toEqual([{ action: "refund", note: "Mijoz bilan gaplashildi, pul qaytariladi" }]);
  expect(mock.refused).toEqual([]);
});
