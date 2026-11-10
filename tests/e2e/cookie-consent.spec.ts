import { mkdirSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn, type Routes } from "./mock";
import { installYmapsStub } from "./ymapsStub";

// The cookie banner and its settings (components/legal/CookieConsent.tsx,
// lib/consent.ts): "Reject all", "Accept all" and "Settings" side by side and
// alike, no category on before the visitor turns it on, the choice saved and
// changed later from the footer, the dialog keeps focus and closes on Esc,
// and nothing optional — the Yandex Maps script, the referral code and UTM
// tags — reaches the browser before consent. Every test starts with no
// choice made ({ cookieChoice: false }).
// Screenshots: CONSENT_SHOTS=1 → /tmp/lexgo-launch-compliance/consent/.

const SHOTS = process.env.CONSENT_SHOTS ? "/tmp/lexgo-launch-compliance/consent" : "";
const KEY = "lexgo_cookie_consent";

const PUBLIC: Routes = {};

const stored = (page: Page, key = KEY) => page.evaluate((k) => localStorage.getItem(k), key);
const choice = async (page: Page) => JSON.parse((await stored(page)) ?? "null") as { v: number; at: number; choices: Record<string, boolean> } | null;
const banner = (page: Page) => page.locator('[data-ai-id="cookies.banner"]');
const dialog = (page: Page) => page.getByRole("dialog", { name: "Настройки cookie" });

async function noOverflow(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(1);
}

test("reject is as easy as accept: three alike buttons, nothing optional on, banner gone after reload", async ({ page }) => {
  await mockBackend(page, PUBLIC, { cookieChoice: false });
  await page.goto("/ru");
  const b = banner(page);
  await expect(b).toBeVisible();
  await expect(b.getByRole("heading", { name: "Ваша приватность — ваш выбор" })).toBeVisible();
  await expect(b.getByRole("link", { name: "Политика cookie" })).toHaveAttribute("href", "/ru/legal/cookie");
  const reject = b.getByRole("button", { name: "Отклонить все" });
  const accept = b.getByRole("button", { name: "Принять все" });
  const settings = b.getByRole("button", { name: "Настроить" });
  // Same look and size: no button is louder than another.
  const look = (l: typeof reject) => l.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.backgroundColor, s.color, s.fontSize, s.fontWeight, s.boxShadow, Math.round(el.getBoundingClientRect().height)].join("|");
  });
  expect(await look(reject)).toBe(await look(accept));
  expect(await look(settings)).toBe(await look(accept));
  const [rb, ab] = [await reject.boundingBox(), await accept.boundingBox()];
  expect(Math.abs((rb?.width ?? 0) - (ab?.width ?? 0))).toBeLessThanOrEqual(1);
  // The banner is first for the keyboard.
  await page.keyboard.press("Tab");
  await expect(b.locator(":focus")).toHaveCount(1);
  expect(await choice(page)).toBeNull();

  await reject.click();
  await expect(b).toHaveCount(0);
  const rec = await choice(page);
  expect(rec?.v).toBe(1);
  expect(rec?.choices).toEqual({ functional: false, analytics: false, marketing: false });
  await page.reload();
  await expect(page.locator("footer")).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await noOverflow(page);
});

test("accept all turns every optional category on", async ({ page }) => {
  await mockBackend(page, PUBLIC, { cookieChoice: false });
  await page.goto("/en");
  await banner(page).getByRole("button", { name: "Accept all" }).click();
  await expect(banner(page)).toHaveCount(0);
  expect((await choice(page))?.choices).toEqual({ functional: true, analytics: true, marketing: true });
});

test("settings: nothing pre-ticked, one category saved, keyboard stays in the dialog, Esc closes, reopened from the footer", async ({ page }) => {
  await mockBackend(page, PUBLIC, { cookieChoice: false });
  await page.goto("/ru");
  await banner(page).getByRole("button", { name: "Настроить" }).click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  await expect(d.getByText("Всегда включены")).toBeVisible();
  for (const name of ["Функциональные", "Аналитика", "Маркетинг"]) await expect(d.getByRole("checkbox", { name })).not.toBeChecked();
  await expect(d.getByText("Яндекс Карты", { exact: true })).toBeVisible();
  await expect(d.getByRole("link", { name: "Политика конфиденциальности: Яндекс Карты" })).toHaveAttribute("target", "_blank");
  await expect(d.getByText("Сейчас на Tezkor Himoya не используется.", { exact: false })).toBeVisible();

  // Tab never leaves the dialog.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  // Esc closes without saving anything; the banner is back.
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
  expect(await choice(page)).toBeNull();
  await expect(banner(page)).toBeVisible();

  // Turn on only "Functional" and save.
  await banner(page).getByRole("button", { name: "Настроить" }).click();
  await d.getByText("Функциональные").click();
  await expect(d.getByRole("checkbox", { name: "Функциональные" })).toBeChecked();
  await d.getByRole("button", { name: "Сохранить выбор" }).click();
  await expect(d).toHaveCount(0);
  await expect(page.locator(".ntf__t", { hasText: "Ваш выбор cookie сохранён" })).toBeVisible();
  expect((await choice(page))?.choices).toEqual({ functional: true, analytics: false, marketing: false });

  // Changed later from the footer, where the refund rules and the Cookie policy are linked too.
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Правила оплаты и возврата" })).toHaveAttribute("href", "/ru/legal/payment-refund-warranty");
  await expect(footer.getByRole("link", { name: "Политика cookie" })).toHaveAttribute("href", "/ru/legal/cookie");
  await footer.getByRole("button", { name: "Настройки cookie" }).click();
  await expect(d).toBeVisible();
  await expect(d.getByRole("checkbox", { name: "Функциональные" })).toBeChecked();
  await expect(d.getByRole("checkbox", { name: "Маркетинг" })).not.toBeChecked();
  await expect(d).toContainText("Текущий выбор сохранён");
  await d.getByRole("button", { name: "Отклонить все" }).click();
  expect((await choice(page))?.choices).toEqual({ functional: false, analytics: false, marketing: false });
  // Closed with the focus back on the button that opened it.
  await expect(footer.getByRole("button", { name: "Настройки cookie" })).toBeFocused();
});

test("the referral code and UTM tags wait for marketing consent, then come from the landing page, and go when it is withdrawn", async ({ page }) => {
  await mockBackend(page, PUBLIC, { cookieChoice: false });
  await page.goto("/ru?ref=FRIEND42&utm_source=telegram");
  await expect(banner(page)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await stored(page, "lexgo_ref")).toBeNull();
  expect(await stored(page, "lexgo_attr")).toBeNull();
  // Consent given on another page still credits the visit's first page.
  await page.locator("footer").getByRole("link", { name: "Политика cookie" }).click();
  await expect(page).toHaveURL(/\/ru\/legal\/cookie$/);
  await banner(page).getByRole("button", { name: "Принять все" }).click();
  await expect.poll(() => stored(page, "lexgo_ref")).toContain("FRIEND42");
  expect(JSON.parse((await stored(page, "lexgo_attr")) ?? "{}")).toMatchObject({ utm_source: "telegram", landing_page: "/ru?ref=FRIEND42&utm_source=telegram" });

  await page.locator("footer").getByRole("button", { name: "Настройки cookie" }).click();
  await dialog(page).getByRole("button", { name: "Отклонить все" }).click();
  expect(await stored(page, "lexgo_ref")).toBeNull();
  expect(await stored(page, "lexgo_attr")).toBeNull();
});

// ── The Yandex map ───────────────────────────────────────────────────────
const LOADER = "https://api-maps.yandex.ru/2.1/?apikey=0f0f0f0f-1111-2222-3333-444444444444&lang=uz_UZ";
const mapRoutes: Routes = {
  "/marketplace/lawyers": { items: [], count: 0, total: 0 },
  "/marketplace/map/config": {
    provider: "yandex",
    api_version: "2.1",
    maps_api_key: "0f0f0f0f-1111-2222-3333-444444444444",
    maps_loader_url: LOADER,
    configured: true,
    default_location: { center: [69.2401, 41.2995], zoom: 11, country_bbox: [55.9, 37.1, 73.2, 45.7] },
    seller_map_url: "/marketplace/sellers/map",
    nearby_search_url: "/marketplace/nearby-sellers/search",
    location_consent_url: "/marketplace/me/location-consent",
    geocoder_search_url: "/marketplace/geocoder/search",
    geocoder_reverse_url: "/marketplace/geocoder/reverse",
    geocoder_configured: true,
    coordinate_order: "longitude_latitude",
    viewport_debounce_ms: 400,
  },
  "/marketplace/sellers/map": { items: [], markers: [], clusters: [], count: 0, total_in_bbox: 0, truncated: false, coordinate_order: "longitude_latitude" },
  "/marketplace/me/location-consent": { granted: false, permission_state: "prompt", source: "web", policy: {} },
};

async function countYandex(context: BrowserContext): Promise<{ urls: string[] }> {
  const seen = { urls: [] as string[] };
  await context.route(/yandex\.(ru|com|uz|net)/, (route) => {
    seen.urls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/javascript", body: `(${installYmapsStub.toString()})();` });
  });
  return seen;
}

test("the Yandex Maps script is not requested before consent; allowing the map loads it, withdrawing takes it down", async ({ page, context }) => {
  const yandex = await countYandex(context);
  await mockBackend(page, await signIn(page, CLIENT, mapRoutes), { cookieChoice: false });
  await page.goto("/uz/portal/client/lawyers?mode=nearby");
  const gate = page.locator('[data-ai-id="cookies.map-gate"]');
  await expect(gate).toBeVisible();
  await expect(gate.getByRole("heading", { name: "Xarita uchun ruxsatingiz kerak" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(yandex.urls).toEqual([]);
  expect(await page.locator('script[data-lexgo-map="yandex"]').count()).toBe(0);
  expect(await page.evaluate(() => "ymaps" in window)).toBe(false);

  // "Show the list instead" leaves the map unloaded.
  await gate.getByRole("button", { name: "Ro'yxat ko'rinishida" }).click();
  await expect(gate).toHaveCount(0);
  expect(yandex.urls).toEqual([]);
  await page.locator('[data-ai-id="marketplace.nearby.view.map"]').click();
  await expect(gate).toBeVisible();

  // Allowing the map turns on "functional" only and loads the config's loader.
  await gate.getByRole("button", { name: "Ruxsat berish va xaritani ko'rsatish" }).click();
  await expect(gate).toHaveCount(0);
  await expect.poll(() => yandex.urls).toEqual([LOADER]);
  await expect(page.locator(".ymk-canvas")).toBeVisible();
  expect((await choice(page))?.choices).toEqual({ functional: true, analytics: false, marketing: false });
  // The cookie banner is gone: the visitor made a choice.
  await expect(banner(page)).toHaveCount(0);

  // Withdrawn in the settings (opened from another tab's footer works the same way): the map and its script go.
  await page.evaluate(() => localStorage.setItem("lexgo_cookie_consent", JSON.stringify({ v: 1, at: Date.now(), choices: { functional: false, analytics: false, marketing: false } })));
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "lexgo_cookie_consent" })));
  await expect(gate).toBeVisible();
  await expect(page.locator(".ymk-canvas")).toHaveCount(0);
  expect(await page.locator('script[data-lexgo-map="yandex"]').count()).toBe(0);
  await noOverflow(page);
});

// ── Screenshots: banner, settings, footer and the waiting map ───────────
const LOCALES = [
  { loc: "uz", settings: "Sozlash", title: "Cookie sozlamalari" },
  { loc: "ru", settings: "Настроить", title: "Настройки cookie" },
  { loc: "en", settings: "Settings", title: "Cookie settings" },
] as const;
const VIEWS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
] as const;

for (const { loc, settings, title } of SHOTS ? LOCALES : []) {
  for (const view of VIEWS) {
    for (const scheme of ["light", "dark"] as const) {
      test(`screenshots ${loc} ${view.name} ${scheme}`, async ({ page, context }) => {
        mkdirSync(SHOTS, { recursive: true });
        const tag = `${loc}-${view.name}-${scheme}`;
        await page.setViewportSize({ width: view.width, height: view.height });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await mockBackend(page, PUBLIC, { cookieChoice: false });
        await page.goto(`/${loc}`);
        await expect(banner(page)).toBeVisible();
        await page.waitForTimeout(600);
        await noOverflow(page);
        await page.screenshot({ path: `${SHOTS}/banner-${tag}.png` });
        await banner(page).getByRole("button", { name: settings }).click();
        await expect(page.getByRole("dialog", { name: title })).toBeVisible();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${SHOTS}/settings-${tag}.png` });
        await page.keyboard.press("Escape");
        await page.locator("footer").scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.locator("footer").screenshot({ path: `${SHOTS}/footer-${tag}.png` });

        // The map waiting for consent, in a signed-in cabinet.
        const ctxPage = await context.newPage();
        await ctxPage.setViewportSize({ width: view.width, height: view.height });
        await ctxPage.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await countYandex(context);
        await mockBackend(ctxPage, await signIn(ctxPage, CLIENT, mapRoutes), { cookieChoice: false });
        await ctxPage.goto(`/${loc}/portal/client/lawyers?mode=nearby`);
        const gate = ctxPage.locator('[data-ai-id="cookies.map-gate"]');
        await expect(gate).toBeVisible();
        await gate.scrollIntoViewIfNeeded();
        await ctxPage.waitForTimeout(300);
        await gate.screenshot({ path: `${SHOTS}/map-gate-${tag}.png` });
        await ctxPage.close();
      });
    }
  }
}
