import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { CALL_CENTER, mockBackend, signIn, type Routes, type Who } from "./mock";
import { ORDER_ID, order } from "./fixtures";
import { ROP, crmServer } from "./crmServer";
import { mocksFor } from "./design1920/data";

// Screenshots of each restricted role's main screens (full page), for the
// before/after comparison of the "hide every action the account has no
// permission for" audit (2026-11-08). playwright.config.ts skips it in the
// normal suite; run it with a config that spreads that one and lifts
// testIgnore, e.g. SHOTS_DIR=/tmp/lexgo-perms/after npx playwright test -c <that config> permissions-shots.
// Every role gets mocks with rows, so the screens show their actions, not
// just empty states. File names: <role>-<screen>.png.
const OUT = process.env.SHOTS_DIR || "/tmp/lexgo-perms/after";
test.describe.configure({ timeout: 600_000 });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

// ── Call-center data (as in redesign-tour.spec.ts) ──
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


const ORG_BOARD = {
  roots: [
    {
      id: "unit:u1",
      entity_id: "u1",
      type: "department",
      name: "Yuridik bo'lim",
      code: "YUR",
      head: { display_name: "Aziz Rahimov" },
      people: [
        { id: "employee:e1", entity_id: "e1", type: "employee", name: "Aziz Rahimov", position_name: "Bo'lim boshlig'i", employee_code: "EMP-001" },
        { id: "employee:e2", entity_id: "e2", type: "employee", name: "Malika Yusupova", position_name: "Yurist", employee_code: "EMP-002" },
      ],
      children: [
        { id: "unit:u2", entity_id: "u2", type: "department", name: "Shartnomalar guruhi", code: "SHG", people: [{ id: "employee:e3", entity_id: "e3", type: "employee", name: "Bobur Aliyev", position_name: "Yurist", employee_code: "EMP-003" }], children: [] },
        { id: "unit:u3", entity_id: "u3", type: "department", name: "Sud ishlari", code: "SUD", people: [{ id: "employee:e4", entity_id: "e4", type: "employee", name: "Nodira Karimova", position_name: "Advokat", employee_code: "EMP-004" }], children: [] },
      ],
    },
    { id: "unit:u4", entity_id: "u4", type: "department", name: "Moliya bo'limi", code: "MOL", people: [{ id: "employee:e5", entity_id: "e5", type: "employee", name: "Sardor Toshmatov", position_name: "Buxgalter", employee_code: "EMP-005" }], children: [] },
  ],
};
const POSITIONS = { items: [{ id: "p1", title: "Yurist", code: "YUR", status: "active" }, { id: "p2", title: "Buxgalter", code: "BUX", status: "active" }], total: 2 };
const SELLER_REQUESTS = {
  items: [
    { id: "rr1", status: "pending", role: "advokat", name: "Jasur Qodirov", phone: "+998901234501", created_at: ago(120) },
    { id: "rr2", status: "pending", role: "yurist", name: "Gulnora Rasulova", phone: "+998901234502", created_at: ago(600) },
    { id: "rr3", status: "pending", role: "advokat_tashkiloti", name: "Adolat Advokatlik byurosi", phone: "+998901234503", created_at: ago(1500) },
  ],
  stats: { total: 3, advokat: 1, yurist: 1, advokat_tashkiloti: 1, pending: 3, approved: 0, rejected: 0 },
};

const AUDIT = [
  { id: "au1", action: "user.role_assigned", detail: "Operator roli berildi", title_uz: "Rol berildi", description_uz: "Bobur Aliyevga operator roli berildi", actor: { id: "u-ua", name: "Kamola Nazarova" }, ip: "10.0.0.4", created_at: ago(30) },
  { id: "au2", action: "register_request.approved", detail: "Ariza tasdiqlandi", title_uz: "Ariza tasdiqlandi", description_uz: "Gulnora Rasulova arizasi tasdiqlandi", actor: { id: "u-ua", name: "Kamola Nazarova" }, ip: "10.0.0.4", created_at: ago(200) },
  { id: "au3", action: "auth.login", detail: "Tizimga kirdi", title_uz: "Tizimga kirish", description_uz: "Kamola Nazarova tizimga kirdi", actor: { id: "u-ua", name: "Kamola Nazarova" }, ip: "10.0.0.4", created_at: ago(400) },
];
const UNIT_U1 = {
  id: "u1",
  name: "Yuridik bo'lim",
  code: "YUR",
  people: [
    { employee: { id: "e1", display_name: "Aziz Rahimov", employee_code: "EMP-001", employment_status: "active" }, assignment: { position_id: "p1" } },
    { employee: { id: "e2", display_name: "Malika Yusupova", employee_code: "EMP-002", employment_status: "active" }, assignment: { position_id: "p1" } },
  ],
  children: [{ id: "u2", name: "Shartnomalar guruhi" }, { id: "u3", name: "Sud ishlari" }],
  stats: { people_count: 2, position_count: 1, children_count: 2 },
};

// The app shells scroll an inner column, not the window: let every tall
// scroller grow to its content so a full-page capture shows the whole screen.
async function unclip(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of [document.documentElement, document.body]) {
      el.style.height = "auto";
      el.style.overflow = "visible";
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 4 || el.clientHeight < 300) continue;
      if (el.closest("[role=dialog],[role=listbox],table")) continue;
      el.style.overflowY = "visible";
      el.style.maxHeight = "none";
      el.style.height = "auto";
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.position === "fixed" || ps.position === "sticky") break;
        p.style.height = "auto";
        p.style.maxHeight = "none";
        if (ps.overflowY !== "visible") p.style.overflowY = "visible";
      }
    }
  });
  await page.waitForTimeout(300);
}

type Screen = [name: string, url: string, ready?: (p: Page) => Promise<unknown>];
type RoleShots = { key: string; who: Who; routes: () => Routes; screens: Screen[] };

const ROLES: RoleShots[] = [
  {
    // Call-center operator holding only callcenter.access: no CRM codes, no
    // review or orders codes.
    key: "operator",
    who: { ...CALL_CENTER, permissions: ["callcenter.access"] },
    routes: () => ({ ...(crmServer([]).routes as Routes), ...ccRoutes() }),
    screens: [
      ["now", "/uz/admin/call-center"],
      ["queues", "/uz/admin/call-center?view=queues"],
      ["crm", "/uz/admin/call-center?view=crm"],
      ["clients", "/uz/admin/call-center?view=clients"],
      ["support", "/uz/admin/call-center/support"],
    ],
  },
  {
    // A limited admin: users.manage only.
    key: "users-admin",
    who: { id: "u-ua", name: "Kamola Nazarova", phone: "+998900000061", role: "client", backendRole: "moderator", roles: ["moderator"], permissions: ["users.manage"] },
    routes: () => ({ "/admin/seller-requests": SELLER_REQUESTS, "/admin/register-requests": { items: SELLER_REQUESTS.items }, "/admin/audit-trail": { items: AUDIT } }),
    screens: [
      ["home", "/uz/admin"],
      ["register-requests", "/uz/admin/register-requests", (p) => p.getByText("Jasur Qodirov").first().waitFor()],
      ["audit-trail", "/uz/admin/audit-trail"],
    ],
  },
  {
    // Sales head (ROP) holding crm.leads.view only.
    key: "rop-view",
    who: { ...ROP, permissions: ["sales.access", "crm.leads.view"] },
    routes: () => crmServer(["crm.leads.view"]).routes as Routes,
    screens: [
      ["overview", "/uz/admin/crm"],
      ["leads", "/uz/admin/crm/leads?tab=all", (p) => p.locator(".crm-table tbody tr").first().waitFor()],
      ["kanban", "/uz/admin/crm/kanban?tab=all", (p) => p.locator(".crm-col").first().waitFor()],
      ["lead", "/uz/admin/crm/leads/m1", (p) => p.locator(".crm-glance").waitFor()],
    ],
  },
  {
    // Internal employee who manages the org chart but not HR records.
    key: "employee-org",
    who: { id: "u-emp", name: "Laylo Ergasheva", phone: "+998900000071", role: "client", backendRole: "employee", roles: ["employee"], permissions: ["internal_org.manage"] },
    routes: () => ({ "/internal/org/board": ORG_BOARD, "/internal/org/positions": POSITIONS, "/internal/org/units/u1": UNIT_U1 }),
    screens: [
      ["home", "/uz/internal"],
      ["org-board", "/uz/internal/org", (p) => p.getByText("Yuridik bo'lim").first().waitFor()],
      [
        "org-list",
        "/uz/internal/org",
        async (p) => {
          await p.getByRole("tab", { name: "Ro'yxat" }).click();
          await p.locator(".org-list tr", { hasText: "Yuridik bo'lim" }).click();
        },
      ],
    ],
  },
  {
    // Advokat whose cabinet can't take orders right now.
    key: "advokat",
    who: { id: "u-adv", name: "Sardor Misolov", phone: "+998900000006", role: "advocate", backendRole: "advokat" },
    routes: () => {
      const r = mocksFor("advocate");
      const cab = r["/lawyers/me/cabinet"] as Record<string, unknown>;
      return { ...r, "/lawyers/me/cabinet": { ...cab, available_actions: { accept_orders: false, secure_chat: true, calls: true } } };
    },
    screens: [
      ["dashboard", "/uz/portal/advocate"],
      ["services", "/uz/portal/advocate/services"],
      ["profile", "/uz/portal/advocate/profile"],
    ],
  },
];

for (const role of ROLES) {
  test(`permission screenshots: ${role.key}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("lexgo_theme", "light"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockBackend(page, await signIn(page, role.who, role.routes()));
    for (const [name, url, ready] of role.screens) {
      await page.goto(url);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      if (ready) await ready(page).catch(() => undefined);
      await page.waitForTimeout(1200);
      await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,nextjs-portal{display:none!important}" }).catch(() => undefined);
      await unclip(page).catch(() => undefined);
      await page.screenshot({ path: join(OUT, `${role.key}-${name}.png`), fullPage: true });
    }
  });
}
