import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// TSK-342697: gift on every tariff. Every active paid plan can be gifted —
// not only the ones marked is_giftable — and a free plan never is.
test("every paid tariff can be given as a gift; a free one is not offered", async ({ page }) => {
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/subscription-plans": [
        { id: "p1", slug: "lexgo-ai-pro", name: "LexGo.AI Pro", monthly_price: 99000, is_active: true, is_giftable: false },
        { id: "p2", slug: "shaxsiy-advokat", name: "Shaxsiy advokat", monthly_price: 300000, is_active: true, is_giftable: true },
        { id: "p3", slug: "lexgo-ai-free", name: "Bepul tarif", monthly_price: 0, is_active: true },
      ],
      "/gifts": { items: [] },
      "/services": { items: [], total: 0 },
    } as never),
  );
  await page.goto("/ru/portal/client/gifts");
  await page.getByRole("button", { name: "Подарить подписку" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Подарить подписку" });
  await dialog.getByRole("button", { name: /^Тариф/ }).last().click();
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option", { name: "LexGo.AI Pro" })).toBeVisible();
  await expect(list.getByRole("option", { name: "Shaxsiy advokat" })).toBeVisible();
  await expect(list.getByRole("option", { name: "Bepul tarif" })).toHaveCount(0);
});
