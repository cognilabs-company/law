import { test } from "@playwright/test";
import { mockBackend, signIn, type Who } from "../mock";
import { ADVOCATE_S, CLIENT_M, LAWYER, prepare, shoot, type Width } from "./shots";
import { mocksFor } from "./data";

// Development helper: LX_SHOT="role:path[,role:path…]" LX_W=desktop,phone
// captures pages with the design mocks. Skipped in normal runs.
const spec = process.env.LX_SHOT ?? "";
const WHO: Record<string, Who> = { client: CLIENT_M, advocate: ADVOCATE_S, lawyer: LAWYER };

test("adhoc design shots", async ({ page }) => {
  test.skip(!spec, "LX_SHOT not set");
  test.setTimeout(600_000);
  await prepare(page);
  if (process.env.LX_DARK) {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("lexgo_theme", "dark"));
  }
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log(`CONSOLE ${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => console.log(`PAGEERROR ${e.message.slice(0, 300)}`));
  const items = spec.split(",").map((s) => s.split(":") as [string, string]);
  const role = items[0][0];
  const routes = await signIn(page, WHO[role], mocksFor(role));
  await mockBackend(page, routes);
  const widths = (process.env.LX_W ?? "desktop").split(",") as Width[];
  for (const [r, path] of items) {
    await page.goto(`/uz/portal/${r}${path ? `/${path}` : ""}`);
    await page.waitForSelector(".portal.lx");
    await page.waitForTimeout(1500);
    const tag = `${process.env.LX_DARK ? "dark-" : ""}${r}-${(path || "dashboard").replace(/\//g, "_")}`;
    for (const w of widths) await shoot(page, `adhoc-${tag}`, w);
    if (process.env.LX_OPEN) {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.locator(".lx-top__burger").click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `reference/design-lexgo-1920/shots/adhoc-${tag}-drawer.jpg`, type: "jpeg", quality: 72 });
    }
  }
});
