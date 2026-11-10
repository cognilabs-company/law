import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn } from "./mock";

// Call-center «Jamoa vazifalari», «Tahlil» and «Profil» views, against
// mocked data: each page and its key detail render, name people (never ids)
// and never overflow sideways. SHOTS=before|after also saves light/dark
// screenshots at 1440 and 390 px into /tmp/lexgo-ccx-pages/c/shots for the
// owner's review.

const SHOTS = process.env.SHOTS ?? "";
const DIR = "/tmp/lexgo-ccx-pages/c/shots";
if (SHOTS) mkdirSync(DIR, { recursive: true });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const P = {
  me: { id: CALL_CENTER.id, name: CALL_CENTER.name, lexgo_id: "LGCC-1", role: "call_center" },
  akmal: { id: "u-op2", name: "Akmal Operator", lexgo_id: "LGCC-2", role: "call_center" },
  nodira: { id: "u-op3", name: "Nodira Yusupova", lexgo_id: "LGCC-3", role: "call_center" },
  rop: { id: "u-rop", name: "Sevara Rahimova", lexgo_id: "LGA-4", role: "admin" },
};
const ACTIONS = { can_edit: true, can_assign: true, can_delete: true, can_change_status: true, is_assigned: true };
const TID = "7c1e2b3a-aaaa-4bbb-8ccc-000000000001";
const task = (n: number, status: string, title: string, desc: string, deadline: string, who: (typeof P)[keyof typeof P][], next: string[], extra: Record<string, unknown> = {}) => ({
  id: n === 1 ? TID : `7c1e2b3a-aaaa-4bbb-8ccc-00000000000${n}`,
  task_code: `TSK-10${n}4`,
  title,
  description: desc,
  status,
  deadline_at: deadline,
  is_overdue: new Date(deadline).getTime() < Date.now() && status !== "ready",
  lock_version: 2,
  creator: P.rop,
  assignees: who.map((p) => ({ ...p, assigned_at: ago(600) })),
  attachment_count: 0,
  actions: { ...ACTIONS, next_statuses: next },
  created_at: ago(60 * 26),
  updated_at: ago(40),
  ...extra,
});
const ATT = [
  { id: "a1", file_name: "shartnoma-namuna.pdf", mime_type: "application/pdf", size_bytes: 248_000, kind: "document", preview_supported: false, download_url: "/task-management/x/attachments/a1/download", uploader: P.rop, created_at: ago(300) },
  { id: "a2", file_name: "skrinshot.png", mime_type: "image/png", size_bytes: 92_000, kind: "image", preview_supported: false, download_url: "/task-management/x/attachments/a2/download", uploader: P.akmal, created_at: ago(200) },
];
const HISTORY = [
  { id: "h1", event_type: "created", actor: P.rop, created_at: ago(60 * 26) },
  { id: "h2", event_type: "status_changed", from_status: "new", to_status: "in_progress", actor: P.me, comment: "Boshladim", created_at: ago(60 * 5) },
];
const TASKS = [
  task(1, "in_progress", "Mijozlar bazasini tozalash", "Takroriy yozuvlarni birlashtirish va telefon raqamlarini tekshirish.", ahead(60 * 20), [P.me, P.akmal], ["testing"], { attachment_count: 2, attachments: ATT, history: HISTORY }),
  task(2, "new", "Yangi skript bo'yicha o'qitish", "Operatorlar uchun qo'ng'iroq skriptini o'rganib chiqish.", ahead(60 * 48), [P.nodira], ["in_progress"]),
  task(3, "new", "Shoshilinch so'rovlar hisoboti", "Haftalik hisobotni tayyorlash.", ago(60 * 3), [P.me], ["in_progress"]),
  task(4, "testing", "CRM shablonlarini yangilash", "SMS shablonlaridagi xatolarni tuzatish.", ahead(60 * 6), [P.akmal], ["ready", "in_progress"]),
  task(5, "ready", "Qo'ng'iroqlar navbatini sozlash", "Navbat qoidalarini tekshirish.", ago(60 * 30), [P.me, P.nodira], [], { ready_by: P.rop, ready_at: ago(60 * 2) }),
];
const TASK_ROUTES = {
  "/task-management/meta": {
    statuses: [
      { value: "new", label: "Yangi", order: 1 },
      { value: "in_progress", label: "Jarayonda", order: 2 },
      { value: "testing", label: "Tekshiruvda", order: 3 },
      { value: "ready", label: "Tayyor", order: 4 },
    ],
    capabilities: { create: true, assign: true, approve_ready: true, delete_ready: true },
  },
  "/task-management/stats": { period_tasks: { total_created: 2, ready_in_period: 1 }, current_snapshot: { total: 5, active_total: 4, ready_total: 1, overdue_total: 1, unassigned_total: 0, by_status: { new: 2, in_progress: 1, testing: 1, ready: 1 } } },
  "/task-management/users": { items: [P.me, P.akmal, P.nodira, P.rop] },
  // Each board column asks for its own status.
  "/task-management": (_: unknown, url: URL) => {
    const st = url.searchParams.get("status");
    const items = st ? TASKS.filter((x) => x.status === st) : TASKS;
    return { items, total: items.length, status_counts: { new: 2, in_progress: 1, testing: 1, ready: 1 }, has_more: false };
  },
  [`/task-management/${TID}`]: TASKS[0],
  [`/task-management/${TID}/history`]: { items: HISTORY },
};

const PROFILE_ROUTES = {
  "/clients/me": { id: CALL_CENTER.id, name: CALL_CENTER.name, phone: CALL_CENTER.phone, email: "operator@lexgo.uz" },
  "/call-center/calls": { items: [] },
};

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((th) => {
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: th, bg: "night", motion: true, keys: true }));
    localStorage.setItem("lexgo_demo_stats", "1");
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

async function noIds(page: Page) {
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(text).not.toMatch(/\bin_progress\b|\bu-op\d\b|\bu-cc\b/);
}

async function settle(page: Page) {
  await expect(page.locator(".opx-intro")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".opx-top")).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 8_000 }).catch(() => undefined);
}

const CASES: { t: "dark" | "light"; w: number }[] = [
  { t: "dark", w: 1440 },
  { t: "light", w: 1440 },
  { t: "dark", w: 390 },
];

for (const { t, w } of CASES) {
  test(`Team tasks ${t} ${w}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await mockBackend(page, await signIn(page, CALL_CENTER, TASK_ROUTES as never));
    await page.goto("/uz/admin/call-center?view=tasks");
    await expect(page.locator(".opx-tk")).toBeVisible();
    await expect(page.getByText("Mijozlar bazasini tozalash").first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await noIds(page);
    await snap(page, "tasks", t, w);
    // Handmade date fields only (owner law): no native date/time control.
    if (SHOTS !== "before") await expect(page.locator("input[type=date], input[type=time]")).toHaveCount(0);

    await page.goto(`/uz/admin/call-center?view=tasks&task=${TID}`);
    await expect(page.getByText("shartnoma-namuna.pdf").first()).toBeVisible();
    await expect(page.getByText("Akmal Operator").first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "tasks-drawer", t, w);

    await page.goto("/uz/admin/call-center?view=tasks");
    await settle(page);
    await page.locator(".opx-tk-head .opx-tk-new, .opx-tk-head__tools .opx-pbtn--main").first().click();
    const sheet = page.locator(".opx-sheet__panel");
    await expect(sheet).toBeVisible();
    if (SHOTS !== "before") await expect(sheet.locator("input[type=date], input[type=time]")).toHaveCount(0);
    await settle(page);
    await noOverflow(page);
    await snap(page, "tasks-sheet", t, w);
    if (SHOTS !== "before") {
      // The deadline date opens the handmade calendar; a picked day shows.
      // (Next's dev-only overlay badge would sit over the bottom-left day.)
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await sheet.locator(".opx-tk-pick[data-kind='date'] .mpick__btn").click();
      const pop = page.locator(".mpick__pop");
      await expect(pop).toBeVisible();
      await snap(page, "tasks-datepick", t, w);
      await pop.locator(".dpick__d:not(:disabled)").last().click();
      await expect(sheet.locator(".opx-tk-pick[data-kind='date']")).not.toHaveAttribute("data-empty", "");
    }
  });

  test(`Analytics ${t} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await mockBackend(page, await signIn(page, CALL_CENTER, {} as never));
    await page.goto("/uz/admin/call-center?view=analytics");
    await expect(page.locator(".opx-an-tile").first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await noIds(page);
    await snap(page, "analytics", t, w);
    await page.locator(".opx-an-seg button").last().click();
    await expect(page.locator(".opx-an-dates .opx-tk-pick")).toHaveCount(2);
    if (SHOTS !== "before") await expect(page.locator("input[type=date], input[type=time]")).toHaveCount(0);
    await page.locator(".opx-an-seg button").first().click();
    await page.locator(".opx-an-tile").first().click();
    await expect(page.locator(".opx-sheet__panel")).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await snap(page, "analytics-drill", t, w);
  });

  test(`Profile ${t} ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await theme(page, t);
    await mockBackend(page, await signIn(page, CALL_CENTER, PROFILE_ROUTES as never));
    await page.goto("/uz/admin/call-center?view=profile");
    await expect(page.locator(".opx-pf")).toBeVisible();
    await expect(page.locator(".opx-pf").getByText(CALL_CENTER.name).first()).toBeVisible();
    await settle(page);
    await noOverflow(page);
    await noIds(page);
    await snap(page, "profile", t, w);
    await page.locator(".opx-pf-card").nth(1).scrollIntoViewIfNeeded();
    await settle(page);
    await snap(page, "profile-prefs", t, w);
  });
}
