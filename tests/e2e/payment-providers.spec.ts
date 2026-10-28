import { expect, test, type Page } from "@playwright/test";
import { ADMIN, CLIENT, mockBackend, signIn } from "./mock";

// TSK-664399 — Click / Payme readiness and the "paid only after the
// confirmed callback" return. Screenshots: PAY_SHOTS=<dir>, PAY_DARK=1, PAY_NARROW=1.
test.use({
  viewport: process.env.PAY_NARROW ? { width: 375, height: 812 } : { width: 1440, height: 960 },
  colorScheme: process.env.PAY_DARK ? "dark" : "light",
});
const shot = async (page: Page, name: string) => {
  if (!process.env.PAY_SHOTS) return;
  await page.waitForTimeout(700);
  const suffix = `${process.env.PAY_DARK ? "dark" : "light"}${process.env.PAY_NARROW ? "-phone" : ""}`;
  await page.screenshot({ path: `${process.env.PAY_SHOTS}/pay-${name}-${suffix}.png` });
};
const watchIntl = (page: Page) => {
  const missing: string[] = [];
  page.on("console", (m) => {
    if (/MISSING_MESSAGE/.test(m.text())) missing.push(m.text().slice(0, 200));
  });
  return missing;
};
const UUID = "3f30810c-c35c-40d6-9eeb-31e1481d1a7f";
const READINESS = {
  items: [
    { key: "payme", configured: false, status: "disabled", detail: "", latency_ms: 0.01, checked_at: new Date(Date.now() - 120000).toISOString() },
    { key: "click", configured: false, status: "disabled", detail: "", latency_ms: 0, checked_at: new Date(Date.now() - 120000).toISOString() },
    { key: "atmos", configured: true, status: "configured_not_verified", detail: "", latency_ms: 42, checked_at: new Date(Date.now() - 120000).toISOString() },
  ],
  all_enabled: false,
  mode: "feature_flagged_until_contracts",
  requirements: ["merchant_contract", "provider_credentials", "signed_webhook", "idempotency", "daily_reconciliation", "refund_support", "settlement_confirmation"],
};
const recon = (provider: string | null) => {
  const all = {
    providers: [
      { provider: "telegram_manual", count: 61, paid_count: 34, amount: 141448834, paid_amount: 6651691, discrepancies: 0 },
      { provider: "atmos", count: 11, paid_count: 3, amount: 4917000, paid_amount: 1341000, discrepancies: 3 },
      { provider: "payme", count: 23, paid_count: 2, amount: 900000, paid_amount: 6000, discrepancies: 2 },
    ],
    discrepancies: [
      ...Array.from({ length: 3 }, (_, i) => ({ payment_id: i ? `${UUID.slice(0, -1)}${i}` : UUID, provider: "atmos", status: "paid", amount: 447000, paid_amount: 447000, reasons: ["provider_transaction_id_missing"] })),
      ...Array.from({ length: 6 }, (_, i) => ({ payment_id: `b-${i}`, provider: "payme", status: "paid", amount: 3000, paid_amount: 3000, reasons: ["provider_transaction_id_missing"] })),
    ],
    discrepancy_count: 9,
    checked_count: 205,
    generated_at: new Date(Date.now() - 60000).toISOString(),
  };
  if (!provider) return all;
  return { ...all, providers: all.providers.filter((p) => p.provider === provider), discrepancies: all.discrepancies.filter((d) => d.provider === provider), discrepancy_count: all.discrepancies.filter((d) => d.provider === provider).length };
};

test("admin: providers' readiness, the road to production and the reconciliation — no ids anywhere", async ({ page }) => {
  const missing = watchIntl(page);
  await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/admin/payments/provider-readiness": READINESS,
      "/admin/payments/reconciliation-v2": (_: unknown, url: URL) => recon(url.searchParams.get("provider")),
    } as never),
  );
  await page.goto("/uz/admin/payments");
  const cards = page.locator(".pmx__card:not(.pmx__card--sk)");
  await expect(cards).toHaveCount(3, { timeout: 20000 });
  await expect(cards.nth(0)).toContainText("Click");
  await expect(cards.nth(0)).toContainText("O'chiq");
  await expect(cards.nth(2)).toContainText("ATMOS");
  await expect(cards.nth(2)).toContainText("Sozlangan, tekshirilmagan");
  await expect(page.getByText("Click va Payme hali yoqilmagan.")).toBeVisible();
  await expect(page.locator(".pmx__reqs li")).toHaveCount(7);
  await expect(page.locator(".pmx__reasons li").first()).toContainText("Provayder tranzaksiya raqami yo'q");
  await expect(page.locator(".pmx__tile").nth(1)).toContainText("9");
  await shot(page, "providers");
  // Six rows, then the rest on request.
  await expect(page.locator(".pmx__rows li")).toHaveCount(6);
  await page.getByRole("button", { name: "Yana 3 tasini ko'rsatish" }).click();
  await expect(page.locator(".pmx__rows li")).toHaveCount(9);
  // Never a payment id, never a raw code.
  const text = await page.locator(".pmx").innerText();
  expect(text).not.toContain(UUID);
  expect(text).not.toMatch(/provider_transaction_id_missing|telegram_manual|configured_not_verified|[0-9a-f]{8}-[0-9a-f]{4}-/);
  // The provider filter asks the backend, it does not filter in the browser.
  await page.locator(".pmx__sel .dsel__btn").click();
  await page.getByRole("option", { name: "ATMOS" }).click();
  await expect(page.locator(".pmx__prov li")).toHaveCount(1);
  await expect(page.locator(".pmx__prov li")).toContainText("ATMOS");
  // Phones: nothing sticks out of the screen.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(wide).toBe(false);
  expect(missing).toEqual([]);
});

test("back from the provider: waiting until the confirmed callback, then paid", async ({ page }) => {
  const missing = watchIntl(page);
  let polls = 0;
  await page.addInitScript(() => sessionStorage.setItem("lexgo.pendingPayment", JSON.stringify({ id: "pay-1", amount: 150000, at: Date.now() })));
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      // One payment, polled by id (gaps closed §2) — never the whole history.
      "/payments/pay-1": () => {
        polls++;
        return { id: "pay-1", amount: 150000, currency: "UZS", status: polls < 3 ? "pending" : "paid", method: "payme", kind: "marketplace_full", description: "", order_id: null, created_at: new Date().toISOString(), receipt_url: null };
      },
    } as never),
  );
  await page.goto("/uz/portal/client");
  const card = page.locator(".payret");
  await expect(card).toContainText("To'lov tasdiqlanmoqda", { timeout: 20000 });
  await expect(card).toContainText("150 000 so'm");
  await shot(page, "return-waiting");
  await expect(card).toContainText("To'lov tasdiqlandi", { timeout: 15000 });
  expect(polls).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => sessionStorage.getItem("lexgo.pendingPayment"))).toBeNull();
  await shot(page, "return-paid");
  expect(missing).toEqual([]);
});

test("back from the provider: an unknown payment is dropped quietly", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("lexgo.pendingPayment", JSON.stringify({ id: "pay-x", amount: 0, at: Date.now() })));
  await mockBackend(page, await signIn(page, CLIENT, { "/payments/pay-x": { status: 404, json: { detail: { code: "payment_not_found" } } } } as never));
  await page.goto("/uz/portal/client");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("lexgo.pendingPayment")), { timeout: 20000 }).toBeNull();
  await expect(page.locator(".payret")).toHaveCount(0);
});

test("back from the provider: a failed payment says so and points to the history", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("lexgo.pendingPayment", JSON.stringify({ id: "pay-2", amount: 0, at: Date.now() })));
  await mockBackend(page, await signIn(page, CLIENT, { "/payments/pay-2": { id: "pay-2", amount: 5000, currency: "UZS", status: "cancelled", method: "click", kind: "marketplace_full", description: "", created_at: new Date().toISOString() } } as never));
  await page.goto("/uz/portal/client");
  const card = page.locator(".payret");
  await expect(card).toContainText("To'lov o'tmadi", { timeout: 20000 });
  await expect(card.getByRole("link", { name: "To'lovlar tarixini ochish" })).toBeVisible();
});
