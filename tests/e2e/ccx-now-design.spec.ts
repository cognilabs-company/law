import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// «Hozir»: the focus card and the «Navbatda» strip, against mocked data.
// SHOTS=before|after also saves light/dark screenshots at 1440 and 390 px
// into /tmp/lexgo-now-design/shots for the owner's review.

const SHOTS = process.env.SHOTS ?? "";
const DIR = "/tmp/lexgo-now-design/shots";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const DAY = 60 * 24;

const item = (n: number, type: string, age: number, sla: number, client?: { id: string; name: string; phone?: string }) => ({
  id: `69e71328-aaaa-4bbb-8ccc-00000000000${n}`,
  type,
  title: type,
  status: "new",
  region: "tashkent_city",
  ...(client ? { client } : {}),
  sla_minutes: sla,
  age_minutes: age,
  sla_breached: age > sla,
  created_at: ago(age),
});

// The first job has no client: the focus card shows the muted fallback name.
const QUEUE = [
  item(1, "order", 63 * DAY, 60),
  item(2, "order", 62 * DAY, 60, { id: "u-c2", name: "Dilnoza Karimova" }),
  item(3, "order", 54 * DAY, 60),
  item(4, "order", 3 * DAY, 60, { id: "u-c4", name: "Jasur Tursunov" }),
  item(5, "order", 50, 60, { id: "u-c5", name: "Malika Rahimova" }),
  item(6, "order", 40, 60 * 24, { id: "u-c6", name: "Sardor Aliyev" }),
  item(7, "order", 20, 60 * 24, { id: "u-c7", name: "Nodira Yusupova" }),
  item(8, "order", 5, 60 * 24),
];

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((th) => {
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: th, bg: "night", motion: true, keys: true }));
  }, t);
}

async function open(page: Page) {
  const routes = await signIn(page, CALL_CENTER, { "/call-center/queue": { items: QUEUE }, "/call-center/calls": { items: [] }, "/call-center/marketplace/cockpit": { total_open: 0, queues: {} } });
  await mockBackend(page, routes);
  await page.goto("/en/admin/call-center");
  await expect(page.locator(".opx-focus__more")).toBeVisible();
  await expect(page.locator(".opx-job")).toHaveCount(QUEUE.length - 1);
  // The welcome splash plays once, then leaves the page.
  await expect(page.locator(".opx-intro")).toHaveCount(0, { timeout: 20_000 });
}

async function snap(page: Page, view: string, t: string, w: number) {
  if (!SHOTS) return;
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,[data-sonner-toaster],nextjs-portal,.cpl-launch,.fab{display:none!important}" }).catch(() => undefined);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${SHOTS}-${view}-${w}-${t}.png` });
}

for (const t of ["dark", "light"] as const) {
  for (const w of [1440, 390]) {
    test(`Hozir focus card and Up next ${t} ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
      await theme(page, t);
      await open(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await snap(page, "focus", t, w);

      // A hovered queue card, with the strip in view.
      await page.locator(".opx-next").evaluate((el) => el.scrollIntoView({ block: "end" }));
      const card = page.locator(".opx-job").first();
      await card.hover();
      await snap(page, "next-hover", t, w);

      if (SHOTS !== "before") {
        // The fallback name reads as a fallback, not as a client called that.
        await expect(page.locator(".opx-focus__code .opx-focus__none")).toHaveText("Client not specified");
        // The timer ring carries the urgency and the call button its icon disc.
        await expect(page.locator('.opx-wait[data-tone="hot"]')).toBeVisible();
        await expect(page.locator(".opx-act--call .opx-act__disc svg")).toHaveCount(1);
        // Every queue card has an age pill with a clock, tinted by urgency.
        await expect(page.locator(".opx-job__age svg")).toHaveCount(QUEUE.length - 1);
        await expect(page.locator('.opx-job[data-tone="hot"]').first()).toBeVisible();
        await expect(page.locator('.opx-job[data-tone="ok"]').first()).toBeVisible();
        if (w > 760) {
          // At the start the back arrow is disabled, the forward one is not.
          await expect(page.locator(".opx-next__nav button").first()).toBeDisabled();
          await expect(page.locator(".opx-next__nav button").last()).toBeEnabled();
        }
        await expect(page.locator(".opx-next__rail")).toHaveAttribute("data-edge", /end|both/);
      }

      // Never an internal id on screen, never a page-wide horizontal scroll.
      await expect(page.getByText("69e71328-aaaa", { exact: false })).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);

      // Picking a queue card still makes it the focus job.
      await card.click();
      await expect(page.locator(".opx-focus__code")).toContainText("Dilnoza Karimova");
    });
  }
}

test("Hozir: no page-wide horizontal scroll on a small phone, a tablet and a wide desktop", async ({ page }) => {
  await theme(page, "dark");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  for (const [w, h] of [
    [1920, 1080],
    [820, 1180],
    [360, 780],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${w}px`).toBeLessThanOrEqual(1);
    await expect(page.locator(".opx-act--call")).toBeInViewport();
  }
});
