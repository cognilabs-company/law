// Visual QA for the landing. Serves real pixels from the running dev server with
// a mocked backend, because the API host may be down.
//
//   node scripts/landing-shot.mjs --sizes 1440x900,390x844 --at ".lh-hero" --out C:/path/name
//   node scripts/landing-shot.mjs --sizes 1920x1080 --at ".lh-prob" --progress 0.5 --out C:/path/name
//   node scripts/landing-shot.mjs --sizes 1440x900 --full --out C:/path/name
//
// Options:
//   --base http://localhost:3120   server
//   --path /uz                     route (/uz, /ru, /en)
//   --sizes WxH,WxH                viewports
//   --at SELECTOR                  scroll so this element's top reaches the viewport top
//   --offset N                     extra pixels after --at (can be negative)
//   --progress 0..1                scroll that fraction through the element's pinned or full height
//   --wait MS                      settle time before the capture (default 1400)
//   --dark                         dark theme
//   --reduced                      prefers-reduced-motion
//   --full                         whole page
//   --mouse X,Y                    move the mouse to this viewport position first
//   --out PATH                     output prefix; files are <prefix>-WxH.png
import { createRequire } from "node:module";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};

const projectRoot = process.cwd();
const require = createRequire(path.join(projectRoot, "package.json"));
const { chromium } = require("@playwright/test");

// Whichever dev server is up: only one can run per project directory.
const probe = async (url) => {
  try {
    const res = await fetch(url + "/uz", { signal: AbortSignal.timeout(90000) });
    return res.status < 500;
  } catch {
    return false;
  }
};
let base = opt("base", null);
if (!base) {
  for (const candidate of ["http://localhost:3000", "http://localhost:3120"]) {
    if (await probe(candidate)) {
      base = candidate;
      break;
    }
  }
}
if (!base) {
  console.log("No dev server answered on 3000 or 3120. Wait a minute and retry.");
  process.exit(1);
}
const route = opt("path", "/uz");
const sizes = String(opt("sizes", "1440x900")).split(",");
const at = opt("at", null);
const offset = Number(opt("offset", 0));
const progress = opt("progress", null);
const wait = Number(opt("wait", 1400));
const out = opt("out", "shot");

const AREAS = ["jinoyat", "oila", "mehnat", "fuqarolik", "iqtisodiy", "soliq"];
const lawyers = Array.from({ length: 8 }, (_, i) => ({
  id: 100 + i,
  user_id: 100 + i,
  full_name: ["Aziza Karimova", "Jasur Rahimov", "Dilnoza Yusupova", "Sardor Aliyev", "Malika Tosheva", "Bekzod Umarov", "Nodira Saidova", "Temur Ismoilov"][i],
  seller_type: i % 2 ? "yurist" : "advokat",
  specializations: [AREAS[i % AREAS.length]],
  region: "Toshkent",
  experience_years: 4 + i,
  base_price: 350000 + i * 50000,
  rating: 4.2 + (i % 8) / 10,
  rating_status: "rated",
  reviews_count: 8 + i * 3,
  cases_won: 10 + i,
  cases_partial: 2 + i,
  created_at: "2025-01-01T00:00:00Z",
  verification_badge: { visible: true },
}));

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const size of sizes) {
  const [width, height] = size.split("x").map(Number);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: opt("reduced", false) ? "reduce" : "no-preference",
    hasTouch: width < 800,
    isMobile: false,
    colorScheme: opt("dark", false) ? "dark" : "light",
  });
  await context.addInitScript((dark) => {
    try {
      localStorage.setItem("lexgo_theme", dark ? "dark" : "light");
      localStorage.setItem("lexgo_cookie_consent", JSON.stringify({ v: 1, at: Date.now(), choices: { functional: false, analytics: false, marketing: false } }));
    } catch {}
  }, Boolean(opt("dark", false)));
  await context.route(/\/api\/backend\//, (r) => {
    const url = new URL(r.request().url());
    const json = (body, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (/\/lawyers(\?|$|\/?$)/.test(url.pathname)) return json(lawyers);
    if (/subscription-plans/.test(url.pathname)) return json([]);
    if (/platform\/policies/.test(url.pathname)) return json({});
    return json({ detail: "mock" }, 404);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector(".lhome", { timeout: 120000 });
  // Wait for the motion to be set up, unless it never will be.
  if (!opt("reduced", false)) {
    await page.waitForSelector("[data-lh-held]", { state: "attached", timeout: 60000 }).catch(() => console.log("note: no held section after 60s"));
  }
  await page.waitForTimeout(2500);

  const cookieBtn = page.locator(".ckc button").first();
  if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click().catch(() => {});

  if (opt("mouse", null)) {
    const [mx, my] = String(opt("mouse")).split(",").map(Number);
    await page.mouse.move(mx, my, { steps: 8 });
  }

  // Walk the page so lazy images load and triggers fire, the way a visitor would.
  const walk = async (target) => {
    let y = await page.evaluate(() => window.scrollY);
    const step = Math.max(200, Math.round(height * 0.55));
    while (Math.abs(target - y) > step) {
      y += Math.sign(target - y) * step;
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(70);
    }
    await page.evaluate((v) => window.scrollTo(0, v), target);
  };

  if (at) {
    const top = await page.evaluate(([sel]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      // A held section scrolls through its track, which is its parent.
      const box = el.matches("[data-lh-held]") ? el.parentElement : el;
      return { top: box.getBoundingClientRect().top + scrollY, height: box.getBoundingClientRect().height };
    }, [at]);
    if (!top) {
      console.log(`selector not found: ${at}`);
    } else {
      const frac = progress === null ? 0 : Number(progress);
      await walk(Math.round(top.top + offset + frac * Math.max(0, top.height - height)));
    }
  }

  if (opt("full", false)) {
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    await walk(total);
    await page.waitForTimeout(600);
    await walk(0);
  }

  await page.waitForTimeout(wait);
  const file = `${out}-${size}.png`;
  await page.screenshot({ path: file, fullPage: Boolean(opt("full", false)), animations: "allow" });
  const metrics = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    height: document.documentElement.scrollHeight,
  }));
  console.log(`${file}  overflow=${metrics.scrollW - metrics.clientW}px pageHeight=${metrics.height}${errors.length ? "\n  errors: " + errors.join("\n  ") : ""}`);
  await context.close();
}
await browser.close();
