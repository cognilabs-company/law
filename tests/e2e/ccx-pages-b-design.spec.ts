import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";
import { OPERATOR, ROP_PERMS, crmServer } from "./crmServer";

// Call-center «CRM», «Qo'llab-quvvatlash» and «Uchrashuvlar» views, against
// mocked data: each page and its key detail render, name people (never ids)
// and never overflow sideways. SHOTS=before|after also saves light/dark
// screenshots at 1440 and 390 px into /tmp/lexgo-ccx-pages/b/shots for the
// owner's review.

const SHOTS = process.env.SHOTS ?? "";
const DIR = "/tmp/lexgo-ccx-pages/b/shots";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const TID = "9d2f4c1e-aaaa-4bbb-8ccc-000000000001";
const TICKETS = [
  { id: TID, work_id: "SUP-1042", subject: "To'lov o'tmadi", status: "in_progress", category: "payment", priority: "high", last_message: "Kartadan pul yechildi, lekin obuna faollashmadi", last_message_at: ago(8), client: { id: "u-c1", name: "Dilnoza Karimova", lexgo_id: "LGC-1" }, assigned_operator_user_id: CALL_CENTER.id, assigned_operator_name: CALL_CENTER.name, unread_count: 2, created_at: ago(45) },
  { id: "9d2f4c1e-aaaa-4bbb-8ccc-000000000002", work_id: "SUP-1043", subject: "Advokat javob bermayapti", status: "in_progress", category: "general", priority: "normal", last_message: "Ikki kundan beri kutyapman", last_message_at: ago(30), client: { id: "u-c2", name: "Jasur Tursunov", lexgo_id: "LGC-2" }, assigned_operator_user_id: CALL_CENTER.id, assigned_operator_name: CALL_CENTER.name, unread_count: 0, created_at: ago(120) },
  { id: "9d2f4c1e-aaaa-4bbb-8ccc-000000000003", work_id: "SUP-1044", subject: "Hujjat yuklanmayapti", status: "in_progress", category: "technical", priority: "low", last_message: "Fayl hajmi katta deyapti", last_message_at: ago(200), client: { id: "u-c3", name: "Malika Rahimova", lexgo_id: "LGC-3" }, assigned_operator_user_id: CALL_CENTER.id, assigned_operator_name: CALL_CENTER.name, unread_count: 0, created_at: ago(260) },
];
const MESSAGES = [
  { id: "m1", ticket_id: TID, sender_user_id: "u-c1", sender_role: "client", sender_name: "Dilnoza Karimova", content: "Assalomu alaykum! Kartadan pul yechildi, lekin obuna faollashmadi.", created_at: ago(40) },
  { id: "m2", ticket_id: TID, sender_user_id: CALL_CENTER.id, sender_role: "call_center", sender_name: CALL_CENTER.name, content: "Va alaykum assalom! Tekshirib ko'ryapman, bir daqiqa.", created_at: ago(35) },
  { id: "m3", ticket_id: TID, sender_user_id: "u-c1", sender_role: "client", sender_name: "Dilnoza Karimova", content: "Rahmat, kutaman.", created_at: ago(8) },
];
const META = { categories: [{ key: "payment", label: "To'lov" }, { key: "general", label: "Umumiy" }, { key: "technical", label: "Texnik" }], priorities: [{ key: "high", label: "Yuqori" }, { key: "normal", label: "Oddiy" }, { key: "low", label: "Past" }], statuses: ["waiting_operator", "in_progress", "reopened", "closed"] };

const INVITED = [
  { room_id: "r1", call_id: "c-live", call_type: "video", title: "Ijara shartnomasi bo'yicha maslahat", caller_name: "Dilnoza Karimova", caller_user_id: "u-c1", status: "active", call_status: "active", started_at: ago(12), auto_end_at: ahead(48), participant_count: 3 },
  { room_id: "r2", call_id: "c-sched", call_type: "audio", title: "Meros masalasi", caller_name: "Jasur Tursunov", caller_user_id: "u-c2", status: "scheduled", call_status: "scheduled", started_at: ahead(90), participant_count: 2 },
  { room_id: "r3", call_id: "c-past", call_type: "video", title: "Mehnat nizosi", caller_name: "Malika Rahimova", caller_user_id: "u-c3", status: "ended", call_status: "ended", started_at: ago(60 * 5), ended_at: ago(60 * 5 - 25), duration_seconds: 1500, participant_count: 2 },
];
const ADMIN_CALLS = [
  { id: "ac-1", work_id: "CALL-7Q2M", status: "active", title: "Ijara shartnomasi bo'yicha maslahat", call_type: "video", room_id: "r1", creator_user_id: "u-c1", creator_name: "Dilnoza Karimova", participant_count: 3, duration_seconds: 720, started_at: ago(12), created_at: ago(14) },
  { id: "ac-2", work_id: "CALL-8K1P", status: "ended", title: "Mehnat nizosi", call_type: "video", room_id: "r3", creator_user_id: "u-c3", creator_name: "Malika Rahimova", participant_count: 2, duration_seconds: 1500, started_at: ago(300), ended_at: ago(275), created_at: ago(302) },
  { id: "ac-3", work_id: "CALL-3B9X", status: "missed", title: "Aliment undirish", call_type: "audio", room_id: "r4", creator_user_id: "u-c4", creator_name: "Sardor Aliyev", participant_count: 1, duration_seconds: 0, started_at: ago(400), created_at: ago(400) },
];
const CALL_DETAIL = {
  call: ADMIN_CALLS[0],
  room: { id: "r1", title: "Ijara shartnomasi bo'yicha maslahat" },
  creator: { id: "u-c1", name: "Dilnoza Karimova", phone: "+998901234567" },
  duration_seconds: 720,
  duration_minutes: 12,
  participants: [
    { user_id: "u-c1", name: "Dilnoza Karimova", role: "client", status: "joined", mic_enabled: true, camera_enabled: true },
    { user_id: "u-l2", name: "Fuqarolik Yurist", role: "lawyer", status: "joined", mic_enabled: true, camera_enabled: false },
    { user_id: "u-cc", name: "Test Operator", role: "call_center", status: "invited" },
  ],
};

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((th) => {
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: th, bg: "night", motion: true, keys: true }));
  }, t);
}

async function snap(page: Page, view: string, t: string, w: number) {
  if (!SHOTS) return;
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,[data-sonner-toaster],nextjs-portal,.cpl-launch,.fab{display:none!important}" }).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${SHOTS}-${view}-${w}-${t}.png` });
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function settle(page: Page) {
  await expect(page.locator(".opx-intro")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".opx-top")).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // Let the shell and the page's entrance animations finish.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 8_000 }).catch(() => undefined);
}

async function crm(page: Page) {
  const perms = [...new Set([...(OPERATOR.permissions ?? []), ...ROP_PERMS.filter((p) => p.startsWith("crm."))])];
  const { routes } = crmServer(perms);
  await mockBackend(page, await signIn(page, { ...OPERATOR, permissions: perms }, routes as never));
}

async function support(page: Page) {
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/call-center/support/tickets": { items: TICKETS, total: TICKETS.length },
      "/call-center/support/operators": { items: [{ id: "u-op2", name: "Akmal Operator", lexgo_id: "LGCC-2", role: "call_center", account_status: "active" }] },
      "/support/meta": META,
      [`/support/tickets/${TID}/messages`]: { items: MESSAGES, total: MESSAGES.length },
      [`/support/tickets/${TID}`]: TICKETS[0],
    } as never),
  );
}

async function meetings(page: Page) {
  await mockBackend(
    page,
    await signIn(page, CALL_CENTER, {
      "/calls/invited": { items: INVITED },
      "/admin/calls": { items: ADMIN_CALLS },
      "/admin/calls/ac-1": CALL_DETAIL,
    } as never),
  );
}

const CASES: { t: "dark" | "light"; w: number }[] = [
  { t: "dark", w: 1440 },
  { t: "light", w: 1440 },
  { t: "dark", w: 390 },
];

const SECTIONS = ["overview", "leads", "customers", "calls", "performance", "templates", "sms"] as const;

for (const { t, w } of CASES) {
  test(`CRM ${t} ${w}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await crm(page);
    for (const s of SECTIONS) {
      await page.goto(`/uz/admin/call-center?view=crm&s=${s}`);
      await expect(page).toHaveURL(/view=crm/);
      await expect(page.getByRole("navigation", { name: /CRM/ }).first()).toBeVisible();
      await settle(page);
      await expect(page.locator("main [aria-busy='true'], main .opx-shim")).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator("main h1, main h2, main h3, main [role='tablist']").first()).toBeVisible();
      await noOverflow(page);
      await snap(page, `crm-${s}`, t, w);
    }
    await page.goto("/uz/admin/call-center?view=crm&s=leads&lead=m1");
    await expect(page.getByText("Dilnoza Karimova").first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "crm-lead", t, w);
    await page.goto("/uz/admin/call-center?view=crm&s=customers&customer=c1");
    await expect(page.getByText("Dilnoza Karimova").first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "crm-customer", t, w);
  });

  test(`Support ${t} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await support(page);
    await page.goto("/uz/admin/call-center?view=support");
    const item = page.locator(".opx-sx-item").filter({ hasText: "Dilnoza Karimova" }).first();
    await expect(item).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "support", t, w);
    await item.click();
    await expect(page.getByText("Rahmat, kutaman.").first()).toBeVisible();
    await noOverflow(page);
    await snap(page, "support-chat", t, w);
    await expect(page.getByText(TID)).toHaveCount(0);
  });

  test(`Meetings ${t} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await meetings(page);
    await page.goto("/uz/admin/call-center?view=meetings");
    await expect(page.locator(".opx-mtg")).toBeVisible();
    await expect(page.getByText("Ijara shartnomasi bo'yicha maslahat").first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "meetings", t, w);
    await page.locator(".opx-mtg-cta").click();
    await page.waitForTimeout(500);
    await noOverflow(page);
    await snap(page, "meetings-new", t, w);
    await page.goto("/uz/admin/call-center?view=meetings");
    await settle(page);
    const all = page.getByRole("tab").last();
    await all.click();
    await expect(page.getByText("Sardor Aliyev").first()).toBeVisible();
    await noOverflow(page);
    await snap(page, "meetings-all", t, w);
    await page.locator(".opx-mtg-row").filter({ hasText: "Dilnoza Karimova" }).first().click();
    await expect(page.getByText("Fuqarolik Yurist").first()).toBeVisible();
    await snap(page, "meetings-detail", t, w);
    await expect(page.getByText("ac-1", { exact: true })).toHaveCount(0);
  });
}
