import type { ComponentType, SVGProps } from "react";
import { IconChartBar, IconChat, IconDownload, IconEye, IconFileText, IconGrid, IconLayers, IconPhone, IconSliders, IconTrendingUp, IconUsers } from "@/components/icons";
import { crmCan, type CrmMeta } from "@/lib/services/crm";

// The CRM's sections (contract 13cb257 §5), each shown only when GET
// /crm/meta grants what it needs (§20) — never by role name. A hidden
// section is absent from the menu, and its URL opened directly shows a
// clean "no access" state (CrmFrame).
export type CrmSectionKey = "overview" | "leads" | "customers" | "performance" | "calls" | "sms" | "templates" | "automation" | "analytics" | "live" | "exports";
export type CrmSection = { key: CrmSectionKey; href: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; ok: (m: CrmMeta | null) => boolean };

export const CRM_SECTIONS: readonly CrmSection[] = [
  { key: "overview", href: "/admin/crm", Icon: IconGrid, ok: (m) => crmCan(m, "crm.leads.view") || crmCan(m, "crm.customers.view") },
  { key: "leads", href: "/admin/crm/leads", Icon: IconLayers, ok: (m) => crmCan(m, "crm.leads.view") },
  { key: "customers", href: "/admin/crm/customers", Icon: IconUsers, ok: (m) => crmCan(m, "crm.customers.view") },
  { key: "performance", href: "/admin/crm/me", Icon: IconTrendingUp, ok: (m) => crmCan(m, "crm.analytics.self") },
  { key: "calls", href: "/admin/crm/calls", Icon: IconPhone, ok: (m) => crmCan(m, "crm.calls.start") },
  { key: "sms", href: "/admin/crm/sms", Icon: IconChat, ok: (m) => crmCan(m, "crm.sms.manage") },
  { key: "templates", href: "/admin/crm/templates", Icon: IconFileText, ok: (m) => crmCan(m, "crm.leads.view") || crmCan(m, "crm.templates.manage") },
  { key: "automation", href: "/admin/crm/automation", Icon: IconSliders, ok: (m) => crmCan(m, "crm.automation.manage") },
  { key: "analytics", href: "/admin/crm/analytics", Icon: IconChartBar, ok: (m) => crmCan(m, "crm.analytics.global") },
  { key: "live", href: "/admin/crm/live", Icon: IconEye, ok: (m) => crmCan(m, "crm.live_calls.view") },
  { key: "exports", href: "/admin/crm/exports", Icon: IconDownload, ok: (m) => crmCan(m, "crm.exports.create") },
];

export const sectionOk = (key: CrmSectionKey, meta: CrmMeta | null): boolean => !!CRM_SECTIONS.find((s) => s.key === key)?.ok(meta);
export const visibleSections = (meta: CrmMeta | null): CrmSection[] => CRM_SECTIONS.filter((s) => s.ok(meta));
