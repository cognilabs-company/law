import { expect, test, type Locator, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn } from "./mock";
import list from "./fixtures/studio-k36.json";
import fx from "./fixtures/studio-k07.json";

// LEXGO_LEGAL_DOCUMENT_LANGUAGES_FRONTEND_FINAL_2026_11_01 — the Studio K07
// legal text editor: Uzbek, Russian and English tabs, Uzbek required, a
// translation only as a pair of title and text, a warning for a language
// left out of the version, and the backend's legal errors on their fields.
// The constructor list is the live one; the K07 schema follows its required
// fields (document_type, source_script, title_i18n, body_i18n). Everything is
// mocked: nothing is written anywhere.

// K07_SHOTS=<dir> saves the screen at 1440 and 390 wide, light and dark.
async function shots(page: Page, name: string, target: Locator, block: ScrollLogicalPosition = "start"): Promise<void> {
  const dir = process.env.K07_SHOTS;
  if (!dir) return;
  const size = page.viewportSize() ?? { width: 1440, height: 1000 };
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((s) => {
      document.documentElement.setAttribute("data-theme", s);
      document.documentElement.style.colorScheme = s;
    }, scheme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 400 ? 1000 : 860 });
      await page.waitForTimeout(350);
      await target
        .first()
        .evaluate((el, b) => el.scrollIntoView({ block: b }), block)
        .catch(() => {});
      if (block === "start") await page.mouse.wheel(0, -140);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${dir}/${name}-${width}-${scheme}.png` });
    }
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize(size);
}

const DOCS = { items: [{ id: "c-privacy", slug: "privacy", version: "1.4", title: "Maxfiylik siyosati", title_i18n: { uz: "Maxfiylik siyosati", ru: "Политика конфиденциальности", en: "Privacy Policy" }, available_languages: ["uz", "ru", "en"], is_active: true }] };
const routes = (extra: Record<string, unknown> = {}) => ({
  "/studio/constructors": list.constructors,
  "/studio/constructors/K07": fx.k07,
  "/studio/constructors/K07/form-context": fx.formContext,
  "/studio/constructors/K07/records": fx.records,
  "/studio/objects": { items: [] },
  "/admin/legal/consents": DOCS,
  "POST /admin/legal/transliterate": (b: { direction?: string; title?: string; body?: string }) => ({ title: b.direction === "lat_to_cyr" ? "Махфийлик сиёсати" : b.title, body: b.direction === "lat_to_cyr" ? "<p>Матн</p>" : b.body }),
  ...extra,
});

const SEND = /^(Save and send|Submit for approval|Send for approval)$/;
const NOTHING_RAW = /legal_[a-z_]+|title_i18n|body_i18n|uz_latn|uz_cyrl|\{"|c-privacy/;

test("a new legal document: three language tabs, Uzbek required, a translation only as a pair, languages left out are named", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mock = await mockBackend(page, await signIn(page, ADMIN, routes() as never));
  await page.goto("/en/admin/studio/o/new?new=K07");
  const tabs = page.getByRole("tablist", { name: /Document text/ });
  await expect(tabs).toBeVisible({ timeout: 30000 });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(tabs.getByRole("tab", { name: /^Uzbek/ })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: /^Russian/ })).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^English/ })).toBeVisible();
  // A new document just goes out without the languages left empty.
  const note = page.locator(".sx-lg__omit");
  await expect(note).toContainText("Will not be published");
  await expect(note).toContainText("Russian: left empty, so this language will simply not be published.");
  await expect(note).toContainText("English: left empty");

  // Uzbek, in the Latin script.
  const uz = page.locator('[role="tabpanel"][data-lang="uz"]');
  await uz.getByRole("textbox", { name: "Title" }).fill("Maxfiylik siyosati");
  await uz.locator('[data-path="body_i18n.uz_latn"] [contenteditable="true"]').fill("Matn");
  await expect(tabs.getByRole("tab", { name: /^Uzbek/ })).toHaveAttribute("data-mark", "complete");

  // English with a title only: the tab says it is half done.
  await tabs.getByRole("tab", { name: /^English/ }).click();
  const en = page.locator('[role="tabpanel"][data-lang="en"]');
  await expect(en).toBeVisible();
  await expect(uz).toBeHidden();
  await en.getByRole("button", { name: "Add English text" }).click();
  await en.getByRole("textbox", { name: "Title" }).fill("Privacy Policy");
  await expect(tabs.getByRole("tab", { name: /^English/ })).toHaveAttribute("data-mark", "partial");
  await expect(en.getByText("English: fill in both the title and the text, or clear both to leave this language out.")).toBeVisible();
  await expect(note).not.toContainText("English");
  await shots(page, "k07-tabs-new", tabs);

  // Sending for approval is blocked on the missing English text.
  await page.getByRole("tab", { name: /^Uzbek/ }).click();
  await page.getByRole("button", { name: SEND }).first().click();
  // The summary names it; picking it opens the English tab on that field.
  const summary = page.getByRole("alert").filter({ hasText: "Fix the fields below" });
  await summary.getByRole("button", { name: /Add the English text too/ }).click();
  await expect(en).toBeVisible();
  await expect(en.getByText("Add the English text too — a translation is published only with both its title and its text.")).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^English/ })).toHaveAttribute("data-mark", "error");
  expect(mock.calls.filter((c) => c.method === "POST" && /\/studio\/objects$/.test(c.path))).toHaveLength(0);
  await shots(page, "k07-pair-error", en);
  expect(await page.locator("main").innerText()).not.toMatch(NOTHING_RAW);
  expect(mock.refused).toEqual([]);
});

test("a new version of a document: languages left out will be removed, the backend's errors land on their tab and field, English is sent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const payload = {
    document_id: "c-privacy",
    document_type: "privacy",
    source_script: "uz_latn",
    version_bump: "minor",
    acceptance_required: true,
    requires_reaccept: false,
    title_i18n: { uz: "Maxfiylik siyosati", ru: "Политика конфиденциальности", en: "Privacy Policy" },
    body_i18n: { uz: "<p>Matn</p>", ru: "<p>Текст</p>", en: "<p>Text</p>" },
  };
  const sent: Record<string, unknown>[] = [];
  let checks = 0;
  const mock = await mockBackend(
    page,
    await signIn(
      page,
      ADMIN,
      routes({
        "/studio/objects/obj-k07": { id: "obj-k07", constructor_code: "K07", title: "Maxfiylik siyosati", status: "draft", lock_version: 1, runtime_target_id: "c-privacy", payload, current_version: { payload } },
        "POST /studio/constructors/K07/validate": (b: Record<string, unknown>) => {
          sent.push(b);
          checks += 1;
          if (checks === 1) return { status: 422, json: { detail: { code: "legal_uz_translation_required", fields: ["title_i18n.uz", "body_i18n.uz"] } } };
          if (checks === 2) return { status: 422, json: { detail: { code: "legal_translation_pair_required", languages: ["en"] } } };
          return { ok: true, errors: [] };
        },
        "POST /studio/constructors/K07/preview": { changed_fields: [], where_used: [], risk: "low", warnings: [] },
      }) as never,
    ),
  );
  await page.goto("/en/admin/studio/o/obj-k07");
  const tabs = page.getByRole("tablist", { name: /Document text/ });
  await expect(tabs).toBeVisible({ timeout: 30000 });
  // Loaded from title_i18n / body_i18n, Uzbek in the chosen script.
  for (const l of ["Uzbek", "Russian", "English"]) await expect(tabs.getByRole("tab", { name: new RegExp(`^${l}`) })).toHaveAttribute("data-mark", "complete");
  const uz = page.locator('[role="tabpanel"][data-lang="uz"]');
  await expect(uz.getByRole("textbox", { name: "Title" }).first()).toHaveValue("Maxfiylik siyosati");
  await expect(page.locator(".sx-lg__omit")).toHaveCount(0);

  // Russian removed from this version: the warning says it goes away.
  await tabs.getByRole("tab", { name: /^Russian/ }).click();
  const ru = page.locator('[role="tabpanel"][data-lang="ru"]');
  await ru.getByRole("button", { name: "Remove the Russian translation" }).click();
  await expect(tabs.getByRole("tab", { name: /^Russian/ })).toHaveAttribute("data-mark", "empty");
  const note = page.locator(".sx-lg__omit");
  await expect(note).toContainText("Not in the new version");
  await expect(note).toContainText("Russian: this translation will be removed from the new version until a reviewed one is supplied.");
  await shots(page, "k07-omission-warning", tabs);

  // The backend's Uzbek check lands on the Uzbek title and text.
  const send = page.getByRole("button", { name: SEND }).first();
  await tabs.getByRole("tab", { name: /^English/ }).click();
  await send.click();
  await expect(uz).toBeVisible({ timeout: 20000 });
  await expect(uz.getByText("Enter the Uzbek title — every legal document needs one.")).toBeVisible();
  await expect(uz.getByText("Enter the Uzbek text — every legal document needs it.")).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Uzbek/ })).toHaveAttribute("data-mark", "error");
  // What was sent: every valid language in title_i18n / body_i18n, English
  // kept, Russian left out, no canonical uz copy and no title_json.
  const first = sent[0] ?? {};
  expect(first.title_i18n).toEqual({ uz_latn: "Maxfiylik siyosati", uz_cyrl: "Махфийлик сиёсати", en: "Privacy Policy" });
  expect(first.body_i18n).toEqual({ uz_latn: "<p>Matn</p>", uz_cyrl: "<p>Матн</p>", en: "<p>Text</p>" });
  expect(first).not.toHaveProperty("title_json");

  // The backend's pair check lands on the English tab.
  await send.click();
  const en = page.locator('[role="tabpanel"][data-lang="en"]');
  await expect(en).toBeVisible({ timeout: 20000 });
  await expect(en.getByText(/Add the English (title|text) too/).first()).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^English/ })).toHaveAttribute("data-mark", "error");
  await shots(page, "k07-server-error", en);
  expect(await page.locator("main").innerText()).not.toMatch(NOTHING_RAW);
  expect(mock.refused).toEqual([]);
});

test("the three tabs fit a 360px phone in every language, names whole", async ({ page }) => {
  // Three locales, each compiled on its first visit in dev.
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await mockBackend(page, await signIn(page, ADMIN, routes() as never));
  for (const [locale, name] of [["ru", "Текст документа"], ["uz", "Hujjat matni"], ["en", "Document text"]] as const) {
    await page.goto(`/${locale}/admin/studio/o/new?new=K07`);
    const tabs = page.getByRole("tablist", { name: new RegExp(name) });
    await expect(tabs).toBeVisible({ timeout: 30000 });
    await tabs.scrollIntoViewIfNeeded();
    const fit = await tabs.evaluate((el) => ({
      list: el.scrollWidth <= el.clientWidth + 1,
      names: [...el.querySelectorAll<HTMLElement>(".sx-lg__tabname")].every((n) => n.scrollWidth <= n.clientWidth + 1),
      page: document.documentElement.scrollWidth <= window.innerWidth + 1,
    }));
    expect(fit, locale).toEqual({ list: true, names: true, page: true });
    if (locale === "ru") await shots(page, "k07-tabs-ru-phone", tabs, "center");
  }
});

// Backend answers 2026-11-01 N4 / N5. The K07 schema lists no `en` yet, so
// the English tab says Studio may not keep it and links to Legal documents.
// Validation answers HTTP 200, ok=false, translation_required on a field:
// a language left out that Studio's check asks for says so on its tab.
test("the English tab names the schema gap; validate's ok=false translation_required lands on its tab in words", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A document in Uzbek only.
  const payload = { document_id: "c-privacy", document_type: "privacy", source_script: "uz_latn", version_bump: "minor", acceptance_required: true, requires_reaccept: false, title_i18n: { uz: "Maxfiylik siyosati" }, body_i18n: { uz: "<p>Matn</p>" } };
  const mock = await mockBackend(
    page,
    await signIn(
      page,
      ADMIN,
      routes({
        "/studio/objects/obj-k07": { id: "obj-k07", constructor_code: "K07", title: "Maxfiylik siyosati", status: "draft", lock_version: 1, runtime_target_id: "c-privacy", payload, current_version: { payload } },
        "POST /studio/constructors/K07/validate": { ok: false, errors: [{ field: "title_i18n.ru", code: "translation_required" }, { field: "body_i18n.ru", code: "translation_required" }] },
        "POST /studio/constructors/K07/preview": { changed_fields: [], where_used: [], risk: "low", warnings: [] },
      }) as never,
    ),
  );
  await page.goto("/en/admin/studio/o/obj-k07");
  const tabs = page.getByRole("tablist", { name: /Document text/ });
  await expect(tabs).toBeVisible({ timeout: 30000 });
  await tabs.getByRole("tab", { name: /^English/ }).click();
  const en = page.locator('[role="tabpanel"][data-lang="en"]');
  const gap = en.locator(".sx-lg__gap");
  await expect(gap).toContainText("Studio doesn’t keep English yet");
  await expect(gap).toContainText("This constructor’s schema has no English field yet");
  expect(await gap.getByRole("link", { name: "Open Legal documents" }).getAttribute("href")).toMatch(/\/admin\/legal$/);
  await shots(page, "k07-english-gap", en);
  // The Russian tab has no gap note: the schema lists Russian.
  await tabs.getByRole("tab", { name: /^Russian/ }).click();
  await expect(page.locator('[role="tabpanel"][data-lang="ru"] .sx-lg__gap')).toHaveCount(0);

  await page.getByRole("button", { name: SEND }).first().click();
  const ru = page.locator('[role="tabpanel"][data-lang="ru"]');
  await expect(ru).toBeVisible({ timeout: 20000 });
  await expect(ru.getByText("Studio’s check asks for the Russian title — fill it in.")).toBeVisible();
  await expect(tabs.getByRole("tab", { name: /^Russian/ })).toHaveAttribute("data-mark", "error");
  await shots(page, "k07-validate-translation-required", ru);
  expect(await page.locator("main").innerText()).not.toMatch(/translation_required|title_i18n/);
  expect(mock.refused).toEqual([]);
});
