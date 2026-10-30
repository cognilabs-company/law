import { expect, test } from "@playwright/test";

// TSK-900422 replaced the 10% advance (TSK-783253) with one full payment
// before the seller takes the order. The public pages say so too: the
// lawyers flow and the FAQ never promise a 10% prepayment.

test("the public pages describe the full payment, never a 10% prepayment", async ({ page }) => {
  await page.goto("/ru/faq");
  const faq = page.locator("main");
  await expect(faq).toContainText("Канал связи открывается после того, как вы полностью оплатите услугу");
  await expect(faq).not.toContainText(/предоплат\S* 10%|10% стоимости/i);

  await page.goto("/ru");
  const flow = page.locator(".flow").first();
  await expect(flow).toContainText("Полная оплата заранее");
  await expect(flow).toContainText("Юрист принимает за 30 минут");
  await expect(page.locator("main")).not.toContainText(/предоплат\S* 10%/i);
});
