import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";

const SHOTS = process.env.PRIVACY_SHOTS;

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

// The admin editor (final contract, eecebb9): Uzbek / Russian / English
// tabs, Uzbek required, a started language needs both parts, one request
// with title_i18n / body_i18n, the version list with its languages, and the
// backend's refusals on the right tab. Saving is mocked — production is never
// written to.
const PRIV = (v: string, active: boolean, langs: ("uz" | "ru" | "en")[], at: string) => ({
  id: `priv-${v}`, slug: "privacy", version: v, is_active: active, created_at: at, language: "uz", requested_language: "uz", translation_fallback: false,
  available_languages: langs,
  title: "Maxfiylik siyosati", body: "Maxfiylik siyosati matni. ".repeat(10),
  title_i18n: Object.fromEntries(langs.map((l) => [l, { uz: "Maxfiylik siyosati", ru: "Политика конфиденциальности", en: "Privacy Policy" }[l]])),
  body_i18n: Object.fromEntries(langs.map((l) => [l, { uz: "Maxfiylik siyosati matni. ", ru: "Текст политики. ", en: "Policy text. " }[l].repeat(10)])),
});
const ADMIN_DOCS = { items: [PRIV("1.1", true, ["uz", "ru", "en"], "2026-11-01T09:00:00Z"), PRIV("1.0", false, ["uz"], "2026-09-14T09:00:00Z")] };

async function adminLegal(page: Page, onPatch: (body: Record<string, unknown>) => { status?: number; json: unknown } | unknown) {
  const asked: string[] = [];
  const mock = await mockBackend(
    page,
    await signIn(page, ADMIN, {
      "/admin/legal/consents": (_b: unknown, url: URL) => (asked.push(url.search), ADMIN_DOCS),
      "PATCH /admin/legal/consents/priv-1.1": (b: unknown) => onPatch(b as Record<string, unknown>),
      "/admin/legal/user-consents": { items: [] },
    } as never),
  );
  await page.goto("/en/admin/legal");
  return { mock, asked };
}

test("admin: the version list shows each version's languages; an archived version only opens read-only", async ({ page }) => {
  const { asked } = await adminLegal(page, () => ({}));
  const row = page.locator(".lgitem").filter({ hasText: "v1.1" });
  await expect(row).toBeVisible({ timeout: 20000 });
  expect(asked[0]).toContain("lang=en");
  await expect(row.locator(".lglang__c")).toHaveText(["Uzbek", "Russian", "English"]);
  await expect(row).not.toContainText("privacy");
  await row.getByRole("button", { name: /2 versions/ }).click();
  const hist = row.locator(".lghist li");
  await expect(hist).toHaveCount(2);
  await expect(hist.nth(1)).toContainText("archived");
  await expect(hist.nth(1).locator(".lglang__c")).toHaveText(["Uzbek"]);
  await row.scrollIntoViewIfNeeded();
  await shotsOf(page, "admin-version-list");
  await hist.nth(1).getByRole("button").click();
  const dlg = page.getByRole("dialog", { name: /v1\.0/ });
  await expect(dlg).toContainText("archived — read-only");
  await expect(dlg.getByRole("tab", { name: /Russian/ })).toBeDisabled();
  await expect(dlg.locator("input, textarea")).toHaveCount(0);
  await shotsOf(page, "admin-version-archived", true);
});

test("admin: tabs check Uzbek and pairs, warn about a dropped translation, and send one PATCH with title_i18n / body_i18n", async ({ page }) => {
  const sent: Record<string, unknown>[] = [];
  let refuse = true;
  await adminLegal(page, (b) => {
    sent.push(b);
    return refuse ? { status: 422, json: { detail: { code: "legal_translation_pair_required", languages: ["en"] } } } : PRIV("1.2", true, ["uz", "ru"], "2026-11-01T10:00:00Z");
  });
  const row = page.locator(".lgitem").filter({ hasText: "v1.1" });
  await row.getByRole("button", { name: "New version" }).click();
  const dlg = page.getByRole("dialog", { name: /New version of/ });
  const tab = (name: RegExp) => dlg.getByRole("tab", { name });
  // Loaded from title_i18n / body_i18n.
  await tab(/Russian/).click();
  await expect(dlg.getByLabel("Title")).toHaveValue("Политика конфиденциальности");
  // Uzbek emptied → required, on the Uzbek tab.
  await tab(/Uzbek/).click();
  await dlg.getByLabel("Title *").fill("");
  await dlg.getByRole("button", { name: "Publish" }).click();
  await expect(dlg.locator(".lgform__err")).toHaveText("The Uzbek title is required.");
  await expect(tab(/Uzbek/)).toHaveAttribute("data-state", "error");
  await shotsOf(page, "admin-editor-uz-required", true);
  await dlg.getByLabel("Title *").fill("Maxfiylik siyosati");
  // English with only a title → the pair rule, on the English tab.
  await tab(/English/).click();
  await dlg.getByLabel("Text").fill("");
  await dlg.getByRole("button", { name: "Publish" }).click();
  await expect(tab(/English/)).toHaveAttribute("aria-selected", "true");
  await expect(dlg.locator(".lgform__err")).toHaveText("Add the English text too, or clear the English title.");
  expect(sent).toHaveLength(0);
  await shotsOf(page, "admin-editor-pair", true);
  // Clearing English: allowed, with the warning that it leaves this version.
  await dlg.getByLabel("Title").fill("");
  await expect(dlg.locator(".lgform__warn")).toContainText("English: this translation will be removed from the new version until a reviewed one is supplied.");
  await shotsOf(page, "admin-editor-warning");
  // The backend refuses (a mocked 422 pair error for English): shown on the
  // English tab, in words, never as a code.
  await dlg.getByRole("button", { name: "Publish" }).click();
  await expect.poll(() => sent.length).toBe(1);
  // One request: only complete translations, as title_i18n / body_i18n.
  expect(sent[0]).toMatchObject({ version_bump: "major", title_i18n: { uz: "Maxfiylik siyosati", ru: "Политика конфиденциальности" } });
  expect(Object.keys(sent[0].title_i18n as object)).toEqual(["uz", "ru"]);
  expect(Object.keys(sent[0])).not.toContain("title_json");
  await expect(tab(/English/)).toHaveAttribute("data-state", "error");
  await expect(page.getByText(/legal_translation_pair_required/)).toHaveCount(0);
  refuse = false;
  await dlg.getByRole("button", { name: "Publish" }).click();
  await expect.poll(() => sent.length).toBe(2);
  await expect(dlg).toHaveCount(0);
});

async function shotsOf(page: Page, name: string, top = false) {
  if (!SHOTS) return;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 400 ? 1000 : 860 });
      await page.waitForTimeout(400);
      // Dialog shots start at the language tabs.
      if (top) await page.evaluate(() => document.querySelectorAll(".amodal__b").forEach((b) => b.scrollTo(0, 0)));
      await page.screenshot({ path: `${SHOTS}/${name}-${width}-${scheme}.png` });
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1360, height: 900 });
}

// Screenshot runs only, against the production API (no mock, read-only):
// PRIVACY_SHOTS=<dir> saves 1440 and 390, light and dark, of the privacy
// policy in uz/ru/en, an honest Uzbek fallback in English and Russian, the
// footer's Terms and Disclaimer, and the sign-up checklist in uz/ru/en.
if (SHOTS) {
  test("legal documents in uz, ru and en against the live backend", async ({ page }) => {
    test.setTimeout(900_000);
    const open = async (path: string) => {
      await page.goto(path);
      await expect(page.locator(".legal__body p").first()).toBeVisible({ timeout: 60000 });
    };
    // The privacy policy in each language, full text, no fallback note.
    for (const lang of ["uz", "ru", "en"] as const) {
      await open(`/${lang}/legal/privacy`);
      await expect(page.locator(".legal__body")).toHaveAttribute("lang", lang);
      await expect(page.locator(".legal__fallback")).toHaveCount(0);
      expect((await page.locator(".legal__body").innerText()).length).toBeGreaterThan(5000);
      await shotsOf(page, `privacy-${lang}`);
    }
    // No English offer yet: the real Uzbek text, marked Uzbek, with the note.
    await open("/en/legal/user-offer");
    await expect(page.locator(".legal__body")).toHaveAttribute("lang", "uz");
    await expect(page.locator(".legal__fallback")).toContainText("This document is shown in Uzbek because the English translation is not published yet.");
    await shotsOf(page, "user-offer-en-fallback");
    // No Russian remote-assistance consent yet.
    await open("/ru/legal/remote-assistance-consent");
    await expect(page.locator(".legal__body")).toHaveAttribute("lang", "uz");
    await expect(page.locator(".legal__fallback")).toContainText("перевод на русский язык ещё не опубликован");
    await shotsOf(page, "remote-assistance-ru-fallback");
    // The footer's Terms and Disclaimer open the real documents.
    for (const [label, path, slugTitle] of [["Terms of use", "/en/legal/terms", "Foydalanuvchi ofertasi"], ["Legal disclaimer", "/en/legal/disclaimer", "Platforma qoidalari"]] as const) {
      await page.goto("/en/legal/privacy");
      const link = page.locator("footer").getByRole("link", { name: label, exact: true });
      await expect(link).toHaveAttribute("href", path);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("h1")).toHaveText(slugTitle, { timeout: 60000 });
      await expect(page.locator(".legal__body p").first()).toBeVisible();
      await shotsOf(page, `footer-${path.split("/").pop()}-en`);
    }
    await atConsentStep(page);
    for (const lang of ["uz", "ru", "en"] as const) {
      await page.goto(`/${lang}/register`);
      const list = page.locator(".consent");
      await expect(list.locator(".consent__meta").first()).toBeVisible({ timeout: 60000 });
      await list.scrollIntoViewIfNeeded();
      await shotsOf(page, `register-consent-${lang}`);
    }
  });
}
