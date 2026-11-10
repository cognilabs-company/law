import { expect, test, type Page } from "@playwright/test";
import { ADVOCATE, CLIENT, mockBackend, signIn } from "./mock";

// Launch compliance 2026-11-01 (a2): sign-up consents with the 18+
// confirmation, the user's own data in the profile, the terms before a
// purchase (amount, renewal and its price, refund rules), cancelling in one
// button, and the AI label. Every write is mocked.

const SHOTS = process.env.COMPLIANCE_SHOTS;

async function shots(page: Page, area: "account" | "claims", name: string, target?: string) {
  if (!SHOTS) return;
  const dir = `${SHOTS}/${area}`;
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((th) => {
      localStorage.setItem("lexgo_theme", th);
      document.documentElement.setAttribute("data-theme", th);
      document.documentElement.style.colorScheme = th;
    }, theme);
    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      if (target) await page.locator(target).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${dir}/${name}-${w}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

const DOCS = {
  items: [
    { id: "doc-offer", slug: "user_offer", version: "1.0", title: "Foydalanuvchi ofertasi", body: "Oferta matni.", language: "uz", is_active: true },
    { id: "doc-privacy", slug: "privacy", version: "1.0", title: "Maxfiylik siyosati", body: "Maxfiylik matni.", language: "uz", is_active: true },
    { id: "doc-age", slug: "age_18", version: "1.0", title: "18 yoshdan katta foydalanuvchi tasdig'i", body: "Yosh cheklovi.", language: "uz", is_active: true },
  ],
};

const atConsentStep = (page: Page) =>
  page.addInitScript(() => {
    if (sessionStorage.getItem("a2-seeded")) return;
    sessionStorage.setItem("a2-seeded", "1");
    localStorage.setItem("lexgo_reg_draft", JSON.stringify({ at: Date.now(), idx: 2, draft: { accountType: "client", phone: "+998901112233", phoneVerified: false, profile: { firstName: "Dilnoza", lastName: "Karimova", region: "tashkent" } }, agreed: {} }));
  });

test("sign-up: every document and the 18+ confirmation start unticked and block the code until ticked", async ({ page }) => {
  const starts: unknown[] = [];
  const mock = await mockBackend(page, {
    "/legal/consents": DOCS,
    "POST /auth/register/start": (b: unknown) => (starts.push(b), { verification_id: "v-1", expires_in: 300, resend_in: 60 }),
  });
  await atConsentStep(page);
  await page.goto("/ru/register");
  const list = page.locator(".consent");
  await expect(list).toContainText("18 yoshdan katta", { timeout: 30000 });
  // The age document is a confirmation in the user's own words.
  await expect(list).toContainText("Подтверждаю, что мне исполнилось 18 лет");
  const boxes = list.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(boxes.nth(i)).not.toBeChecked();
  await shots(page, "account", "register-consents-ru", ".consent");

  await page.locator('input[type="password"]').first().fill("Parol12345");
  const go = page.getByRole("button", { name: "Получить код" });
  await go.dispatchEvent("click");
  await expect(page.locator(".rf__missing")).toContainText("Согласие с документами");
  // Two of three is still not enough.
  await list.locator(".consent__row").nth(0).click();
  await list.locator(".consent__row").nth(1).click();
  await go.dispatchEvent("click");
  expect(starts).toHaveLength(0);
  await list.locator(".consent__row").nth(2).click();
  await go.dispatchEvent("click");
  await expect.poll(() => starts.length).toBe(1);
  // No marketing consent is asked at sign-up: the backend has nowhere to keep one.
  expect(JSON.stringify(starts[0])).not.toMatch(/marketing/);
  expect(mock.refused).toEqual([]);
});

for (const lang of ["uz", "ru", "en"] as const) {
  test(`sign-up consents render in ${lang}`, async ({ page }) => {
    await mockBackend(page, { "/legal/consents": DOCS });
    await atConsentStep(page);
    await page.goto(`/${lang}/register`);
    await expect(page.locator(".consent")).toContainText("18 yoshdan katta", { timeout: 30000 });
    await page.locator(".consent").scrollIntoViewIfNeeded();
    await shots(page, "account", `register-consents-${lang}`, ".consent");
  });
}

test("profile: download my data says it is not available yet, delete opens the deletion page", async ({ page }) => {
  await mockBackend(page, await signIn(page, CLIENT, { "/clients/me": { id: "u-client", name: "Test Mijoz", phone: CLIENT.phone } }));
  for (const lang of ["uz", "ru", "en"] as const) {
    await page.goto(`/${lang}/portal/client/profile?tab=security`);
    const card = page.locator(".accdata");
    await expect(card).toBeVisible({ timeout: 30000 });
    await shots(page, "account", `account-data-${lang}`, ".accdata");
  }
  await page.goto("/ru/portal/client/profile?tab=security");
  const card = page.locator(".accdata");
  await expect(card.getByRole("button", { name: "Скачать" })).toBeDisabled();
  await expect(card).toContainText("Пока недоступно");
  await expect(card.getByRole("link", { name: /Запросить копию/ })).toHaveAttribute("href", "/ru/portal/client/support");
  const del = card.getByRole("link", { name: "Удалить аккаунт" });
  await expect(del).toHaveAttribute("href", "/ru/legal/account-deletion");
  await del.click();
  await expect(page).toHaveURL(/\/ru\/legal\/account-deletion$/);
  await expect(page.locator("h1")).toContainText("удаление аккаунта");
});

const PRO = { id: "p-pro", slug: "lexgo-ai-pro", name: "LexGo.AI Pro", price: 99000, monthly_price: 99000, six_month_price: 564300, yearly_price: 1069200, prepaid_yearly_price: 962280, is_active: true, audiences: ["client"], entitlements: { ai_requests: 1000 } };
const QUOTE = (period: string) =>
  period === "yearly"
    ? { months: 12, base_amount: 1069200, discount_amount: 69200, amount: 1000000, currency: "UZS", campaign: { id: "c1", title: "Kuzgi chegirma", discount_type: "fixed", discount_value: 69200 } }
    : { months: 1, base_amount: 99000, discount_amount: 0, amount: 99000, currency: "UZS", campaign: null };

test("subscription: the terms come before any payment, renewal is the user's choice, refund rules are linked", async ({ page }) => {
  const payments: Record<string, unknown>[] = [];
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/subscription-plans": [PRO],
      "/subscription-plans/p-pro/quote": (_b: unknown, url: URL) => QUOTE(url.searchParams.get("billing_period") ?? "monthly"),
      "POST /payments": (b: unknown) => (payments.push(b as Record<string, unknown>), { id: "pay-1", status: "pending", amount: 99000, currency: "UZS", payment_url: "https://pay.example/1" }),
    }),
  );
  await page.goto("/ru/portal/client/subscription");
  const card = page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]');
  await card.getByRole("button", { name: "Выбрать тариф" }).click();
  const dlg = page.getByRole("dialog", { name: "Проверьте перед оплатой" });
  await expect(dlg).toBeVisible();
  // Nothing is charged before the terms are accepted.
  expect(payments).toHaveLength(0);
  await expect(dlg).toContainText("Tezkor Himoya AI Pro");
  await expect(dlg.locator(".pterms__now")).toContainText(/99[\s  ]000 сум/);
  await expect(dlg).toContainText("Tezkor Himoya не добавляет к ней никаких сборов");
  const renew = dlg.getByRole("checkbox", { name: "Продлевать автоматически" });
  await expect(renew).not.toBeChecked();
  await expect(dlg).toContainText("Без автопродления");
  await expect(dlg.getByRole("link", { name: /Правила оплаты и возврата/ })).toHaveAttribute("href", "/ru/legal/payment-refund-warranty");
  await dlg.getByText("Продлевать автоматически").click();
  await expect(renew).toBeChecked();
  await expect(dlg.locator(".pterms__renew")).toContainText(/каждый месяц за 99[\s  ]000 сум/);
  await shots(page, "account", "subscription-terms-ru", ".pterms");
  await dlg.getByRole("button", { name: /Оплатить 99[\s  ]000 сум/ }).click();
  await expect.poll(() => payments.length).toBe(1);
  expect(payments[0]).toMatchObject({ amount: 99000, target_type: "subscription_plan", target_id: "p-pro" });
  // The renewal choice is kept as the auto-pay setting (no subscription yet).
  expect(await page.evaluate(() => localStorage.getItem("lexgo_autopay_u-client"))).toBe("1");
  expect(mock.refused).toEqual([]);
});

test("subscription: a promotion says the later periods cost the listed price", async ({ page }) => {
  await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/subscription-plans": [PRO],
      "/subscription-plans/p-pro/quote": (_b: unknown, url: URL) => QUOTE(url.searchParams.get("billing_period") ?? "monthly"),
    }),
  );
  for (const lang of ["uz", "en"] as const) {
    await page.goto(`/${lang}/portal/client/subscription`);
    await page.locator('[data-ai-id="pricing.billing"]').getByRole("button").nth(2).click();
    const card = page.locator('[data-ai-id="pricing.plan.lexgo-ai-pro"]');
    await expect(card).toContainText("Kuzgi chegirma");
    await card.getByRole("button", { name: lang === "uz" ? "Tarifni tanlash" : "Choose tariff" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.locator(".pterms__now")).toContainText(/1[\s  ]000[\s  ]000/);
    await expect(dlg.locator(".pterms__promo")).toContainText(/1[\s  ]069[\s  ]200/);
    await shots(page, "account", `subscription-terms-${lang}`, ".pterms");
    await dlg.getByRole("button", { name: lang === "uz" ? "Orqaga" : "Back" }).click();
  }
});

test("my plan: cancelling is one obvious button with the app's own confirmation", async ({ page }) => {
  const patches: unknown[] = [];
  let auto = true;
  const mock = await mockBackend(
    page,
    await signIn(page, CLIENT, {
      "/clients/me": () => ({ id: "u-client", name: "Test Mijoz", subscription: { id: "sub-1", plan_id: "p-pro", plan_name: "LexGo.AI Pro", status: "active", auto_renew: auto, renews_at: "2026-12-01T00:00:00Z" } }),
      "/subscriptions/me/features": { subscription_id: "sub-1", plan_id: "p-pro", plan_version: 1, items: [] },
      "/subscriptions/sub-1/contract": { subscription_id: "sub-1", status: "active", snapshot: { title: "LexGo.AI Pro", prices: { monthly: 99000 } }, renewal_terms_changed: false },
      "PATCH /subscriptions/sub-1/auto-renew": (b: unknown) => {
        patches.push(b);
        auto = (b as { auto_renew: boolean }).auto_renew;
        return { id: "sub-1", auto_renew: auto };
      },
    }),
  );
  await page.goto("/ru/portal/client/subscription");
  const renewRow = page.locator(".myplan__renew");
  await expect(renewRow).toContainText("Продлевается автоматически", { timeout: 30000 });
  await expect(renewRow).toContainText(/1 дек\S* 2026/);
  await shots(page, "account", "my-plan-cancel-ru", ".myplan");
  // Nothing happens without the confirmation; "keep" changes nothing.
  await renewRow.getByRole("button", { name: "Отменить подписку" }).click();
  const confirm = page.getByRole("dialog", { name: "Отменить подписку?" });
  await expect(confirm).toContainText(/1 дек\S* 2026/);
  await shots(page, "account", "my-plan-cancel-confirm-ru");
  await confirm.getByRole("button", { name: "Оставить подписку" }).click();
  expect(patches).toHaveLength(0);
  await renewRow.getByRole("button", { name: "Отменить подписку" }).click();
  await page.getByRole("dialog", { name: "Отменить подписку?" }).getByRole("button", { name: "Отменить подписку" }).click();
  await expect(renewRow).toContainText("Продление отключено");
  await expect(renewRow).toContainText(/Тариф закончится 1 дек\S* 2026/);
  await expect(renewRow.getByRole("button")).toHaveCount(0);
  expect(patches).toEqual([{ auto_renew: false }]);
  // The auto-pay switch shows the same state.
  await expect(page.getByRole("switch", { name: /Автоплатёж/ })).toHaveAttribute("aria-checked", "false");
  expect(mock.refused).toEqual([]);
  for (const lang of ["uz", "en"] as const) {
    auto = true;
    await page.goto(`/${lang}/portal/client/subscription`);
    await expect(page.locator(".myplan__cancel")).toBeVisible({ timeout: 30000 });
    await shots(page, "account", `my-plan-cancel-${lang}`, ".myplan");
    // The confirmation reads in the page's language too; "keep" changes nothing.
    await page.locator(".myplan__cancel").click();
    const dlg = page.locator(".amodal__c");
    await expect(dlg).toContainText("2026");
    await shots(page, "account", `my-plan-cancel-confirm-${lang}`);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
  }
  expect(patches).toEqual([{ auto_renew: false }]);
});

test("AI answers are labelled AI-generated and not legal advice, in the page's language", async ({ page }) => {
  const mock = await mockBackend(
    page,
    await signIn(page, ADVOCATE, {
      "POST /ai/assistant": { answer: "Da'vo muddati — 3 yil (FK 150-modda). Hujjatlarni yig'ing." },
    }),
  );
  const LABEL = { uz: "Yuridik maslahat emas", ru: "Не юридическая консультация", en: "Not legal advice" };
  for (const lang of ["uz", "ru", "en"] as const) {
    await page.goto(`/${lang}/portal/advocate/assistant`);
    await page.locator("textarea").first().fill("Qarzdor 2 yildan beri pulni qaytarmayapti, nima qilish kerak?");
    await page.locator(".asist .btn--pri").click();
    const ans = page.locator(".asist__ans");
    await expect(ans).toContainText("Da'vo muddati", { timeout: 30000 });
    const label = ans.locator(".ailbl");
    await expect(label).toBeVisible();
    await expect(label).toContainText(LABEL[lang]);
    await shots(page, "claims", `ai-label-assistant-${lang}`, ".asist__ans");
  }
  expect(mock.refused).toEqual([]);
});

test("a failed AI request is not labelled as an AI answer", async ({ page }) => {
  await mockBackend(page, await signIn(page, ADVOCATE, { "POST /ai/assistant": { status: 500, json: { detail: "boom" } } }));
  await page.goto("/en/portal/advocate/assistant");
  await page.locator("textarea").first().fill("A question long enough to send.");
  await page.locator(".asist .btn--pri").click();
  await expect(page.locator(".asist__ans")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".asist__ans .ailbl")).toHaveCount(0);
});

test("home page shows no made-up counters, ticker or quotes", async ({ page }) => {
  await mockBackend(page, { "/lawyers": [], "/subscription-plans": [] });
  for (const lang of ["uz", "ru", "en"] as const) {
    await page.goto(`/${lang}`);
    await expect(page.locator(".hero")).toBeVisible({ timeout: 30000 });
    await expect(page.locator(".stats, .ticker, .quotes")).toHaveCount(0);
    const text = await page.locator("main, body").first().innerText();
    expect(text).not.toMatch(/1[ ,. ]?240\+|63[ ,. ]?000\+|12k\+/);
    await page.locator(".hero__tags").scrollIntoViewIfNeeded();
    await shots(page, "claims", `home-hero-${lang}`, ".hero__tags");
  }
});
