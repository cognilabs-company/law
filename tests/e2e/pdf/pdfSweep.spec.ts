import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { mockBackend, signIn } from "../mock";
import { mocksFor } from "../design1920/data";
import { ADVOCATE_S } from "../design1920/shots";
import { advocateExtra } from "./pdfData";

// The PDF pages at the owner's 15 widths in uz/ru/en: no page-level
// horizontal scroll, nothing past the right edge, no text cut without a way
// to read it. Run on demand: PDF_SWEEP=1 npx playwright test tests/e2e/pdf/pdfSweep
test.skip(!process.env.PDF_SWEEP, "set PDF_SWEEP=1");
test.setTimeout(600_000);

const WIDTHS = [320, 375, 430, 640, 768, 1024, 1280, 1366, 1440, 1470, 1512, 1600, 1728, 1920, 2560];
const PAGES = (process.env.PDF_PAGES || "marketplace-orders,calendar,tasks,assistant,messages?room=r1,meetings,promotion,subscription").split(",");

for (const lang of ["uz", "ru", "en"]) for (const theme of ["light", "dark"] as const) {
  test(`sweep ${lang} ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((th) => localStorage.setItem("lexgo_theme", th), theme);
    await mockBackend(page, await signIn(page, ADVOCATE_S, { ...mocksFor("advocate"), ...advocateExtra() }));
    const bad: string[] = [];
    for (const p of PAGES) {
      await page.setViewportSize({ width: 1470, height: 900 });
      await page.goto(`/${lang}/portal/advocate/${p}`, { waitUntil: "networkidle" });
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(120);
        const r = await page.evaluate(() => {
          const out: string[] = [];
          const vw = window.innerWidth;
          if (document.documentElement.scrollWidth > vw + 1) out.push(`hscroll ${document.documentElement.scrollWidth}`);
          const main = document.querySelector(".pbody") ?? document.body;
          for (const el of main.querySelectorAll<HTMLElement>("b,span,a,button,h1,h2,h3,p,li,label,small,em,i,th,td")) {
            const rc = el.getBoundingClientRect();
            if (rc.width <= 1 || rc.height <= 1) continue;
            if (el.closest("[hidden],.sr-only,.ScrollCue,.pipe,.ptable__wrap,.chiprow,.mko-tabs,.scroller")) continue;
            if (rc.right > vw + 1 && !el.closest("[data-scroll],.ptable__wrap")) out.push(`out ${el.tagName}.${el.className} "${(el.textContent || "").trim().slice(0, 30)}"`);
            const cs = getComputedStyle(el);
            const clipped = el.scrollWidth > el.clientWidth + 1 && cs.overflow !== "visible" && cs.overflowX !== "auto" && cs.overflowX !== "scroll";
            if (clipped && cs.textOverflow === "ellipsis" && (el.title || el.closest("[title]"))) continue;
            if (clipped && el.children.length === 0) out.push(`clip ${el.tagName}.${el.className} "${(el.textContent || "").trim().slice(0, 30)}"`);
          }
          return [...new Set(out)].slice(0, 6);
        });
        if (r.length) bad.push(`${p} @${w}: ${r.join(" | ")}`);
      }
    }
    const dir = join(process.cwd(), "coverage", "pdf-shots");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `sweep-${lang}-${theme}.txt`), bad.join("\n") || "OK");
    expect(bad, bad.join("\n")).toEqual([]);
  });
}
