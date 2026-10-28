import { expect, test } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";
import { order } from "./fixtures";

// A service the client already bought and has not finished shows as
// "already bought" with a link to the order — not a second "buy".
const SELLER = "u-adv";
const services = { items: [
  { service_id: "svc-open", title: "Ajrashish bo'yicha maslahat", base_price: 110000, selected_price: 110000, effective_price: 110000, currency: "UZS" },
  { service_id: "svc-done", title: "Shartnoma ekspertizasi", base_price: 200000, selected_price: 200000, effective_price: 200000, currency: "UZS" },
] };

test("an open order marks its service as already bought; a finished one can be bought again", async ({ page }) => {
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Test Advokat", seller_type: "advokat", lexgo_verified: true, is_verified: true, region: "tashkent", online_now: true, availability: { status: "available" } },
      [`/marketplace/lawyers/${SELLER}/services`]: services,
      "/marketplace/me/orders": {
        items: [
          order({ id: "o-open", work_id: "ADV-OPEN1", service_id: "svc-open", status: "in_progress", payment_status: "paid" }),
          order({ id: "o-done", work_id: "ADV-DONE1", service_id: "svc-done", status: "completed", payment_status: "paid" }),
        ],
        total: 2,
      },
    }),
  );
  await page.goto(`/uz/portal/client/lawyers/${SELLER}`);
  const open = page.locator(".mk-svc", { hasText: "Ajrashish bo'yicha maslahat" });
  const done = page.locator(".mk-svc", { hasText: "Shartnoma ekspertizasi" });
  const link = open.getByRole("link", { name: "Sotib olingan" });
  await expect(link).toBeVisible({ timeout: 20000 });
  await expect(link).toHaveAttribute("href", /\/portal\/client\/marketplace-orders\/o-open$/);
  await expect(open.getByRole("button", { name: "Sotib olish" })).toHaveCount(0);
  await expect(done.getByRole("button", { name: "Sotib olish" })).toBeVisible();
  // The side panel for the selected (bought) service says so and opens the order.
  await open.getByRole("radio").click();
  await expect(page.locator(".mk-side__bought")).toContainText("ADV-OPEN1");
  await expect(page.getByRole("link", { name: "Buyurtmani ochish" })).toBeVisible();
  await done.getByRole("radio").click();
  await expect(page.locator(".mk-side__bought")).toHaveCount(0);
  if (process.env.BOUGHT_SHOTS) {
    await open.getByRole("radio").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${process.env.BOUGHT_SHOTS}/bought.png` });
  }
});
