import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CALL_CENTER, CLIENT, mockBackend, signIn } from "./mock";
import { ORDER_ID, order } from "./fixtures";

// The 2026-11-21 contract's new UI at every width the product promises, in
// uz, ru and en: nothing overflows the page or its own box, nothing is cut,
// and the buttons keep their words on one line.
const WIDTHS = [320, 375, 430, 640, 768, 1024, 1280, 1366, 1440, 1470, 1512, 1600, 1728, 1920, 2560];
const LOCALES = ["uz", "ru", "en"] as const;
const SELLER = "u-adv";
const PROVIDERS = { items: [{ provider: "click", enabled: true, label: "Click", status: "configured" }, { provider: "atmos", enabled: true, label: "ATMOS", status: "configured" }], fallback_provider: "click", currency: "UZS" };

test.use({ colorScheme: "light" });
test.setTimeout(240_000);

async function problems(page: Page, scope: string, oneLine: string[]): Promise<string[]> {
  return page.evaluate(
    ({ scope, oneLine }) => {
      const out: string[] = [];
      const doc = document.documentElement;
      if (doc.scrollWidth > window.innerWidth + 1) out.push(`page scrolls sideways (${doc.scrollWidth} > ${window.innerWidth})`);
      const root = document.querySelector(scope);
      if (!root) return [`${scope} missing`];
      const box = root.getBoundingClientRect();
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.left < box.left - 1 || r.right > box.right + 1) out.push(`${el.tagName.toLowerCase()}.${el.className} sticks out of ${scope}`);
        if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") out.push(`${el.tagName.toLowerCase()}.${el.className} is cut`);
      }
      // Lines of text actually drawn: the distinct line boxes of its text
      // (a button's min-height is not a second line).
      const lines = (el: HTMLElement): number => {
        const tops: number[] = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of Array.from(range.getClientRects())) {
            if (!r.width) continue;
            if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top);
          }
        }
        return tops.length;
      };
      for (const sel of oneLine) {
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
          const n = lines(el);
          if (n > 1) out.push(`"${el.textContent?.trim()}" wraps onto ${n} lines (${Math.round(el.getBoundingClientRect().width)}px of ${Math.round(box.width)}px)`);
        }
      }
      return out;
    },
    { scope, oneLine },
  );
}

async function sweep(page: Page, label: string, scope: string, oneLine: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(120);
    await page.locator(scope).first().scrollIntoViewIfNeeded();
    for (const p of await problems(page, scope, oneLine)) found.push(`${label} @${w}: ${p}`);
  }
  return found;
}

const hideDev = (page: Page) => page.addStyleTag({ content: "nextjs-portal{display:none!important}" });

for (const locale of LOCALES) {
  test(`purchase: Click down, pay with ATMOS — fits every width (${locale})`, async ({ page }) => {
    await mockBackend(
      page,
      await signIn(page, CLIENT, {
        [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
        [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Mehnat nizosi bo'yicha da'vo arizasi", base_price: 350000, selected_price: 350000, effective_price: 350000, currency: "UZS" }] },
        "POST /marketplace/services/svc-1/quote": { base_price: 350000, total_price: 350000, currency: "UZS", breakdown: [] },
        [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: { status: 503, json: { detail: { code: "payment_provider_unavailable" } } },
        "/marketplace/me/orders": { items: [], total: 0 },
        "/payments/providers": PROVIDERS,
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/lawyers/${SELLER}`);
    await hideDev(page);
    await page.locator('[data-ai-id$=".buy"]').last().click();
    const dialog = page.locator('[data-ai-id="marketplace.purchase-modal"]');
    await dialog.getByRole("textbox").first().fill("Ish bo'yicha maslahat");
    await page.locator('[data-ai-id="marketplace.purchase.submit"]').click();
    await expect(page.locator('[data-ai-id="marketplace.purchase.provider-off"]')).toBeVisible();
    const found = await sweep(page, `${locale} provider off`, '[data-ai-id="marketplace.purchase.provider-off"]', ['[data-ai-id="marketplace.purchase.provider-fallback"]']);
    found.push(...(await sweep(page, `${locale} provider cards`, '[data-ai-id="marketplace.purchase.provider"]', [])));
    expect(found).toEqual([]);
  });

  test(`plan checkout with Click and ATMOS fits every width (${locale})`, async ({ page }) => {
    const PRO = { id: "p-pro", slug: "lexgo-ai-pro", name: "Pro", price: 99000, monthly_price: 99000, six_month_price: 564300, yearly_price: 1000000, is_active: true, audiences: ["client"], entitlements: { ai_requests: 1000 } };
    await mockBackend(
      page,
      await signIn(page, CLIENT, {
        "/subscription-plans": [PRO],
        "/subscription-plans/p-pro/quote": { plan_id: "p-pro", billing_period: "monthly", currency: "UZS", months: 1, base_amount: 99000, discount_amount: 0, amount: 99000, campaign: null },
        "/payments/providers": PROVIDERS,
        "POST /subscription-plans/p-pro/purchase": { status: 503, json: { detail: { code: "payment_provider_unavailable" } } },
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/portal/client/subscription`);
    await hideDev(page);
    await page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]').getByRole("button").last().click();
    await page.locator('[data-ai-id="pricing.checkout-review.pay"]').click();
    await expect(page.locator(".plx-review__notice")).toBeVisible();
    expect(await sweep(page, `${locale} plan review`, ".plx-review", [".mk-pay__m b"])).toEqual([]);
  });

  test(`registration referral field fits every width (${locale})`, async ({ page }) => {
    await mockBackend(page, { "/referrals/THREF001/validate": { code: "THREF001", valid: true, referrer_name: "Dilshod Abdurahmonov" } });
    await page.addInitScript(() => {
      localStorage.setItem("lexgo_reg_draft", JSON.stringify({ at: Date.now(), idx: 2, draft: { accountType: "client", phone: "+998901234567", otpDeliveryMethod: "sms", profile: { firstName: "Aziza" } }, agreed: {} }));
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/register?ref=THREF001`);
    await hideDev(page);
    await expect(page.locator("#rf-referral-note")).toContainText("Dilshod");
    expect(await sweep(page, `${locale} referral`, ".rf__ref", [])).toEqual([]);
  });

  test(`call-center refund panel fits every width (${locale})`, async ({ page }) => {
    const refund = {
      id: "rf-1",
      status: "operator_required",
      price: 1250000,
      currency: "UZS",
      created_at: new Date(Date.now() - 50 * 60000).toISOString(),
      payload: { order_id: ORDER_ID, order_work_id: "MP-4H8LZ", payment_id: "pay-1", refund_type: "partial", amount: 1250000, provider: "atmos", provider_error: { message: "ATMOS: refund window closed for transaction 88421907 (merchant reference mismatch)" }, reason: "Mijoz xizmatdan voz kechdi, ish hajmi qisqardi", client_name: "Aziza Karimova", service_title: "Mehnat nizosi bo'yicha da'vo arizasi va sudgacha maslahat" },
    };
    await mockBackend(page, await signIn(page, { ...CALL_CENTER, permissions: [...(CALL_CENTER.permissions ?? []), "payments.manage"] }, { "/call-center/marketplace/refund-requests": { items: [refund], total: 1, limit: 50, offset: 0 } }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/admin/call-center?tab=refunds`);
    await hideDev(page);
    const card = page.locator(".opx-qcard").filter({ hasText: "MP-4H8LZ" });
    await expect(card).toBeVisible();
    const found = await sweep(page, `${locale} refund card`, ".opx-qcard", [".opx-qbtn"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await card.locator(".opx-qbtn").first().click();
    await expect(page.locator('[data-ai-id="ccx.refunds.decide"]')).toBeVisible();
    await page.locator('[data-ai-id="ccx.refunds.decide"]').getByText(/Qo'lda qaytarildi|Возвращено вручную|Refunded by hand/).click();
    found.push(...(await sweep(page, `${locale} refund panel`, ".opx-jobsheet", [".opx-pbtn"])));
    expect(found).toEqual([]);
  });

  test(`SOS minutes and the used-up state fit every width (${locale})`, async ({ page }) => {
    await mockBackend(
      page,
      await signIn(page, CLIENT, {
        "/clients/me": { id: CLIENT.id, name: CLIENT.name, subscription: { id: "sub-1", plan_name: "Pro", status: "active", sos_usage: { active: true, limit_seconds: 1800, used_seconds: 420, remaining_seconds: 1380, reset_at: "2026-12-18T09:00:00+00:00" } } },
        "POST /sos": { status: 402, json: { detail: { code: "feature_limit_exhausted", feature_key: "sos_call_minutes", reset_at: "2026-12-18T09:00:00+00:00" } } },
      }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/portal/client/sos`);
    await hideDev(page);
    await expect(page.locator('[data-ai-id="sos.minutes"]')).toBeVisible();
    const found = await sweep(page, `${locale} minutes`, '[data-ai-id="sos.minutes"]', []);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-ai-target="button:sos-connect"]').click();
    await expect(page.locator('[data-ai-id="sos.limit"]')).toBeVisible();
    found.push(...(await sweep(page, `${locale} limit`, '[data-ai-id="sos.limit"]', [])));
    expect(found).toEqual([]);
  });

  test(`external advocate's meetings note fits every width (${locale})`, async ({ page }) => {
    await mockBackend(page, await signIn(page, { ...ADVOCATE, permissions: ["meetings.manage"] }, {}));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/portal/advocate/meetings`);
    await hideDev(page);
    await expect(page.locator(".mext")).toBeVisible();
    expect(await sweep(page, `${locale} meetings note`, ".mext", [".mext-note__a"])).toEqual([]);
  });

  test(`extra payment with Click on the order fits every width (${locale})`, async ({ page }) => {
    const o = order({
      status: "in_progress",
      payment_status: "paid",
      can_start_chat: true,
      additional_payment_request: { id: "ap-1", status: "pending", additional_amount: 1250000, new_total: 4500000, note: "Qo'shimcha hujjatlar va sud majlisida ishtirok", payload: { provider: "click", payment_url: "https://lexgo.api.cognilabs.org/payments/click/checkout/x", payment_id: "pay-x" } },
    });
    await mockBackend(page, await signIn(page, CLIENT, { [`/marketplace/me/orders/${ORDER_ID}`]: o, [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] } }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/portal/client/marketplace-orders/${ORDER_ID}`);
    await hideDev(page);
    await expect(page.locator(".mko__suppay")).toBeVisible();
    expect(await sweep(page, `${locale} extra payment`, ".mko__sup", [".mko__suppay .btn"])).toEqual([]);
  });
}
