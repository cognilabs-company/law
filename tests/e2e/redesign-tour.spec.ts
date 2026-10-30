import { expect, test, type Page } from "@playwright/test";
import { ADMIN, CALL_CENTER, mockBackend, signIn, type Who } from "./mock";
import { ORDER_ID, order } from "./fixtures";
import { OPERATOR, crmServer } from "./crmServer";

// A walk through every CRM page and every call-center tab and page against
// the mocked backend: each screen renders inside the admin shell, never
// spills past the screen, never shows a raw id or a missing translation.
// Screenshots: TOUR_SHOTS=<dir>; TOUR_WIDTHS=1440,1024,390 (default 1440,390).

const WIDTHS = (process.env.TOUR_WIDTHS ?? "1440,390").split(",").map(Number);
const SCHEMES = (process.env.TOUR_SCHEMES ?? "light,dark").split(",") as ("light" | "dark")[];
// TOUR_ONLY=cc-cockpit,crm-leads limits a run to those screens.
const ONLY = process.env.TOUR_ONLY ? process.env.TOUR_ONLY.split(",") : null;
const want = (name: string) => !ONLY || ONLY.includes(name);
test.describe.configure({ timeout: 1_800_000 });

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

async function check(page: Page, name: string, width: number, scheme: string) {
  await page.waitForTimeout(700);
  // Nothing sticks out past the screen, and the shell scrolls once.
  const over = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll(".pbody__in *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        // Inside a horizontal scroller (tab strips, tables, the kanban) is fine.
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return false;
          if (p.classList.contains("pbody")) break;
        }
        return r.right > vw + 1;
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    // The shell scrolls inside .pbody; the document itself never does.
    const tall = document.documentElement.scrollHeight > window.innerHeight + 1;
    return { wide, page: document.documentElement.scrollWidth > vw + 1, tall };
  });
  expect.soft(over.page, `${name} @${width}: the page scrolls sideways`).toBe(false);
  expect.soft(over.tall, `${name} @${width}: the document scrolls under the shell`).toBe(false);
  expect.soft(over.wide, `${name} @${width}: sticks out`).toEqual([]);
  const text = await page.locator(".pbody").innerText();
  expect.soft(text, `${name}: shows a raw id`).not.toMatch(UUID);
  if (process.env.TOUR_SHOTS) await page.screenshot({ path: `${process.env.TOUR_SHOTS}/${name}-${width}-${scheme}.png`, fullPage: false });
}

function watchIntl(page: Page) {
  const missing: string[] = [];
  page.on("console", (m) => {
    if (/MISSING_MESSAGE|INVALID_KEY|FORMATTING_ERROR/.test(m.text())) missing.push(m.text().slice(0, 200));
  });
  return missing;
}

const ALL_CRM = ["crm.calls.start", "crm.sms.manage", "crm.customers.view", "crm.customers.manage", "crm.customers.merge", "crm.leads.view", "crm.leads.manage", "crm.leads.claim", "crm.leads.assign", "crm.analytics.self", "crm.analytics.global", "crm.revenue.view", "crm.ai.use", "crm.exports.create", "crm.templates.manage", "crm.automation.manage", "crm.live_calls.view", "crm.sms.approve"];
const CRM_PAGES: [string, string][] = [
  ["crm-overview", "/ru/admin/crm"],
  ["crm-leads", "/ru/admin/crm/leads?tab=all"],
  ["crm-board", "/ru/admin/crm/leads?tab=all&view=board"],
  ["crm-lead", "/ru/admin/crm/leads/m1"],
  ["crm-customers", "/ru/admin/crm/customers"],
  ["crm-customer", "/ru/admin/crm/customers/c1"],
  ["crm-calls", "/ru/admin/crm/calls"],
  ["crm-sms", "/ru/admin/crm/sms"],
  ["crm-templates", "/ru/admin/crm/templates"],
  ["crm-analytics", "/ru/admin/crm/analytics"],
  ["crm-automation", "/ru/admin/crm/automation"],
  ["crm-live", "/ru/admin/crm/live"],
  ["crm-me", "/ru/admin/crm/me"],
  ["crm-exports", "/ru/admin/crm/exports"],
];

for (const scheme of SCHEMES)
  test(`every CRM page fits the admin shell (${scheme})`, async ({ browser }) => {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: width < 600 ? 844 : 900 }, locale: "ru-RU" });
      const page = await ctx.newPage();
      const missing = watchIntl(page);
      const { routes } = crmServer(ALL_CRM, true);
      await mockBackend(page, await signIn(page, ADMIN, routes as never));
      for (const [name, url] of CRM_PAGES) {
        if (!want(name)) continue;
        await page.goto(url);
        await expect(page.locator(".crm").first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(".pbody [aria-busy=true]")).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined);
        await check(page, name, width, scheme);
      }
      expect(missing).toEqual([]);
      await ctx.close();
    }
  });

// ── Call center ───────────────────────────────────────────────────────
const SELLER = { id: "u-adv", lexgo_id: "LGA-7K2Q", name: "Aziz Karimov", phone: "+998901112233", role: "advokat", account_status: "active" };
const CLIENT_P = { id: "u-c1", lexgo_id: "LGC-1", name: "Dilnoza Karimova", phone: "+998900000005" };
const ccRoutes = () => ({
  "/service-categories": [],
  "/call-center/marketplace/cockpit": {
    total_open: 9,
    queues: {
      assignments: { total: 1, items: [{ id: "x1", title: "Eskalatsiya", status: "open", payload: { client_user_id: "u-c1", reason: "contact_sla_breached", opened_at: ago(20) } }] },
      complaints: { total: 1, items: [{ id: "mc-1", work_id: "CMP-TPGNT", title: "Marketplace shikoyati · CMP-TPGNT · Shartnoma tahlili", owner: { id: "u-c1", name: "Dilnoza Karimova" }, status: "new", payload: { client_name: "Dilnoza Karimova", rating: 1, reason: "low_rating", priority: "high", work_id: "CMP-TPGNT" }, created_at: ago(95) }] },
      refunds: { total: 0, items: [] },
      payouts: { total: 2, items: [] },
      payout_recoveries: { total: 0, items: [] },
      experience: { total: 1, items: [] },
      achievements: { total: 0, items: [] },
    },
  },
  "/call-center/clients/u-c1": { client: { ...CLIENT_P, account_status: "active", created_at: "2026-09-01T08:00:00Z" }, summary: { orders_count: 3, cases_count: 1, payments_count: 2, total_spent: 410000, leads_count: 2, rooms_count: 1, complaints_count: 0, reviews_count: 1 }, orders: [order()], payments: [], leads: [], activities: [{ id: "ac1", action: "login", detail: "", created_at: ago(300) }], complaints: [], subscriptions: [], family_members: [] },
  "/call-center/clients/search": { items: [{ ...CLIENT_P, account_status: "active" }, { id: "u-c2", lexgo_id: "LGC-2", name: "Bobur Aliyev", phone: "+998901110022", account_status: "active" }] },
  "/call-center/queue": { items: [
    { id: "lq1", type: "lead", title: "Ijara shartnomasi", status: "new", score: "hot", urgency: "urgent", region: "tashkent_city", client_user_id: "u-c1", sla_minutes: 60, age_minutes: 75, sla_breached: true, created_at: ago(75) },
    { id: "lq2", type: "order", title: "order", status: "pending", score: "warm", urgency: "normal", region: "samarkand", client_user_id: "u-c1", sla_minutes: 60, age_minutes: 12, sla_breached: false, created_at: ago(12) },
  ] },
  "/call-center/urgent-advokat/requests": { items: [{ id: "ur1", work_id: "LGT-20261030-C3A5DD71", service_kind: "urgent_consultation", channel: "phone", status: "new", source: "web", region: "tashkent_city", need: "Hibsga olindi, zudlik bilan advokat kerak", directions: ["criminal"], lawyer_count: 1, client: { id: "u-c1", name: "Dilnoza Karimova", phone: "+998900000005" }, created_at: ago(6), lifecycle: { next_statuses: ["in_review", "cancelled"], active_statuses: ["new", "in_review"], final_statuses: ["completed", "cancelled"] } }] },
  "/call-center/urgent-advokat/candidates": { items: [] },
  "/call-center/marketplace/assignment-escalations": { items: [{ id: "esc-1", status: "open", order_id: ORDER_ID, order: order({ status: "sent_to_seller", service_title: "Ajrashish bo'yicha maslahat", client_name: "Dilnoza Karimova" }), reason: "seller_declined", previous_seller_user_id: "s-1", previous_seller_name: "Avvalgi Advokat", history: [], assignment_history: [], resolution: { offer: null, refund: null, can_choose: false }, actions: ["offer_resolution", "reassign", "message", "cancel", "full_refund"], created_at: ago(40) }], total: 1 },
  "/call-center/quality-complaints": { items: [{ id: "qc1", work_id: "DOC-4F2", status: "new", title: "Da'vo arizasi", client: { name: "Dilnoza Karimova" }, lawyer: { name: "Aziz Karimov" }, rating: 2, complaint: "Hujjat kech topshirildi va xatolar bor.", created_at: ago(180) }], count: 1, statuses: ["new", "under_review", "rework_required", "rejected", "resolved"] },
  "/call-center/marketplace/complaints": { items: [{ id: "mc-1", status: "new", reason: "Natija to'liq emas", rating: 1, order: { id: "o-1", work_id: "ADV-1", status: "completed", payment_status: "paid", price: 500000, currency: "UZS" }, client: CLIENT_P, seller: SELLER, evidence: [], settlement: { status: "complaint_hold", gross_amount: 500000, held_amount: 500000, refunded_amount: 0, pending_refund_amount: 0, currency: "UZS" }, allowed_actions: ["valid_rework", "partial_refund", "full_refund", "invalid", "resolved"], created_at: ago(260) }], total: 1, has_more: false },
  "/call-center/marketplace/warranty": { items: [{ id: "w-1", status: "new", kind: "no_response", reason: "Ikki kundan beri javob yo'q", allow_material_transfer: true, order: { id: "o-2", work_id: "ADV-2", status: "in_progress", price: 300000, currency: "UZS", service_id: "svc-1" }, client: CLIENT_P, seller: SELLER, available_resolutions: ["replacement", "full_refund"], created_at: ago(500) }], total: 1, has_more: false },
  "/call-center/marketplace/cancellation-reviews": { items: [{ id: "rev-1", order_id: "ord-1", status: "open", reason: "Mutaxassis javob bermayapti", work_id: "MP-77", service_title: "Meros ulushi", client_name: "Dilnoza Karimova", seller_name: "Aziz Karimov", created_at: ago(70) }], count: 1, total: 1 },
  "/call-center/marketplace/experience": { items: [{ id: "e9", root_id: "r1", status: "pending_review", version: 2, experience_kind: "category_experience", workplace: "Toshkent advokatlar hay'ati", positions: [{ title: "Advokat", started_at: "2019-01-01T00:00:00Z", ended_at: null, is_current: true }], description: "Meros ishlari", seller: SELLER, submitted_at: ago(1440) }], total: 1 },
  "/call-center/marketplace/achievements": { items: [{ id: "a2", status: "pending_review", title: "Yilning eng yaxshi advokati", seller: SELLER, submitted_at: ago(2000) }], total: 1 },
  "/call-center/marketplace/advocate-licenses": { items: [{ id: "lv1", status: "pending_review", version: 2, holder_name: "Aliyev Vali", certificate_number: "ADV-12346", issuing_authority: "Adliya vazirligi", advocate_status_started_at: "2020-05-12", submitted_at: ago(900), seller: SELLER }], total: 1, has_more: false },
  "/call-center/marketplace/payouts": { items: [
    { id: "po-1", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Ajrashish bo'yicha maslahat", seller: SELLER, stage: "acceptance", status: "operator_required", gross_percent: 30, gross_amount: 33000, commission_amount: 0, payable_amount: 33000, currency: "UZS", seller_user_id: "u-adv", mode: "operator_managed", created_at: ago(300) },
    { id: "po-3", order_id: ORDER_ID, work_id: "ADV-7Q2", service_title: "Ajrashish bo'yicha maslahat", seller: SELLER, stage: "completion", status: "provider_pending", gross_percent: 40, gross_amount: 44000, commission_amount: 19800, payable_amount: 24200, currency: "UZS", seller_user_id: "u-adv", mode: "automatic_provider_payout", created_at: ago(200) },
  ], total: 2, has_more: false },
  "/call-center/marketplace/payout-recoveries": { items: [], total: 0, has_more: false },
  "/call-center/leads/kanban": { columns: [] },
  "/call-center/calls": { items: [
    { id: "cl1", record_type: "incoming", title: "+998900000005", status: "completed", created_at: ago(30), owner_user_id: "u-cc", payload: { phone: "+998900000005", client_user_id: "u-c1", topic: "Buyurtma holati", result: "Javob berildi", duration_sec: 185 } },
    { id: "cl2", record_type: "outgoing", title: "+998901110022", status: "no_answer", created_at: ago(90), owner_user_id: "u-cc", payload: { phone: "+998901110022", topic: "Qayta qo'ng'iroq", duration_sec: 0 } },
  ] },
  "/call-center/support/tickets": { items: [
    { id: "t1", work_id: "SUP-1042", subject: "To'lov o'tmadi", status: "waiting_operator", category: "payment", priority: "high", last_message: "Kartadan pul yechildi, buyurtma ochilmadi", last_message_at: ago(8), client: { id: "u-c1", name: "Dilnoza Karimova", lexgo_id: "LGC-1" }, unread_count: 2, created_at: ago(15) },
    { id: "t2", work_id: "SUP-1039", subject: "Advokat bilan bog'lanish", status: "in_progress", category: "general", priority: "normal", last_message: "Rahmat, kutaman", last_message_at: ago(60), client: { id: "u-c2", name: "Bobur Aliyev" }, assigned_operator: { id: "u-cc", name: "Test Operator" }, created_at: ago(120) },
  ], total: 2 },
  "/support/meta": { categories: [{ key: "payment", label: "To'lov" }, { key: "general", label: "Umumiy" }], priorities: [{ key: "high", label: "Yuqori" }, { key: "normal", label: "Oddiy" }], statuses: ["waiting_operator", "in_progress", "closed"] },
  "/support/tickets/t1": { id: "t1", work_id: "SUP-1042", subject: "To'lov o'tmadi", status: "waiting_operator", category: "payment", priority: "high", client: { id: "u-c1", name: "Dilnoza Karimova", lexgo_id: "LGC-1" }, created_at: ago(15) },
  "/support/tickets/t1/messages": { items: [
    { id: "m1", ticket_id: "t1", sender_role: "client", sender: { id: "u-c1", name: "Dilnoza Karimova" }, content: "Kartadan pul yechildi, buyurtma ochilmadi", created_at: ago(15) },
  ], total: 1 },
  "/call-center/marketplace/experience/e9": { record: { id: "e9", root_id: "r1", status: "pending_review", version: 2, experience_kind: "category_experience", workplace: "Toshkent advokatlar hay'ati", positions: [{ title: "Advokat", started_at: "2019-01-01T00:00:00Z", ended_at: null, is_current: true }], description: "Meros ishlari bo'yicha 25 ta ish", evidence: [{ id: "ev1", file_name: "buyruq.pdf" }], submitted_at: ago(1440) }, reviews: [], seller: SELLER, checklist: [{ key: "identity_license", label: "Shaxs va litsenziya", label_i18n: { ru: "Личность и лицензия" } }], diff: [] },
});

const CC_TABS = ["cockpit", "queue", "urgent", "escalations", "complaints", "mpComplaints", "warranty", "cancellations", "experience", "achievements", "licenses", "payouts", "leads", "clients"];
const CC_OPERATOR: Who = { ...CALL_CENTER, permissions: [...(CALL_CENTER.permissions ?? []), ...OPERATOR.permissions!.filter((p) => !CALL_CENTER.permissions!.includes(p))] };

for (const scheme of SCHEMES)
  test(`every call-center tab and page fits the admin shell (${scheme})`, async ({ browser }) => {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: width < 600 ? 844 : 900 }, locale: "ru-RU" });
      const page = await ctx.newPage();
      const missing = watchIntl(page);
      const { routes: crm } = crmServer(OPERATOR.permissions!, false);
      await mockBackend(page, await signIn(page, CC_OPERATOR, { ...(crm as object), ...ccRoutes() } as never));
      for (const tab of CC_TABS) {
        if (!want(`cc-${tab}`)) continue;
        await page.goto(`/ru/admin/call-center?tab=${tab}`);
        await expect(page.locator(`#ccon-panel-${tab}`)).toBeVisible({ timeout: 30_000 });
        await check(page, `cc-${tab}`, width, scheme);
      }
      // The client 360 card, from a search.
      if (want("cc-client360")) {
        await page.goto("/ru/admin/call-center?tab=clients");
        const search = page.locator("#ccon-panel-clients").getByRole("searchbox").first();
        await search.fill("Dilnoza", { timeout: 20_000 });
        await search.press("Enter");
        await page.locator("#ccon-panel-clients").getByRole("button", { name: /Dilnoza Karimova/ }).first().click();
        await check(page, "cc-client360", width, scheme);
      }
      for (const [name, url] of [["cc-support", "/ru/admin/call-center/support"], ["cc-support-ticket", "/ru/admin/call-center/support/t1"], ["cc-experience-page", "/ru/admin/call-center/experience/e9"]]) {
        if (!want(name)) continue;
        await page.goto(url);
        await expect(page.locator(".pbody__in > *").first()).toBeVisible({ timeout: 30_000 });
        await check(page, name, width, scheme);
      }
      expect(missing).toEqual([]);
      await ctx.close();
    }
  });
