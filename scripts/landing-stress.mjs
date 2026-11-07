// How the landing behaves for a real visitor on a slower device.
//   node scripts/landing-stress.mjs --base http://localhost:3200 --size 1366x768 --cpu 4
// Reports time to interactive-ish milestones, the longest main-thread tasks during
// load and during wheel scrolling, and frame timing while scrolling.
import { createRequire } from "node:module";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? dflt : argv[i + 1];
};
const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");
const base = opt("base", "http://localhost:3200");
const route = opt("path", "/uz");
const [width, height] = opt("size", "1366x768").split("x").map(Number);
const cpu = Number(opt("cpu", 1));
const touch = width < 800;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
await context.addInitScript(() => {
  const s = (window.__s = { long: [], frames: [] });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) s.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });
});
await context.route(/\/api\/backend\//, (r) => {
  const url = new URL(r.request().url());
  const json = (b, st = 200) => r.fulfill({ status: st, contentType: "application/json", body: JSON.stringify(b) });
  if (/subscription-plans/.test(url.pathname) || /\/lawyers/.test(url.pathname)) return json([]);
  if (/platform\/policies/.test(url.pathname)) return json({});
  return json({ detail: "mock" }, 404);
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
const cdp = await context.newCDPSession(page);
if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });

const t0 = Date.now();
await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForSelector(".lhome h1", { timeout: 120000 });
const tShell = Date.now() - t0;
const tw = Date.now();
let spacers = 0;
while (Date.now() - tw < 150000) {
  spacers = await page.evaluate(() => document.querySelectorAll(".pin-spacer, [data-lh-held]").length);
  if (spacers >= 3 && (await page.evaluate(() => !!document.querySelector(".lh-cursor") && document.documentElement.scrollHeight > 20000))) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(2500);
const tMotion = Date.now() - t0;
const loadLong = await page.evaluate(() => window.__s.long.slice());
await page.evaluate(() => {
  const s = window.__s;
  s.long.length = 0;
  let last = performance.now();
  const tick = (now) => { s.frames.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const total = await page.evaluate(() => document.documentElement.scrollHeight);
const stepPx = Math.round(height * 0.55);
const stalls = [];
await page.mouse.move(width / 2, height / 2);
for (let y = 0; y < total + stepPx; y += stepPx) {
  const a = Date.now();
  // Touch contexts ignore the synthetic wheel, which would leave the page at the top.
  if (touch) await page.evaluate((d) => window.scrollBy(0, d), stepPx);
  else await page.mouse.wheel(0, stepPx);
  await page.waitForTimeout(100);
  await page.evaluate(() => 1);
  const ms = Date.now() - a - 100;
  if (ms > 250) stalls.push([Math.round(await page.evaluate(() => scrollY)), ms]);
}
const r = await page.evaluate(() => {
  const f = window.__s.frames.slice().sort((a, b) => a - b);
  const pct = (p) => Math.round(f[Math.floor(f.length * p)] || 0);
  return { frames: f.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: Math.round(f[f.length - 1] || 0), over50: f.filter((x) => x > 50).length, long: window.__s.long.slice(), y: Math.round(scrollY), h: document.documentElement.scrollHeight };
});
const top = (a) => a.map((x) => x[1]).sort((x, y) => y - x).slice(0, 6).join(",");
console.log(`${width}x${height} cpu x${cpu} ${route}`);
console.log(`  h1 visible ${tShell} ms; motion ready ${tMotion} ms; pins ${spacers}; page height ${r.h}; ended at ${r.y}`);
console.log(`  LOAD long tasks: ${loadLong.length}, total ${loadLong.reduce((s, x) => s + x[1], 0)} ms, longest ${top(loadLong)}`);
console.log(`  SCROLL long tasks: ${r.long.length}, total ${r.long.reduce((s, x) => s + x[1], 0)} ms, longest ${top(r.long)}`);
console.log(`  SCROLL frames ${r.frames}: p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} ms; over 50ms: ${r.over50}`);
console.log(`  input stalls >250ms: ${stalls.length} ${JSON.stringify(stalls.slice(0, 8))}`);
console.log(`  page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await browser.close();
