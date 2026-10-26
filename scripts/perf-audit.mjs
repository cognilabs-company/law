// Performance audit against a running production server (next build && next
// start). Measures, per page:
//   cold  — a first visit with an empty cache on a throttled phone-class
//           device: HTML/JS bytes, requests, FCP, LCP, total blocking time;
//   nav   — clicking a nav link: time until the click is acknowledged
//           (html[data-nav-pending], see lib/navProgress, or the URL change)
//           and until the new page shows;
//   scroll — scrolling the page for 4 s: slow frames and long tasks.
//
// Usage:
//   BASE=http://localhost:3200 node scripts/perf-audit.mjs [--out file.json]
// Optional sign-in for the portal pages (read-only: every non-GET request
// except /auth/* is aborted):
//   PERF_TOKEN=<access token> PERF_SESSION='<lexgo_session json>' ...
//   PERF_REFRESH_ONLY=1 replaces the access token with a dead one so the
//   first requests hit 401 and go through the refresh path (an expired
//   session on a cold visit).

import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3200";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
const TOKEN = process.env.PERF_TOKEN || "";
const SESSION = process.env.PERF_SESSION || "";
const REFRESH_ONLY = process.env.PERF_REFRESH_ONLY === "1";

// A mid-range phone on a decent 4G link (Lighthouse's "slow 4G" class).
const NET = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const CPU = 4;

const PUBLIC = (process.env.PAGES ?? "/uz,/uz/lawyers,/uz/services").split(",").filter(Boolean);
const PORTAL = (process.env.PORTAL_PAGES || "").split(",").filter(Boolean);
const NAV = (process.env.NAV || "").split(",").filter(Boolean); // from>selectorOfLink>expectPath

async function context(browser, signedIn, desktop = false) {
  const ctx = await browser.newContext(
    desktop
      ? { viewport: { width: 1366, height: 900 }, locale: "uz-UZ", colorScheme: "dark" }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "uz-UZ", colorScheme: "dark" },
  );
  if (signedIn && TOKEN && SESSION) {
    const token = REFRESH_ONLY ? "expired.expired.expired" : TOKEN;
    await ctx.addInitScript(
      ([t, s]) => {
        try {
          const sess = { ...JSON.parse(s), token: t };
          localStorage.setItem("lexgo_token", t);
          localStorage.setItem("lexgo_session", JSON.stringify(sess));
          localStorage.setItem("lexgo_last_activity", String(Date.now()));
        } catch {}
      },
      [token, SESSION],
    );
  }
  await ctx.route("**/*", (r) => {
    const req = r.request();
    const url = req.url();
    if (req.method() === "GET" || req.method() === "HEAD" || /\/auth\/(refresh|login)/.test(url) || !/\/api\/backend\//.test(url)) return r.continue();
    return r.abort();
  });
  return ctx;
}

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  return cdp;
}

const VITALS = () => {
  window.__perf = { lcp: 0, longTasks: [], fcp: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]);
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });
};

async function cold(browser, path, signedIn, desktop = false) {
  const ctx = await context(browser, signedIn, desktop);
  const page = await ctx.newPage();
  await page.addInitScript(VITALS);
  const cdp = await throttle(page);
  let html = 0;
  let js = 0;
  let css = 0;
  let api = 0;
  let requests = 0;
  let other = 0;
  const sizes = new Map();
  cdp.on("Network.responseReceived", (e) => sizes.set(e.requestId, { url: e.response.url, type: e.type }));
  cdp.on("Network.loadingFinished", (e) => {
    const r = sizes.get(e.requestId);
    if (!r) return;
    requests++;
    const b = e.encodedDataLength;
    if (r.type === "Document") html += b;
    else if (r.type === "Script") js += b;
    else if (r.type === "Stylesheet") css += b;
    else other += b;
    if (r.url.includes("/api/backend/")) api++;
  });
  const t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: "load", timeout: 180_000 });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(4000);
  const v = await page.evaluate(() => window.__perf);
  // Total blocking time after FCP: the part of each long task over 50 ms.
  const tbt = Math.round(v.longTasks.filter(([s]) => s >= v.fcp).reduce((n, [, d]) => n + Math.max(0, d - 50), 0));
  await ctx.close();
  return { path, signedIn, desktop, otherKB: Math.round(other / 1024), htmlKB: Math.round(html / 1024), jsKB: Math.round(js / 1024), cssKB: Math.round(css / 1024), requests, api, fcp: Math.round(v.fcp), lcp: Math.round(v.lcp), tbt, longTasks: v.longTasks.length, loadMs };
}

async function scroll(browser, path, signedIn, desktop) {
  const ctx = await context(browser, signedIn, desktop);
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "load", timeout: 180_000 });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const r = await page.evaluate(
    () =>
      new Promise((done) => {
        const scroller = [document.querySelector(".pbody"), document.scrollingElement].find((el) => el && el.scrollHeight > el.clientHeight + 50) || document.scrollingElement;
        const frames = [];
        const long = [];
        const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(e.duration)));
        po.observe({ type: "longtask" });
        const max = scroller.scrollHeight - scroller.clientHeight;
        const start = performance.now();
        let last = start;
        const step = (now) => {
          frames.push(now - last);
          last = now;
          const t = (now - start) / 4000;
          scroller.scrollTop = max * Math.min(1, t < 0.5 ? t * 2 : 2 - t * 2);
          if (now - start < 4000) requestAnimationFrame(step);
          else {
            po.disconnect();
            const slow = frames.filter((d) => d > 34).length;
            const sorted = [...frames].sort((a, b) => a - b);
            done({ frames: frames.length, slow, p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0), worst: Math.round(sorted[sorted.length - 1] || 0), longTasks: long.length, height: max });
          }
        };
        requestAnimationFrame(step);
      }),
  );
  await ctx.close();
  return { path, desktop, ...r };
}

async function nav(browser, spec) {
  const [from, linkSel, expect] = spec.split(">");
  const ctx = await context(browser, true, true);
  const page = await ctx.newPage();
  await page.goto(BASE + from, { waitUntil: "load", timeout: 180_000 });
  await page.waitForTimeout(4000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const link = page.locator(linkSel).first();
  await link.scrollIntoViewIfNeeded();
  // Acknowledged = a pending marker appears on the link/page, or the URL moves.
  await page.evaluate(() => {
    window.__ack = 0;
    const mark = () => (window.__ack ||= performance.now());
    // The whole document: lib/navProgress marks <html data-nav-pending>.
    new MutationObserver(() => {
      if (document.querySelector("[data-pending], .nav-pending, html[data-nav-pending]")) mark();
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    const push = history.pushState;
    history.pushState = function (...a) {
      mark();
      return push.apply(this, a);
    };
  });
  const t0 = await page.evaluate(() => performance.now());
  await link.click();
  await page.waitForURL((u) => u.pathname.endsWith(expect), { timeout: 60_000 });
  const urlAt = await page.evaluate(() => performance.now());
  const ack = await page.evaluate(() => window.__ack);
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  const done = await page.evaluate(() => performance.now());
  await ctx.close();
  return { spec, ackMs: Math.round((ack || urlAt) - t0), urlMs: Math.round(urlAt - t0), settledMs: Math.round(done - t0) };
}

const browser = await chromium.launch({ channel: "chrome" });
const out = { base: BASE, at: new Date().toISOString(), cold: [], scroll: [], nav: [] };
const ONLY = (process.env.ONLY || "cold,scroll,nav").split(",");
if (ONLY.includes("cold")) for (const p of PUBLIC) out.cold.push(await cold(browser, p, false));
if (ONLY.includes("cold")) for (const p of PORTAL) out.cold.push(await cold(browser, p, true));
// The portal on a computer: the 3D robot companion only exists there.
if (ONLY.includes("cold")) for (const p of PORTAL.slice(0, 1)) out.cold.push(await cold(browser, p, true, true));
if (ONLY.includes("scroll")) for (const desktop of [false, true]) for (const p of [...PUBLIC, ...PORTAL]) out.scroll.push(await scroll(browser, p, PORTAL.includes(p), desktop));
if (ONLY.includes("nav")) for (const s of NAV) out.nav.push(await nav(browser, s));
await browser.close();
console.log(JSON.stringify(out, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 1));
