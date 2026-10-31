import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN, ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn, type Who } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// Screenshots of the order screens changed for the backend answers of
// 2026-10-31 (§1.3 contact SLA, §1.5 warranty, §1.6/§3.9 client price,
// §1.9 complaint window, §1.10 payout stages), at 1440 and 390, light and
// dark. Defined only with ORDERS_SHOTS=<dir>, so a normal run neither skips
// nor takes it.
const SHOTS = process.env.ORDERS_SHOTS;
const inMin = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const ITEMS = [
  { id: "a1", executor_title: "Hujjatlarni tekshirish", client_title: "Hujjatlaringiz tekshirildi", status: "done", required: true, payout_stage: "first_checklist" },
  { id: "a2", executor_title: "Da'vo loyihasini tayyorlash", client_title: "Da'vo loyihasi tayyorlandi", status: "skipped_with_reason", comment: "Mijoz loyihani o'zi tayyorlab keldi", required: false, payout_stage: "first_checklist" },
  { id: "f1", executor_title: "Sudga topshirish", client_title: "Ariza sudga topshirildi", status: "pending", required: true, payout_stage: "final_completion" },
];
const ACCEPT = { id: "po-a", stage: "acceptance", status: "paid", gross_percent: 30, payable_amount: 33000, paid_at: "2026-10-31T09:00:00Z" };

async function sellerOrder(page: Page) {
  await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      [`/marketplace/me/orders/${ORDER_ID}`]: order({ status: "in_progress", started_at: "2026-10-31T09:00:00Z", contact_speed: "within_1_hour", contact_deadline_at: inMin(42) }),
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: { order_id: ORDER_ID, snapshot: {}, payouts: [ACCEPT], payout_stages: [], settlement: null },
      [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
      [`/marketplace/orders/${ORDER_ID}/checklist`]: { order_id: ORDER_ID, items: ITEMS },
      "/marketplace/me/orders": { items: [], total: 0 },
    }),
  );
  await page.goto(`/uz/portal/advocate/marketplace-orders/${ORDER_ID}`);
  await expect(page.locator(".pst")).toBeVisible({ timeout: 30_000 });
}

async function clientOrder(page: Page) {
  const priced = order({
    status: "completed",
    completed_at: new Date().toISOString(),
    result_text: "Maslahat berildi",
    rating: { available: true, deadline_at: inMin(12), remaining_seconds: 720 },
    rating_url: `/marketplace/me/orders/${ORDER_ID}/rating`,
    complaint: { available: true, deadline_at: inMin(12) },
    contact_speed: "within_15_min",
    contact_started_at: "2026-10-31T09:05:00Z",
    warranty_url: `/marketplace/me/orders/${ORDER_ID}/warranty`,
    details: {
      pricing_snapshot: {
        base_price: 100000,
        final_price: 120000,
        client_price_reasons: [{ code: "lawyer_experience", text: "Mutaxassisning tasdiqlangan tajribasi narxda hisobga olingan.", text_i18n: { uz_latn: "Mutaxassisning tasdiqlangan tajribasi narxda hisobga olingan." } }],
      },
    },
  });
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      [`/marketplace/me/orders/${ORDER_ID}`]: priced,
      [`/marketplace/me/orders/${ORDER_ID}/financials`]: financials([{ stage: "full_payment", status: "paid", amount: 120000 }]),
      [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
      [`/marketplace/orders/${ORDER_ID}/checklist`]: { order_id: ORDER_ID, items: [] },
      "/marketplace/runtime-capabilities": { warranty: { available_resolutions: ["replacement", "full_refund"] } },
      "/marketplace/me/orders": { items: [], total: 0 },
    }),
  );
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await expect(page.locator(".mod-price")).toBeVisible({ timeout: 30_000 });
}

async function callCenter(page: Page, tab: string, routes: Record<string, unknown>, who: Who = CALL_CENTER) {
  await mockBackend(page, await signIn(page, who, routes));
  await page.goto(`/uz/admin/call-center?tab=${tab}`);
}

const ONLY = process.env.ORDERS_SHOTS_ONLY;
async function each(browser: Browser, name: string, run: (page: Page, w: number) => Promise<void>) {
  if (ONLY && !name.startsWith(ONLY)) return;
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
      const page = await ctx.newPage();
      await run(page, w);
      // No sideways scroll on any width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/${name}-${w}-${scheme}.png` });
      await ctx.close();
    }
  }
}

if (SHOTS)
  test("screenshots: the order screens of the 2026-10-31 backend answers", async ({ browser }) => {
    test.setTimeout(900_000);
    await each(browser, "seller-payout-stages", async (page) => {
      await sellerOrder(page);
      await page.locator(".pst").scrollIntoViewIfNeeded();
    });
    await each(browser, "seller-contact-sla", async (page) => {
      await sellerOrder(page);
      await page.locator(".mod-facts").scrollIntoViewIfNeeded();
    });
    await each(browser, "seller-checklist-skipped", async (page) => {
      await sellerOrder(page);
      await page.locator('.cps[data-stage="first_checklist"]').scrollIntoViewIfNeeded();
    });
    await each(browser, "client-price-reasons", async (page) => {
      await clientOrder(page);
      await page.locator(".mod-price").scrollIntoViewIfNeeded();
    });
    await each(browser, "client-complaint-window", async (page) => {
      await clientOrder(page);
      await page.locator(".mko__cmp").scrollIntoViewIfNeeded();
    });
    await each(browser, "client-warranty-remedies", async (page) => {
      await clientOrder(page);
      await page.getByRole("button", { name: /kafolat/i }).first().click();
      await expect(page.locator(".wrt-outcomes")).toBeVisible();
    });
    const esc = {
      id: "esc-c1",
      status: "open",
      order_id: ORDER_ID,
      order: order({ status: "paid", service_title: "Ajrashish bo'yicha maslahat", contact_speed: "within_15_min", contact_deadline_at: new Date(Date.now() - 120_000).toISOString() }),
      reason: "seller_contact_sla_breach",
      previous_seller_user_id: "u-adv",
      previous_seller_name: "Test Advokat",
      history: [],
      assignment_history: [],
      resolution: null,
      actions: ["message", "reassign"],
      created_at: "2026-10-31T09:00:00Z",
    };
    await each(browser, "cc-escalation-contact", async (page) => {
      await callCenter(page, "escalations", { "/call-center/marketplace/assignment-escalations": { items: [esc], total: 1 } });
      await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ }).click();
      await expect(page.locator(".esc__body")).toBeVisible();
    });
    await each(browser, "cc-escalation-reassign", async (page) => {
      await callCenter(page, "escalations", { "/call-center/marketplace/assignment-escalations": { items: [esc], total: 1 } });
      await page.getByRole("button", { name: /Ajrashish bo'yicha maslahat/ }).click();
      await page.locator(".esc__acts").getByRole("button").nth(1).click();
      await expect(page.locator(".amodal__c")).toBeVisible();
    });
    const claim = (id: string, avail: string[]) => ({
      id,
      status: "new",
      kind: id === "w1" ? "sla_breach" : "seller_restricted",
      reason: "Muddat o'tdi",
      order: { id: ORDER_ID, work_id: id === "w1" ? "MP-W1" : "MP-W2", status: "in_progress", price: 110000, currency: "UZS", service_id: "svc-1" },
      client: { id: "c1", name: "Test Mijoz", lexgo_id: "LGC-1", phone: "" },
      seller: { id: "s-old", name: "Avvalgi Advokat", lexgo_id: "LGA-1", phone: "" },
      available_resolutions: avail,
      created_at: "2026-10-24T08:00:00Z",
    });
    await each(browser, "cc-warranty-resolutions", async (page) => {
      await callCenter(page, "warranty", { "/call-center/marketplace/warranty": { items: [claim("w1", ["full_refund"]), claim("w2", [])], total: 2, has_more: false } });
      await page.locator(".esc__row").nth(1).click();
      await expect(page.locator(".esc__item").nth(1).locator(".esc__muted")).toBeVisible();
    });
      const po = { id: "po-1", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Maslahat", seller: { id: "u-adv", name: "Aziz Karimov" }, stage: "acceptance", status: "operator_required", gross_percent: 30, payable_amount: 33000, created_at: "2026-10-28T08:00:00Z" };
    await each(browser, "cc-payout-settled", async (page) => {
      await callCenter(page, "payouts", { "/call-center/marketplace/payouts": { items: [po, { ...po, id: "po-2", stage: "first_checklist" }], total: 2, has_more: false }, "POST /call-center/marketplace/payouts/po-1/mark-paid": { ...po, status: "paid" } });
      await page.getByRole("button", { name: "To'landi deb belgilash" }).first().click();
      const dlg = page.locator(".amodal__c");
      await dlg.getByRole("textbox", { name: /Tranzaksiya raqami/ }).fill("TRX-1");
      await dlg.getByRole("button", { name: "To'landi" }).click();
      await expect(page.locator(".pyq__done")).toBeVisible();
    });
    await each(browser, "admin-payment-providers", async (page) => {
      await page.route(/\/admin\/payments\/reconciliation-v2/, (r) => r.fulfill({ json: { providers: [], discrepancies: [] } }));
      await callCenter(
        page,
        "",
        {
          "/admin/payments/provider-readiness": { items: [{ key: "click", configured: true, status: "configured", provider_enabled: false }, { key: "payme", configured: false, status: "disabled" }], all_enabled: false, mode: "feature_flagged_until_contracts", requirements: ["merchant_contract"] },
          "/admin/payments/reconciliation-v2": { providers: [], discrepancies: [] },
        },
        ADMIN,
      );
      await page.goto("/uz/admin/payments");
      await expect(page.locator(".pmx__card").first()).toBeVisible({ timeout: 30_000 });
    });
  });
