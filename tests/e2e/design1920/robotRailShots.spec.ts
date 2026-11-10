import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { mockBackend, signIn } from "../mock";
import { ROP, ROP_PERMS, crmServer } from "../crmServer";

// Development helper: RAIL_SHOTS=/tmp/dir RAIL_TAG=before|after captures the
// robot builder's step rail (the line and its step circles): the top with
// the first step being edited and the rest upcoming, then a state with steps
// done (rail 2–5 in view), desktop and phone, dark and light, plus a close-up
// of the rail in dark. Mocked CRM only. Skipped in normal runs.
const OUT = process.env.RAIL_SHOTS ?? "";
const TAG = process.env.RAIL_TAG ?? "shot";

const MODES = [
  { name: "desktop-dark", w: 1440, h: 900, dark: true },
  { name: "desktop-light", w: 1440, h: 900, dark: false },
  { name: "phone-dark", w: 390, h: 844, dark: true },
  { name: "phone-light", w: 390, h: 844, dark: false },
] as const;

const HIDE = ".robot-edge-zone,.lgr,nextjs-portal{display:none!important}";

async function tidy(page: Page) {
  await page.addStyleTag({ content: HIDE }).catch(() => undefined);
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a"))) {
      if (/LexGo AI/.test(el.textContent ?? "") && getComputedStyle(el).position === "fixed") el.style.display = "none";
    }
  });
  // let the rail's fill and the circles settle
  await page.waitForTimeout(1100);
}

async function scrollTo(page: Page, sel: string) {
  await page.locator(sel).first().evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -110);
    let p = el.parentElement;
    while (p) {
      if (p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(p).overflowY)) p.scrollTop -= 110;
      p = p.parentElement;
    }
  });
}

for (const m of MODES) {
  test(`robot rail screenshots (${m.name})`, async ({ page }) => {
    test.skip(!OUT, "RAIL_SHOTS not set");
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await page.emulateMedia({ colorScheme: m.dark ? "dark" : "light" });
    await page.addInitScript((dark) => localStorage.setItem("lexgo_theme", dark ? "dark" : "light"), m.dark);
    await page.setViewportSize({ width: m.w, height: m.h });
    const { routes } = crmServer(ROP_PERMS);
    await mockBackend(page, await signIn(page, ROP, routes as never));

    await page.goto("/uz/admin/crm/automation");
    await page.locator("[data-rop-robots] .rb-rule, [data-rop-robots] .rop-empty").first().waitFor();
    await page.locator("[data-rop-new-robot]").click();
    const b = page.locator("[data-rop-builder]");
    await b.waitFor();

    // top: step 1 being edited, the rest upcoming
    await b.getByRole("textbox", { name: "Nomi" }).click();
    await tidy(page);
    await page.screenshot({ path: `${OUT}/${TAG}-rail-top-${m.name}.png` });

    // some steps done: name, event, delay, a condition, an action; step 5 edited
    await b.getByRole("textbox", { name: "Nomi" }).fill("Javobsiz qo'ng'iroqdan keyin SMS");
    await scrollTo(page, ".rb-step[data-step='2']");
    await b.getByRole("button", { name: "Hodisa" }).click();
    await page.getByRole("listbox").getByRole("option", { name: /Qo'ng'iroqqa javob berilmadi/ }).click();
    await b.getByRole("textbox", { name: "Kechikish" }).fill("3");
    await b.getByRole("button", { name: "Shart qo'shish" }).click();
    await b.locator("[data-rb-add]").click();
    await page.getByRole("dialog", { name: "Amal tanlash" }).locator("[data-rb-pick=send_sms]").click();
    await b.locator("[data-rb-action=send_sms]").getByRole("textbox", { name: /Xabar matni/ }).fill("Siz bilan bog'lana olmadik.");
    // a taller window (same width) so steps 2–5 fit in one picture
    await page.setViewportSize({ width: m.w, height: m.w > 600 ? 1500 : 2000 });
    await scrollTo(page, ".rb-step[data-step='2']");
    await tidy(page);
    await page.screenshot({ path: `${OUT}/${TAG}-rail-done-${m.name}.png` });

    if (m.name === "desktop-dark") {
      // close-up of the rail: steps 2–5 with the line between them
      const box = await page.evaluate(() => {
        const dots = Array.from(document.querySelectorAll<HTMLElement>(".rb-step__dot")).map((d) => d.getBoundingClientRect());
        const vis = dots.filter((r) => r.bottom > 0 && r.top < window.innerHeight);
        const top = Math.max(0, vis[0].top - 40);
        const bottom = Math.min(window.innerHeight, vis[vis.length - 1].bottom + 40);
        return { x: Math.max(0, vis[0].left - 40), y: top, width: 260, height: bottom - top };
      });
      await page.screenshot({ path: `${OUT}/${TAG}-rail-closeup-${m.name}.png`, clip: box });
    }
  });
}
