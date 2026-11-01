import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CLIENT, mockBackend, signIn } from "./mock";

// Launch checklist items 6 (contrast), 8 (alt text) and 9 (keyboard): axe
// runs over the public pages, sign-up / sign-in, the legal pages and the
// plans page, in light and in dark, and fails on any serious or critical
// finding. Public pages read the live backend (GET only: anything else is
// refused here before it leaves the browser); the signed-in plan page runs
// on the mocked backend.
const PAGES = [
  "/ru",
  "/ru/services",
  "/ru/lawyers",
  "/ru/faq",
  "/ru/contact",
  "/ru/for-lawyers",
  "/ru/academy",
  "/ru/legal-aid",
  "/ru/warranty",
  "/ru/subscription",
  "/ru/login",
  "/ru/register",
  "/ru/legal",
  "/ru/legal/privacy",
  "/ru/legal/terms",
  "/ru/legal/account-deletion",
  "/ru/legal/licenses",
  "/en/legal/licenses",
  "/uz",
  "/en",
];
const THEMES = ["light", "dark"] as const;
const REPORT = process.env.A11Y_REPORT;

async function readOnly(page: Page, banner = false) {
  await page.route(/\/api\/backend\/|lexgo\.api\.cognilabs\.org/, (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.fallback();
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"read-only test"}' });
  });
  // The cookie banner (launch item 3) is answered so it does not cover
  // the page under test; it is checked on its own below.
  if (banner) return;
  await page.addInitScript(() => {
    try {
      localStorage.setItem("lexgo_cookie_consent", JSON.stringify({ v: 1, at: Date.now(), choices: { functional: false, analytics: false, marketing: false } }));
    } catch {}
  });
}

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript((t) => localStorage.setItem("lexgo_theme", t), theme);
}

type Found = { id: string; impact: string; help: string; nodes: { target: string; html: string; summary: string }[] };

async function scan(page: Page): Promise<Found[]> {
  // Scroll-reveal sections start transparent; show them as a reader would.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return res.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact ?? "",
      help: v.help,
      nodes: v.nodes.slice(0, 12).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160), summary: (n.failureSummary ?? "").slice(0, 240) })),
    }));
}

function explain(found: Found[]): string {
  return found.map((f) => `${f.id} (${f.impact}): ${f.help}\n${f.nodes.map((n) => `   ${n.target}\n     ${n.summary}`).join("\n")}`).join("\n");
}

async function report(name: string, found: Found[]) {
  if (!REPORT) return;
  const fs = await import("node:fs");
  fs.mkdirSync(REPORT, { recursive: true });
  fs.writeFileSync(`${REPORT}/${name.replace(/[^a-z0-9]+/gi, "_")}.json`, JSON.stringify(found, null, 1));
}

for (const theme of THEMES) {
  for (const path of PAGES) {
    test(`axe: ${path} in ${theme} has no serious or critical issue`, async ({ page }) => {
      await readOnly(page);
      await setTheme(page, theme);
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator("main, [role=main], body").first()).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      const found = await scan(page);
      await report(`${theme}${path}`, found);
      expect(found, explain(found)).toEqual([]);
    });
  }

  // Sign-up past the phone step: the client's form and every advocate step,
  // resumed from a saved draft (no request leaves the browser).
  for (const [type, idx] of [["client", 2], ["advocate", 2], ["advocate", 3], ["advocate", 4], ["advocate", 5], ["advocate", 6]] as const) {
    test(`axe: sign-up step ${idx} for ${type} in ${theme} has no serious or critical issue`, async ({ page }) => {
      await setTheme(page, theme);
      await readOnly(page);
      await mockBackend(page, {
        "/legal/consents": { items: [{ id: "doc-terms", slug: "terms", version: "2.1", title: "Условия использования", body: "Текст.", language: "ru", is_active: true }] },
      });
      await page.addInitScript(
        ([t, i]) =>
          localStorage.setItem(
            "lexgo_reg_draft",
            JSON.stringify({ at: Date.now(), idx: i, draft: { accountType: t, phone: "+998901112233", phoneVerified: true, profile: { firstName: "Dilnoza", lastName: "Karimova" } }, agreed: {} }),
          ),
        [type, idx] as const,
      );
      await page.goto("/ru/register");
      await expect(page.locator(".rf__step")).toBeVisible({ timeout: 20000 });
      const found = await scan(page);
      await report(`${theme}/ru/register-${type}-${idx}`, found);
      expect(found, explain(found)).toEqual([]);
    });
  }

  test(`axe: the cookie banner and its settings in ${theme} have no serious or critical issue`, async ({ page }) => {
    await readOnly(page, true);
    await setTheme(page, theme);
    await page.goto("/ru/legal");
    const banner = page.locator(".ckc");
    await expect(banner).toBeVisible({ timeout: 20000 });
    let found = await scan(page);
    await report(`${theme}/ru/cookie-banner`, found);
    expect(found, explain(found)).toEqual([]);
    // Its settings: the category switches are handmade checkboxes.
    await page.locator('[data-ai-id="cookies.banner.settings"]').click();
    await expect(page.locator(".ckc-cat").first()).toBeVisible();
    found = await scan(page);
    await report(`${theme}/ru/cookie-settings`, found);
    expect(found, explain(found)).toEqual([]);
  });

  test(`axe: the signed-in plan page in ${theme} has no serious or critical issue`, async ({ page }) => {
    await setTheme(page, theme);
    await readOnly(page);
    await mockBackend(page, await signIn(page, CLIENT, {}));
    await page.goto("/ru/portal/client/subscription");
    await page.waitForLoadState("networkidle").catch(() => {});
    const found = await scan(page);
    await report(`${theme}/ru/portal/client/subscription`, found);
    expect(found, explain(found)).toEqual([]);
  });
}

// A11Y_SHOTS=<dir> saves the licences page and a keyboard focus example
// (the sign-up Select with its ring, its contrast-fixed labels around it)
// in uz, ru and en, at 1440 and 390, light and dark.
const SHOTS = process.env.A11Y_SHOTS;
if (SHOTS) {
  for (const locale of ["uz", "ru", "en"]) {
    for (const theme of THEMES) {
      test(`shots: licences and focus ring, ${locale} ${theme}`, async ({ page }) => {
        test.setTimeout(240_000);
        await readOnly(page);
        await setTheme(page, theme);
        await mockBackend(page, {
          "/legal/consents": { items: [{ id: "doc-terms", slug: "terms", version: "2.1", title: "Terms", body: "Text.", language: locale, is_active: true }] },
        });
        await page.addInitScript(() =>
          localStorage.setItem(
            "lexgo_reg_draft",
            JSON.stringify({ at: Date.now(), idx: 2, draft: { accountType: "client", phone: "+998901112233", phoneVerified: true, profile: { firstName: "Dilnoza", lastName: "Karimova" } }, agreed: {} }),
          ),
        );
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
          await page.goto(`/${locale}/legal/licenses`);
          await expect(page.locator(".lic-groups")).toBeVisible({ timeout: 30000 });
          await page.screenshot({ path: `${SHOTS}/licenses-${locale}-${width}-${theme}.png` });
          await page.locator(".lic-group .lic-text summary").first().click();
          await page.locator(".lic-group").first().scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${SHOTS}/licenses-text-${locale}-${width}-${theme}.png` });
          await page.goto(`/${locale}/register`);
          const btn = page.locator(".rf__step .dsel__btn").first();
          await expect(btn).toBeVisible({ timeout: 30000 });
          await page.locator(".rf__step input").first().focus();
          for (let i = 0; i < 40 && !(await btn.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
          await btn.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${SHOTS}/focus-select-${locale}-${width}-${theme}.png` });
          await page.keyboard.press("Enter");
          await page.keyboard.press("ArrowDown");
          await page.screenshot({ path: `${SHOTS}/focus-option-${locale}-${width}-${theme}.png` });
          await page.keyboard.press("Escape");
        }
      });
    }
  }
}
