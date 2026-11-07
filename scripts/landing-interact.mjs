// Tries to break the page the way real visitors do.
//   node scripts/landing-interact.mjs [base]
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");
const base = process.argv[2] || "http://localhost:3200";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const fails = [];
const note = (ok, msg) => { console.log(`${ok ? "pass" : "FAIL"}  ${msg}`); if (!ok) fails.push(msg); };

const lawyers = Array.from({ length: 8 }, (_, i) => ({
  id: 100 + i, user_id: 100 + i, full_name: `Test Advokat ${i}`, seller_type: i % 2 ? "yurist" : "advokat", specializations: ["jinoyat"],
  region: "Toshkent", experience_years: 4 + i, base_price: 350000, rating: 4.5, rating_status: "rated", reviews_count: 8, cases_won: 10, cases_partial: 2,
  created_at: "2025-01-01T00:00:00Z", verification_badge: { visible: true },
}));

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 800 });
  await context.addInitScript(() => {
    try { localStorage.setItem("lexgo_cookie_consent", JSON.stringify({ v: 1, at: Date.now(), choices: { functional: false, analytics: false, marketing: false } })); } catch {}
  });
  await context.route(/\/api\/backend\//, (r) => {
    const url = new URL(r.request().url());
    const json = (b, s = 200) => r.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (/\/lawyers(\?|$|\/?$)/.test(url.pathname)) return json(lawyers);
    if (/subscription-plans/.test(url.pathname)) return json([]);
    if (/platform\/policies/.test(url.pathname)) return json({});
    return json({ detail: "mock" }, 404);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 260)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load|hydrat/i.test(m.text())) errors.push("console: " + m.text().slice(0, 260)); });
  await page.goto(`${base}/uz`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await ready(page);
  return { context, page, errors };
}
const ready = async (page) => {
  await page.waitForSelector("[data-lh-held]", { state: "attached", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector(".lh-cursor"), null, { timeout: 30000 });
  await page.waitForTimeout(3500);
};
const scrollInto = async (page, sel, f = 0.5) => {
  const y = await page.evaluate(([s, fr]) => {
    const el = document.querySelector(s);
    const box = el.matches("[data-lh-held]") ? el.parentElement : el;
    const r = box.getBoundingClientRect();
    return Math.round(r.top + scrollY + fr * Math.max(0, r.height - innerHeight));
  }, [sel, f]);
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(500);
  return y;
};
const heldTop = (page, sel) => page.evaluate((s) => Math.round(document.querySelector(s).getBoundingClientRect().top), sel);
const pageState = (page) => page.evaluate(() => ({
  lhome: !!document.querySelector(".lhome"),
  h1: !!document.querySelector("h1"),
  bodyHasText: document.body.innerText.length > 200,
  htmlStyle: document.documentElement.getAttribute("style") || "",
  bodyStyle: document.body.getAttribute("style") || "",
  over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  held: document.querySelectorAll("[data-lh-held]").length,
}));
const responsive = async (page, label) => {
  const a = Date.now();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  const ms = Date.now() - a;
  note(ms < 1500, `${label}: main thread answered in ${ms} ms`);
};

for (const [w, h] of [[1440, 900], [390, 844]]) {
  console.log(`\n=== ${w}x${h} ===`);
  const { context, page, errors } = await open(w, h);

  // 1. Fast scroll down and back up.
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += h * 2) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(40); }
  await responsive(page, "fast scroll to the bottom");
  for (let y = total; y > 0; y -= h * 2) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(40); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await responsive(page, "fast scroll back to the top");
  note(Math.abs(await heldTop(page, ".lh-prob__stage")) > 100, "problem stage rests below the fold at the top");

  // 2. Leave by client navigation from inside a held section, come back, three times.
  for (let i = 1; i <= 3; i++) {
    await scrollInto(page, ".lh-prob__stage", 0.5);
    await page.evaluate(() => {
      const a = document.querySelector('a[href$="/faq"], footer a[href*="/faq"]') || document.querySelector('footer a[href^="/uz/"]');
      a.click();
    });
    await page.waitForFunction(() => !document.querySelector(".lhome"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(700);
    const away = await pageState(page);
    note(!away.lhome && away.bodyHasText, `leave #${i}: another page shows, not a blank screen`);
    note(!/scroll-behavior/.test(away.htmlStyle), `leave #${i}: no scroll-behavior left on html`);
    await page.goBack();
    await page.waitForSelector(".lhome", { timeout: 30000 });
    await ready(page);
    const back = await pageState(page);
    note(back.h1 && back.held >= 1, `back #${i}: landing and its motion are alive again (${back.held} held)`);
  }

  // 3. Hold still works after coming back.
  await scrollInto(page, ".lh-prob__stage", 0.5);
  note(Math.abs(await heldTop(page, ".lh-prob__stage")) <= 2, "problem stage still sticks after navigation");

  // 4. Theme and language mid-page.
  if (w > 800) {
    await page.evaluate(() => document.querySelector(".bar__act .thm button, .thm button")?.click());
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector(".bar__act .thm [role=menuitem], .thm [role=option], .thm [role=menuitemradio]")?.click());
    await page.waitForTimeout(800);
    await responsive(page, "theme switch mid-page");
    note(Math.abs(await heldTop(page, ".lh-prob__stage")) <= 2, "section still held after the theme switch");
  }
  await page.evaluate(() => document.querySelector(".lang > button")?.click());
  await page.waitForTimeout(500);
  const switched = await page.evaluate(() => {
    const a = [...document.querySelectorAll(".lang a, .lang button")].find((x) => /ru|рус/i.test(x.textContent || "") && !x.matches(".lang > button"));
    if (a) a.click();
    return !!a;
  });
  if (switched) {
    await page.waitForURL(/\/ru/, { timeout: 30000 }).catch(() => {});
    await page.waitForSelector(".lhome", { timeout: 30000 });
    await ready(page);
    const st = await pageState(page);
    note(/\/ru/.test(page.url()) && st.h1 && st.held >= 1, `language switch: ${page.url().replace(base, "")} is alive (${st.held} held)`);
  } else {
    note(false, "language switch control not found");
  }

  // 5. Resize across orientation mid-page.
  await scrollInto(page, ".lh-war", 0.4);
  await page.setViewportSize({ width: h, height: w });
  await page.waitForTimeout(2500);
  let st = await pageState(page);
  note(st.over <= 1, `resize to ${h}x${w}: no horizontal overflow (${st.over})`);
  await responsive(page, "resize to the other orientation");
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(2500);
  st = await pageState(page);
  note(st.over <= 1, `resize back: no horizontal overflow (${st.over})`);
  note(st.held >= 1, `resize back: motion alive (${st.held} held)`);

  // 6. Chat and the phone menu inside a held section.
  await scrollInto(page, ".lh-prob__stage", 0.5);
  const y0 = await page.evaluate(() => scrollY);
  const opened = await page.evaluate(() => {
    const b = w_burger() || document.querySelector(".fab");
    function w_burger() { const x = document.querySelector(".burg"); return x && getComputedStyle(x).display !== "none" ? x : null; }
    if (b) b.click();
    return b ? b.className : "";
  });
  await page.waitForTimeout(900);
  note(Math.abs(await heldTop(page, ".lh-prob__stage")) <= 2, `section behind stays held with ${opened || "overlay"} open`);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const x = document.querySelector(".burg[aria-expanded=true]") || document.querySelector(".dock button[aria-label], .fab");
    if (x) x.click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(300);
  const y1 = await page.evaluate(() => scrollY);
  note(y1 !== y0, `page still scrolls after closing the overlay (${y0} -> ${y1})`);

  // 7. Reload deep in the page.
  await scrollInto(page, ".lh-war", 0.5);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  st = await pageState(page);
  note(st.h1 && st.over <= 1, `reload deep in the page: alive, overflow ${st.over}`);
  await responsive(page, "after a deep reload");

  note(errors.length === 0, `no page errors (${errors.slice(0, 4).join(" || ")})`);
  await context.close();
}

// 8. Keyboard: focus stays visible and on screen through the whole page.
console.log("\n=== keyboard 1440x900 ===");
{
  const { context, page } = await open(1440, 900);
  let lost = 0, hiddenRing = 0, count = 0;
  const seen = [];
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { tag: el.tagName, label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28), top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width), outline: cs.outlineStyle, ow: parseFloat(cs.outlineWidth), inMain: !!el.closest("main") };
    });
    if (!r) continue;
    count++;
    if (r.inMain && (r.bottom < 0 || r.top > 900)) { lost++; seen.push(`off screen: ${r.label} (${r.top})`); }
    if (r.inMain && (r.outline === "none" || r.ow < 2)) { hiddenRing++; seen.push(`no ring: ${r.label}`); }
  }
  note(lost === 0, `keyboard: ${count} stops, focus off screen ${lost} times ${seen.filter((x) => x.startsWith("off")).slice(0, 4).join("; ")}`);
  note(hiddenRing === 0, `keyboard: focus ring missing ${hiddenRing} times ${seen.filter((x) => x.startsWith("no")).slice(0, 4).join("; ")}`);
  await context.close();
}

console.log(`\n${fails.length ? fails.length + " FAILED:\n - " + fails.join("\n - ") : "ALL PASSED"}`);
await browser.close();
