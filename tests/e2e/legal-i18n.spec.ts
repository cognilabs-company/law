import { expect, test, type Page } from "@playwright/test";
import { mockBackend } from "./mock";

// LEXGO_PRIVACY_POLICY_I18N_FRONTEND_2026_11_01: legal documents come in
// uz, ru and en. Every request names the page's language (?lang=), the text
// is shown as the backend wrote it, and a language change reloads it.
const TITLE = { uz: "Maxfiylik siyosati", ru: "ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ", en: "Privacy Policy" };
const BODY = { uz: "Shaxsga doir maʼlumotlarni qayta ishlash.", ru: "Обработка персональных данных.", en: "Personal data processing." };
const TERMS = { uz: "Foydalanish shartlari", ru: "Условия использования", en: "Terms of use" };
type Lang = keyof typeof TITLE;
const docs = (lang: Lang) => ({
  items: [
    { id: "doc-terms", slug: "terms", version: "2.1", title: TERMS[lang], body: "", language: lang, title_i18n: TERMS, is_active: true },
    { id: "doc-privacy", slug: "privacy", version: "1.0", title: TITLE[lang], body: BODY[lang], language: lang, title_i18n: TITLE, body_i18n: BODY, is_active: true },
  ],
});

// The client's last profile step, where the checklist sits.
const atConsentStep = (page: Page) =>
  page.addInitScript(() =>
    localStorage.setItem("lexgo_reg_draft", JSON.stringify({ at: Date.now(), idx: 2, draft: { accountType: "client", phone: "+998901112233", phoneVerified: false, profile: { firstName: "Dilnoza", lastName: "Karimova" } }, agreed: {} })),
  );

test("the sign-up checklist reads the documents in the page's language and reloads them on a language change", async ({ page }) => {
  const langs: string[] = [];
  const mock = await mockBackend(page, {
    "/legal/consents": (_b: unknown, url: URL) => {
      const lang = (url.searchParams.get("lang") ?? "") as Lang;
      langs.push(lang);
      return docs(TITLE[lang] ? lang : "uz");
    },
  });
  await atConsentStep(page);
  await page.goto("/uz/register");
  const list = page.locator(".consent");
  await expect(list).toContainText(TITLE.uz, { timeout: 20000 });
  await expect(list).toContainText(TERMS.uz);
  await expect(list).toContainText("Versiya 1.0");
  // Tick one, then switch the page to Russian: the same documents come back
  // in Russian and the tick is kept.
  await list.locator(".consent__row").nth(1).click();
  await expect(list.getByRole("checkbox").nth(1)).toBeChecked();
  // The sign-up screen hides the site header, so its language switcher is
  // driven directly: the same client-side switch (router.replace) it makes.
  await page.locator(".lang > button").first().dispatchEvent("click");
  await page.locator(".lang__menu button").filter({ hasText: /RU|Рус/i }).first().dispatchEvent("click");
  await expect(page).toHaveURL(/\/ru\/register/);
  await expect(list).toContainText(TITLE.ru, { timeout: 20000 });
  await expect(list).toContainText(TERMS.ru);
  await expect(list).not.toContainText(TITLE.uz);
  await expect(list.getByRole("checkbox").nth(1)).toBeChecked();
  // The text being accepted is the Russian one, marked as Russian.
  await list.locator(".consent__body summary").first().click();
  await expect(list.locator(".consent__body p").first()).toHaveText(BODY.ru);
  await expect(list.locator(".consent__body p").first()).toHaveAttribute("lang", "ru");
  expect(langs).toContain("uz");
  expect(langs.at(-1)).toBe("ru");
  // Every legal request named a language; no "text is only in Uzbek" note.
  expect(mock.calls.filter((c) => c.path.startsWith("/legal/")).length).toBeGreaterThan(0);
  await expect(page.getByText(/faqat o.zbek|только на узбекском|only in Uzbek/i)).toHaveCount(0);
});

test("an unsupported language is retried quietly in Uzbek, never shown as an error", async ({ page }) => {
  const langs: string[] = [];
  await mockBackend(page, {
    "/legal/consents": (_b: unknown, url: URL) => {
      const lang = url.searchParams.get("lang") ?? "";
      langs.push(lang);
      if (lang !== "uz") return { status: 422, json: { detail: { code: "legal_language_not_supported", message: "Supported legal document languages: uz, ru, en", allowed: ["uz", "ru", "en"] } } };
      return { items: [{ id: "doc-privacy", slug: "privacy", version: "1.0", title: TITLE.uz, body: BODY.uz, language: "uz", title_i18n: { uz: TITLE.uz }, is_active: true }] };
    },
  });
  await atConsentStep(page);
  await page.goto("/en/register");
  const list = page.locator(".consent");
  await expect(list).toContainText(TITLE.uz, { timeout: 20000 });
  // (Dev mode may ask twice; the order is what matters.)
  expect(langs[0]).toBe("en");
  expect(langs.indexOf("uz")).toBeGreaterThan(0);
  await expect(page.getByText(/legal_language_not_supported|Supported legal document languages/)).toHaveCount(0);
});

// Screenshot runs only, against the production API (no mock):
// PRIVACY_SHOTS=<dir> saves /{uz,ru,en}/legal/privacy and the sign-up
// checklist at 1440 and 390, light and dark.
const SHOTS = process.env.PRIVACY_SHOTS;
if (SHOTS) {
  test("privacy policy and sign-up checklist in uz, ru and en (production API)", async ({ page }) => {
    test.setTimeout(600_000);
    const shoot = async (name: string, prep?: () => Promise<void>) => {
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 400 ? 1000 : 860 });
          await page.waitForTimeout(500);
          if (prep) await prep();
          await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` });
        }
      }
    };
    for (const lang of ["uz", "ru", "en"] as const) {
      await page.goto(`/${lang}/legal/privacy`);
      await expect(page.locator(".legal__body p").first()).toBeVisible({ timeout: 60000 });
      await shoot(`privacy-${lang}`);
    }
    await atConsentStep(page);
    for (const lang of ["uz", "ru", "en"] as const) {
      await page.goto(`/${lang}/register`);
      const list = page.locator(".consent");
      await expect(list.locator(".consent__meta").first()).toBeVisible({ timeout: 60000 });
      await shoot(`register-consent-${lang}`, async () => {
        await list.scrollIntoViewIfNeeded();
      });
    }
  });
}
