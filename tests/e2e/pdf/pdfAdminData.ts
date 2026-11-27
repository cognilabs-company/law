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

export function adminExtra(): Routes {
  return {
    "/admin/roles": ROLES.map(([name, title, p], i) => ({ id: `r${i}`, name, title, permissions: p, description: "" })),
    "/admin/permissions": PERMS.map((code) => ({ code, title: code })),
    "/admin/permission-matrix": { roles: ROLES.map(([name, title, p], i) => ({ id: `r${i}`, name, title, permissions: p })), permissions: PERMS, seller_rules: {} },
    "/admin/services": { items: SVC.map(([title, cat, price, on], i) => ({ id: `s${i}`, title, slug: `svc-${i}`, category_title: cat, category_id: `c${CATS.indexOf(cat)}`, standard_price: price, is_active: on, catalog_code: `PRO-${100 + i}`, executor_type: "advokat" })) },
    "/service-categories/tree": { items: CATS.map((title, i) => ({ id: `c${i}`, slug: `cat-${i}`, title, is_active: true, children: [] })) },
  };
}
