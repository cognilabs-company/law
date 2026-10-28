import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, order } from "./fixtures";

// TSK-906326 — 30-30-40 payouts: the call center pays each stage with a
// transfer reference and records recoveries; the seller sees their stages;
// the client never does. Screenshots: PO_SHOTS=<dir>, PO_DARK=1, PO_NARROW=1.
test.use({
  viewport: process.env.PO_NARROW ? { width: 375, height: 812 } : { width: 1440, height: 960 },
  colorScheme: process.env.PO_DARK ? "dark" : "light",
});
const shot = async (page: Page, name: string) => {
  if (!process.env.PO_SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.PO_SHOTS}/po-${name}${process.env.PO_DARK ? "-dark" : "-light"}${process.env.PO_NARROW ? "-phone" : ""}.png` });
};
const SELLER = { id: "u-adv", name: "Aziz Karimov" };
const payouts = () => [
  { id: "po-1", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Ajrashish bo'yicha maslahat", stage: "seller_accept", stage_percent: 30, amount: 33000, status: "required", seller: SELLER, created_at: "2026-10-28T08:00:00Z" },
  { id: "po-2", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Ajrashish bo'yicha maslahat", stage: "first_checklist", stage_percent: 30, amount: 33000, status: "required", seller: SELLER, created_at: "2026-10-28T09:00:00Z" },
];

test("call center: pay a stage with a transfer number; recover a refunded payout", async ({ page }) => {
  const st = { payouts: payouts(), recovered: [] as Record<string, unknown>[], paid: [] as Record<string, unknown>[] };
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/marketplace/payouts": () => ({ items: st.payouts, total: st.payouts.length, limit: 20, offset: 0, has_more: false }),
      "POST /call-center/marketplace/payouts/po-1/mark-paid": (b: unknown) => {
        st.paid.push(b as Record<string, unknown>);
        st.payouts = st.payouts.map((p) => (p.id === "po-1" ? { ...p, status: "paid", transaction_reference: "TRX-9001" } : p));
        return st.payouts[0];
      },
      "/call-center/marketplace/payout-recoveries": () => ({ items: [{ id: "rc-1", work_id: "ADV-1KX", service_title: "Meros ulushi", amount: 66000, status: st.recovered.length ? "resolved" : "pending", seller: { id: "u-adv2", name: "Malika Yusupova" }, reason: "Mijozga pul qaytarildi" }], total: 1, has_more: false }),
      "POST /call-center/marketplace/payout-recoveries/rc-1/resolve": (b: unknown) => (st.recovered.push(b as Record<string, unknown>), { id: "rc-1", status: "resolved" }),
    } as never),
  );
  await page.goto("/uz/admin/call-center?tab=payouts");
  const q = page.locator(".pyq");
  await expect(q.locator(".pyq__row")).toHaveCount(2, { timeout: 20000 });
  await expect(q.locator(".pyq__row").first()).toContainText("Aziz Karimov");
  await expect(q.locator(".pyq__row").first()).toContainText("Qabul qilinganda");
  await expect(q.locator(".pyq__row").nth(1)).toContainText("Birinchi bosqich");
  await expect(q).toContainText("33 000 so'm");
  // Never an id on screen.
  expect(await q.innerText()).not.toMatch(/po-1|u-adv|[0-9a-f]{8}-[0-9a-f]{4}-/);
  await shot(page, "queue");
  await q.getByRole("button", { name: "To'landi deb belgilash" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Payout to'landi" });
  await dlg.getByRole("button", { name: "To'landi" }).click();
  await expect(dlg.getByText("Tranzaksiya raqamini kiriting.")).toBeVisible();
  expect(st.paid).toHaveLength(0);
  await dlg.getByRole("textbox", { name: /Tranzaksiya raqami/ }).fill("  TRX-9001 ");
  await shot(page, "paid-dialog");
  await dlg.getByRole("button", { name: "To'landi" }).click();
  await expect(page.getByText("Payout to'langan deb belgilandi.")).toBeVisible();
  expect(st.paid[0]).toEqual({ transaction_reference: "TRX-9001", evidence_ids: [], note: "" });
  // The paid one leaves the waiting list.
  await expect(q.locator(".pyq__row")).toHaveCount(1);

  await q.getByRole("radio", { name: "Qaytarib olinadiganlar" }).click();
  await expect(q.locator(".pyq__row")).toHaveCount(1);
  await expect(q.locator(".pyq__row")).toContainText("Malika Yusupova");
  await expect(q.locator(".pyq__row")).toContainText("Mijozga pul qaytarildi");
  await q.getByRole("button", { name: "Qaytdi deb belgilash" }).click();
  const rd = page.getByRole("dialog", { name: "Pul qaytdi" });
  await rd.getByRole("textbox", { name: /Tranzaksiya raqami/ }).fill("RET-12");
  await rd.getByRole("button", { name: "Qaytdi" }).click();
  await expect(page.getByText("Qaytarish yakunlandi.")).toBeVisible();
  expect(st.recovered[0]).toMatchObject({ transaction_reference: "RET-12" });
});

const financials = { order_id: ORDER_ID, payments: [{ id: "p", stage: "full_payment", status: "paid", amount: 110000 }], payouts: [
  { id: "a", stage: "seller_accept", stage_percent: 30, amount: 33000, status: "paid", paid_at: "2026-10-28T09:10:00Z" },
  { id: "b", stage: "first_checklist", stage_percent: 30, amount: 33000, status: "required" },
  { id: "c", stage: "completion", stage_percent: 22, amount: 24200, status: "held" },
], settlement: { status: "held" } };

test("the seller sees their three payout stages; the client sees none of it", async ({ browser }) => {
  for (const [who, expectStages] of [[ADVOCATE, true], [CLIENT, false]] as const) {
    const page = await browser.newPage();
    await mockBackend(
      page,
      await signIn(page, who, {
        [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "in_progress", payment_status: "paid", price: 110000 }),
        [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials,
        [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
        "/marketplace/me/orders": { items: [], total: 0 },
      }),
    );
    await page.goto(`/uz/portal/${who.role === "client" ? "client" : "advocate"}/marketplace-orders/${ORDER_ID}`);
    await expect(page.locator(".mod__facts")).toBeVisible({ timeout: 20000 });
    if (expectStages) {
      const card = page.locator(".pst");
      await expect(card.locator(".pst__step")).toHaveCount(3);
      await expect(card.locator(".pst__step").nth(0)).toContainText("To'landi");
      await expect(card.locator(".pst__step").nth(1)).toContainText("To'lanadi");
      await expect(card.locator(".pst__step").nth(2)).toContainText("Ushlab turilgan");
      await expect(card).toContainText("yakuniy to'lov u yopilguncha ushlab turiladi");
      await card.scrollIntoViewIfNeeded();
      await shot(page, "seller-stages");
    } else {
      await page.waitForTimeout(1500);
      await expect(page.locator(".pst")).toHaveCount(0);
    }
    await page.close();
  }
});
