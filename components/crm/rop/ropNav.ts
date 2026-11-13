import type { ComponentType } from "react";
import { Bot, ClipboardCheck, Columns3, Download, FileText, LayoutDashboard, ListChecks, PhoneCall, Rows3, ScrollText, UserCog, Users } from "lucide-react";
import { crmCan, type CrmMeta } from "@/lib/services/crm";

// The ROP workspace menu (ROP final contract 2026-11-04 §4). Every row is
// shown only when GET /crm/meta grants its permission — never by role
// name — so a permission a superadmin revokes takes the row away with no
// code change. There is no Revenue row: ROP never sees revenue (§3).
export type RopKey = "overview" | "leads" | "kanban" | "customers" | "operators" | "live" | "robots" | "runs" | "drafts" | "templates" | "scripts" | "exports";
// `perm`: a row gated by the session's own permission rather than the CRM
// meta (sales scripts, 2026-11-13 §8).
export type RopItem = { key: RopKey; href: string; group: "" | "work" | "robots" | "tools"; Icon: ComponentType<{ className?: string }>; ok: (m: CrmMeta | null) => boolean; perm?: string; exact?: boolean };

const crmAccess = (m: CrmMeta | null) => crmCan(m, "crm.leads.view") || crmCan(m, "crm.customers.view");

export const ROP_NAV: readonly RopItem[] = [
  { key: "overview", href: "/admin/crm", group: "", Icon: LayoutDashboard, ok: (m) => crmCan(m, "crm.analytics.self"), exact: true },
  { key: "leads", href: "/admin/crm/leads", group: "work", Icon: Rows3, ok: (m) => crmCan(m, "crm.leads.view") },
  { key: "kanban", href: "/admin/crm/kanban", group: "work", Icon: Columns3, ok: (m) => crmCan(m, "crm.leads.view") },
  { key: "customers", href: "/admin/crm/customers", group: "work", Icon: Users, ok: (m) => crmCan(m, "crm.customers.view") },
  { key: "operators", href: "/admin/crm/operators", group: "work", Icon: UserCog, ok: (m) => crmCan(m, "crm.leads.view") },
  { key: "live", href: "/admin/crm/live", group: "work", Icon: PhoneCall, ok: (m) => crmCan(m, "crm.live_calls.view") },
  { key: "robots", href: "/admin/crm/automation", group: "robots", Icon: Bot, ok: (m) => crmCan(m, "crm.automation.manage"), exact: true },
  { key: "runs", href: "/admin/crm/automation/runs", group: "robots", Icon: ListChecks, ok: (m) => crmCan(m, "crm.automation.manage") },
  { key: "drafts", href: "/admin/crm/automation/drafts", group: "robots", Icon: ClipboardCheck, ok: (m) => crmCan(m, "crm.automation.manage") },
  { key: "templates", href: "/admin/crm/templates", group: "tools", Icon: FileText, ok: crmAccess },
  { key: "scripts", href: "/admin/crm/scripts", group: "tools", Icon: ScrollText, ok: () => false, perm: "sales_scripts.manage" },
  { key: "exports", href: "/admin/crm/exports", group: "tools", Icon: Download, ok: (m) => crmCan(m, "crm.exports.create") },
];

export const ropVisible = (m: CrmMeta | null, perms: readonly string[] = []): RopItem[] => ROP_NAV.filter((i) => (i.perm ? perms.includes(i.perm) || perms.includes("*") : i.ok(m)));

// The row a path belongs to: the longest href that matches it. A lead or a
// customer page sits under its list.
export function ropActive(items: readonly RopItem[], path: string): RopItem | undefined {
  return items
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => path === i.href || (!i.exact && path.startsWith(`${i.href}/`)) || (i.key === "robots" && /^\/admin\/crm\/automation\/rules(\/|$)/.test(path)));
}

// Which account opens the ROP workspace instead of the general admin shell:
// the sales supervisor, unless the same account also holds a role that
// works in the full admin (its menus are wider than the ROP's).
const FULL = ["superadmin", "admin", "manager", "ceo_viewer", "finance"];
export const isRopAccount = (roles: readonly string[]): boolean => roles.includes("sales_head") && !roles.some((r) => FULL.includes(r));
