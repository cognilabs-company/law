import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { mockBackend, signIn } from "../mock";
import { ROP, ROP_PERMS, crmServer } from "../crmServer";

// Development helper: ROBOT_SHOTS=/tmp/dir ROBOT_TAG=before|after captures
// the CRM robot builder (top, bottom with conditions and actions, the open
// event dropdown) and the robot list, desktop and phone, dark and light,
// with the mocked CRM. Skipped in normal runs.
const OUT = process.env.ROBOT_SHOTS ?? "";
const TAG = process.env.ROBOT_TAG ?? "shot";

const MODES = [
  { name: "desktop-dark", w: 1440, h: 900, dark: true },
  { name: "desktop-light", w: 1440, h: 900, dark: false },
  { name: "phone-dark", w: 390, h: 844, dark: true },
  { name: "phone-light", w: 390, h: 844, dark: false },
] as const;

const HIDE = ".robot-edge-zone,.lgr,nextjs-portal{display:none!important}";

async function snap(page: Page, name: string) {
  await page.addStyleTag({ content: HIDE }).catch(() => undefined);
  // the floating AI assistant button covers the bottom-right corner
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a"))) {
      if (/LexGo AI/.test(el.textContent ?? "") && getComputedStyle(el).position === "fixed") el.style.display = "none";
      else if (/LexGo AI/.test(el.textContent ?? "") && el.closest<HTMLElement>("[style*=fixed], .aidock, [class*=dock]")) el.closest<HTMLElement>("[style*=fixed], .aidock, [class*=dock]")!.style.display = "none";
    }
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
}

async function scrollTo(page: Page, sel: string) {
  await page.locator(sel).first().evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    // clear of the sticky header
    window.scrollBy(0, -110);
    let p = el.parentElement;
    while (p) {
      if (p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(p).overflowY)) p.scrollTop -= 110;
      p = p.parentElement;
    }
  });
}

for (const m of MODES) {
  test(`robot screenshots (${m.name})`, async ({ page }) => {
    test.skip(!OUT, "ROBOT_SHOTS not set");
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await page.emulateMedia({ colorScheme: m.dark ? "dark" : "light", reducedMotion: "reduce" });
    await page.addInitScript((dark) => localStorage.setItem("lexgo_theme", dark ? "dark" : "light"), m.dark);
    await page.setViewportSize({ width: m.w, height: m.h });
    const { routes } = crmServer(ROP_PERMS);
    await mockBackend(page, await signIn(page, ROP, routes as never));

    // the robot list
    await page.goto("/uz/admin/crm/automation");
    await page.locator("[data-rop-robots] .rb-rule, [data-rop-robots] .rop-empty").first().waitFor();
    await snap(page, `list-${m.name}`);

    // the builder, top half
    await page.locator("[data-rop-new-robot]").click();
    const b = page.locator("[data-rop-builder]");
    await b.waitFor();
    await b.getByRole("textbox", { name: "Nomi" }).click();
    await snap(page, `builder-top-${m.name}`);

    // the open event dropdown
    await scrollTo(page, ".rb-step[data-step='2']");
    await b.getByRole("button", { name: "Hodisa" }).click();
    await page.getByRole("listbox").waitFor();
    await snap(page, `builder-event-${m.name}`);
    await page.getByRole("listbox").getByRole("option", { name: /Qo'ng'iroqqa javob berilmadi/ }).click();

    // the bottom half: conditions and actions filled in
    await b.getByRole("textbox", { name: "Nomi" }).fill("Javobsiz qo'ng'iroqdan keyin SMS");
    await b.getByRole("textbox", { name: "Kechikish" }).fill("3");
    await b.getByRole("button", { name: "Shart qo'shish" }).click();
    await b.locator("[data-rb-add]").click();
    await page.getByRole("dialog", { name: "Amal tanlash" }).locator("[data-rb-pick=send_sms]").click();
    await scrollTo(page, ".rb-step[data-step='4']");
    await snap(page, `builder-bottom-${m.name}`);
    await scrollTo(page, ".rb-step[data-step='5']");
    await snap(page, `builder-actions-${m.name}`);

    // saved as a draft: the list with a robot in it
    await b.locator("[data-rb-action=send_sms]").getByRole("textbox", { name: /Xabar matni/ }).fill("Siz bilan bog'lana olmadik.");
    await scrollTo(page, ".rb-step[data-step='8']");
    await snap(page, `builder-save-${m.name}`);
    await b.locator("[data-rb-save=draft]").click();
    await page.locator("[data-rop-robots] .rb-rule").first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, `list-filled-${m.name}`);

    // runs and approval drafts
    await page.goto("/uz/admin/crm/automation/runs?run=run7");
    await page.locator("[data-rb-run]").waitFor().catch(() => undefined);
    await snap(page, `runs-${m.name}`);
    await page.goto("/uz/admin/crm/automation/drafts");
    await page.locator("[data-draft]").first().waitFor().catch(() => undefined);
    await snap(page, `drafts-${m.name}`);
  });
}
