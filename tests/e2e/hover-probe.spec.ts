import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type Page } from "@playwright/test";
import { ADMIN, CALL_CENTER, CLIENT, mockBackend, signIn, type Routes, type Who } from "./mock";
import { ORDER_ID, order } from "./fixtures";
import { OPERATOR, ROP, crmServer } from "./crmServer";
import { mocksFor } from "./design1920/data";

// Hover / focus-visible probe (docs/LEXGO_HOVER_STATES_AUDIT_2026_11_08.md).
// playwright.config.ts skips it in the normal suite; run it with a config
// that lifts testIgnore. Two modes:
//   HP_MODE=probe (default): on every screen below, light and dark, hovers
//     each visible interactive element and flags hover states that break
//     (unreadable text, lost fill/border/radius, layout shift, disabled
//     buttons that still react, icons that stop following the text colour,
//     no keyboard focus ring). Writes HP_OUT (a JSON file).
//   HP_MODE=shots: hovered screenshots of the SHOTS list into SHOTS_DIR,
//     light + dark, desktop 1440 + mobile 390.
const MODE = process.env.HP_MODE || "probe";
const OUT = process.env.HP_OUT || "/tmp/lexgo-hover-audit/probe-after.json";
const SHOTS_DIR = process.env.SHOTS_DIR || "/tmp/lexgo-hover-audit/after";
const PARTS = `${OUT}.parts`;
test.describe.configure({ timeout: 600_000 });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

// ── Call-center data (as in permissions-shots.spec.ts) ──
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

const CC_ADMIN: Who = { id: "u-ccadmin", name: "Test Admin", phone: "+998900000011", role: "client", backendRole: "admin", roles: ["admin"], permissions: ["callcenter.access"] };
const CC_OP: Who = { ...CALL_CENTER, permissions: [...(OPERATOR.permissions ?? []), "leads.manage", "marketplace.experience.review"] };
const crm = (perms: string[]) => crmServer(perms).routes as Routes;
const ccAll = (): Routes => ({ ...crm(CC_OP.permissions ?? []), ...ccRoutes() });
const wait = (sel: string) => (p: Page) => p.locator(sel).first().waitFor({ timeout: 15_000 });

type Screen = { name: string; who: Who | null; routes: () => Routes; url: string; ready?: (p: Page) => Promise<unknown> };

const SCREENS: Screen[] = [
  // Call center (ccx) and its CRM
  { name: "cc-now", who: CC_OP, routes: ccAll, url: "/uz/admin/call-center" },
  { name: "cc-queues", who: CC_OP, routes: ccAll, url: "/uz/admin/call-center?view=queues" },
  { name: "cc-clients", who: CC_OP, routes: ccAll, url: "/uz/admin/call-center?view=clients" },
  { name: "cc-support", who: CC_OP, routes: ccAll, url: "/uz/admin/call-center/support" },
  { name: "cc-cancellations", who: CC_ADMIN, routes: ccRoutes, url: "/uz/admin/call-center?tab=cancellations" },
  { name: "crm-customer", who: OPERATOR, routes: () => crm(OPERATOR.permissions ?? []), url: "/uz/admin/call-center?view=crm&s=customers&customer=c1", ready: wait(".opx-cd-tabs") },
  { name: "crm-lead", who: OPERATOR, routes: () => crm(OPERATOR.permissions ?? []), url: "/uz/admin/call-center?view=crm&s=leads&lead=m1", ready: wait(".opx-cd") },
  { name: "crm-leads", who: OPERATOR, routes: () => crm(OPERATOR.permissions ?? []), url: "/uz/admin/call-center?view=crm&s=leads" },
  // Sales head CRM (admin shell)
  { name: "rop-overview", who: ROP, routes: () => crm(ROP.permissions ?? []), url: "/uz/admin/crm" },
  { name: "rop-leads", who: ROP, routes: () => crm(ROP.permissions ?? []), url: "/uz/admin/crm/leads?tab=all", ready: wait(".crm-table tbody tr") },
  { name: "rop-kanban", who: ROP, routes: () => crm(ROP.permissions ?? []), url: "/uz/admin/crm/kanban?tab=all", ready: wait(".crm-col") },
  { name: "rop-lead", who: ROP, routes: () => crm(ROP.permissions ?? []), url: "/uz/admin/crm/leads/m1", ready: wait(".crm-glance") },
  // Admin
  { name: "admin-home", who: ADMIN, routes: () => ({}), url: "/uz/admin" },
  { name: "admin-register", who: ADMIN, routes: () => ({ "/admin/seller-requests": SELLER_REQUESTS, "/admin/register-requests": { items: SELLER_REQUESTS.items } }), url: "/uz/admin/register-requests", ready: (p) => p.getByText("Jasur Qodirov").first().waitFor() },
  { name: "admin-audit", who: ADMIN, routes: () => ({ "/admin/audit-trail": { items: AUDIT } }), url: "/uz/admin/audit-trail" },
  { name: "admin-payouts", who: ADMIN, routes: () => ({ "/admin/payouts": { items: [{ id: "p1", payment_id: "pay1", gross_amount: 100000, platform_fee: 10000, status: "on_hold" }] }, "/payments/reconciliation": {} }), url: "/uz/admin/payouts" },
  // Org (internal)
  { name: "org-board", who: { id: "u-emp", name: "Laylo Ergasheva", phone: "+998900000071", role: "client", backendRole: "employee", roles: ["employee"], permissions: ["internal_org.manage"] }, routes: () => ({ "/internal/org/board": ORG_BOARD, "/internal/org/positions": POSITIONS, "/internal/org/units/u1": UNIT_U1 }), url: "/uz/internal/org", ready: (p) => p.getByText("Yuridik bo'lim").first().waitFor() },
  // Seller (advocate) portal
  { name: "seller-dashboard", who: { id: "u-adv", name: "Sardor Misolov", phone: "+998900000006", role: "advocate", backendRole: "advokat" }, routes: () => mocksFor("advocate"), url: "/uz/portal/advocate" },
  { name: "seller-services", who: { id: "u-adv", name: "Sardor Misolov", phone: "+998900000006", role: "advocate", backendRole: "advokat" }, routes: () => mocksFor("advocate"), url: "/uz/portal/advocate/services" },
  { name: "seller-profile", who: { id: "u-adv", name: "Sardor Misolov", phone: "+998900000006", role: "advocate", backendRole: "advokat" }, routes: () => mocksFor("advocate"), url: "/uz/portal/advocate/profile" },
  // Client portal and marketplace
  { name: "client-home", who: CLIENT, routes: () => mocksFor("client"), url: "/uz/portal/client" },
  { name: "client-documents", who: CLIENT, routes: () => mocksFor("client"), url: "/uz/portal/client/documents" },
  { name: "marketplace", who: CLIENT, routes: () => mocksFor("client"), url: "/uz/lawyers" },
  { name: "public-home", who: null, routes: () => ({}), url: "/uz" },
];

// Hovered screenshots: [file stem, screen, selector of the hovered element].
// Every real case the probe flagged (see the audit doc).
const SHOTS: [stem: string, screen: string, selector: string, how?: "hover" | "focus"][] = [
  ["call-button", "crm-customer", ".opx-cd-chead__acts .opx-pbtn--call"],
  ["ccx-pbtn-disabled", "crm-lead", ".opx-cd-comp__side .opx-pbtn:disabled"],
  ["ccx-act-later-focus", "cc-now", ".opx-acts > .opx-act--later", "focus"],
  ["admin-btn-disabled", "admin-audit", ".uf-extra .btn--pri"],
  ["admin-lang-glass", "admin-home", ".ptop .lang .btn--glass"],
  ["rop-composer-addtitle", "rop-lead", ".crm-composer__addtitle"],
  ["rop-composer-type", "rop-lead", ".crm-composer__types button:not([aria-pressed=true])"],
  ["rop-filter-chip", "rop-leads", ".crm-filters .crm-chip"],
  ["rop-pill-link", "rop-overview", "a.rop-pill"],
  ["org-user", "org-board", ".hn-user"],
  ["org-legend", "org-board", ".ob-legend button"],
  ["market-bar-glass", "marketplace", ".bar__act .btn--glass"],
  ["market-card-go", "marketplace", ".mk-card__go"],
  ["market-show-go", "marketplace", ".mk-show__go"],
  ["home-round-disabled", "public-home", ".lh-svc__ctrl .lh-round[aria-disabled=true]"],
  ["home-bar-glass", "public-home", ".bar__act a.btn--glass"],
  ["home-war-glass", "public-home", ".lh-war__links .lh-btn--glass"],
  ["home-plan-switch", "public-home", ".switch > button:not(.on)"],
  ["crm-status-item", "crm-lead", "li > button:has-text('Taklif')"],
  ["admin-side-link", "admin-home", ".psb__glist a.psb__link:not(.on)"],
  ["client-ai-launch", "client-documents", ".cpl-launch--button"],
];

const THEMES = ["light", "dark"] as const;

async function open(page: Page, sc: Screen, theme: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.emulateMedia({ colorScheme: theme as "light" | "dark", reducedMotion: "reduce" });
  await page.addInitScript((t) => {
    localStorage.setItem("lexgo_theme", t);
    localStorage.setItem("lexgo_ccx_prefs", JSON.stringify({ theme: t, bg: "night", motion: false, keys: true }));
    localStorage.setItem("lexgo_ccx_intro", "1");
  }, theme);
  const routes = sc.routes();
  await mockBackend(page, sc.who ? await signIn(page, sc.who, routes) : routes);
  await page.goto(sc.url);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  if (sc.ready) await sc.ready(page).catch(() => undefined);
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: ".robot-edge-zone,.lgr,.nprog,nextjs-portal{display:none!important}" }).catch(() => undefined);
}

// ── In-page helpers (serialised into the page) ──
const PROBE_LIB = () => {
  const w = window as unknown as Record<string, unknown>;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true })!;
  const rgba = (s: string): number[] | null => {
    if (!s || s === "none") return null;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#010203";
    cx.fillStyle = s;
    if (cx.fillStyle === "#010203" && !/010203/.test(s)) return null;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const COLOR_RE = /(?:rgba?|color|oklab|oklch|lab|lch|hsla?)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-fA-F]{3,8}\b/g;
  const stops = (img: string): number[][] => {
    if (!img || img === "none" || !/gradient/.test(img)) return [];
    return (img.match(COLOR_RE) || []).map(rgba).filter((c): c is number[] => !!c);
  };
  const over = (top: number[], under: number[]) => {
    const a = top[3];
    return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
  };
  // Layers from the element up to the first opaque one, blended down.
  const effBg = (el: Element): number[] => {
    const layers: number[][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const g = stops(cs.backgroundImage);
      if (g.length) {
        const avg = g[0];
        layers.push(avg);
        if (avg[3] > 0.95) break;
      }
      const c = rgba(cs.backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] > 0.95) break;
      }
    }
    let base = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1][3] <= 0.95) base = document.documentElement.dataset.theme === "dark" ? [12, 16, 28, 1] : [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const lum = (c: number[]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a: number[], b: number[]) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const ownText = (el: Element) => {
    // The deepest element that holds visible text: its colour is the text colour.
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.textContent || !t.textContent.trim()) continue;
      const p = t.parentElement!;
      const cs = getComputedStyle(p);
      if (cs.visibility === "hidden" || cs.display === "none" || p.getClientRects().length === 0) continue;
      if (p.closest("kbd")) continue;
      return p;
    }
    return null;
  };
  const snap = (el: HTMLElement) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const tEl = ownText(el);
    const bgEl = tEl || el;
    const bg = effBg(bgEl);
    const tc = tEl ? rgba(getComputedStyle(tEl).color) : null;
    const textC = tc ? over(tc, bg) : null;
    const svg = el.querySelector("svg");
    let icon: number[] | null = null;
    let iconStr = "";
    if (svg) {
      const scs = getComputedStyle(svg);
      const paint = scs.stroke && scs.stroke !== "none" ? scs.stroke : scs.fill && scs.fill !== "none" ? scs.fill : scs.color;
      iconStr = paint;
      const ic = rgba(paint);
      icon = ic ? over(ic, effBg(svg)) : null;
    }
    const ownBg = rgba(cs.backgroundColor);
    const g = stops(cs.backgroundImage);
    const bc = rgba(cs.borderTopColor);
    return {
      color: cs.color,
      bgColor: cs.backgroundColor,
      bgImage: cs.backgroundImage.slice(0, 160),
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      borderW: parseFloat(cs.borderTopWidth) || 0,
      borderA: bc ? bc[3] : 0,
      radius: cs.borderTopLeftRadius,
      opacity: cs.opacity,
      shadow: cs.boxShadow,
      transform: cs.transform,
      filter: cs.filter,
      // Ancestors' transforms: a card that lifts on hover moves its buttons
      // without any layout shift.
      upT: (() => {
        let t = "";
        for (let n = el.parentElement; n; n = n.parentElement) t += getComputedStyle(n).transform + ";";
        return t;
      })(),
      outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      rect: [r.x, r.y, r.width, r.height],
      box: [el.offsetWidth, el.offsetHeight],
      fill: g.length ? 2 : ownBg && ownBg[3] > 0.35 ? 1 : 0,
      contrast: textC ? +ratio(textC, bg).toFixed(2) : null,
      iconContrast: icon ? +ratio(icon, effBg(svg!)).toFixed(2) : null,
      iconFollows: svg && tEl ? iconStr === getComputedStyle(tEl).color : null,
      text: tEl ? true : false,
    };
  };
  w.__hp = { snap, rgba };
};

type Snap = {
  color: string; bgColor: string; bgImage: string; border: string; borderW: number; borderA: number; radius: string; opacity: string; shadow: string; transform: string; filter: string; upT: string; outline: string;
  rect: number[]; box: number[]; fill: number; contrast: number | null; iconContrast: number | null; iconFollows: boolean | null; text: boolean;
};

function judge(b: Snap, a: Snap, disabled: boolean, selected: boolean): string[] {
  const f: string[] = [];
  const paint = (s: Snap) => [s.color, s.bgColor, s.bgImage, s.border, s.shadow, s.transform, s.filter, s.opacity].join("|");
  if (disabled) {
    if (paint(b) !== paint(a)) f.push("disabled-reacts");
    return f;
  }
  if (a.contrast !== null && a.contrast < 3 && (b.contrast === null || b.contrast >= 3)) f.push(`contrast-drop ${b.contrast}→${a.contrast}`);
  else if (a.contrast !== null && a.contrast < 3) f.push(`contrast-low ${b.contrast}→${a.contrast}`);
  if (!a.text && a.iconContrast !== null && a.iconContrast < 2 && (b.iconContrast ?? 9) >= 2) f.push(`icon-contrast-drop ${b.iconContrast}→${a.iconContrast}`);
  if (b.fill === 2 && a.fill !== 2) f.push("gradient-lost");
  else if (b.fill === 1 && a.fill === 0) f.push("fill-lost");
  if (b.borderW > 0 && b.borderA > 0.2 && (a.borderW === 0 || a.borderA < 0.05)) f.push("border-lost");
  if (b.radius !== a.radius) f.push(`radius ${b.radius}→${a.radius}`);
  if (Math.abs(b.box[0] - a.box[0]) > 1 || Math.abs(b.box[1] - a.box[1]) > 1) f.push(`size-shift ${b.box}→${a.box}`);
  const dx = Math.max(Math.abs(b.rect[0] - a.rect[0]), Math.abs(b.rect[1] - a.rect[1]));
  if (dx > 1 && (a.transform === "none" || a.transform === b.transform) && a.upT === b.upT) f.push(`layout-shift ${dx.toFixed(1)}px`);
  if (b.iconFollows === true && a.iconFollows === false) f.push("icon-stops-following-text");
  // A filled button whose paint does not move at all gives no hover feedback
  // (the selected tab / segment / nav item is allowed to stay put).
  if (b.fill > 0 && !selected && paint(b) === paint(a)) f.push("no-hover-feedback");
  return f;
}

type Row = { screen: string; theme: string; sel: string; label: string; selected: boolean; disabled: boolean; flags: string[]; before: Snap; after: Snap; focusRing: boolean | null };

// A readable, stable-ish selector for the element (for the report and shots).
const DESCRIBE = (el: Element) => {
  const cls = (n: Element) => (typeof n.className === "string" ? n.className.trim().split(/\s+/).filter((c) => c && !/^(is-hov|__)/.test(c)).slice(0, 3).map((c) => "." + c).join("") : "");
  const own = el.tagName.toLowerCase() + cls(el) + (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "");
  const p = el.parentElement;
  return (p && p !== document.body ? (p.tagName.toLowerCase() + cls(p)).slice(0, 60) + " > " : "") + own;
};

const CANDIDATES = [
  "button", "a[class*=btn]", "a[class*=chip]", "a[class*=pill]", "a[class*=tab]", "a[class*=link]", "a[class*=__go]", "a[class*=cta]",
  "[role=tab]", "[role=menuitem]", "[role=option]", "[class*=chip]", "[class*=pbtn]", "[class*=btn]", "[role=button]",
].join(",");

if (MODE === "probe") {
  test.afterAll(() => {
    let rows: Row[] = [];
    try {
      for (const f of readdirSync(PARTS).sort()) rows = rows.concat(JSON.parse(readFileSync(join(PARTS, f), "utf8")));
    } catch {
      return;
    }
    const flagged = rows.filter((r) => r.flags.length || r.focusRing === false);
    writeFileSync(OUT, JSON.stringify({ probed: rows.length, flagged: flagged.length, rows: flagged }, null, 1));
  });

  for (const sc of SCREENS) {
    for (const theme of THEMES) {
      test(`hover probe ${sc.name} ${theme}`, async ({ page }) => {
        mkdirSync(PARTS, { recursive: true });
        await open(page, sc, theme, { width: 1440, height: 900 });
        await page.addStyleTag({ content: "*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important}" });
        await page.evaluate(PROBE_LIB);
        const count = await page.evaluate(
          ([q, describe]) => {
            const desc = new Function("return " + describe)() as (e: Element) => string;
            const seen = new Set<Element>();
            const out: Element[] = [];
            for (const el of Array.from(document.querySelectorAll(q))) {
              // The outermost interactive one (a chip span inside a button is the button).
              const top = el.parentElement?.closest(q);
              const use = top && top.contains(el) && top !== el ? top : el;
              if (seen.has(use)) continue;
              seen.add(use);
              const r = use.getBoundingClientRect();
              const cs = getComputedStyle(use);
              if (r.width < 8 || r.height < 8 || cs.visibility === "hidden" || cs.display === "none") continue;
              if (use.closest("nextjs-portal,.robot-edge-zone,.lgr")) continue;
              out.push(use);
            }
            // At most 140 per screen; same class signatures are sampled.
            const bySig = new Map<string, number>();
            let i = 0;
            for (const el of out) {
              const sig = desc(el);
              const n = bySig.get(sig) ?? 0;
              bySig.set(sig, n + 1);
              if (n >= 3 || i >= 140) continue;
              el.setAttribute("data-hp", String(i++));
              el.setAttribute("data-hp-sel", sig);
            }
            return i;
          },
          [CANDIDATES, DESCRIBE.toString()] as const,
        );
        const rows: Row[] = [];
        const vp = page.viewportSize()!;
        for (let i = 0; i < count; i++) {
          const sel = `[data-hp="${i}"]`;
          const pre = await page.evaluate((s) => {
            const el = document.querySelector<HTMLElement>(s);
            if (!el || !el.isConnected) return null;
            el.scrollIntoView({ block: "center", inline: "nearest" });
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return null;
            const x = r.x + r.width / 2, y = r.y + r.height / 2;
            const hit = document.elementFromPoint(x, y);
            if (!hit || !(el === hit || el.contains(hit))) return null;
            const disabled = (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
            const selected = ["aria-selected", "aria-checked", "aria-pressed", "aria-current"].some((a) => (el.getAttribute(a) ?? "false") !== "false") || /(^|\s)(on|is-on|active|is-active|is-sel|sel|selected|is-current)(\s|$)/.test(typeof el.className === "string" ? el.className : "");
            return { x, y, disabled, selected, label: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().slice(0, 40), sel: el.getAttribute("data-hp-sel") || "" };
          }, sel).catch(() => null);
          if (!pre) continue;
          await page.mouse.move(vp.width - 2, vp.height - 2);
          await page.waitForTimeout(30);
          const before = (await page.evaluate((s) => (window as unknown as { __hp: { snap: (e: Element) => unknown } }).__hp.snap(document.querySelector(s)!), sel).catch(() => null)) as Snap | null;
          if (!before) continue;
          await page.mouse.move(pre.x, pre.y);
          await page.waitForTimeout(60);
          const after = (await page.evaluate((s) => {
            const el = document.querySelector(s);
            return el && el.matches(":hover") ? (window as unknown as { __hp: { snap: (e: Element) => unknown } }).__hp.snap(el) : null;
          }, sel).catch(() => null)) as Snap | null;
          if (!after) continue;
          let focusRing: boolean | null = null;
          if (!pre.disabled) {
            await page.mouse.move(vp.width - 2, vp.height - 2);
            focusRing = await page
              .evaluate((s) => {
                const el = document.querySelector<HTMLElement>(s)!;
                const plain = getComputedStyle(el);
                const o0 = plain.outlineStyle + plain.outlineWidth + plain.boxShadow + plain.borderTopColor + plain.backgroundColor;
                (el as HTMLElement & { focus(o?: { focusVisible?: boolean; preventScroll?: boolean }): void }).focus({ focusVisible: true, preventScroll: true });
                if (document.activeElement !== el) return null;
                if (!el.matches(":focus-visible")) return null;
                const cs = getComputedStyle(el);
                const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.outlineStyle + cs.outlineWidth + cs.boxShadow + cs.borderTopColor + cs.backgroundColor !== o0;
                el.blur();
                return ring;
              }, sel)
              .catch(() => null);
          }
          const flags = judge(before, after, pre.disabled, pre.selected);
          rows.push({ screen: sc.name, theme, sel: pre.sel, label: pre.label, selected: pre.selected, disabled: pre.disabled, flags, before, after, focusRing });
        }
        writeFileSync(join(PARTS, `${sc.name}-${theme}.json`), JSON.stringify(rows));
      });
    }
  }
}

if (MODE === "shots") {
  const VIEWS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
  for (const [stem, screen, selector, how = "hover"] of SHOTS) {
    const sc = SCREENS.find((s) => s.name === screen)!;
    for (const [view, size] of Object.entries(VIEWS)) {
      for (const theme of THEMES) {
        test(`hover shot ${stem} ${view} ${theme}`, async ({ page }) => {
          mkdirSync(SHOTS_DIR, { recursive: true });
          await open(page, sc, theme, size);
          const el = page.locator(selector).filter({ visible: true }).first();
          const shown = await el.waitFor({ timeout: 10_000 }).then(() => true, () => false);
          // Some controls are not on the small screen at all (folded into a menu).
          test.skip(!shown, `${selector} is not shown at ${view}`);
          await el.scrollIntoViewIfNeeded({ timeout: 15_000 });
          await page.waitForTimeout(300);
          if (how === "focus") {
            // Keyboard focus: the ring a Tab user sees.
            await el.evaluate((n) => (n as HTMLElement & { focus(o?: { focusVisible?: boolean }): void }).focus({ focusVisible: true }));
          } else {
            // Mobile has no hover; page.hover emulates it the same way.
            await el.hover({ timeout: 15_000, force: true });
          }
          await page.waitForTimeout(500);
          const box = await el.boundingBox();
          const padX = Math.min(160, size.width / 4), padY = 70;
          const clip = box
            ? (() => {
                const x = Math.max(0, box.x - padX), y = Math.max(0, box.y - padY);
                return { x, y, width: Math.min(size.width - x, box.width + padX * 2), height: Math.min(size.height - y, box.height + padY * 2) };
              })()
            : undefined;
          await page.screenshot({ path: `${SHOTS_DIR}/${stem}-${view}-${theme}.png`, clip });
        });
      }
    }
  }
}
