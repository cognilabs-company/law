import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { ORDER_ID, order } from "./fixtures";

// TEZKOR_HIMOYA_FRONTEND_UPDATE_2026_11_21.md against a mocked backend: no
// request reaches the real API and no money moves.
test.use({ viewport: { width: 1470, height: 900 }, locale: "uz-UZ" });

const PROVIDERS = { items: [{ provider: "click", enabled: true, label: "Click", status: "configured" }, { provider: "atmos", enabled: true, label: "ATMOS", status: "configured" }], fallback_provider: "click", currency: "UZS" };
const ATMOS_PAGE = "https://checkout.atmos.uz/invoice/opaque-plan";
const hideDev = (page: Page) => page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

const PRO = { id: "p-pro", slug: "lexgo-ai-pro", name: "Pro", price: 99000, monthly_price: 99000, six_month_price: 564300, yearly_price: 1000000, is_active: true, audiences: ["client"], entitlements: { ai_requests: 1000 } };
const FREE = { id: "p-free", slug: "lexgo-ai-free", name: "Free", price: 0, monthly_price: 0, is_active: true, audiences: ["client"], entitlements: { ai_requests: 5 } };
const GIFT = { id: "p-gift", slug: "shaxsiy-advokat-gift", name: "Sovg'a advokat", price: 300000, monthly_price: 300000, is_active: true, billing_type: "gift", is_giftable: true, audiences: ["client"] };
const planRoutes = (bodies: Record<string, unknown>[], purchase?: (b: Record<string, unknown>) => unknown): Routes => ({
  "/subscription-plans": [FREE, PRO, GIFT],
  "/subscription-plans/p-pro/quote": (_b: unknown, url: URL) => ({ plan_id: "p-pro", billing_period: url.searchParams.get("billing_period") ?? "monthly", currency: "UZS", months: 1, base_amount: 99000, discount_amount: 0, amount: 99000, campaign: null }),
  "/payments/providers": PROVIDERS,
  "POST /subscription-plans/p-pro/purchase": (b: unknown) => {
    bodies.push(b as Record<string, unknown>);
    if (purchase) return purchase(b as Record<string, unknown>);
    return { id: "req-1", work_id: "SUB-AT001", status: "awaiting_payment", payment_id: "pay-p", subscription_id: "sub-1", plan_id: "p-pro", amount: 99000, provider: "atmos", payment_url: ATMOS_PAGE, payment: { id: "pay-p", status: "pending", amount: 99000, currency: "UZS", provider: "atmos", payment_url: ATMOS_PAGE } };
  },
});

test("plans: Click or ATMOS in the checkout, ATMOS opens its own page; no Telegram, no gift-only plan", async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  const mock = await mockBackend(page, await signIn(page, CLIENT, planRoutes(bodies)));
  await page.route(`${ATMOS_PAGE}**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>ATMOS</h1>" }));
  await page.goto("/uz/portal/client/subscription");
  await hideDev(page);
  await expect(page.locator('[data-ai-id="pricing.plan.shaxsiy-advokat-gift"]')).toHaveCount(0);
  await page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]').getByRole("button").last().click();
  const review = page.locator('[data-ai-id="pricing.checkout-review.provider"]');
  await expect(review.getByRole("button", { name: /^Click/ })).toHaveAttribute("aria-pressed", "true");
  await expect(review.getByRole("button", { name: /^Telegram/ })).toHaveCount(0);
  await review.getByRole("button", { name: /^ATMOS/ }).click();
  await page.locator('[data-ai-id="pricing.checkout-review.pay"]').click();
  await page.waitForURL(`${ATMOS_PAGE}**`);
  expect(bodies[0]).toMatchObject({ billing_period: "monthly", provider: "atmos", currency: "UZS" });
  expect(mock.count("POST", /telegram-purchase-request$/)).toBe(0);
  expect(mock.count("POST", /^\/payments$/)).toBe(0);
});

test("plans: Click cannot take it — the notice names ATMOS and picks it, nothing is charged", async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  await mockBackend(page, await signIn(page, CLIENT, planRoutes(bodies, (b) => (b.provider === "click" ? { status: 503, json: { detail: { code: "payment_provider_unavailable" } } } : { status: "approved", amount: 0, provider: "atmos" }))));
  await page.goto("/uz/portal/client/subscription");
  await hideDev(page);
  await page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]').getByRole("button").last().click();
  await page.locator('[data-ai-id="pricing.checkout-review.pay"]').click();
  await expect(page.getByRole("alert").filter({ hasText: "ATMOS orqali to'lashingiz mumkin" })).toBeVisible();
  await expect(page.locator('[data-ai-id="pricing.checkout-review.provider"]').getByRole("button", { name: /^ATMOS/ })).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-ai-id="pricing.checkout-review.pay"]').click();
  expect(bodies.map((b) => b.provider)).toEqual(["click", "atmos"]);
});

const REGIONS = {
  items: [
    ["tashkent", "Toshkent shahri"], ["tashkent_region", "Toshkent viloyati"], ["karakalpakstan", "Qoraqalpog'iston Respublikasi"], ["andijan", "Andijon viloyati"],
    ["bukhara", "Buxoro viloyati"], ["fergana", "Farg'ona viloyati"], ["jizzakh", "Jizzax viloyati"], ["namangan", "Namangan viloyati"], ["navoi", "Navoiy viloyati"],
    ["kashkadarya", "Qashqadaryo viloyati"], ["samarkand", "Samarqand viloyati"], ["syrdarya", "Sirdaryo viloyati"], ["surkhandarya", "Surxondaryo viloyati"], ["khorezm", "Xorazm viloyati"],
  ].map(([key, uz]) => ({ key, labels: { uz_latn: uz, uz_cyrl: uz, ru: uz, en: uz } })),
  total: 14,
};
const seedClientDraft = (page: Page) =>
  page.addInitScript(() => {
    localStorage.setItem("lexgo_reg_draft", JSON.stringify({ at: Date.now(), idx: 2, draft: { accountType: "client", phone: "+998901234567", otpDeliveryMethod: "sms", profile: { firstName: "Aziza", lastName: "Karimova" } }, agreed: {} }));
  });

test("registration: the referral code from ?ref= is filled in and checked; all 14 regions come from GET /regions", async ({ page }) => {
  const mock = await mockBackend(page, {
    "/regions": REGIONS,
    "/referrals/THREF001/validate": { code: "THREF001", valid: true, referrer_name: "Dilshod" },
    "/referrals/NOPE99/validate": { code: "NOPE99", valid: false },
  });
  await seedClientDraft(page);
  await page.goto("/uz/register?ref=THREF001");
  await hideDev(page);
  const field = page.locator("#rf-referral");
  await expect(field).toHaveValue("THREF001");
  await expect(page.locator("#rf-referral-note")).toHaveText("Dilshod sizni taklif qildi.");
  await field.fill("NOPE99");
  await expect(page.locator("#rf-referral-note")).toContainText("Taklif kodi topilmadi");
  expect(mock.count("GET", /^\/referrals\/NOPE99\/validate$/)).toBe(1);
  await page.getByRole("button", { name: /^Viloyat/ }).click();
  await expect(page.getByRole("option")).toHaveCount(14);
  await expect(page.getByRole("option", { name: "Surxondaryo viloyati" })).toBeVisible();
});

const REFUND = {
  id: "rf-1",
  module: "marketplace_refund_request",
  status: "operator_required",
  price: 350000,
  currency: "UZS",
  created_at: new Date(Date.now() - 50 * 60000).toISOString(),
  payload: { order_id: ORDER_ID, order_work_id: "MP-4H8LZ", payment_id: "pay-1", refund_type: "full", amount: 350000, provider: "click", provider_error: { message: "Click: to'lov kuni o'tgan" }, reason: "Mijoz voz kechdi", client_name: "Aziza Karimova", service_title: "Ajrashish bo'yicha da'vo" },
};

test("call center: a stuck refund is decided in its queue — a refusal needs a note", async ({ page }) => {
  const decisions: Record<string, unknown>[] = [];
  let open = [REFUND];
  await mockBackend(
    page,
    await signIn(page, { ...CALL_CENTER, permissions: [...(CALL_CENTER.permissions ?? []), "payments.manage"] }, {
      "/call-center/marketplace/refund-requests": () => ({ items: open, total: open.length, limit: 50, offset: 0 }),
      "POST /call-center/marketplace/refund-requests/rf-1/decision": (b: unknown) => {
        decisions.push(b as Record<string, unknown>);
        open = [];
        return { message: "ok", refund_request: { ...REFUND, status: "rejected" }, order: { id: ORDER_ID, status: "cancelled" } };
      },
    }),
  );
  await page.goto("/uz/admin/call-center?tab=refunds");
  await hideDev(page);
  const card = page.locator(".opx-qcard").filter({ hasText: "MP-4H8LZ" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Ochish/ }).click();
  const sheet = page.getByRole("dialog").filter({ has: page.locator('[data-ai-id="ccx.refunds.decide"]') });
  await expect(sheet).toContainText("Click: to'lov kuni o'tgan");
  await sheet.getByText("Rad etish", { exact: true }).first().click();
  await sheet.locator(".opx-pbtn--main").click();
  await expect(sheet.getByRole("alert")).toContainText("kamida 5");
  expect(decisions).toEqual([]);
  await sheet.getByRole("textbox").fill("Mijoz bilan kelishildi");
  await sheet.locator(".opx-pbtn--main").click();
  await expect.poll(() => decisions.length).toBe(1);
  expect(decisions[0]).toEqual({ action: "reject", note: "Mijoz bilan kelishildi" });
});

test("SOS: the plan's minutes are shown, and a used-up allowance says when it returns", async ({ page }) => {
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/clients/me": { id: CLIENT.id, name: CLIENT.name, phone: CLIENT.phone, subscription: { id: "sub-1", plan_id: "p-pro", plan_name: "Pro", status: "active", sos_usage: { active: true, limit_seconds: 1800, used_seconds: 420, remaining_seconds: 1380, reset_at: "2026-12-18T09:00:00+00:00" } } },
      "POST /sos": { status: 402, json: { detail: { code: "feature_limit_exhausted", feature_key: "sos_call_minutes", reset_at: "2026-12-18T09:00:00+00:00" } } },
    }),
  );
  await page.goto("/uz/portal/client/sos");
  await hideDev(page);
  await expect(page.locator('[data-ai-id="sos.minutes"]')).toContainText("30 daqiqadan 23 daqiqa qoldi");
  await page.locator('[data-ai-target="button:sos-connect"]').click();
  await expect(page.locator('[data-ai-id="sos.limit"]')).toContainText("Bu davr uchun SOS daqiqalari tugadi");
});

test("external advocate: no new meeting and no people search, only the rule and the way to the orders", async ({ page }) => {
  const mock = await mockBackend(page, await signIn(page, { ...ADVOCATE, permissions: ["meetings.manage", "orders.manage"] }, { "/calls/active": { items: [] }, "/calls/history": { items: [] } }));
  await page.goto("/uz/portal/advocate/meetings");
  await hideDev(page);
  await expect(page.locator('[data-ai-id="meetings.external-seller-note"]')).toBeVisible();
  await expect(page.locator('[data-ai-target="meetings:create"]')).toHaveCount(0);
  expect(mock.count("GET", /^\/users\/search/)).toBe(0);
});

test("order page: the extra payment the lawyer asked for is paid with Click on its own page", async ({ page, context }) => {
  const URL = "https://lexgo.api.cognilabs.org/payments/click/checkout/opaque-extra";
  await context.route(/payments\/click\/checkout\/opaque-extra/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Click</h1>" }));
  const o = order({
    status: "in_progress",
    payment_status: "paid",
    can_start_chat: true,
    additional_payment_request: { id: "ap-1", status: "pending", additional_amount: 50000, new_total: 450000, note: "Qo'shimcha hujjat", payload: { provider: "click", payment_url: URL, payment_id: "pay-x" } },
  });
  await mockBackend(page, await signIn(page, CLIENT, { [`/marketplace/me/orders/${ORDER_ID}`]: o, [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] } }));
  await page.goto(`/uz/portal/client/marketplace-orders/${ORDER_ID}`);
  await hideDev(page);
  const pay = page.locator('[data-ai-id="marketplace.orders.supplemental.pay"]');
  await expect(pay).toHaveText(/Click orqali to'lash/);
  const [tab] = await Promise.all([context.waitForEvent("page"), pay.click()]);
  await tab.waitForURL(URL);
  await tab.close();
});
