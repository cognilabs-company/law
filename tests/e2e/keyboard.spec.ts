import { expect, test, type Locator, type Page } from "@playwright/test";
import { CLIENT, mockBackend, signIn } from "./mock";

// Launch checklist item 9: the handmade controls (Select, DatePicker,
// TimePicker, CheckBox) and the dialogs work from the keyboard alone, show a
// focus ring, close on Escape and hand focus back to what opened them.
const SHOTS = process.env.A11Y_SHOTS;

const DOCS = {
  items: [
    { id: "doc-terms", slug: "terms", version: "2.1", title: "Условия использования", body: "Текст условий.", language: "ru", is_active: true },
    { id: "doc-privacy", slug: "privacy", version: "1.0", title: "Политика конфиденциальности", body: "Текст политики.", language: "ru", is_active: true },
  ],
};

async function quiet(page: Page, theme: "light" | "dark" = "light") {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript((t) => {
    localStorage.setItem("lexgo_theme", t);
    localStorage.setItem("lexgo_cookie_consent", JSON.stringify({ v: 1, at: Date.now(), choices: { functional: false, analytics: false, marketing: false } }));
  }, theme);
}

const draft = (accountType: "client" | "advocate", idx: number) => (page: Page) =>
  page.addInitScript(
    ([type, at]) =>
      localStorage.setItem(
        "lexgo_reg_draft",
        JSON.stringify({ at: Date.now(), idx: at, draft: { accountType: type, phone: "+998901112233", phoneVerified: true, profile: { firstName: "Dilnoza", lastName: "Karimova" } }, agreed: {} }),
      ),
    [accountType, idx] as const,
  );

// Presses Tab until `target` has focus; fails if it is never reached.
async function tabTo(page: Page, target: Locator, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

// A ring the eye can find: an outline (or the drawn box's outline) at least
// 2px wide that is not transparent.
async function ringOf(el: Locator) {
  return el.evaluate((n) => {
    const s = getComputedStyle(n);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor };
  });
}
async function expectRing(el: Locator) {
  const r = await ringOf(el);
  expect(r.style).not.toBe("none");
  expect(r.width).toBeGreaterThanOrEqual(2);
  expect(r.color).not.toMatch(/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/);
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test("the Select opens, moves, picks and closes from the keyboard, with a focus ring", async ({ page }) => {
  await quiet(page);
  await mockBackend(page, { "/legal/consents": DOCS });
  await draft("client", 2)(page);
  await page.goto("/ru/register");
  const btn = page.locator(".rf__step .dsel__btn").first();
  await expect(btn).toBeVisible({ timeout: 20000 });
  // Reachable with Tab from the first name field.
  await page.locator(".rf__step input").first().focus();
  await tabTo(page, btn);
  await expectRing(btn);
  // Its spoken name holds the field's name and what the button shows.
  await expect(btn).toHaveAccessibleName(/Регион|Область|Hudud|Region/i);
  await shot(page, "focus-select");
  await page.keyboard.press("Enter");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  // The keyboard lands inside the list; arrows move between options.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const focused = page.locator('[role="option"]:focus');
  await expect(focused).toHaveCount(1);
  const label = (await focused.innerText()).trim();
  await expectRing(focused);
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(btn).toContainText(label);
  await expect(btn).toBeFocused();
  // Space opens too, and Escape closes without picking, focus back home.
  await page.keyboard.press(" ");
  await expect(list).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(btn).toBeFocused();
  await expect(btn).toContainText(label);
});

test("the consent CheckBox is reached with Tab, toggles with Space and shows its ring on the drawn box", async ({ page }) => {
  await quiet(page);
  await mockBackend(page, { "/legal/consents": DOCS });
  await draft("client", 2)(page);
  await page.goto("/ru/register");
  const box = page.locator(".consent .cbx__in").first();
  await expect(page.locator(".consent")).toContainText("Условия использования", { timeout: 20000 });
  await page.locator(".rf__step input").first().focus();
  await tabTo(page, box, 80);
  await expect(box).not.toBeChecked();
  await expectRing(page.locator(".consent .cbx__box").first());
  await shot(page, "focus-checkbox");
  await page.keyboard.press(" ");
  await expect(box).toBeChecked();
  await page.keyboard.press(" ");
  await expect(box).not.toBeChecked();
});

test("the TimePicker opens with ArrowDown, walks the hours and minutes, and returns focus on Escape", async ({ page }) => {
  await quiet(page);
  await mockBackend(page, { "/legal/consents": DOCS });
  // The advocate's expertise step holds the working-hours pickers.
  await draft("advocate", 4)(page);
  await page.goto("/ru/register");
  const btn = page.locator(".rf__step .tpick .mpick__btn").first();
  await expect(btn).toBeVisible({ timeout: 20000 });
  await btn.focus();
  await expectRing(btn);
  await expect(btn).toContainText("09:00");
  await page.keyboard.press("ArrowDown");
  const dialog = page.locator(".tpick__pop");
  await expect(dialog).toBeVisible();
  const hour = page.locator(".tpick__grid--h [role=option]:focus");
  await expect(hour).toHaveText("09");
  await expectRing(hour);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".tpick__grid--h [role=option]:focus")).toHaveText("10");
  // Enter picks the hour and moves on to the minutes; Enter again closes.
  await page.keyboard.press("Enter");
  await expect(page.locator(".tpick__grid--m [role=option]:focus")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(btn).toContainText("10:00");
  await expect(btn).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(btn).toBeFocused();
});

test("the DatePicker opens into its grid, moves by day and week, picks with Enter and closes on Escape", async ({ page }) => {
  await quiet(page);
  const routes = await signIn(page, CLIENT, {});
  await mockBackend(page, routes);
  await page.goto("/ru/portal/client/payments");
  const field = page.locator(".dpick input").first();
  await expect(field).toBeVisible({ timeout: 20000 });
  await field.focus();
  // The text field sits inside the pill, which draws the ring.
  await expectRing(page.locator(".dpick .mpick__btn").first());
  await page.keyboard.press("ArrowDown");
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  const day = page.locator(".dpick__d:focus");
  await expect(day).toHaveCount(1);
  await expectRing(day);
  const start = await day.getAttribute("data-iso");
  // Back one week, then one day forward: the cursor follows the calendar.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  const iso = await page.locator(".dpick__d:focus").getAttribute("data-iso");
  expect(iso).not.toBe(start);
  const [y, m, d] = String(iso).split("-");
  await shot(page, "focus-datepicker");
  await page.keyboard.press("Enter");
  await expect(grid).toBeHidden();
  await expect(field).toHaveValue(`${d}.${m}.${y}`);
  await expect(field).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(grid).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(grid).toBeHidden();
  await expect(field).toBeFocused();
});

test("the AI chat opens from the keyboard, takes focus, and gives it back to its button on Escape", async ({ page }) => {
  await quiet(page);
  await page.goto("/ru/faq");
  const fab = page.locator(".fab");
  await expect(fab).toBeVisible({ timeout: 20000 });
  await expect(fab).toHaveAccessibleName(/AI/);
  await fab.focus();
  await expectRing(fab);
  const dock = page.locator(".dock.on");
  // Retried until the page has hydrated: Enter on the button opens the dock.
  await expect(async () => {
    await fab.focus();
    await page.keyboard.press("Enter");
    await expect(dock).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await expect.poll(() => dock.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dock.on")).toHaveCount(0);
  await expect(fab).toBeFocused();
});

test("a dialog keeps Tab inside, closes on Escape and returns focus to its opener", async ({ page }) => {
  await quiet(page);
  // A verified badge opens the shared Modal; the lawyers page reads live
  // (GET only) sellers, so the first verified card opens it.
  await page.route(/\/api\/backend\/|lexgo\.api\.cognilabs\.org/, (r) =>
    ["GET", "HEAD", "OPTIONS"].includes(r.request().method()) ? r.fallback() : r.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/ru/lawyers");
  const badge = page.locator("button.vbadge").first();
  await expect(badge).toBeVisible({ timeout: 30000 });
  await badge.focus();
  await expectRing(badge);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog").filter({ has: page.locator(".vmodal__hero") });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // Tab and Shift+Tab many times: focus never leaves the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await expectRing(page.locator(":focus"));
  await shot(page, "focus-modal");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(badge).toBeFocused();
});
