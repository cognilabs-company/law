import { expect, test, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { ORDER_ID, financials, order } from "./fixtures";

// The Click web checkout's new states, at every width the product promises
// and in uz, ru and en: nothing overflows the page or the Click card, and the
// status pill, the Click button and the error's actions keep their words on
// one line (TEZKOR_HIMOYA_CLICK_WEB_FRONTEND_INTEGRATION_2026_11_17.md).
const WIDTHS = [320, 375, 430, 640, 768, 1024, 1280, 1366, 1440, 1470, 1512, 1600, 1728, 1920, 2560];
const LOCALES = ["uz", "ru", "en"] as const;
const SELLER = "u-adv";
const PRICE = 1_250_000;
const URL = "https://lexgo.api.cognilabs.org/payments/click/checkout/opaque-token-sweep";

test.use({ colorScheme: "light" });
test.setTimeout(240_000);

const unpaid = () =>
  order({
    status: "pending_payment",
    payment_status: "pending",
    contact_unlocked: false,
    can_start_chat: false,
    price: PRICE,
    service_title: "Mehnat nizosi bo'yicha da'vo arizasi va sudgacha maslahat",
    payment: { id: "pay-1", status: "pending", amount: PRICE, currency: "UZS", provider: "click" },
    details: { assignment_status: "payment_pending", client_status: "payment_required" },
  });
const paid = () =>
  order({
    status: "sent_to_seller",
    payment_status: "paid",
    contact_unlocked: false,
    can_start_chat: false,
    price: PRICE,
    payment: { id: "pay-1", status: "paid", amount: PRICE, currency: "UZS", provider: "click" },
    details: { assignment_mode: "client_selected_external", assignment_status: "waiting_seller_response", acceptance_deadline_at: new Date(Date.now() + 29 * 60_000).toISOString(), seller_response_minutes: 30, client_status: "sent_to_seller" },
  });

const routes = (state: { order: Record<string, unknown> }, extra: Routes = {}): Routes => ({
  [`/marketplace/lawyers/${SELLER}`]: { user_id: SELLER, name: "Javlonbek Ergashev", seller_type: "advokat", region: "tashkent", rating: 4.8, reviews_count: 12, is_verified: true },
  [`/marketplace/lawyers/${SELLER}/services`]: { items: [{ service_id: "svc-1", title: "Mehnat nizosi bo'yicha da'vo arizasi", base_price: PRICE, selected_price: PRICE, effective_price: PRICE, currency: "UZS", category_title: "Test" }] },
  "POST /marketplace/services/svc-1/quote": { base_price: PRICE, total_price: PRICE, currency: "UZS", breakdown: [] },
  [`POST /marketplace/lawyers/${SELLER}/services/svc-1/purchase-request`]: () => ({ work_id: "MP-TEST1", status: "payment_pending", order: state.order, payment: { ...(state.order.payment as object), payment_url: URL } }),
  "/marketplace/me/orders": { items: [], count: 0 },
  [`/marketplace/me/orders/${ORDER_ID}`]: () => state.order,
  [`/marketplace/me/orders/${ORDER_ID}/financials`]: () => financials([{ stage: "full_payment", status: "pending", amount: PRICE }]),
  [`/marketplace/me/orders/${ORDER_ID}/timeline`]: { items: [] },
  "/payments/providers": { items: [{ provider: "click", enabled: true, label: "Click", status: "configured" }], fallback_provider: "telegram_manual", currency: "UZS" },
  "POST /payments/pay-1/click/checkout": { payment_id: "pay-1", status: "pending", provider: "click", payment_url: URL },
  ...extra,
});

// What is wrong at this width, if anything.
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
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") out.push(`${el.tagName.toLowerCase()}.${el.className} is cut`);
      }
      for (const sel of oneLine) {
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
          const cs = getComputedStyle(el);
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
          const inner = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
          // Icons inside may be taller than a line; two text lines are not.
          if (inner > Math.max(lh * 1.6, 26)) out.push(`"${el.textContent?.trim()}" wraps (${Math.round(inner)}px tall, ${Math.round(el.getBoundingClientRect().width)}px of ${Math.round(box.width)}px)`);
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

const ONE_LINE = [".ckp__pill", ".ckp__btn", ".ckp__err-acts > *", ".ckp__ghost"];

for (const locale of LOCALES) {
  test(`Click on the order page fits every width (${locale})`, async ({ page, context }) => {
    await context.route(/payments\/click\/checkout\/opaque-token/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Click</h1>" }));
    const state = { order: unpaid() };
    await mockBackend(page, await signIn(page, CLIENT, routes(state)));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/portal/client/marketplace-orders/${ORDER_ID}`);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const panel = page.locator(".odx-pay .ckp");
    await expect(panel).toBeVisible();
    const found = await sweep(page, `${locale} pending`, ".odx-pay", ONE_LINE);
    found.push(...(await sweep(page, `${locale} header`, ".mod-head", [])));

    // Opened: waiting for Click's confirmation.
    await page.setViewportSize({ width: 1440, height: 900 });
    const [tab] = await Promise.all([context.waitForEvent("page"), panel.locator('[data-ai-id$=".click.open"]').click()]);
    await tab.close();
    await expect(panel).toHaveAttribute("data-state", "confirming");
    found.push(...(await sweep(page, `${locale} confirming`, ".odx-pay", ONE_LINE)));
    expect(found).toEqual([]);
  });

  test(`Click resting after 503 fits every width (${locale})`, async ({ page }) => {
    const state = { order: unpaid() };
    await mockBackend(page, await signIn(page, CLIENT, routes(state, { "POST /payments/pay-1/click/checkout": { status: 503, json: { detail: { code: "payment_provider_not_configured" } } } })));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/portal/client/marketplace-orders/${ORDER_ID}`);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const panel = page.locator(".odx-pay .ckp");
    await panel.locator('[data-ai-id$=".click.open"]').click();
    await expect(panel.locator(".ckp__err-acts")).toBeVisible();
    expect(await sweep(page, `${locale} resting`, ".odx-pay", ONE_LINE)).toEqual([]);
  });

  test(`Click in the purchase dialog fits every width (${locale})`, async ({ page, context }) => {
    await context.route(/payments\/click\/checkout\/opaque-token/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Click</h1>" }));
    const state = { order: unpaid() };
    const mock = await mockBackend(page, await signIn(page, CLIENT, routes(state)));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${locale}/lawyers/${SELLER}`);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.locator('[data-ai-id$=".buy"]').last().click();
    const dialog = page.locator('[data-ai-id="marketplace.purchase-modal"]');
    await dialog.getByRole("textbox").first().fill("Click");
    await page.locator('[data-ai-id="marketplace.purchase.submit"]').click();
    const panel = dialog.locator(".ckp");
    const [tab] = await Promise.all([context.waitForEvent("page"), panel.locator('[data-ai-id$=".click.open"]').click()]);
    await tab.close();
    await expect(panel).toHaveAttribute("data-state", "confirming");
    const found = await sweep(page, `${locale} dialog confirming`, '[data-ai-id="marketplace.purchase.click"]', ONE_LINE);

    // Paid: the slim "Payment confirmed" line above the seller's 30 minutes.
    state.order = paid();
    await mock.push({ event: "marketplace.full_payment_paid", order_id: ORDER_ID, payment_id: "pay-1", payment_status: "paid" });
    await expect(dialog.locator(".ckp--slim")).toBeVisible({ timeout: 15_000 });
    found.push(...(await sweep(page, `${locale} dialog paid`, ".ckp--slim", [".ckp__pill"])));
    expect(found).toEqual([]);
  });
}
