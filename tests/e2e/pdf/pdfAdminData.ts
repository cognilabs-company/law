import type { Routes } from "../mock";

// Data for the superadmin shots (owner's PDF 2026-11-27, S1–S23).
const SVC = [
  ["Onlayn konsultatsiya", "Fuqarolik", 200000, true],
  ["Da'vo arizasi tayyorlash", "Fuqarolik", 450000, true],
  ["Mehnat nizosi bo'yicha maslahat", "Mehnat", 300000, true],
  ["Ijara shartnomasini tekshirish", "Ko'chmas mulk", 250000, true],
  ["Avtoavariya bo'yicha konsultatsiya", "Avtoavariya", 300000, true],
  ["Meros rasmiylashtirish", "Oila", 500000, false],
  ["Biznes ro'yxatdan o'tkazish", "Biznes", 600000, true],
  ["Jinoiy ish bo'yicha himoya", "Jinoyat", 1500000, true],
] as const;

const CATS = ["Fuqarolik", "Mehnat", "Ko'chmas mulk", "Avtoavariya", "Oila", "Biznes", "Jinoyat"];

const PERMS = ["users.manage", "roles.manage", "services.manage", "subscriptions.manage", "templates.manage", "payments.manage", "approvals.manage", "lawyers.verify", "leads.manage", "callcenter.access", "notifications.manage", "legal_aid.manage"];
const ROLES = [
  ["superadmin", "Superadmin", PERMS],
  ["admin", "Administrator", PERMS.slice(0, 9)],
  ["finance", "Moliya", ["payments.manage", "approvals.manage"]],
  ["call_center", "Call-markaz", ["leads.manage", "callcenter.access"]],
  ["moderator", "Moderator", ["lawyers.verify", "services.manage"]],
  ["marketing", "Marketing", ["notifications.manage"]],
] as const;

const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const REQS = [
  ["Dilshod Rahimov", "advokat", 30], ["Nodira Karimova", "yurist", 120], ["Jasur Toshmatov", "advokat", 60 * 5],
  ["\"Adolat\" advokatlik byurosi", "advokat_tashkiloti", 60 * 26], ["Malika Usmonova", "yurist", 60 * 30],
] as const;

export function adminExtra(): Routes {
  return {
    "/admin/subscription-plans": { items: [
      { id: "pl1", slug: "lexgo-ai-free", name: "Free", monthly_price: 0, is_active: true, sort_order: 1, audience: "client", features: ["AI bilan suhbat", "Shablonlarni ko'rish"] },
      { id: "pl2", slug: "lexgo-ai-lite", name: "Lite", monthly_price: 99000, is_active: true, sort_order: 2, audience: "client", features: ["AI cheksiz", "Hujjat konstruktori"] },
      { id: "pl3", slug: "lexgo-ai-pro", name: "Pro", monthly_price: 199000, is_active: true, sort_order: 3, audience: "client", features: ["Hammasi", "Ustuvor yordam"] },
      { id: "pl4", slug: "shaxsiy-advokat-standart", name: "Shaxsiy advokat · Standart", monthly_price: 350000, is_active: true, sort_order: 4, audience: "personal" },
      { id: "pl5", slug: "shaxsiy-advokat-premium", name: "Shaxsiy advokat · Premium", monthly_price: 650000, is_active: false, sort_order: 5, audience: "personal" },
    ] },
    "/admin/platform/policies": { items: {
      order: { accept_timeout_minutes: 30, auto_cancel_hours: 24, rework_limit: 2 },
      payment: { refund_window_hours: 72, prepayment_percent: 10 },
      document_analysis: { max_pages: 10, price_per_extra_page: 5000 },
      workspace: { file_limit_mb: 50 },
      security: { otp_ttl_seconds: 120, max_sessions: 5 },
      notifications: { sms_enabled: true, telegram_enabled: true },
    } },
    "/admin/compliance/readiness": { overall_status: "partial", checks: [
      { key: "click", label: "Click to'lov", ok: true, status: "ok" },
      { key: "atmos", label: "ATMOS to'lov", ok: true, status: "ok" },
      { key: "sms", label: "SMS provayder", ok: false, status: "waiting", note: "Eskiz shartnomasi kutilmoqda" },
      { key: "backup", label: "Zaxira nusxa", ok: true, status: "ok" },
    ] },
    "/payments/reconciliation": { payments_count: 64, paid_count: 58, gross_amount: 24600000, platform_fee: 4428000, provider_fee: 246000, seller_share: 19926000, payout_statuses: { pending: 6, paid: 41, processing: 3 }, by_provider: [{ provider: "Click", count: 37, amount: 15200000 }, { provider: "ATMOS", count: 21, amount: 9400000 }] },
    "/admin/payouts": { items: [
      { id: "p1", gross: 500000, platform_fee: 90000, provider_fee: 5000, seller_share: 405000, currency: "UZS", status: "pending" },
      { id: "p2", gross: 350000, platform_fee: 63000, provider_fee: 3500, seller_share: 283500, currency: "UZS", status: "processing" },
      { id: "p3", gross: 450000, platform_fee: 81000, provider_fee: 4500, seller_share: 364500, currency: "UZS", status: "paid" },
    ] },
    "/approvals": { items: [
      { id: "a1", type: "refund", work_id: "APR-JFQDL", status: "pending", admin_approved: false, manager_approved: false },
      { id: "a2", type: "lawyer_change", work_id: "APR-KD21Q", status: "partial", admin_approved: true, manager_approved: false },
      { id: "a3", type: "refund", work_id: "APR-LM88X", status: "partial", admin_approved: false, manager_approved: true },
      { id: "a4", type: "refund", work_id: "APR-PZ03A", status: "approved", admin_approved: true, manager_approved: true },
    ] },
    "/admin/seller-requests": { items: REQS.map(([name, role, ago], i) => ({ id: `rr${i}`, verification_id: `v${i}`, status: "pending", role, name, phone: `+99890000${String(1000 + i)}`, created_at: iso(ago) })), stats: { total: 48, advokat: 22, yurist: 19, advokat_tashkiloti: 7, pending: 5, approved: 38, rejected: 5 } },
    "/admin/roles": ROLES.map(([name, title, p], i) => ({ id: `r${i}`, name, title, permissions: p, description: "" })),
    "/admin/permissions": PERMS.map((code) => ({ code, title: code })),
    "/admin/permission-matrix": { roles: ROLES.map(([name, title, p], i) => ({ id: `r${i}`, name, title, permissions: p })), permissions: PERMS, seller_rules: {} },
    "/admin/services": { items: SVC.map(([title, cat, price, on], i) => ({ id: `s${i}`, title, slug: `svc-${i}`, category_title: cat, category_id: `c${CATS.indexOf(cat)}`, standard_price: price, is_active: on, catalog_code: `PRO-${100 + i}`, executor_type: "advokat" })) },
    "/service-categories/tree": { items: CATS.map((title, i) => ({ id: `c${i}`, slug: `cat-${i}`, title, is_active: true, children: [] })) },
  };
}
