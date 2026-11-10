import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { mockBackend, signIn } from "./mock";
import { OPERATOR, crmServer } from "./crmServer";

// The CRM «New lead» sheet in the call-center console and the «New customer»
// step it opens, against mocked data. SHOTS=before|after also saves light/dark
// screenshots at 1440 and 390 px into /tmp/lexgo-newlead-design/shots.

const SHOTS = process.env.SHOTS ?? "";
const DIR = "/tmp/lexgo-newlead-design/shots";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const PEOPLE: [string, string][] = [
  ["Azizbek Qodirov", "tashkent_city"],
  ["Dilnoza Karimova", "samarkand"],
  ["Javohir Abdullayev", "fergana"],
  ["Malika Ergasheva", "tashkent_region"],
  ["Sardor Jo'rayev", "bukhara"],
  ["Nodira Yusupova", "andijan"],
];
const OPTS = PEOPLE.map(([name, region], i) => ({
  id: `5d0e8a1c-0000-4000-8000-00000000000${i + 1}`,
  public_id: `CRM-0000000${i + 1}`,
  name,
  region,
  primary_phone: `+99890112010${i + 1}`,
  is_lexgo_user: i === 1,
  lexgo_user_label: "LexGo",
  lead_count: 2,
  display_label: `${name} · CRM-0000000${i + 1} · +99890112010${i + 1}`,
}));

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((th) => {
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: th, bg: "night", motion: true, keys: true }));
  }, t);
}

async function open(page: Page) {
  const perms = [...(OPERATOR.permissions ?? []).filter((p) => p !== "callcenter.access"), "crm.customers.manage"];
  const { routes } = crmServer(perms);
  Object.assign(routes, { "/crm/customers/select": { items: OPTS, total: OPTS.length, limit: 30, offset: 0, has_more: false } });
  await mockBackend(page, await signIn(page, { ...OPERATOR, permissions: [...(OPERATOR.permissions ?? []), "crm.customers.manage"] }, routes as never));
  await page.goto("/en/admin/call-center?view=crm&s=leads");
  await expect(page.locator(".opx-intro")).toHaveCount(0, { timeout: 30_000 });
  await page.locator(".opx-ld-newbtn").first().click();
  const sheet = page.getByRole("dialog", { name: "New lead" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("option")).toHaveCount(OPTS.length);
  return sheet;
}

async function snap(page: Page, view: string, t: string, w: number) {
  if (!SHOTS) return;
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,[data-sonner-toaster],nextjs-portal,.cpl-launch,.fab{display:none!important}" }).catch(() => undefined);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${SHOTS}-${view}-${w}-${t}.png` });
}

const noOverflow = async (page: Page) => {
  const sheetOver = await page.locator(".opx-sheet__panel").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(sheetOver).toBeLessThanOrEqual(1);
  const pageOver = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(pageOver).toBeLessThanOrEqual(1);
};

for (const t of ["dark", "light"] as const) {
  for (const w of [1440, 390]) {
    test(`New lead sheet ${t} ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await theme(page, t);
      const sheet = await open(page);
      await snap(page, "empty", t, w);

      if (SHOTS !== "before") {
        // Every empty text field carries an example placeholder, never a value.
        await expect(sheet.getByRole("textbox", { name: /^Title/ })).toHaveAttribute("placeholder", "e.g. Divorce consultation");
        await expect(sheet.getByRole("textbox", { name: /^Title/ })).toHaveValue("");
        await expect(sheet.getByLabel("The request in full")).toHaveAttribute("placeholder", /alimony/);
        await expect(sheet.getByLabel("Region")).toHaveAttribute("placeholder", "e.g. Tashkent city");
        // Rows: initials avatar, the name, a CRM chip and a readable phone.
        const row = sheet.getByRole("option").first();
        await expect(row.locator(".opx-ld-opt__av")).toHaveText("AQ");
        await expect(row.locator(".opx-ld-opt__id")).toHaveText("CRM-00000001");
        await expect(row).toContainText("+998 90 112 01 01");
        await expect(page.locator(".opx-sheet__panel.opx-nl")).toHaveCount(1);
      }
      await expect(sheet.getByText("5d0e8a1c", { exact: false })).toHaveCount(0);
      await noOverflow(page);

      // A hovered (active) customer.
      await sheet.getByRole("option").nth(3).hover();
      await snap(page, "hover", t, w);

      // The footer stays visible with the body scrolled to the end.
      await sheet.locator(".opx-ld-form").evaluate((el) => (el.scrollTop = el.scrollHeight));
      await expect(sheet.getByRole("button", { name: "Create lead" })).toBeInViewport();
      await snap(page, "bottom", t, w);

      // The new-customer step, empty: placeholders only.
      await sheet.locator(".opx-ld-pick__new").click();
      const cust = page.getByRole("dialog", { name: "New customer" });
      await expect(cust).toBeVisible();
      if (SHOTS !== "before") {
        await expect(cust.getByRole("textbox", { name: /^Name/ })).toHaveAttribute("placeholder", "e.g. Aziz Karimov");
        await expect(cust.getByLabel("Phone")).toHaveAttribute("placeholder", "+998 90 123 45 67");
      }
      await noOverflow(page);
      await snap(page, "customer", t, w);
    });
  }
}

test("New lead: picking a customer still fills the region and selects it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await theme(page, "dark");
  const sheet = await open(page);
  await sheet.getByRole("option").nth(1).click();
  await expect(sheet.locator(".opx-ld-cust")).toContainText("Dilnoza Karimova");
  await expect(sheet.getByLabel("Region")).not.toHaveValue("");
  await snap(page, "picked", "dark", 1440);
});

test("New lead: uz and ru show their own example placeholders, no missing text", async ({ page }) => {
  const missing: string[] = [];
  page.on("console", (m) => {
    if (/MISSING_MESSAGE|INVALID_KEY|FORMATTING_ERROR/.test(m.text())) missing.push(m.text().slice(0, 200));
  });
  await theme(page, "light");
  const perms = [...(OPERATOR.permissions ?? []).filter((p) => p !== "callcenter.access"), "crm.customers.manage"];
  const { routes } = crmServer(perms);
  Object.assign(routes, { "/crm/customers/select": { items: OPTS, total: OPTS.length, limit: 30, offset: 0, has_more: false } });
  await mockBackend(page, await signIn(page, { ...OPERATOR, permissions: [...(OPERATOR.permissions ?? []), "crm.customers.manage"] }, routes as never));
  for (const [loc, title, name] of [
    ["uz", "Masalan: Ajrashish bo'yicha maslahat", "Masalan: Aziz Karimov"],
    ["ru", "Например: консультация по разводу", "Например: Азиз Каримов"],
  ]) {
    await page.goto(`/${loc}/admin/call-center?view=crm&s=leads`);
    await expect(page.locator(".opx-intro")).toHaveCount(0, { timeout: 30_000 });
    await page.locator(".opx-ld-newbtn").first().click();
    const sheet = page.locator(".opx-nl");
    await expect(sheet.locator(`input[placeholder="${title}"]`)).toHaveCount(1);
    await sheet.locator(".opx-ld-pick__new").click();
    await expect(sheet.locator(`input[placeholder="${name}"]`)).toHaveCount(1);
  }
  expect(missing).toEqual([]);
});
