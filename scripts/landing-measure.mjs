// Measures what is clipped or off screen, across sizes and languages.
//   node scripts/landing-measure.mjs [base]
// For every text element in the landing: is its ink outside the viewport or cut by
// a clipping ancestor? Also reports nav overflow and first-screen CTA visibility.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");
const base = process.argv[2] || "http://localhost:3200";
const sizes = (process.argv[3] || "360x740,390x844,430x932,600x900,820x1180,1024x768,1280x720,1366x768,1440x900,1920x1080,2560x1440,3440x1440").split(",");
const locales = (process.argv[4] || "uz,ru,en").split(",");
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const size of sizes) {
  const [width, height] = size.split("x").map(Number);
  for (const loc of locales) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      try { localStorage.setItem("lexgo_cookie_consent", JSON.stringify({ v: 1, at: Date.now(), choices: { functional: false, analytics: false, marketing: false } })); } catch {}
    });
    await context.route(/\/api\/backend\//, (r) => r.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
    const page = await context.newPage();
    await page.goto(`${base}/${loc}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector(".lhome h1", { timeout: 60000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      const seen = new Set();
      const walker = document.createTreeWalker(document.querySelector(".lhome"), NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (el.closest('[aria-hidden="true"], .lh-cursor, script, style, .uf-card, [hidden], .sr-only')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        range.selectNodeContents(n);
        const b = range.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        // Inside a horizontally scrolling row, off-screen items are expected.
        let inScroller = false;
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") { inScroller = true; break; }
        }
        if (inScroller) continue;
        const key = n.textContent.trim().slice(0, 40);
        if ((b.left < -1 || b.right > vw + 1) && !seen.has(key)) {
          seen.add(key);
          out.push(`${key} [${Math.round(b.left)}..${Math.round(b.right)}] <${el.className || el.tagName}>`);
        }
      }
      const bar = document.querySelector(".bar__in");
      const act = document.querySelector(".bar__act");
      const burg = document.querySelector(".burg");
      const burgBox = burg && getComputedStyle(burg).display !== "none" ? burg.getBoundingClientRect() : null;
      const cta = document.querySelector(".lh-hero__ask");
      const tab = document.querySelector(".tabbar");
      const tabTop = tab && getComputedStyle(tab).display !== "none" ? tab.getBoundingClientRect().top : innerHeight;
      const c = cta.getBoundingClientRect();
      return {
        off: out,
        burgRight: burgBox ? Math.round(burgBox.right - vw) : null,
        navOverflow: bar ? bar.scrollWidth - bar.clientWidth : 0,
        actRight: act ? Math.round(act.getBoundingClientRect().right - vw) : 0,
        ctaBottomVsFold: Math.round(c.bottom - tabTop),
        pageOverflow: document.documentElement.scrollWidth - vw,
      };
    });
    const flags = [];
    if (r.off.length) flags.push(`OFF-SCREEN TEXT: ${r.off.join(" ; ")}`);
    if (r.burgRight !== null && r.burgRight > 0) flags.push(`burger cut by ${r.burgRight}px`);
    if (r.actRight > 0) flags.push(`nav actions cut by ${r.actRight}px`);
    if (r.ctaBottomVsFold > 0) flags.push(`hero CTA ${r.ctaBottomVsFold}px below the fold`);
    if (r.pageOverflow > 1) flags.push(`page overflow ${r.pageOverflow}px`);
    console.log(`${size} ${loc}: ${flags.join(" | ") || "ok"}`);
    await context.close();
  }
}
await browser.close();
