import { expect, test, type Page } from "@playwright/test";
import { ADMIN, mockBackend, signIn, type Mock, type Routes, type Who } from "./mock";

// Superadmin mobile test monitoring
// (docs/LEXGO_SUPERADMIN_MOBILE_TEST_MONITORING_FRONTEND_2026_11_01.md).
// Everything is mocked: no request reaches the real backend, so no release
// is created or closed and no Telegram report is ever posted. The numbers
// in the comments are the contract's §11 acceptance checklist.

const SHOTS = process.env.MTM_SHOTS;
const NOT_PRIMARY: Who = { ...ADMIN, id: "u-admin2", name: "Second Superadmin", primary: false };
const MANAGER: Who = { id: "u-mgr", name: "Test Manager", phone: "+998900000009", role: "client", backendRole: "admin", permissions: ["users.manage", "leads.manage"], primary: false };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const tester = (i: number) => ({ id: `0b6f0d1e-0000-4000-8000-${String(i).padStart(12, "0")}`, lexgo_id: `LGC-${String(10000000 + i)}`, name: `Tester ${i}`, phone: `+99890${String(1000000 + i)}` });
// 55 registered phones: the first 40 used on the selected day, the rest not.
function phone(i: number, date: string) {
  const used = i <= 40;
  return {
    id: `7d2c3a10-0000-4000-8000-${String(i).padStart(12, "0")}`,
    installation_key: "must-never-show-installation-key",
    tester: tester(i),
    platform: "android",
    distribution_track: i % 3 === 0 ? "internal" : "closed",
    app_version: "2.4.0",
    version_code: 20400,
    manufacturer: "Samsung",
    model: i === 1 ? "SM-S918B" : `Galaxy A${i}`,
    os_version: "15",
    locale: "uz",
    is_test: true,
    status: "active",
    first_seen_at: "2026-10-20T09:00:00Z",
    last_seen_at: "2026-11-01T12:30:00Z",
    usage: {
      date,
      foreground_seconds: used ? 1800 : 0,
      foreground_minutes: used ? 30.0 : 0,
      session_count: used ? 4 : 0,
      first_activity_at: used ? `${date}T03:00:00Z` : null,
      last_activity_at: used ? `${date}T12:30:00Z` : null,
      used,
    },
  };
}
const SUMMARY: Record<string, Record<string, number>> = {
  "2026-11-01": { registered_devices: 55, used_devices: 40, unused_devices: 15, active_now: 2, total_foreground_seconds: 72000, total_foreground_minutes: 1200.0, sessions: 160 },
  "2026-10-31": { registered_devices: 55, used_devices: 7, unused_devices: 48, active_now: 0, total_foreground_seconds: 7230, total_foreground_minutes: 120.5, sessions: 19 },
};

type State = { dashCalls: string[]; listCalls: string[]; detailCalls: string[]; reportCalls: string[]; sends: string[]; bump: number; releases: Record<string, unknown>[] };

function routes(st: State, opts: { empty?: boolean; fail?: boolean } = {}): Routes {
  const dayOf = (url: URL) => url.searchParams.get("date") || "2026-11-01";
  return {
    "/admin/mobile-testing/dashboard": (_b: unknown, url: URL) => {
      st.dashCalls.push(url.search);
      if (opts.fail) return { status: 500, json: { detail: { code: "internal_error", trace: "{\"secret\":1}" } } };
      const date = dayOf(url);
      const base = opts.empty ? { registered_devices: 0, used_devices: 0, unused_devices: 0, active_now: 0, total_foreground_seconds: 0, total_foreground_minutes: 0, sessions: 0 } : SUMMARY[date] ?? SUMMARY["2026-11-01"];
      // The server is the only source of totals: after a realtime event the
      // next read simply returns new numbers.
      const s = { ...base, sessions: base.sessions + st.bump, total_foreground_minutes: base.total_foreground_minutes + st.bump * 3 };
      return { date, timezone: "Asia/Tashkent", summary: s, items: [], realtime: { websocket_url: "/ws/users/me", events: ["mobile_testing.installation_registered", "mobile_testing.usage_updated", "mobile_testing.session_stale", "mobile_testing.report_sent"] } };
    },
    "/admin/mobile-testing/installations": (_b: unknown, url: URL) => {
      st.listCalls.push(url.search);
      const date = dayOf(url);
      const usage = url.searchParams.get("usage") || "all";
      const limit = Number(url.searchParams.get("limit") || 50);
      const offset = Number(url.searchParams.get("offset") || 0);
      const all = opts.empty ? [] : Array.from({ length: 55 }, (_, i) => phone(i + 1, date));
      const rows = all.filter((p) => usage === "all" || (usage === "used" ? p.usage.used : !p.usage.used));
      return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset, date };
    },
    "/admin/mobile-testing/installations/[^/]+": (_b: unknown, url: URL) => {
      st.detailCalls.push(url.search);
      const from = url.searchParams.get("date_from") || "2026-10-03";
      const to = url.searchParams.get("date_to") || "2026-11-01";
      return {
        installation: phone(1, to),
        date_from: from,
        date_to: to,
        timezone: "Asia/Tashkent",
        daily: [
          { date: "2026-10-28", foreground_seconds: 2400, foreground_minutes: 40, session_count: 3, first_activity_at: "2026-10-28T04:00:00Z", last_activity_at: "2026-10-28T13:00:00Z" },
          { date: "2026-10-30", foreground_seconds: 900, foreground_minutes: 15, session_count: 1, first_activity_at: "2026-10-30T06:00:00Z", last_activity_at: "2026-10-30T06:15:00Z" },
          { date: "2026-11-01", foreground_seconds: 1800, foreground_minutes: 30, session_count: 4, first_activity_at: "2026-11-01T03:00:00Z", last_activity_at: "2026-11-01T12:30:00Z" },
        ],
        sessions: [
          { id: "s3", status: "active", started_at: "2026-11-01T12:00:00Z", ended_at: null, last_heartbeat_at: "2026-11-01T12:30:00Z", foreground_seconds: 1800, foreground_minutes: 30, app_version: "2.4.0" },
          { id: "s2", status: "stale", started_at: "2026-10-30T06:00:00Z", ended_at: "2026-10-30T06:15:00Z", last_heartbeat_at: "2026-10-30T06:15:00Z", foreground_seconds: 900, foreground_minutes: 15, app_version: "2.4.0" },
          { id: "s1", status: "completed", started_at: "2026-10-28T04:00:00Z", ended_at: "2026-10-28T04:40:00Z", foreground_seconds: 2400, foreground_minutes: 40, app_version: "2.3.9" },
        ],
      };
    },
    "/admin/mobile-testing/releases": () => ({ items: st.releases }),
    "POST /admin/mobile-testing/releases": (body: unknown) => {
      const b = body as Record<string, unknown>;
      if (b.version_code === 20400) return { status: 409, json: { detail: { code: "mobile_test_release_exists" } } };
      if (b.version_code === 99999) return { status: 422, json: { detail: [{ loc: ["body", "distribution_track"], msg: "Value error, invalid track", type: "value_error" }] } };
      const rel = { id: "rel-new", status: "active", created_at: "2026-11-01T07:00:00Z", updated_at: "2026-11-01T07:00:00Z", ...b };
      st.releases = [rel, ...st.releases];
      return { status: 201, json: rel };
    },
    "PATCH /admin/mobile-testing/releases/[^/]+": (body: unknown) => {
      const b = body as Record<string, unknown>;
      st.releases = st.releases.map((r) => (r.id === "rel-1" ? { ...r, ...b, updated_at: "2026-11-01T08:00:00Z" } : r));
      return st.releases.find((r) => r.id === "rel-1");
    },
    "/admin/mobile-testing/reports": (_b: unknown, url: URL) => {
      st.reportCalls.push(url.search);
      const limit = Number(url.searchParams.get("limit") || 30);
      const offset = Number(url.searchParams.get("offset") || 0);
      if (opts.empty) return { items: [], total: 0, limit, offset };
      const all = Array.from({ length: 45 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 9, 31 - i)).toISOString().slice(0, 10);
        const status = i === 1 ? "failed" : i === 2 ? "pending" : "sent";
        return { id: `rep-${i}`, report_date: d, status, first_telegram_message_id: status === "sent" ? 4000 + i : null, attempt_count: status === "failed" ? 3 : 1, sent_at: status === "sent" ? `${d}T18:00:05Z` : null, created_at: `${d}T18:00:00Z`, updated_at: `${d}T18:00:05Z` };
      });
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
    },
    "POST /admin/mobile-testing/reports/[^/]+/send": (_b: unknown, url: URL) => {
      st.sends.push(`${url.pathname.replace(/^.*\/reports\//, "")}${url.search}`);
      const date = url.pathname.split("/").slice(-2)[0];
      if (date === "2026-10-31" && url.searchParams.get("force") !== "true") return { status: 409, json: { detail: { code: "mobile_test_report_already_sent" } } };
      return { report: { id: "rep-x", report_date: date, status: "sent", first_telegram_message_id: 5001, attempt_count: 1, sent_at: "2026-11-01T10:00:00Z", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" } };
    },
  };
}
const RELEASES = () => [
  { id: "rel-1", platform: "android", version_name: "2.4.0", version_code: 20400, distribution_track: "closed", status: "active", auto_enroll: true, starts_at: "2026-10-31T19:00:00Z", ends_at: null, created_at: "2026-10-31T19:00:00Z", updated_at: "2026-10-31T19:00:00Z" },
  { id: "rel-0", platform: "android", version_name: "2.3.9", version_code: 20309, distribution_track: "internal", status: "closed", auto_enroll: false, starts_at: "2026-10-01T04:00:00Z", ends_at: "2026-10-30T18:59:00Z", created_at: "2026-10-01T04:00:00Z", updated_at: "2026-10-30T19:00:00Z" },
];
const fresh = (): State => ({ dashCalls: [], listCalls: [], detailCalls: [], reportCalls: [], sends: [], bump: 0, releases: RELEASES() });

async function open(page: Page, who: Who, st: State, path: string, opts: { empty?: boolean; fail?: boolean; forbid?: boolean } = {}): Promise<Mock> {
  const own = routes(st, opts);
  const forbid: Routes = Object.fromEntries(Object.keys(own).map((k) => [k, { status: 403, json: { detail: { code: "primary_superadmin_required" } } }]));
  const mock = await mockBackend(page, await signIn(page, who, opts.forbid ? forbid : own));
  await page.goto(path);
  return mock;
}

// Nothing a tester must not see, and no machine text, is ever on screen.
async function clean(page: Page) {
  const text = await page.locator("main, .mtm, [role=dialog]").allInnerTexts();
  const all = text.join("\n");
  expect(all).not.toMatch(UUID);
  expect(all).not.toContain("installation_key");
  expect(all).not.toContain("must-never-show-installation-key");
  expect(all).not.toMatch(/[{[]\s*"/);
  expect(all).not.toMatch(/primary_superadmin_required|mobile_test_release_exists|already_sent|_at\b/);
}

// Screenshot runs only: MTM_SHOTS=<dir> saves every screen in uz/ru/en at
// 1440 and 390, light and dark (viewport shots).
async function snap(page: Page, name: string, loc: string) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 400 ? 900 : 844 });
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${SHOTS}/${name}-${loc}-${width}-${scheme}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("1, 3, 4, 5, 8, 12, 13, 14: the primary superadmin sees the cards and phones for the picked Tashkent day", async ({ page }) => {
  const st = fresh();
  await open(page, ADMIN, st, "/en/admin/mobile-testing");
  // 1: the nav item and the page are there.
  await expect(page.locator('.psb__nav a[data-ai-target="nav:mobileTesting"]')).toHaveCount(1);
  await expect(page.locator(".mtm-hero__h")).toHaveText("Mobile test monitoring");
  // No date picked: the backend picks today in Tashkent and its date is shown.
  expect(st.dashCalls[0]).toBe("");
  await expect(page.getByTestId("mtm-date")).toHaveText("1 November 2026");
  await expect(page.locator(".mtm-date")).toContainText("Tashkent");
  // Six cards, every number from the backend.
  for (const [k, v] of [["registered", "55"], ["used", "40"], ["unused", "15"], ["active", "2"], ["minutes", "20 h"], ["sessions", "160"]]) await expect(page.getByTestId(`mtm-card-${k}`)).toContainText(v);
  // The list uses the dashboard's date.
  await expect.poll(() => st.listCalls[0]).toContain("date=2026-11-01");
  const table = page.getByTestId("mtm-devices");
  await expect(table.locator("tbody tr")).toHaveCount(50);
  await expect(table.locator("tbody tr").first()).toContainText("Tester 1");
  await expect(table.locator("tbody tr").first()).toContainText("LGC-10000001");
  await expect(table.locator("tbody tr").first()).toContainText("Samsung SM-S918B");
  await expect(table.locator("tbody tr").first()).toContainText("Android 15");
  await expect(table.locator("tbody tr").first()).toContainText("Closed testing");
  // 12: times are on the Tashkent clock (03:00Z → 08:00, 12:30Z → 17:30) and the zone is named.
  await expect(table.locator("tbody tr").first()).toContainText("08:00");
  await expect(table.locator("tbody tr").first()).toContainText("17:30");
  await expect(page.locator(".mtm-panel .mtm-tz").first()).toContainText("Tashkent time (UTC+5)");

  // Pagination of the device list.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => st.listCalls.at(-1)).toContain("offset=50");
  await expect(table.locator("tbody tr")).toHaveCount(5);
  // 5: a registered phone with no activity stays, with 0 minutes and a gray "Not used".
  const idle = table.locator('tbody tr[data-used="0"]').first();
  await expect(idle).toContainText("Not used");
  await expect(idle).toContainText("0 min");

  // 4: used / unused filters go to the backend and show what it returns.
  await page.getByRole("radio", { name: "Used", exact: true }).click();
  await expect.poll(() => st.listCalls.at(-1)).toMatch(/usage=used.*offset=0/);
  await expect(table.locator('tbody tr[data-used="0"]')).toHaveCount(0);
  await expect(table.locator("tbody tr")).toHaveCount(40);
  await page.getByRole("radio", { name: "Not used" }).click();
  await expect.poll(() => st.listCalls.at(-1)).toContain("usage=unused");
  await expect(table.locator("tbody tr")).toHaveCount(15);
  await expect(table.locator('tbody tr[data-used="1"]')).toHaveCount(0);
  await expect(table.locator(".mtm-badge", { hasText: "Not used" })).toHaveCount(15);

  // 3: a new date updates every card and every row.
  await page.getByRole("combobox", { name: "Pick a day" }).fill("31.10.2026");
  await page.getByRole("combobox", { name: "Pick a day" }).press("Tab");
  await expect.poll(() => st.dashCalls.at(-1)).toBe("?date=2026-10-31");
  await expect.poll(() => st.listCalls.at(-1)).toContain("date=2026-10-31");
  await expect(page.getByTestId("mtm-date")).toHaveText("31 October 2026");
  await expect(page.getByTestId("mtm-card-used")).toContainText("7");
  await expect(page.getByTestId("mtm-card-minutes")).toContainText("2 h");
  await expect(page.getByTestId("mtm-card-sessions")).toContainText("19");
  // 13, 14: no raw JSON, codes, UUIDs or installation key; no native pickers.
  await clean(page);
  await expect(page.locator("main select, main input[type=date], main input[type=time]")).toHaveCount(0);
  const keyAsked = (await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name))).some((u) => /installation_key|installation-key/.test(u));
  expect(keyAsked).toBe(false);
});

test("phone: the device list becomes cards at 390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const st = fresh();
  await open(page, ADMIN, st, "/en/admin/mobile-testing?usage=unused");
  const cards = page.getByTestId("mtm-devices-cards");
  await expect(cards.locator("li")).toHaveCount(15);
  await expect(page.getByTestId("mtm-devices")).toBeHidden();
  await expect(cards.locator("li").first()).toContainText("Not used");
  // No sideways scroll on the page.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("2: other roles get no nav item and the readable 403 state", async ({ page }) => {
  const st = fresh();
  await open(page, NOT_PRIMARY, st, "/en/admin/mobile-testing", { forbid: true });
  await expect(page.getByText("Only the primary superadmin can open this")).toBeVisible();
  await expect(page.locator('.psb__nav a[data-ai-target="nav:mobileTesting"]')).toHaveCount(0);
  await clean(page);
  for (const path of ["/en/admin/mobile-testing/releases", "/en/admin/mobile-testing/reports", "/en/admin/mobile-testing/devices/7d2c3a10-0000-4000-8000-000000000001"]) {
    await page.goto(path);
    await expect(page.getByText("Only the primary superadmin can open this")).toBeVisible();
  }
});

test("2: a non-superadmin admin role sees no nav item either", async ({ page }) => {
  const st = fresh();
  await open(page, MANAGER, st, "/en/admin/audit-trail", { forbid: true });
  await expect(page.locator(".psb__nav")).toBeVisible();
  await expect(page.locator('.psb__nav a[data-ai-target="nav:mobileTesting"]')).toHaveCount(0);
});

test("7, 8: realtime events refetch once after a short pause; a dropped socket shows the stale state and manual refresh works", async ({ page }) => {
  const st = fresh();
  const mock = await open(page, ADMIN, st, "/en/admin/mobile-testing");
  await expect(page.getByTestId("mtm-card-sessions")).toContainText("160");
  await expect.poll(() => mock.sockets.some((s) => s.url.includes("/ws/users/me"))).toBe(true);
  await expect(page.locator(".mtm-live")).toContainText("Live");
  const before = st.dashCalls.length;
  const listBefore = st.listCalls.length;
  st.bump = 1;
  // A burst of three events: one refetch, no page reload.
  await page.evaluate(() => ((window as unknown as { __mtm: number }).__mtm = 1));
  await mock.push({ event: "mobile_testing.usage_updated", installation_id: "x" });
  await mock.push({ event: "mobile_testing.session_stale", installation_id: "x" });
  await mock.push({ event: "mobile_testing.installation_registered" });
  await page.waitForTimeout(150);
  expect(st.dashCalls.length).toBe(before);
  await expect.poll(() => st.dashCalls.length).toBe(before + 1);
  expect(st.listCalls.length).toBe(listBefore + 1);
  // The new totals are the backend's, not the old ones plus anything.
  await expect(page.getByTestId("mtm-card-sessions")).toContainText("161");
  await expect(page.getByTestId("mtm-card-minutes")).toContainText("20 h 3 min");
  expect(await page.evaluate(() => (window as unknown as { __mtm?: number }).__mtm)).toBe(1);
  // A report event is not for this view.
  await mock.push({ event: "mobile_testing.report_sent" });
  await page.waitForTimeout(700);
  expect(st.dashCalls.length).toBe(before + 1);

  // Disconnected: a quiet stale note; manual refresh still reads the server.
  await page.routeWebSocket(/\/ws\/users\/me/, () => undefined);
  await mock.drop();
  await expect(page.locator(".mtm-live")).toContainText("Live updates paused");
  await expect(page.locator(".mtm-live")).toContainText("Data may be out of date");
  const n = st.dashCalls.length;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => st.dashCalls.length).toBeGreaterThan(n);
});

test("6, 12: the detail shows device, tester, the daily chart and table, and the session timeline", async ({ page }) => {
  const st = fresh();
  const mock = await open(page, ADMIN, st, "/en/admin/mobile-testing");
  await page.getByTestId("mtm-devices").getByRole("link", { name: "Tester 1", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/mobile-testing\/devices\/.+\?date=2026-11-01/);
  // Default period: the backend's latest 30 days, echoed back.
  expect(st.detailCalls[0]).toBe("");
  await expect(page.getByRole("heading", { name: "Samsung SM-S918B" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tester 1" })).toBeVisible();
  await expect(page.locator(".mtm-info").nth(1)).toContainText("LGC-10000001");
  await expect(page.getByRole("combobox", { name: "From" })).toHaveValue("03.10.2026");
  await expect(page.getByRole("combobox", { name: "To" })).toHaveValue("01.11.2026");
  // Chart: one bar per day the backend sent.
  await expect(page.locator(".mtm-chart__bar")).toHaveCount(3);
  const daily = page.getByTestId("mtm-daily");
  await expect(daily.locator("tbody tr")).toHaveCount(3);
  await expect(daily.locator("tbody tr").first()).toContainText("1 November 2026");
  await expect(daily.locator("tbody tr").first()).toContainText("30 min");
  await expect(daily.locator("tbody tr").first()).toContainText("08:00");
  // Timeline: every circle carries its status icon.
  const tl = page.getByTestId("mtm-timeline");
  await expect(tl.locator("li")).toHaveCount(3);
  for (const dot of await tl.locator(".mtm-tl__dot").all()) await expect(dot.locator("svg")).toHaveCount(1);
  await expect(tl.locator("li").first()).toContainText("Active now");
  await expect(tl.locator("li").nth(2)).toContainText("Completed");
  // The stale badge explains itself on keyboard focus, not only hover.
  const stale = tl.getByRole("button", { name: /Closed by server/ });
  await stale.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.getByRole("tooltip")).toContainText("closed this session by itself");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  // …and on tap.
  await stale.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await clean(page);

  // More than 366 days: a readable message and no request.
  const calls = st.detailCalls.length;
  await page.getByRole("combobox", { name: "From" }).fill("01.10.2025");
  await page.getByRole("combobox", { name: "From" }).press("Tab");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose at most 366 days" })).toBeVisible();
  expect(st.detailCalls.length).toBe(calls);
  // A valid period goes to the backend.
  await page.getByRole("combobox", { name: "From" }).fill("01.11.2025");
  await page.getByRole("combobox", { name: "From" }).press("Tab");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect.poll(() => st.detailCalls.at(-1)).toBe("?date_from=2025-11-01&date_to=2026-11-01");

  // Realtime for another phone is ignored; for this one it refetches.
  const before = st.detailCalls.length;
  await mock.push({ event: "mobile_testing.usage_updated", installation_id: "someone-else" });
  await page.waitForTimeout(700);
  expect(st.detailCalls.length).toBe(before);
  await mock.push({ event: "mobile_testing.usage_updated", installation_id: "7d2c3a10-0000-4000-8000-000000000001" });
  await expect.poll(() => st.detailCalls.length).toBe(before + 1);

  // Back keeps the day.
  await page.getByRole("link", { name: "All phones" }).click();
  await expect(page).toHaveURL(/\/admin\/mobile-testing\?date=2026-11-01$/);
});

test("9: releases are created, a duplicate and field errors read as words, and closing asks first", async ({ page }) => {
  const st = fresh();
  const mock = await open(page, ADMIN, st, "/en/admin/mobile-testing/releases");
  const list = page.getByTestId("mtm-releases");
  await expect(list.locator("li")).toHaveCount(2);
  await expect(list.locator("li").first()).toContainText("2.4.0");
  await expect(list.locator("li").first()).toContainText("Auto-enrolment on");
  // 19:00Z is midnight in Tashkent.
  await expect(list.locator("li").first()).toContainText("00:00");

  await page.getByRole("button", { name: "New release" }).first().click();
  const dlg = page.getByRole("dialog", { name: "New test release" });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Version code").fill("20400");
  await dlg.getByLabel("Version name").fill("2.4.0");
  await dlg.getByRole("combobox", { name: "Start date" }).fill("01.11.2026");
  await dlg.getByRole("combobox", { name: "Start date" }).press("Tab");
  await dlg.getByRole("button", { name: "Create release" }).click();
  // 409 mobile_test_release_exists, in words, on the field.
  await expect(dlg.getByTestId("mtm-release-error")).toContainText("A release with version code 20400 already exists");
  await expect(dlg.getByLabel("Version code")).toHaveAttribute("aria-invalid", "true");
  await clean(page);
  // A 422 on a field is shown under that field, not as the server's text.
  await dlg.getByLabel("Version code").fill("99999");
  await dlg.getByRole("button", { name: "Create release" }).click();
  await expect(dlg).toContainText("Pick internal, closed or open testing.");
  await expect(dlg).not.toContainText("invalid track");
  // A valid one: the body is exactly the contract's.
  await dlg.getByLabel("Version code").fill("20500");
  await dlg.getByLabel("Version name").fill("2.5.0");
  await dlg.getByRole("button", { name: "Create release" }).click();
  await expect(dlg).toBeHidden();
  const post = mock.calls.filter((c) => c.method === "POST" && c.path === "/admin/mobile-testing/releases").at(-1);
  expect(post?.body).toEqual({ platform: "android", version_name: "2.5.0", version_code: 20500, distribution_track: "closed", auto_enroll: true, starts_at: "2026-11-01T00:00:00+05:00", ends_at: null });
  await expect(list.locator("li")).toHaveCount(3);

  // Closing asks first, then sends status closed + auto_enroll false.
  const row = list.locator("li", { hasText: "build 20400" });
  await row.getByRole("button", { name: "Close", exact: true }).click();
  const ask = page.locator(".amodal__c");
  await expect(ask).toContainText("Close release 2.4.0?");
  expect(mock.calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  await ask.getByRole("button", { name: "Close release" }).click();
  await expect.poll(() => mock.calls.filter((c) => c.method === "PATCH").length).toBe(1);
  expect(mock.calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "closed", auto_enroll: false });
  await expect(row).toContainText("Closed");
  expect(mock.refused).toEqual([]);
});

test("10, 11: report history paginates; a send asks first and a force resend needs two clearly warned confirmations", async ({ page }) => {
  const st = fresh();
  const mock = await open(page, ADMIN, st, "/en/admin/mobile-testing/reports");
  const table = page.getByTestId("mtm-reports");
  await expect(table.locator("tbody tr")).toHaveCount(30);
  await expect(table.locator("tbody tr").first()).toContainText("31 October 2026");
  await expect(table.locator("tbody tr").first()).toContainText("Sent");
  await expect(table.locator("tbody tr").nth(1)).toContainText("Failed");
  await expect(table.locator("tbody tr").nth(2)).toContainText("Waiting");
  // 18:00Z is 23:00 in Tashkent: the automatic time.
  await expect(table.locator("tbody tr").first()).toContainText("23:00");
  // 10: pagination.
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => st.reportCalls.at(-1)).toBe("?limit=30&offset=30");
  await expect(table.locator("tbody tr")).toHaveCount(15);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect.poll(() => st.reportCalls.at(-1)).toBe("?limit=30&offset=0");

  // 11: a normal send asks first; nothing is sent before the confirm.
  await page.getByRole("combobox", { name: "Report day" }).fill("30.10.2026");
  await page.getByRole("combobox", { name: "Report day" }).press("Tab");
  await page.getByRole("button", { name: "Send report…" }).click();
  await expect(page.getByTestId("mtm-send-dialog")).toContainText("30 October 2026");
  expect(st.sends).toEqual([]);
  await page.getByTestId("mtm-send-confirm").click();
  await expect.poll(() => st.sends).toEqual(["2026-10-30/send?force=false"]);
  await expect(page.getByTestId("mtm-send-dialog")).toBeHidden();

  // Already sent: the normal button never forces.
  await page.getByRole("combobox", { name: "Report day" }).fill("31.10.2026");
  await page.getByRole("combobox", { name: "Report day" }).press("Tab");
  await page.getByRole("button", { name: "Send report…" }).click();
  await page.getByTestId("mtm-send-confirm").click();
  await expect(page.getByTestId("mtm-send-dialog")).toContainText("has already been posted");
  expect(st.sends.at(-1)).toBe("2026-10-31/send?force=false");
  await page.locator(".amodal__c").getByRole("button", { name: "Cancel" }).click();

  // Force resend from a sent row: warning, then a second confirmation that
  // stays disabled until the risk is ticked.
  await table.locator("tbody tr").first().getByRole("button", { name: "Send again anyway…" }).click();
  await expect(page.getByTestId("mtm-force1")).toContainText("SECOND message");
  await page.getByTestId("mtm-force-next").click();
  const second = page.getByTestId("mtm-force2");
  await expect(second).toContainText("real LexGo Telegram group");
  await expect(page.getByTestId("mtm-force-confirm")).toBeDisabled();
  expect(st.sends.filter((s) => s.includes("force=true"))).toEqual([]);
  await second.getByText("Yes, post another copy").click();
  await expect(page.getByTestId("mtm-force-confirm")).toBeEnabled();
  await page.getByTestId("mtm-force-confirm").click();
  await expect.poll(() => st.sends.at(-1)).toBe("2026-10-31/send?force=true");
  expect(st.sends.filter((s) => s.includes("force=true"))).toHaveLength(1);
  // A report_sent event refreshes the history.
  const n = st.reportCalls.length;
  await mock.push({ event: "mobile_testing.report_sent" });
  await expect.poll(() => st.reportCalls.length).toBe(n + 1);
  await clean(page);
});

test("9: empty states explain how phones and reports appear", async ({ page }) => {
  const st = fresh();
  st.releases = [];
  await open(page, ADMIN, st, "/en/admin/mobile-testing", { empty: true });
  await expect(page.getByText("No test phones yet")).toBeVisible();
  await expect(page.getByText("opens the instrumented Android build and signs in")).toBeVisible();
  await page.goto("/en/admin/mobile-testing/releases");
  await expect(page.getByText("No releases yet")).toBeVisible();
  await page.goto("/en/admin/mobile-testing/reports");
  await expect(page.getByText("No reports yet")).toBeVisible();
});

test("13: an API error is words and a retry, never the body", async ({ page }) => {
  const st = fresh();
  await open(page, ADMIN, st, "/en/admin/mobile-testing", { fail: true });
  await expect(page.getByText("Could not load the data")).toBeVisible();
  await expect(page.getByText("The server could not answer right now")).toBeVisible();
  await clean(page);
  const n = st.dashCalls.length;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => st.dashCalls.length).toBe(n + 1);
});

test("screenshots of every screen (MTM_SHOTS only)", async ({ browser }) => {
  test.setTimeout(900_000);
  if (!SHOTS) return;
  const fresh2 = async (opts: { empty?: boolean; fail?: boolean; forbid?: boolean } = {}, who: Who = ADMIN) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("dialog", (d) => void d.accept());
    const st = fresh();
    if (opts.empty) st.releases = [];
    const own = routes(st, opts);
    const forbid: Routes = Object.fromEntries(Object.keys(own).map((k) => [k, { status: 403, json: { detail: { code: "primary_superadmin_required" } } }]));
    await mockBackend(page, await signIn(page, who, opts.forbid ? forbid : own));
    return page;
  };
  // MTM_LOCALES=uz,ru narrows a run (the machine is small).
  for (const loc of (process.env.MTM_LOCALES || "uz,ru,en").split(",")) {
    const page = await fresh2();
    const go = async (path: string) => {
      await page.goto(`/${loc}/admin/mobile-testing${path}`);
      await page.locator(".mtm").first().waitFor();
      await page.locator(".mtm-skel, .mtm-card--skel").first().waitFor({ state: "detached" }).catch(() => undefined);
    };
    await go("");
    await page.getByTestId("mtm-devices").locator("tbody tr").first().waitFor();
    await snap(page, "dashboard", loc);
    await go("?usage=used");
    await page.getByTestId("mtm-devices").locator("tbody tr").first().waitFor();
    await page.locator(".mtm-panel").first().scrollIntoViewIfNeeded();
    await snap(page, "list-used", loc);
    await go("?usage=unused");
    await page.getByTestId("mtm-devices").locator("tbody tr").first().waitFor();
    await page.locator(".mtm-panel").first().scrollIntoViewIfNeeded();
    await snap(page, "list-unused", loc);
    await go("/devices/7d2c3a10-0000-4000-8000-000000000001?date=2026-11-01");
    await page.locator(".mtm-chart__bar").first().waitFor();
    await snap(page, "detail", loc);
    await page.getByTestId("mtm-timeline").scrollIntoViewIfNeeded();
    await page.getByTestId("mtm-timeline").locator(".mtm-badge--btn").first().focus();
    await snap(page, "detail-timeline", loc);
    await go("/releases");
    await page.getByTestId("mtm-releases").waitFor();
    await snap(page, "releases", loc);
    await page.locator(".mtm-bar .btn--pri").click();
    const dlg = page.locator(".amodal__c");
    await dlg.locator("input.mtm-input[inputmode=numeric]").fill("20400");
    await dlg.locator("input.mtm-input:not([inputmode])").fill("2.4.0");
    await snap(page, "release-form", loc);
    await dlg.locator("button[type=submit]").click();
    await page.getByTestId("mtm-release-error").waitFor();
    await snap(page, "release-409", loc);
    await go("/reports");
    await page.getByTestId("mtm-reports").waitFor();
    await snap(page, "reports", loc);
    await page.locator(".mtm-send__form .btn--pri").click();
    await page.getByTestId("mtm-send-dialog").waitFor();
    await snap(page, "report-confirm", loc);
    await page.keyboard.press("Escape");
    await page.getByTestId("mtm-send-dialog").waitFor({ state: "hidden" });
    await page.getByTestId("mtm-reports").locator(".mtm-danger").first().click();
    await page.getByTestId("mtm-force1").waitFor();
    await snap(page, "report-force1", loc);
    await page.getByTestId("mtm-force-next").click();
    await page.getByTestId("mtm-force2").waitFor();
    await snap(page, "report-force2", loc);
    await page.close();

    for (const [name, opts, who] of [["empty", { empty: true }, ADMIN], ["error", { fail: true }, ADMIN], ["forbidden", { forbid: true }, NOT_PRIMARY]] as const) {
      const p = await fresh2(opts, who);
      await p.goto(`/${loc}/admin/mobile-testing`);
      await p.locator(".mtm-state").first().waitFor();
      await snap(p, name, loc);
      await p.close();
    }
  }
});
