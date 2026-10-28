import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Point 8: once the client has paid, the order shows the advocate's phone
// (the backend sends it with lawyer.phone_visible); before payment, only
// that it opens after paying — never a number.
const lawyer = (paid: boolean) => ({ id: "u-adv", name: "Test Advokat", phone: paid ? "+998901112233" : "", phone_visible: paid, phone_hidden_reason: paid ? null : "payment_pending" });

for (const paid of [true, false]) {
  test(`client order: the advocate's phone ${paid ? "shows once paid" : "waits for the payment"}`, async ({ page }) => {
    await mockBackend(
      page,
      await signIn(page, CLIENT, {
        [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: paid ? "in_progress" : "pending_payment", payment_status: paid ? "paid" : "pending", contact_unlocked: paid, lawyer: lawyer(paid) }),
        [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "full_payment", status: paid ? "paid" : "pending", amount: 110000 }]),
        [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
      }),
    );
    await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
    const facts = page.locator(".mod-facts");
    const row = facts.locator(".mod-facts__row", { hasText: "Mutaxassis telefoni" });
    await expect(row).toBeVisible({ timeout: 20000 });
    if (paid) await expect(row.getByRole("link", { name: "+998901112233" })).toHaveAttribute("href", "tel:+998901112233");
    else {
      await expect(row).toContainText("To'lovdan keyin ochiladi");
      await expect(page.locator("main")).not.toContainText("+998901112233");
    }
  });
}
