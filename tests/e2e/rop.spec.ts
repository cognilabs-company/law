import { expect, test, type Page } from "@playwright/test";
import { mockBackend, signIn } from "./mock";
import { ROP, ROP_PERMS, crmServer } from "./crmServer";

// The ROP (sales_head) CRM workspace — ROP final contract 2026-11-04 —
// against the mocked CRM backend: a menu built only from /crm/meta that
// follows a revoked permission, no revenue and no /crm/analytics, approval
// drafts edited before approval, robot runs with retry / a refused cancel,
// exports that keep polling on 409 crm_export_not_ready, and a socket
// resync that refetches what is on screen. Every text is translated.

test.use({ viewport: { width: 1440, height: 960 }, colorScheme: "light" });
test.describe.configure({ timeout: 120_000 });

const watchIntl = (page: Page) => {
  const missing: string[] = [];
  page.on("console", (m) => {
    if (/MISSING_MESSAGE|INVALID_KEY|FORMATTING_ERROR/.test(m.text())) missing.push(m.text().slice(0, 200));
  });
  return missing;
};
const SHOTS = process.env.ROP_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/rop-${name}.png` });
};

test("menu follows /crm/meta: a revoked permission takes its rows away on the next resync", async ({ page }) => {
  const missing = watchIntl(page);
  let perms = [...ROP_PERMS];
  const { routes } = crmServer(ROP_PERMS);
  const base = routes["/crm/meta"] as () => Record<string, unknown>;
  routes["/crm/meta"] = () => ({ ...base(), permissions: perms });
  const mock = await mockBackend(page, await signIn(page, ROP, routes as never));
  await page.goto("/uz/admin/crm/leads");
  const nav = page.locator(".lx-sb");
  await expect(nav.locator("[data-rop-nav]")).toHaveCount(11, { timeout: 30000 });
  await expect(nav.locator("[data-rop-nav=robots]")).toBeVisible();
  // A superadmin revokes robots; the backend announces a resync.
  perms = ROP_PERMS.filter((p) => p !== "crm.automation.manage");
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  await mock.push({ event: "crm.resync", resources: ["/crm/leads", "/crm/me/metrics"], reason: "permissions_changed" });
  await expect(nav.locator("[data-rop-nav=robots]")).toHaveCount(0);
  await expect(nav.locator("[data-rop-nav=drafts]")).toHaveCount(0);
  await expect(nav.locator("[data-rop-nav=leads]")).toBeVisible();
  // Nothing in the socket URL ends up on screen.
  await expect(page.locator("body")).not.toContainText("test-token");
  expect(missing).toEqual([]);
});

test("no revenue anywhere: the analytics address shows no access and is never asked", async ({ page }) => {
  const { st, routes } = crmServer([...ROP_PERMS, "crm.analytics.global"]);
  await mockBackend(page, await signIn(page, ROP, routes as never));
  await page.goto("/uz/admin/crm/analytics");
  await expect(page.locator("[data-denied]")).toBeVisible({ timeout: 30000 });
  await page.goto("/uz/admin/crm");
  await expect(page.locator("[data-rop-overview]")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("25 039 162");
  await expect(page.locator(".lx-sb")).not.toContainText(/Daromad|Tushum/);
  expect(st.analyticsCalls).toBe(0);
});

test("approval drafts: the text is edited, then approved with a reason; reject needs one", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(ROP_PERMS);
  await mockBackend(page, await signIn(page, ROP, routes as never));
  await page.goto("/uz/admin/crm/automation/drafts");
  const row = page.locator("[data-draft=d1]");
  await expect(row).toContainText("Dilnoza Karimova", { timeout: 30000 });
  await expect(page.locator(".lx-sb [data-rop-nav=drafts] .lx-sb__badge")).toHaveText("1");
  await shot(page, "drafts");
  await row.click();
  const dlg = page.locator("[data-rb-draft=d1]");
  // Reject without a reason is stopped here.
  await dlg.locator("[data-draft-reject]").click();
  await expect(page.getByText("Rad etish sababini yozing").first()).toBeVisible();
  expect(st.decisions).toHaveLength(0);
  await dlg.getByRole("textbox", { name: "Matn" }).fill("Assalomu alaykum! Ertaga qayta qo'ng'iroq qilamiz.");
  await dlg.getByRole("textbox", { name: /Izoh/ }).fill("Matn tekshirildi");
  await expect(dlg.locator("[data-draft-approve]")).toHaveText(/O'zgartirib tasdiqlash/);
  await dlg.locator("[data-draft-approve]").click();
  await expect.poll(() => st.decisions[0]).toMatchObject({
    id: "d1",
    decision: "approve",
    reason: "Matn tekshirildi",
    edited_payload: { body: "Assalomu alaykum! Ertaga qayta qo'ng'iroq qilamiz.", to_phone: "+998901234567" },
  });
  await expect(page.locator("[data-draft=d1]")).toHaveCount(0);
  expect(missing).toEqual([]);
});

test("robot runs: steps read as text; retry from a step; a refused cancel is a business message", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(ROP_PERMS);
  // This run looks cancellable to the list, the backend refuses.
  const runs = routes["/crm/automation/runs/[^/]+"] as (b: unknown, u: URL) => Record<string, unknown>;
  routes["/crm/automation/runs/[^/]+"] = (b: unknown, u: URL) => {
    const r = runs(b, u);
    return u.pathname.endsWith("run7") ? { ...r, can_cancel: true } : r;
  };
  await mockBackend(page, await signIn(page, ROP, routes as never));
  await page.goto("/uz/admin/crm/automation/runs?status=failed");
  const row = page.locator("[data-run=run7]");
  await expect(row).toContainText("Xato", { timeout: 30000 });
  await expect(page.locator("[data-run=run9]")).toHaveCount(0);
  await row.click();
  const run = page.locator("[data-rb-run]");
  await expect(run).toContainText("SMS provayder javob bermadi");
  await expect(run.locator(".rb-runsteps > li")).toHaveCount(2);
  await run.locator(".rb-runsteps > li").nth(1).getByText("Kiruvchi ma'lumot").click();
  await expect(run).toContainText("Salom");
  await expect(run).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  await shot(page, "run");
  await run.getByRole("button", { name: "Qaysi qadamdan" }).click();
  await page.getByRole("listbox").getByRole("option", { name: /2-qadamdan/ }).click();
  await run.locator("[data-rb-retry]").click();
  await expect.poll(() => st.runOps.find((o) => o.path === "retry:run7")?.body).toEqual({ from_step_index: 1 });
  await page.locator("[data-rb-cancel]").click();
  await expect(page.getByText("allaqachon tugagan").first()).toBeVisible();
  expect(missing).toEqual([]);
});

test("exports: a download asked too early keeps polling instead of opening a broken file", async ({ page }) => {
  const missing = watchIntl(page);
  const { st, routes } = crmServer(ROP_PERMS);
  let downloads = 0;
  routes["/crm/exports/ex1/download"] = () => (downloads++, { status: 409, json: { detail: { code: "crm_export_not_ready" } } });
  routes["/crm/exports/ex1"] = () => ((st.exportPolls += 1), { id: "ex1", scope: "leads", status: st.exportPolls === 2 ? "ready" : st.exportPolls > 2 ? "ready" : "processing", download_url: st.exportPolls >= 2 ? "/crm/exports/ex1/download" : null });
  await mockBackend(page, await signIn(page, ROP, routes as never));
  await page.goto("/uz/admin/crm/exports");
  await page.getByRole("button", { name: "Eksportni boshlash" }).click({ timeout: 30000 });
  const dl = page.getByRole("button", { name: "Yuklab olish" }).first();
  await expect(dl).toBeVisible({ timeout: 15000 });
  const polls = st.exportPolls;
  await dl.click();
  await expect.poll(() => downloads).toBe(1);
  // Back to polling, no error toast, no file.
  await expect.poll(() => st.exportPolls, { timeout: 15000 }).toBeGreaterThan(polls);
  await shot(page, "exports");
  expect(missing).toEqual([]);
});

test("realtime: crm.resync refetches the leads on screen; the operators page shows workload", async ({ page }) => {
  const missing = watchIntl(page);
  const { routes } = crmServer(ROP_PERMS);
  const mock = await mockBackend(page, await signIn(page, ROP, routes as never));
  await page.goto("/uz/admin/crm/leads?tab=all");
  await expect(page.locator(".crm-table tbody tr").first()).toBeVisible({ timeout: 30000 });
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  const before = mock.count("GET", /^\/crm\/leads$/);
  await mock.push({ event: "crm.resync", resources: ["/crm/leads"], reason: "reconnected" });
  await expect.poll(() => mock.count("GET", /^\/crm\/leads$/)).toBeGreaterThan(before);
  // Operators: each with their active leads; a click filters the list.
  await page.locator(".lx-sb [data-rop-nav=operators]").click();
  const op = page.locator(".rop-op").filter({ hasText: "Akmal Operator" });
  await expect(op).toContainText("3");
  await op.getByRole("link").click();
  await expect(page).toHaveURL(/operator=op-2/);
  await expect(page.locator(".crm-table tbody tr").first()).toBeVisible();
  expect(missing).toEqual([]);
});
