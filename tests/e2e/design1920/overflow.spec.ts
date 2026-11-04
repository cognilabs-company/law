import { test } from "@playwright/test";
import { mockBackend, signIn, type Who } from "../mock";
import { ADVOCATE_S, CLIENT_M, LAWYER, prepare } from "./shots";
import { mocksFor } from "./data";

// Development helper: LX_OVF="role:path,…" LX_VW=360 lists elements wider than the viewport.
const spec = process.env.LX_OVF ?? "";
const WHO: Record<string, Who> = { client: CLIENT_M, advocate: ADVOCATE_S, lawyer: LAWYER };
test("adhoc overflow", async ({ page }) => {
  test.skip(!spec, "LX_OVF not set");
  test.setTimeout(600_000);
  await prepare(page);
  const items = spec.split(",").map((s) => s.split(":") as [string, string]);
  await mockBackend(page, await signIn(page, WHO[items[0][0]], mocksFor(items[0][0])));
  await page.setViewportSize({ width: Number(process.env.LX_VW ?? 1920), height: 900 });
  for (const [r, p] of items) {
    await page.goto(`/uz/portal/${r}${p ? `/${p}` : ""}`);
    await page.waitForSelector(".portal.lx");
    await page.waitForTimeout(1500);
    const out = await page.evaluate(() => {
      const vw = window.innerWidth;
      const bad: string[] = [];
      document.querySelectorAll<HTMLElement>(".pbody *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") bad.push(`${el.tagName}.${String(el.className).slice(0, 60)} ${Math.round(r.right)}`);
      });
      return { sw: document.documentElement.scrollWidth, vw, bad: bad.slice(0, 8) };
    });
    console.log(`OVF ${r}/${p} sw=${out.sw} vw=${out.vw}`, JSON.stringify(out.bad));
  }
});
