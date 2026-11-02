import type { CrmMeta } from "@/lib/services/crm";

export type CrmView = "overview" | "leads" | "customers" | "calls" | "performance" | "templates" | "sms";

export const CRM_VIEWS: CrmView[] = ["overview", "leads", "customers", "calls", "performance", "templates", "sms"];

export type CrmSectionProps = { meta: CrmMeta };

export function crmHref(view: CrmView, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ view: "crm", s: view, ...extra });
  return `/admin/call-center?${q.toString()}`;
}

export const leadHref = (id: string) => crmHref("leads", { lead: id });
export const customerHref = (id: string) => crmHref("customers", { customer: id });
