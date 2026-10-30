import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, order } from "./fixtures";

// TSK-906326 — 30-30-22 payouts (shapes from the backend's "gaps closed"
// 2026-10-28 §6–9): the call center pays each stage with a transfer reference and
// records recoveries; the seller sees their stages; the client never does. Screenshots: PO_SHOTS=<dir>, PO_DARK=1, PO_NARROW=1.
test.use({
  viewport: process.env.PO_NARROW ? { width: 375, height: 812 } : { width: 1440, height: 960 },
  colorScheme: process.env.PO_DARK ? "dark" : "light",
});
const shot = async (page: Page, name: string) => {
  if (!process.env.PO_SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.PO_SHOTS}/po-${name}${process.env.PO_DARK ? "-dark" : "-light"}${process.env.PO_NARROW ? "-phone" : ""}.png` });
};
const SELLER = { id: "u-adv", lexgo_id: "LGA-1", name: "Aziz Karimov", phone: "+998901112233", role: "advokat", account_status: "active" };
const payouts = () => [
  { id: "po-1", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Ajrashish bo'yicha maslahat", seller: SELLER, stage: "acceptance", status: "operator_required", gross_percent: 30, gross_amount: 33000, commission_amount: 0, payable_amount: 33000, currency: "UZS", seller_user_id: "u-adv", mode: "operator_managed", reason: "", transaction_reference: "", paid_at: null, created_at: "2026-10-28T08:00:00Z" },
  { id: "po-2", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Ajrashish bo'yicha maslahat", seller: SELLER, stage: "first_checklist", status: "operator_required", gross_percent: 30, gross_amount: 33000, commission_amount: 0, payable_amount: 33000, currency: "UZS", seller_user_id: "u-adv", mode: "operator_managed", reason: "", transaction_reference: "", paid_at: null, created_at: "2026-10-28T09:00:00Z" },
  { id: "po-3", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Ajrashish bo'yicha maslahat", seller: SELLER, stage: "completion", status: "provider_pending", gross_percent: 40, gross_amount: 44000, commission_amount: 19800, payable_amount: 24200, currency: "UZS", seller_user_id: "u-adv", mode: "automatic_provider_payout", reason: "", transaction_reference: "", paid_at: null, created_at: "2026-10-28T10:00:00Z" },
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
      "/call-center/marketplace/payout-recoveries": () => ({ items: [{ id: "rc-1", order_id: "o-2", work_id: "ADV-1KX", service_title: "Meros ulushi", seller_user_id: "u-adv2", seller: { id: "u-adv2", name: "Malika Yusupova" }, status: st.recovered.length ? "recovered" : "operator_required", amount: 66000, currency: "UZS", reason: "Mijozga pul qaytarildi", payload: {}, created_at: "2026-10-28T08:00:00Z" }], total: 1, has_more: false }),
      "POST /call-center/marketplace/payout-recoveries/rc-1/resolve": (b: unknown) => (st.recovered.push(b as Record<string, unknown>), { id: "rc-1", status: "recovered" }),
    } as never),
  );
  await page.goto("/uz/admin/call-center?tab=payouts");
  const q = page.locator(".pyq");
  await expect(q.locator(".pyq__row")).toHaveCount(3, { timeout: 20000 });
  await expect(q.locator(".pyq__row").first()).toContainText("Aziz Karimov");
  await expect(q.locator(".pyq__row").first()).toContainText("Qabul qilinganda");
  await expect(q.locator(".pyq__row").nth(1)).toContainText("Birinchi bosqich");
  await expect(q).toContainText("33 000 so'm");
  await expect(q.locator(".pyq__row").first()).toContainText("ADV-7Q2 · Ajrashish bo'yicha maslahat");
  // The provider is sending the third: nothing to press there.
  await expect(q.locator(".pyq__row").nth(2)).toContainText("Provayder o'tkazmoqda");
  await expect(q.locator(".pyq__row").nth(2).getByRole("button")).toHaveCount(0);
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
  await expect(q.locator(".pyq__row")).toHaveCount(2);

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

// Stages come with the financials; the hold is the settlement's own status.
const stages = [
  { id: "a", stage: "acceptance", gross_percent: 30, payable_amount: 33000, status: "paid", paid_at: "2026-10-28T09:10:00Z" },
  { id: "b", stage: "first_checklist", gross_percent: 30, payable_amount: 33000, status: "operator_required" },
  { id: "c", stage: "completion", gross_percent: 40, payable_amount: 24200, status: "operator_required" },
];
// A client's financials carry empty payout arrays.
const financials = (seller: boolean) => ({ order_id: ORDER_ID, work_id: "ADV-7Q2", snapshot: {}, payments: [{ id: "p", stage: "full_payment", status: "paid", amount: 110000 }], payouts: seller ? stages : [], payout_stages: seller ? stages : [], settlement: { status: "held", held_amount: 24200, hold_reason: "rating_and_complaint_window", release_after: "2026-10-28T10:15:00Z" } });

test("the seller sees their three payout stages; the client sees none of it", async ({ browser }) => {
  for (const [who, expectStages] of [[ADVOCATE, true], [CLIENT, false]] as const) {
    const page = await browser.newPage();
    await mockBackend(
      page,
      await signIn(page, who, {
        [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "in_progress", payment_status: "paid", price: 110000 }),
        [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials(expectStages),
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
      await expect(card).toContainText("yakuniy to'lov shu oyna yopilgach chiqariladi");
      await card.scrollIntoViewIfNeeded();
      await shot(page, "seller-stages");
    } else {
      await page.waitForTimeout(1500);
      await expect(page.locator(".pst")).toHaveCount(0);
    }
    await page.close();
  }
});

// TSK-344069: an open complaint holds the seller's final payout, and the
// seller is told why.
test("an open complaint holds the seller's final payout and says so", async ({ page }) => {
  const f = { ...financials(true), settlement: { status: "complaint_hold", held_amount: 24200, hold_reason: "complaint_open" } };
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "completed", payment_status: "paid", price: 110000 }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: f,
      [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
      "/marketplace/me/orders": { items: [], total: 0 },
    }),
  );
  await page.goto(`/uz/portal/advocate/marketplace-orders/${ORDER_ID}`);
  const card = page.locator(".pst");
  await expect(card).toContainText("Mijoz shikoyati ko'rib chiqilmoqda — yakuniy to'lov hal bo'lguncha ushlab turiladi.", { timeout: 20000 });
  await expect(card).not.toContainText("yakuniy to'lov shu oyna yopilgach chiqariladi");
});
