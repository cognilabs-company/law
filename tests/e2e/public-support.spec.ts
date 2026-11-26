import { expect, test, type Page } from "@playwright/test";
import { mockBackend, type Mock } from "./mock";

// TEZKOR_HIMOYA_PUBLIC_SUPPORT_FRONTEND (2026-11-26): /support is the public,
// login-free page for the App Store / Google Play "Support URL". Its text
// comes from GET /public/support?lang=uz|ru|en.
//
// The page reads the API on the server first. These checks need that server
// read to fail, so the browser loads it through the mocked proxy: run them
// with a dev server whose BACKEND_ORIGIN reaches nothing, e.g.
// BACKEND_ORIGIN=http://127.0.0.1:9. Against a server that reaches a real
// backend they skip.
const WIDTHS = [320, 375, 430, 640, 768, 1024, 1280, 1366, 1440, 1470, 1512, 1600, 1728, 1920, 2560];
const LOCALES = ["uz", "ru", "en"] as const;
type Lang = (typeof LOCALES)[number];

const TEXT: Record<Lang, { title: string; intro: string; email: string; phone: string; privacy: string; deletion: string; operator: string; include: string; security: string; instructions: string }> = {
  uz: { title: "Yordam markazi", intro: "Tezkor Himoya ilovasidan foydalanish bo‘yicha yordam oling.", instructions: "Accountga kirish, xizmatlar, to‘lovlar yoki texnik muammolar bo‘yicha email yozing yoki qo‘ng‘iroq qiling. Ilovaga kira olsangiz, uning ichidagi yordam markazidan ham murojaat yuborishingiz mumkin.", include: "Murojaatda muammoni, sodir bo‘lgan vaqtni, qurilma va ilova versiyasini ko‘rsating. To‘lov masalasida buyurtma yoki to‘lov ID’sini kiriting. Skrinshotda maxfiy ma’lumotlarni yashiring.", security: "Parol, SMS/Telegram tasdiqlash kodi, karta PIN-kodi yoki to‘liq karta ma’lumotlarini yubormang.", email: "Email orqali yozish", phone: "Qo‘ng‘iroq qilish", privacy: "Maxfiylik siyosati", deletion: "Accountni o‘chirish", operator: "Platforma operatori" },
  ru: { title: "Центр поддержки", intro: "Получите помощь по использованию приложения Tezkor Himoya.", instructions: "По вопросам входа в аккаунт, услуг, платежей или технических неполадок напишите нам или позвоните. Если вы можете войти в приложение, обращение также можно отправить через встроенный центр поддержки.", include: "Опишите проблему, время её возникновения, устройство и версию приложения. Для вопросов оплаты укажите ID заказа или платежа. Скройте конфиденциальные сведения на скриншотах.", security: "Не отправляйте пароль, код подтверждения из SMS/Telegram, PIN-код или полные реквизиты карты.", email: "Написать письмо", phone: "Позвонить", privacy: "Политика конфиденциальности", deletion: "Удаление аккаунта", operator: "Оператор платформы" },
  en: { title: "Support center", intro: "Get help with the Tezkor Himoya application.", instructions: "For account access, services, payments or technical issues, email or call us. If you can sign in, you can also submit a request through the support center inside the application.", include: "Describe the issue, when it occurred, your device and application version. For payment issues, include the order or payment ID. Hide confidential information in screenshots.", security: "Do not send passwords, SMS/Telegram verification codes, card PINs or full card details.", email: "Email support", phone: "Call support", privacy: "Privacy policy", deletion: "Account deletion", operator: "Platform operator" },
};

const supportAnswer = (lang: Lang) => ({
  brand: "Tezkor Himoya",
  language: lang,
  available_languages: ["uz", "ru", "en"],
  ...TEXT[lang],
  contact: { email: "zyovuddnov1@gmail.com", phone: "+998909338678", email_url: "mailto:zyovuddnov1@gmail.com", phone_url: "tel:+998909338678" },
  company: { name: "LEXGO-TECH MChJ", tax_id: "313406672", address: "Samarqand viloyati, Ishtixon tumani, Halqabod QFY, Sheyxlarkent mahallasi, Sheyxlarkent qishlog‘i, 52-uy" },
  links: { support: `/support?lang=${lang}`, privacy_policy: `/legal/privacy-policy?lang=${lang}`, account_deletion: `/legal/account-deletion?lang=${lang}` },
});

test.use({ colorScheme: "light" });

const ROUTES = {
  "/public/support": (_b: unknown, url: URL) => {
    const lang = url.searchParams.get("lang");
    return lang === "uz" || lang === "ru" || lang === "en" ? supportAnswer(lang) : { status: 422, json: { detail: "unsupported language" } };
  },
};

// Opens the page as a signed-out visitor; skips when the server rendered it
// from a real backend (see the note at the top).
async function open(page: Page, path: string, routes: Record<string, unknown> = ROUTES): Promise<Mock> {
  const mock = await mockBackend(page, routes);
  await page.goto(path);
  await expect(page.locator(".supp")).toBeVisible({ timeout: 30_000 });
  const asked = mock.calls.some((c) => c.path === "/public/support");
  const server = (await page.locator(".supp").getAttribute("data-support")) === "api" && !asked;
  test.skip(server, "the dev server reached a real backend; run it with BACKEND_ORIGIN=http://127.0.0.1:9");
  return mock;
}

for (const lang of LOCALES) {
  test(`a signed-out visitor reads the support page in ${lang}, with working email and phone actions`, async ({ page }) => {
    const mock = await open(page, `/${lang}/support`);
    const t = TEXT[lang];
    const supp = page.locator(".supp");
    await expect(supp).toHaveAttribute("data-support", "api");
    await expect(supp.getByRole("heading", { level: 1 })).toHaveText(t.title);
    await expect(supp).toContainText(t.intro);
    await expect(supp).toContainText(t.instructions);
    await expect(supp).toContainText(t.include);
    await expect(supp.getByRole("note")).toHaveText(t.security);
    // The actions use the URLs the backend gives.
    await expect(supp.getByRole("link", { name: new RegExp(t.email) })).toHaveAttribute("href", "mailto:zyovuddnov1@gmail.com");
    await expect(supp.getByRole("link", { name: new RegExp(t.phone) })).toHaveAttribute("href", "tel:+998909338678");
    await expect(supp).toContainText("zyovuddnov1@gmail.com");
    await expect(supp).toContainText("+998 90 933 86 78");
    // Operator details.
    await expect(supp.getByRole("heading", { name: t.operator })).toBeVisible();
    await expect(supp).toContainText("LEXGO-TECH MChJ");
    await expect(supp).toContainText("313406672");
    // Relative links open on the backend, not on this site.
    const privacy = supp.getByRole("link", { name: t.privacy });
    await expect(privacy).toHaveAttribute("href", `https://lexgo.api.cognilabs.org/legal/privacy-policy?lang=${lang}`);
    await expect(privacy).toHaveAttribute("target", "_blank");
    await expect(supp.getByRole("link", { name: t.deletion })).toHaveAttribute("href", `https://lexgo.api.cognilabs.org/legal/account-deletion?lang=${lang}`);
    // No promise of hours or reply times.
    await expect(supp).not.toContainText(/24\s*\/\s*7|24 soat|24 час|24 hours/i);
    // Asked in the page's own language, with no sign-in.
    const calls = mock.calls.filter((c) => c.path === "/public/support");
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.headers.authorization).toBeUndefined();
    await expect(page).toHaveURL(new RegExp(`/${lang}/support$`));
  });
}

test("the page asks the backend in the page's language on each locale", async ({ page }) => {
  const mock = await open(page, "/ru/support");
  await expect(page.locator(".supp h1")).toHaveText(TEXT.ru.title);
  await page.goto("/en/support");
  await expect(page.locator(".supp h1")).toHaveText(TEXT.en.title);
  // The mock answers 422 to any other language, so the titles above prove
  // each request named the page's language.
  expect(mock.refused).toEqual([]);
});

test("with the API down the page still shows how to reach support", async ({ page }) => {
  await open(page, "/uz/support", { "/public/support": { status: 503, json: { detail: "down" } } });
  const supp = page.locator(".supp");
  await expect(supp).toHaveAttribute("data-support", "fallback");
  await expect(supp.getByRole("heading", { level: 1 })).toHaveText("Yordam markazi");
  await expect(supp.getByRole("link", { name: /Email orqali yozish/ })).toHaveAttribute("href", "mailto:zyovuddnov1@gmail.com");
  await expect(supp.getByRole("link", { name: /Qo'ng'iroq qilish/ })).toHaveAttribute("href", "tel:+998909338678");
  await expect(supp.getByRole("link", { name: "Maxfiylik siyosati" })).toHaveAttribute("href", "/uz/legal/privacy");
  await expect(supp.getByRole("link", { name: "Hisobni o'chirish" })).toHaveAttribute("href", "/uz/legal/account-deletion");
});

test("the footer links to the support page", async ({ page }) => {
  test.setTimeout(120_000);
  await mockBackend(page, ROUTES);
  await page.goto("/uz/faq");
  const link = page.locator("footer").getByRole("link", { name: "Yordam markazi" });
  await expect(link).toHaveAttribute("href", "/uz/support");
  // The new entry keeps to one line and inside the page at every width.
  const found: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(80);
    const p = await link.evaluate((a) => {
      const r = a.getBoundingClientRect();
      const lines = new Set(Array.from(a.getClientRects()).filter((x) => x.width).map((x) => Math.round(x.top))).size;
      return { right: r.right, lines, page: document.documentElement.scrollWidth, vw: window.innerWidth };
    });
    if (p.right > p.vw + 1 || p.page > p.vw + 1) found.push(`@${w}: overflows`);
    if (p.lines > 1) found.push(`@${w}: wraps onto ${p.lines} lines`);
  }
  expect(found).toEqual([]);
});

// Every promised width, in every language: nothing overflows the page or its
// own box, nothing is cut, and the action labels keep to one line.
async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) out.push(`page scrolls sideways (${doc.scrollWidth} > ${window.innerWidth})`);
    const root = document.querySelector<HTMLElement>(".supp .legal__in");
    if (!root) return ["page missing"];
    const box = root.getBoundingClientRect();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < box.left - 1 || r.right > box.right + 1) out.push(`${el.tagName.toLowerCase()}.${el.className} sticks out`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") out.push(`${el.tagName.toLowerCase()}.${el.className} is cut`);
    }
    for (const b of Array.from(root.querySelectorAll<HTMLElement>(".supp__txt b"))) {
      const range = document.createRange();
      range.selectNodeContents(b);
      const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width).map((r) => Math.round(r.top)));
      if (tops.size > 1) out.push(`"${b.textContent}" wraps onto ${tops.size} lines`);
    }
    return out;
  });
}

for (const lang of LOCALES) {
  for (const down of [false, true]) {
    test(`the support page fits all 15 widths (${lang}${down ? ", API down" : ""})`, async ({ page }) => {
      test.setTimeout(180_000);
      await open(page, `/${lang}/support`, down ? { "/public/support": { status: 503, json: {} } } : ROUTES);
      await expect(page.locator(".supp")).toHaveAttribute("data-support", down ? "fallback" : "api");
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      const found: string[] = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(120);
        for (const p of await problems(page)) found.push(`@${w}: ${p}`);
      }
      expect(found).toEqual([]);
    });
  }
}
